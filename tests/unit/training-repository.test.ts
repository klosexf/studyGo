import "fake-indexeddb/auto";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { TrainingSession } from "@/features/training/types";
import {
  createLogicTrainingDatabase,
  getLogicTrainingDatabase,
  resetLogicTrainingDatabaseForTests,
  StorageUnavailableError,
  type LogicTrainingDatabase,
} from "@/lib/storage/database";
import {
  TrainingRepository,
  type CorruptTrainingData,
} from "@/lib/storage/training-repository";
import {
  comparisonFixture,
  diagnosisFixture,
  trainingRecord,
  trainingTopic,
} from "@/../tests/fixtures/training";

function session(
  overrides: Partial<TrainingSession> = {},
): TrainingSession {
  return {
    id: "session-1",
    stage: "draft",
    provider: "mock",
    model: "mock-v1",
    promptVersion: "1",
    config: {
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    },
    draftText: "我认为成长更重要，因为它能带来长期机会。",
    rewriteText: "",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T11:00:00.000Z",
    topic: trainingTopic,
    ...overrides,
  } as TrainingSession;
}

describe("TrainingRepository", () => {
  let db: LogicTrainingDatabase;
  let repository: TrainingRepository;

  beforeEach(() => {
    db = createLogicTrainingDatabase(
      `logic-training-test-${crypto.randomUUID()}`,
    );
    repository = new TrainingRepository(db);
  });

  afterEach(async () => {
    await db.delete();
  });

  it("saves, reads, and deletes a session", async () => {
    expect(db.verno).toBe(2);

    const draft = session();

    await repository.saveSession(draft);

    expect(await repository.getActiveSession()).toEqual(draft);
    await repository.deleteSession(draft.id);
    expect(await repository.getActiveSession()).toBeNull();
  });

  it("deletes a session only when the persisted snapshot is unchanged", async () => {
    const captured = session({
      id: "conditional",
      updatedAt: "2026-06-01T11:00:00.000Z",
    });
    await repository.saveSession(captured);

    await expect(
      repository.deleteSessionIfUnchanged(captured),
    ).resolves.toBe(true);
    expect(await db.sessions.get(captured.id)).toBeUndefined();

    await repository.saveSession(captured);
    const newer = session({
      ...captured,
      draftText: "更新后的内容",
      updatedAt: "2026-06-01T11:01:00.000Z",
    });
    await repository.saveSession(newer);

    await expect(
      repository.deleteSessionIfUnchanged(captured),
    ).resolves.toBe(false);
    expect(await db.sessions.get(captured.id)).toEqual(newer);
  });

  it("returns the most recently updated valid session", async () => {
    const older = session({
      id: "older",
      updatedAt: "2026-06-01T11:00:00.000Z",
    });
    const newer = session({
      id: "newer",
      updatedAt: "2026-06-02T11:00:00.000Z",
    });
    await repository.saveSession(older);
    await repository.saveSession(newer);
    await db.sessions.put({
      ...newer,
      id: "invalid",
      updatedAt: "2026-06-03T11:00:00.000Z",
      stage: "result",
      diagnosis: undefined,
      comparison: undefined,
    } as never);

    expect((await repository.getActiveSession())?.id).toBe("newer");
  });

  it("sorts active sessions by parsed timestamps including fractional seconds", async () => {
    await db.sessions.bulkPut([
      session({
        id: "whole-second",
        updatedAt: "2026-06-01T11:00:00Z",
      }),
      session({
        id: "fractional-second",
        updatedAt: "2026-06-01T11:00:00.100Z",
      }),
    ]);

    expect((await repository.getActiveSession())?.id).toBe(
      "fractional-second",
    );
  });

  it("quarantines invalid sessions before choosing the latest valid session", async () => {
    const corrupt: CorruptTrainingData[] = [];
    repository = new TrainingRepository(db, {
      onCorrupt: (entry) => corrupt.push(entry),
    });
    await repository.saveSession(
      session({
        id: "valid",
        updatedAt: "2026-06-01T11:00:00.000Z",
      }),
    );
    await db.sessions.put({
      ...session(),
      id: "invalid",
      updatedAt: "not-a-date",
    } as never);

    expect((await repository.getActiveSession())?.id).toBe("valid");
    expect(await db.sessions.get("invalid")).toBeUndefined();
    expect(await db.quarantine.count()).toBe(1);
    expect(corrupt[0]).toMatchObject({
      table: "sessions",
      originalId: "invalid",
      payload: expect.objectContaining({ id: "invalid" }),
    });
  });

  it("does not quarantine a valid session that replaced the captured corrupt snapshot", async () => {
    const corruptSession = {
      ...session({ id: "raced-session" }),
      updatedAt: "not-a-date",
    };
    const replacement = session({
      id: "raced-session",
      draftText: "这是隔离开始前保存的新草稿。",
      updatedAt: "2026-06-08T01:00:00.000Z",
    });
    await db.sessions.put(corruptSession as never);
    const originalToArray = db.sessions.toArray.bind(db.sessions);
    vi.spyOn(db.sessions, "toArray").mockImplementationOnce(
      (async () => {
        const captured = await originalToArray();
        await db.sessions.put(replacement);
        return captured;
      }) as never,
    );

    await repository.getActiveSession();

    expect(await db.sessions.get(replacement.id)).toEqual(replacement);
    expect(await db.quarantine.count()).toBe(0);
  });

  it("completes a session atomically by writing the record and deleting the draft", async () => {
    const resultSession = session({
      stage: "result",
      diagnosis: diagnosisFixture(),
      comparison: comparisonFixture(),
    });
    const record = trainingRecord({
      id: resultSession.id,
      completedAt: "2026-06-03T12:00:00.000Z",
    });
    await repository.saveSession(resultSession);

    await repository.completeSession(record);

    expect(await repository.getRecord(record.id)).toEqual(record);
    expect(await db.sessions.get(record.id)).toBeUndefined();
  });

  it("lists records by completedAt descending and supports lookup", async () => {
    const oldest = trainingRecord({
      id: "oldest",
      completedAt: "2026-06-01T12:00:00.000Z",
    });
    const newest = trainingRecord({
      id: "newest",
      completedAt: "2026-06-03T12:00:00.000Z",
    });
    const middle = trainingRecord({
      id: "middle",
      completedAt: "2026-06-02T12:00:00.000Z",
    });
    await db.records.bulkPut([oldest, newest, middle]);

    expect((await repository.listRecords()).map(({ id }) => id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
    expect(await repository.getRecord("middle")).toEqual(middle);
    expect(await repository.getRecord("missing")).toBeUndefined();
  });

  it("sorts records by parsed completedAt timestamps", async () => {
    await db.records.bulkPut([
      trainingRecord({
        id: "whole-second",
        completedAt: "2026-06-01T12:00:00Z",
      }),
      trainingRecord({
        id: "fractional-second",
        completedAt: "2026-06-01T12:00:00.100Z",
      }),
    ]);

    expect((await repository.listRecords()).map(({ id }) => id)).toEqual([
      "fractional-second",
      "whole-second",
    ]);
  });

  it("quarantines corrupt records without failing the full list", async () => {
    const corrupt: CorruptTrainingData[] = [];
    repository = new TrainingRepository(db, {
      onCorrupt: (entry) => corrupt.push(entry),
    });
    await db.records.bulkPut([
      trainingRecord({ id: "valid" }),
      {
        ...trainingRecord({ id: "invalid" }),
        completedAt: "not-a-date",
      } as never,
    ]);

    expect((await repository.listRecords()).map(({ id }) => id)).toEqual([
      "valid",
    ]);
    expect(await db.records.get("invalid")).toBeUndefined();
    expect(await db.quarantine.count()).toBe(1);
    expect(corrupt).toHaveLength(1);
  });

  it("does not quarantine a valid record that replaced a corrupt list snapshot", async () => {
    const corruptRecord = {
      ...trainingRecord({ id: "raced-list-record" }),
      completedAt: "not-a-date",
    };
    const replacement = trainingRecord({
      id: "raced-list-record",
      rewriteText: "这是隔离开始前完成的新记录。",
      completedAt: "2026-06-08T02:00:00.000Z",
    });
    await db.records.put(corruptRecord as never);
    const originalToArray = db.records.toArray.bind(db.records);
    vi.spyOn(db.records, "toArray").mockImplementationOnce(
      (async () => {
        const captured = await originalToArray();
        await db.records.put(replacement);
        return captured;
      }) as never,
    );

    await repository.listRecords();

    expect(await db.records.get(replacement.id)).toEqual(replacement);
    expect(await db.quarantine.count()).toBe(0);
  });

  it("returns undefined and quarantines a corrupt record lookup", async () => {
    await db.records.put({
      ...trainingRecord({ id: "invalid" }),
      comparison: undefined,
    } as never);

    expect(await repository.getRecord("invalid")).toBeUndefined();
    expect(await db.records.get("invalid")).toBeUndefined();
    expect(await db.quarantine.count()).toBe(1);
  });

  it("does not quarantine a valid record that replaced a corrupt get snapshot", async () => {
    const corruptRecord = {
      ...trainingRecord({ id: "raced-get-record" }),
      comparison: undefined,
    };
    const replacement = trainingRecord({
      id: "raced-get-record",
      rewriteText: "这是查询后写入的有效记录。",
    });
    await db.records.put(corruptRecord as never);
    const originalGet = db.records.get.bind(db.records);
    vi.spyOn(db.records, "get").mockImplementationOnce(
      (async (key: string) => {
        const captured = await originalGet(key);
        await db.records.put(replacement);
        return captured;
      }) as never,
    );

    expect(await repository.getRecord(replacement.id)).toBeUndefined();
    expect(await db.records.get(replacement.id)).toEqual(replacement);
    expect(await db.quarantine.count()).toBe(0);
  });

  it("quarantines an unchanged snapshot regardless of object key order", async () => {
    const captured = {
      ...trainingRecord({ id: "reordered-record" }),
      completedAt: "not-a-date",
    };
    await db.records.put(captured as never);
    const originalGet = db.records.get.bind(db.records);
    vi.spyOn(db.records, "get").mockImplementationOnce(
      (async (key: string) => {
        const original = await originalGet(key);
        const reordered = Object.fromEntries(
          Object.entries(original as object).reverse(),
        );
        await db.records.put(reordered as never);
        return original;
      }) as never,
    );

    await repository.getRecord("reordered-record");

    expect(await db.records.get("reordered-record")).toBeUndefined();
    expect(await db.quarantine.count()).toBe(1);
    expect((await db.quarantine.toArray())[0]?.payload).toEqual(captured);
  });

  it("clears sessions and records together", async () => {
    await repository.saveSession(session());
    await db.records.put(trainingRecord());

    await repository.clearTrainingData();

    expect(await db.sessions.count()).toBe(0);
    expect(await db.records.count()).toBe(0);
    expect(await db.quarantine.count()).toBe(0);
  });

  it("rejects invalid values instead of silently persisting them", async () => {
    await expect(
      repository.saveSession(
        session({ updatedAt: "not-a-date" }) as TrainingSession,
      ),
    ).rejects.toThrow();

    await expect(
      repository.completeSession(
        trainingRecord({ completedAt: "not-a-date" }),
      ),
    ).rejects.toThrow();
  });

  it("does not recreate a session after a record has completed", async () => {
    const draft = session();
    const record = trainingRecord({ id: draft.id });

    await repository.completeSession(record);
    await repository.saveSession(draft);

    expect(await db.records.get(record.id)).toEqual(record);
    expect(await db.sessions.get(record.id)).toBeUndefined();
  });

  it("keeps the completed record and removes the session under concurrent writes", async () => {
    const draft = session();
    const record = trainingRecord({ id: draft.id });

    await Promise.all([
      repository.saveSession(draft),
      repository.completeSession(record),
    ]);

    expect(await db.records.get(record.id)).toEqual(record);
    expect(await db.sessions.get(record.id)).toBeUndefined();
  });
});

describe("logic training database lifecycle", () => {
  afterEach(() => {
    resetLogicTrainingDatabaseForTests();
    vi.unstubAllGlobals();
  });

  it("returns one shared browser database until reset", () => {
    const first = getLogicTrainingDatabase();
    const second = getLogicTrainingDatabase();

    expect(second).toBe(first);

    resetLogicTrainingDatabaseForTests();
    expect(getLogicTrainingDatabase()).not.toBe(first);
  });

  it("throws a typed error when database storage is requested during SSR", async () => {
    resetLogicTrainingDatabaseForTests();
    vi.stubGlobal("window", undefined);

    expect(() => getLogicTrainingDatabase()).toThrow(
      StorageUnavailableError,
    );
    await expect(
      new TrainingRepository().getActiveSession(),
    ).rejects.toThrow(
      StorageUnavailableError,
    );
  });
});
