import Dexie, { type Table } from "dexie";

import type {
  TrainingRecord,
  TrainingSession,
} from "@/features/training/types";

export const LOGIC_TRAINING_DATABASE_NAME = "logic-expression-training";

export type QuarantineTable = "sessions" | "records";

export interface QuarantinedTrainingData {
  id?: number;
  table: QuarantineTable;
  originalId: string;
  reason: string;
  quarantinedAt: string;
  payload: unknown;
}

export class StorageUnavailableError extends Error {
  constructor() {
    super("Browser storage is unavailable");
    this.name = "StorageUnavailableError";
  }
}

export class LogicTrainingDatabase extends Dexie {
  sessions!: Table<TrainingSession, string>;
  records!: Table<TrainingRecord, string>;
  quarantine!: Table<QuarantinedTrainingData, number>;

  constructor(name = LOGIC_TRAINING_DATABASE_NAME) {
    super(name);

    this.version(1).stores({
      sessions: "id, updatedAt",
      records:
        "id, completedAt, config.scenarioType, config.trainingGoal, weakestDimension, provider",
    });

    this.version(2).stores({
      sessions: "id, updatedAt",
      records:
        "id, completedAt, config.scenarioType, config.trainingGoal, weakestDimension, provider",
      quarantine: "++id, table, originalId, quarantinedAt",
    });
  }
}

export function createLogicTrainingDatabase(
  name = LOGIC_TRAINING_DATABASE_NAME,
) {
  return new LogicTrainingDatabase(name);
}

let sharedDatabase: LogicTrainingDatabase | undefined;

export function getLogicTrainingDatabase() {
  if (
    typeof window === "undefined" ||
    typeof globalThis.indexedDB === "undefined"
  ) {
    throw new StorageUnavailableError();
  }

  sharedDatabase ??= createLogicTrainingDatabase();
  return sharedDatabase;
}

export function closeLogicTrainingDatabase() {
  sharedDatabase?.close();
  sharedDatabase = undefined;
}

export function resetLogicTrainingDatabaseForTests() {
  closeLogicTrainingDatabase();
}
