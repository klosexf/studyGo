import Dexie, { type Table } from "dexie";
import { z } from "zod";

import { rewriteComparisonSchema } from "@/features/training/schemas/comparison";
import { draftDiagnosisSchema } from "@/features/training/schemas/diagnosis";
import {
  trainingDimensionSchema,
  trainingTopicSchema,
} from "@/features/training/schemas/topic";
import {
  DIFFICULTIES,
  PROVIDER_IDS,
  SCENARIO_TYPES,
  type TrainingRecord,
  type TrainingSession,
} from "@/features/training/types";
import {
  getLogicTrainingDatabase,
  type LogicTrainingDatabase,
  type QuarantinedTrainingData,
  type QuarantineTable,
} from "@/lib/storage/database";

const isoDateTimeSchema = z.iso.datetime();

const trainingConfigSchema = z.object({
  scenarioType: z.enum(SCENARIO_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  trainingGoal: trainingDimensionSchema,
});

const sessionBaseShape = {
  id: z.string().trim().min(1),
  provider: z.enum(PROVIDER_IDS),
  model: z.string(),
  promptVersion: z.string().trim().min(1),
  config: trainingConfigSchema,
  draftText: z.string(),
  rewriteText: z.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
};

const trainingSessionSchema: z.ZodType<TrainingSession> =
  z.discriminatedUnion("stage", [
    z.object({
      ...sessionBaseShape,
      stage: z.literal("setup"),
    }),
    z.object({
      ...sessionBaseShape,
      stage: z.literal("topic"),
      topic: trainingTopicSchema,
    }),
    z.object({
      ...sessionBaseShape,
      stage: z.literal("draft"),
      topic: trainingTopicSchema,
    }),
    z.object({
      ...sessionBaseShape,
      stage: z.literal("diagnosis"),
      topic: trainingTopicSchema,
      diagnosis: draftDiagnosisSchema,
    }),
    z.object({
      ...sessionBaseShape,
      stage: z.literal("result"),
      topic: trainingTopicSchema,
      diagnosis: draftDiagnosisSchema,
      comparison: rewriteComparisonSchema,
    }),
  ]);

const trainingRecordSchema: z.ZodType<TrainingRecord> = z.object({
  ...sessionBaseShape,
  topic: trainingTopicSchema,
  diagnosis: draftDiagnosisSchema,
  comparison: rewriteComparisonSchema,
  weakestDimension: trainingDimensionSchema,
  draftLogicScore: z.number().min(1).max(5),
  draftExpressionScore: z.number().min(1).max(5),
  rewriteLogicScore: z.number().min(1).max(5),
  rewriteExpressionScore: z.number().min(1).max(5),
  logicImprovement: z.number(),
  expressionImprovement: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
  completedAt: isoDateTimeSchema,
});

export class TrainingRepository {
  private readonly injectedDatabase?: LogicTrainingDatabase;
  private readonly onCorrupt?: (entry: CorruptTrainingData) => void;

  constructor(
    db?: LogicTrainingDatabase,
    options: TrainingRepositoryOptions = {},
  ) {
    this.injectedDatabase = db;
    this.onCorrupt = options.onCorrupt;
  }

  private get db() {
    return this.injectedDatabase ?? getLogicTrainingDatabase();
  }

  async saveSession(session: TrainingSession) {
    const validated = trainingSessionSchema.parse(session);
    await this.db.transaction(
      "rw",
      this.db.sessions,
      this.db.records,
      async () => {
        if (await this.db.records.get(validated.id)) {
          await this.db.sessions.delete(validated.id);
          return;
        }
        await this.db.sessions.put(validated);
      },
    );
  }

  async getActiveSession(): Promise<TrainingSession | null> {
    const sessions = await this.db.sessions.toArray();
    const valid: TrainingSession[] = [];
    for (const session of sessions) {
      const captured = Dexie.deepClone(session);
      const result = trainingSessionSchema.safeParse(captured);
      if (result.success) {
        valid.push(result.data);
      } else {
        await this.quarantine(
          "sessions",
          captured,
          result.error.message,
        );
      }
    }

    valid.sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
    return valid[0] ?? null;
  }

  async deleteSession(id: string) {
    await this.db.sessions.delete(id);
  }

  async deleteSessionIfUnchanged(
    expected: TrainingSession,
  ): Promise<boolean> {
    const validated = trainingSessionSchema.parse(expected);
    let deleted = false;
    await this.db.transaction("rw", this.db.sessions, async () => {
      const current = await this.db.sessions.get(validated.id);
      if (!stableEqual(current, validated)) {
        return;
      }
      await this.db.sessions.delete(validated.id);
      deleted = true;
    });
    return deleted;
  }

  async completeSession(record: TrainingRecord) {
    const validated = trainingRecordSchema.parse(record);

    await this.db.transaction(
      "rw",
      this.db.sessions,
      this.db.records,
      async () => {
        await this.db.records.put(validated);
        await this.db.sessions.delete(validated.id);
      },
    );
  }

  async listRecords(): Promise<TrainingRecord[]> {
    const records = await this.db.records.toArray();
    const valid: TrainingRecord[] = [];

    for (const record of records) {
      const captured = Dexie.deepClone(record);
      const result = trainingRecordSchema.safeParse(captured);
      if (result.success) {
        valid.push(result.data);
      } else {
        await this.quarantine(
          "records",
          captured,
          result.error.message,
        );
      }
    }

    return valid.sort(
      (left, right) =>
        Date.parse(right.completedAt) - Date.parse(left.completedAt),
    );
  }

  async getRecord(id: string): Promise<TrainingRecord | undefined> {
    const record = await this.db.records.get(id);
    if (!record) {
      return undefined;
    }

    const captured = Dexie.deepClone(record);
    const result = trainingRecordSchema.safeParse(captured);
    if (result.success) {
      return result.data;
    }

    await this.quarantine("records", captured, result.error.message);
    return undefined;
  }

  async clearTrainingData() {
    await this.db.transaction(
      "rw",
      this.db.sessions,
      this.db.records,
      this.db.quarantine,
      async () => {
        await Promise.all([
          this.db.sessions.clear(),
          this.db.records.clear(),
          this.db.quarantine.clear(),
        ]);
      },
    );
  }

  private async quarantine(
    table: QuarantineTable,
    captured: unknown,
    reason: string,
  ) {
    const originalId =
      captured &&
      typeof captured === "object" &&
      typeof Reflect.get(captured, "id") === "string"
        ? String(Reflect.get(captured, "id"))
        : "unknown";
    const entry: CorruptTrainingData = {
      table,
      originalId,
      reason,
      quarantinedAt: new Date().toISOString(),
      payload: Dexie.deepClone(captured),
    };
    const sourceTable = this.sourceTable(table);
    let quarantined = false;

    await this.db.transaction(
      "rw",
      sourceTable,
      this.db.quarantine,
      async () => {
        if (originalId === "unknown") {
          return;
        }
        const current = await sourceTable.get(originalId);
        if (!stableEqual(current, captured)) {
          return;
        }
        await this.db.quarantine.add(entry);
        await sourceTable.delete(originalId);
        quarantined = true;
      },
    );
    if (quarantined) {
      this.onCorrupt?.(entry);
    }
  }

  private sourceTable(table: QuarantineTable): Table<unknown, string> {
    return table === "sessions"
      ? (this.db.sessions as Table<unknown, string>)
      : (this.db.records as Table<unknown, string>);
  }
}

export type CorruptTrainingData = Omit<QuarantinedTrainingData, "id">;

export interface TrainingRepositoryOptions {
  onCorrupt?: (entry: CorruptTrainingData) => void;
}

function stableEqual(left: unknown, right: unknown) {
  return stableSerialize(left) === stableSerialize(right);
}

function stableSerialize(value: unknown) {
  return JSON.stringify(toStableValue(Dexie.deepClone(value)));
}

function toStableValue(value: unknown): unknown {
  if (value === undefined) {
    return ["undefined"];
  }
  if (value === null) {
    return ["null"];
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return ["number", "NaN"];
    }
    if (Object.is(value, -0)) {
      return ["number", "-0"];
    }
    return ["number", value];
  }
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return [typeof value, String(value)];
  }
  if (value instanceof Date) {
    return ["date", value.toISOString()];
  }
  if (Array.isArray(value)) {
    return ["array", value.map(toStableValue)];
  }
  if (typeof value === "object") {
    return [
      "object",
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          toStableValue(Reflect.get(value, key)),
        ]),
    ];
  }
  return [typeof value, String(value)];
}
