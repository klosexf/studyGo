import { act, renderHook } from "@testing-library/react";
import {
  createElement,
  StrictMode,
  type ReactNode,
} from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createSessionPersistenceController,
  useSessionPersistence,
} from "@/features/training/hooks/use-session-persistence";
import {
  AppClientError,
  type TrainingApi,
} from "@/features/training/services/training-api";
import {
  createTrainingStore,
  type TrainingStore,
  type TrainingStoreDependencies,
} from "@/features/training/store/training-store";
import type {
  CoachingFeedback,
  TrainingSession,
  TrainingTopic,
} from "@/features/training/types";
import type { TrainingRepository } from "@/lib/storage/training-repository";
import {
  coachingFeedbackFixture,
  comparisonFixture,
  diagnosisFixture,
  trainingTopic,
} from "@/../tests/fixtures/training";

function createRepository() {
  return {
    saveSession: vi.fn(async () => undefined),
    getActiveSession: vi.fn(async () => null),
    deleteSession: vi.fn(async () => undefined),
    deleteSessionIfUnchanged: vi.fn(async () => true),
  } as unknown as TrainingRepository;
}

function createApi(): TrainingApi {
  return {
    generateTopic: vi.fn(async () => trainingTopic),
    diagnoseDraft: vi.fn(async () => diagnosisFixture()),
    coachRound: vi.fn(async () => coachingFeedbackFixture()),
    compareRewrite: vi.fn(async () => comparisonFixture()),
    testProvider: vi.fn(async () => ({
      ok: true as const,
      provider: "mock" as const,
      model: "",
    })),
  };
}

function createStore(overrides: {
  repository?: TrainingRepository;
  api?: TrainingApi;
  id?: () => string;
  loadSettings?: TrainingStoreDependencies["loadSettings"];
} = {}) {
  return createTrainingStore({
    repository: overrides.repository ?? createRepository(),
    api: overrides.api ?? createApi(),
    clock: () => new Date("2026-06-09T01:00:00.000Z"),
    id: overrides.id ?? (() => "session-1"),
    loadSettings: overrides.loadSettings ?? (() => ({
      selectedProvider: "openai",
      profiles: {
        mock: { baseUrl: "", apiKey: "", model: "", lastTest: null },
        openai: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "",
          model: "",
          lastTest: null,
        },
        deepseek: { baseUrl: "", apiKey: "", model: "", lastTest: null },
        zhipu: { baseUrl: "", apiKey: "", model: "", lastTest: null },
      },
    })),
  });
}

function advanceToDraft(store: TrainingStore) {
  store.getState().startSession({
    scenarioType: "life",
    difficulty: "medium",
    trainingGoal: "argumentSufficiency",
  });
  store.getState().setTopic(trainingTopic);
  store.getState().startDraft();
  store.getState().updateDraft("保留这段初稿");
}

function advanceToFinalRewrite(store: TrainingStore, text = "最终复述文本") {
  advanceToDraft(store);
  store.getState().setDiagnosis(diagnosisFixture());
  store.getState().startCoaching();
  store.getState().updateCoachingAnswer("至少需要 6 个月生活费。");
  const session = store.getState().session;
  if (session?.stage !== "coaching") {
    throw new Error("Expected coaching session");
  }
  store.getState().restoreSession({
    ...session,
    coachingRounds: session.coachingRounds.map((round) => ({
      ...round,
      attempts: [coachingFeedbackFixture({ status: "passed" })],
      userAnswers: ["至少需要 6 个月生活费。"],
      status: "passed" as const,
    })),
  });
  store.getState().startFinalRewrite();
  store.getState().updateFinalRewrite(text);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const validFinalRewrite = "复".repeat(200);

describe("training store", () => {
  it("starts with mock when the selected real provider is invalid", () => {
    const store = createStore();

    store.getState().startSession({
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    });

    expect(store.getState().session).toMatchObject({
      id: "session-1",
      stage: "setup",
      provider: "mock",
      model: "",
    });
  });

  it("supports every legal action and constructs discriminated sessions", () => {
    const store = createStore();
    advanceToDraft(store);
    store.getState().setDiagnosis(diagnosisFixture());
    store.getState().startCoaching();
    store.getState().updateCoachingAnswer("至少需要 6 个月生活费。");
    const coachingSession = store.getState().session;
    if (coachingSession?.stage !== "coaching") {
      throw new Error("Expected coaching session");
    }
    store.getState().restoreSession({
      ...coachingSession,
      coachingRounds: coachingSession.coachingRounds.map((round) => ({
        ...round,
        attempts: [coachingFeedbackFixture({ status: "passed" })],
        userAnswers: ["至少需要 6 个月生活费。"],
        status: "passed" as const,
      })),
    });
    store.getState().startFinalRewrite();
    store.getState().updateFinalRewrite("用户自己的最终复述");
    store.getState().setComparison(comparisonFixture());

    expect(store.getState().session).toMatchObject({
      stage: "result",
      topic: trainingTopic,
      diagnosis: diagnosisFixture(),
      comparison: comparisonFixture(),
      draftText: "保留这段初稿",
      finalRewriteText: "用户自己的最终复述",
      rewriteText: "用户自己的最终复述",
    });

    store.getState().goBack();
    expect(store.getState().session?.stage).toBe("setup");
  });

  it("runs coaching rounds before final rewrite comparison", async () => {
    const api = createApi();
    vi.mocked(api.coachRound).mockResolvedValue(
      coachingFeedbackFixture({ status: "passed" }),
    );
    const store = createStore({ api });
    advanceToDraft(store);
    await store.getState().requestDiagnosis();

    expect(store.getState().session?.stage).toBe("diagnosis");
    store.getState().startCoaching();
    expect(store.getState().session?.stage).toBe("coaching");

    store.getState().updateCoachingAnswer("至少需要 6 个月生活费。");
    await store.getState().requestCoachingFeedback();
    expect(api.coachRound).toHaveBeenCalledTimes(1);
    expect(store.getState().session).toMatchObject({
      stage: "coaching",
      currentRoundIndex: 0,
      coachingRounds: [
        {
          attempts: [expect.objectContaining({ status: "passed" })],
          userAnswers: ["至少需要 6 个月生活费。"],
          status: "passed",
        },
      ],
    });

    store.getState().startFinalRewrite();
    expect(store.getState().session?.stage).toBe("finalRewrite");
    store.getState().updateFinalRewrite(validFinalRewrite);
    await store.getState().requestComparison();
    expect(store.getState().session).toMatchObject({
      stage: "result",
      finalRewriteText: validFinalRewrite,
      rewriteText: validFinalRewrite,
    });
  });

  it("does not write stale coaching feedback after answer changes", async () => {
    const pending = deferred<CoachingFeedback>();
    const api = createApi();
    vi.mocked(api.coachRound).mockReturnValueOnce(pending.promise);
    const store = createStore({ api });
    advanceToDraft(store);
    store.getState().setDiagnosis(diagnosisFixture());
    store.getState().startCoaching();
    store.getState().updateCoachingAnswer("第一版回答");
    const request = store
      .getState()
      .requestCoachingFeedback()
      .catch(() => undefined);
    await Promise.resolve();
    await Promise.resolve();

    store.getState().updateCoachingAnswer("第二版回答");
    pending.resolve(coachingFeedbackFixture());
    await request;

    expect(store.getState().session).toMatchObject({
      stage: "coaching",
      currentAnswer: "第二版回答",
      coachingRounds: [
        {
          attempts: [],
          userAnswers: [],
          status: "pending",
        },
      ],
    });
  });

  it("marks every new local session snapshot as needing persistence", () => {
    const store = createStore();

    store.getState().startSession({
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    });
    expect(store.getState().saveStatus).toBe("idle");

    store.getState().setSaveStatus("saved");
    store.getState().updateSetup({ difficulty: "challenging" });
    expect(store.getState().saveStatus).toBe("idle");

    store.getState().setSaveStatus("saved");
    store.getState().setTopic(trainingTopic);
    expect(store.getState().saveStatus).toBe("idle");

    store.getState().setSaveStatus("saved");
    store.getState().startDraft();
    expect(store.getState().saveStatus).toBe("idle");

    store.getState().setSaveStatus("saved");
    store.getState().updateDraft("新的初稿快照");
    expect(store.getState().saveStatus).toBe("idle");

    store.getState().setSaveStatus("saved");
    store.getState().setDiagnosis(diagnosisFixture());
    expect(store.getState().saveStatus).toBe("idle");

    store.getState().setSaveStatus("saved");
    store.getState().startCoaching();
    expect(store.getState().saveStatus).toBe("idle");

    store.getState().setSaveStatus("saved");
    store.getState().updateCoachingAnswer("新的追问回答");
    expect(store.getState().saveStatus).toBe("idle");

    const coachingSession = store.getState().session;
    if (coachingSession?.stage !== "coaching") {
      throw new Error("Expected coaching session");
    }
    store.getState().restoreSession({
      ...coachingSession,
      coachingRounds: coachingSession.coachingRounds.map((round) => ({
        ...round,
        attempts: [coachingFeedbackFixture({ status: "passed" })],
        userAnswers: ["新的追问回答"],
        status: "passed" as const,
      })),
    });

    store.getState().setSaveStatus("saved");
    store.getState().startFinalRewrite();
    expect(store.getState().saveStatus).toBe("idle");

    store.getState().setSaveStatus("saved");
    store.getState().updateFinalRewrite("新的最终复述快照");
    expect(store.getState().saveStatus).toBe("idle");

    store.getState().setSaveStatus("saved");
    store.getState().setComparison(comparisonFixture());
    expect(store.getState().saveStatus).toBe("idle");

    store.getState().setSaveStatus("saved");
    store.getState().goBack();
    expect(store.getState().saveStatus).toBe("idle");
  });

  it("keeps restored sessions saved until a subsequent mutation", () => {
    const store = createStore();
    const restored: TrainingSession = {
      id: "restored-saved",
      stage: "draft",
      provider: "mock",
      model: "",
      promptVersion: "1",
      config: {
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
      },
      draftText: "已持久化初稿",
      rewriteText: "",
      createdAt: "2026-06-08T01:00:00.000Z",
      updatedAt: "2026-06-08T01:00:00.000Z",
      topic: trainingTopic,
    };

    store.getState().restoreSession(restored);
    expect(store.getState().saveStatus).toBe("saved");

    store.getState().updateDraft("恢复后继续编辑");
    expect(store.getState().saveStatus).toBe("idle");
  });

  it("marks AI-generated session snapshots as needing persistence", async () => {
    const topicStore = createStore();
    topicStore.getState().startSession({
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    });
    await topicStore.getState().requestTopic();
    expect(topicStore.getState().session?.stage).toBe("topic");
    expect(topicStore.getState().saveStatus).toBe("idle");

    const diagnosisStore = createStore();
    advanceToDraft(diagnosisStore);
    await diagnosisStore.getState().requestDiagnosis();
    expect(diagnosisStore.getState().session?.stage).toBe("diagnosis");
    expect(diagnosisStore.getState().saveStatus).toBe("idle");

    const comparisonStore = createStore();
    advanceToFinalRewrite(comparisonStore, "等待 AI 对比的改写");
    await comparisonStore.getState().requestComparison();
    expect(comparisonStore.getState().session?.stage).toBe("result");
    expect(comparisonStore.getState().saveStatus).toBe("idle");
  });

  it("rejects illegal actions explicitly without mutating the session", () => {
    const store = createStore();
    store.getState().startSession({
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    });
    const original = store.getState().session;

    expect(() => store.getState().updateDraft("不允许")).toThrow(
      "draft stage",
    );
    expect(store.getState().session).toEqual(original);
    expect(store.getState().error).toMatchObject({
      code: "INVALID_STAGE",
      retryable: false,
    });
  });

  it("restores and resets sessions", () => {
    const store = createStore();
    const initialEpoch = store.getState().persistenceEpoch;
    const restored: TrainingSession = {
      id: "restored",
      stage: "topic",
      provider: "mock",
      model: "",
      promptVersion: "1",
      config: {
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
      },
      draftText: "",
      rewriteText: "",
      createdAt: "2026-06-08T01:00:00.000Z",
      updatedAt: "2026-06-08T01:00:00.000Z",
      topic: trainingTopic,
    };

    store.getState().restoreSession(restored);
    expect(store.getState().session).toEqual(restored);
    expect(store.getState().persistenceEpoch).toBe(initialEpoch + 1);
    store.getState().resetSession();
    expect(store.getState()).toMatchObject({
      session: null,
      loading: null,
      error: null,
      saveStatus: "idle",
      persistenceEpoch: initialEpoch + 2,
    });
  });

  it("increments persistence epoch for an empty reset and a new session", () => {
    const store = createStore();
    expect(store.getState().session).toBeNull();
    expect(store.getState().persistenceEpoch).toBe(0);

    store.getState().resetSession();
    expect(store.getState().persistenceEpoch).toBe(1);

    store.getState().startSession({
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    });
    expect(store.getState().session?.id).toBe("session-1");
    expect(store.getState().persistenceEpoch).toBe(2);
  });

  it("saves before AI requests and keeps text when the request fails", async () => {
    const repository = createRepository();
    const api = createApi();
    vi.mocked(api.diagnoseDraft).mockRejectedValueOnce(
      new AppClientError({
        code: "NETWORK_ERROR",
        message: "网络不可用",
        retryable: true,
        status: 0,
      }),
    );
    const store = createStore({ repository, api });
    advanceToDraft(store);

    await expect(store.getState().requestDiagnosis()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });

    expect(repository.saveSession).toHaveBeenCalledBefore(
      vi.mocked(api.diagnoseDraft),
    );
    expect(store.getState().session).toMatchObject({
      stage: "draft",
      draftText: "保留这段初稿",
    });
    expect(store.getState().error?.message).toBe("网络不可用");
  });

  it.each([
    {
      operation: "topic",
      prepare(store: TrainingStore) {
        store.getState().startSession({
          scenarioType: "life",
          difficulty: "medium",
          trainingGoal: "argumentSufficiency",
        });
      },
      request(store: TrainingStore) {
        return store.getState().requestTopic();
      },
      apiMethod: "generateTopic" as const,
    },
    {
      operation: "diagnosis",
      prepare: advanceToDraft,
      request(store: TrainingStore) {
        return store.getState().requestDiagnosis();
      },
      apiMethod: "diagnoseDraft" as const,
    },
    {
      operation: "comparison",
      prepare(store: TrainingStore) {
        advanceToFinalRewrite(store, "改写文本");
      },
      request(store: TrainingStore) {
        return store.getState().requestComparison();
      },
      apiMethod: "compareRewrite" as const,
    },
  ])(
    "does not call the $operation API when the required save fails",
    async ({ prepare, request, apiMethod }) => {
      const repository = createRepository();
      vi.mocked(repository.saveSession).mockRejectedValueOnce(
        new Error("quota"),
      );
      const api = createApi();
      const store = createStore({ repository, api });
      prepare(store);

      await expect(request(store)).rejects.toMatchObject({
        code: "SAVE_FAILED",
      });
      expect(api[apiMethod]).not.toHaveBeenCalled();
    },
  );

  it("keeps the selected real provider after a real request failure without calling mock", async () => {
    const api = createApi();
    vi.mocked(api.generateTopic).mockRejectedValueOnce(
      new AppClientError({
        code: "PROVIDER_ERROR",
        message: "真实服务失败",
        retryable: true,
        status: 502,
      }),
    );
    const store = createStore({
      api,
      loadSettings: () => ({
        selectedProvider: "openai",
        profiles: {
          mock: { baseUrl: "", apiKey: "", model: "", lastTest: null },
          openai: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "real-key",
            model: "real-model",
            lastTest: null,
          },
          deepseek: { baseUrl: "", apiKey: "", model: "", lastTest: null },
          zhipu: { baseUrl: "", apiKey: "", model: "", lastTest: null },
        },
      }),
    });
    store.getState().startSession({
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    });

    await expect(store.getState().requestTopic()).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    expect(api.generateTopic).toHaveBeenCalledOnce();
    expect(vi.mocked(api.generateTopic).mock.calls[0][0].provider).toMatchObject({
      provider: "openai",
      model: "real-model",
    });
    expect(store.getState().session?.provider).toBe("openai");
  });

  it("cancels duplicate operations and ignores stale responses after stage changes", async () => {
    let resolveFirst!: (topic: TrainingTopic) => void;
    const first = new Promise<TrainingTopic>((resolve) => {
      resolveFirst = resolve;
    });
    const api = createApi();
    vi.mocked(api.generateTopic)
      .mockImplementationOnce(async (_request, signal) => {
        await first;
        expect(signal?.aborted).toBe(true);
        return trainingTopic;
      })
      .mockResolvedValueOnce({
        ...trainingTopic,
        title: "第二个命题",
      });
    const store = createStore({ api });
    store.getState().startSession({
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    });

    const stale = store.getState().requestTopic();
    const current = store.getState().requestTopic();
    resolveFirst(trainingTopic);
    await Promise.allSettled([stale, current]);

    expect(store.getState().session).toMatchObject({
      stage: "topic",
      topic: expect.objectContaining({ title: "第二个命题" }),
    });
  });

  it("ignores a topic response after setup content changes", async () => {
    let resolveTopic!: () => void;
    const api = createApi();
    vi.mocked(api.generateTopic).mockImplementationOnce(
      async (_input, signal) => {
        await new Promise<void>((resolve) => {
          resolveTopic = resolve;
        });
        expect(signal?.aborted).toBe(true);
        return trainingTopic;
      },
    );
    const store = createStore({ api });
    store.getState().startSession({
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    });
    const revision = store.getState().requestRevision;
    const request = store.getState().requestTopic();
    await Promise.resolve();
    await Promise.resolve();

    store.getState().updateSetup({ difficulty: "challenging" });
    expect(store.getState().requestRevision).toBe(revision + 1);
    resolveTopic();
    await Promise.allSettled([request]);

    expect(store.getState().session).toMatchObject({
      stage: "setup",
      config: { difficulty: "challenging" },
    });
  });

  it("does not call the API when content changes while the request pre-save is pending", async () => {
    const repository = createRepository();
    let resolveSave!: () => void;
    vi.mocked(repository.saveSession).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const api = createApi();
    const store = createStore({ repository, api });
    store.getState().startSession({
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    });

    const request = store.getState().requestTopic();
    await Promise.resolve();
    store.getState().updateSetup({ difficulty: "challenging" });
    resolveSave();
    await Promise.allSettled([request]);

    expect(api.generateTopic).not.toHaveBeenCalled();
    expect(repository.deleteSessionIfUnchanged).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ difficulty: "medium" }),
      }),
    );
    expect(store.getState().session).toMatchObject({
      config: { difficulty: "challenging" },
    });
  });

  it("ignores a diagnosis response after draft content changes", async () => {
    let resolveDiagnosis!: () => void;
    const api = createApi();
    vi.mocked(api.diagnoseDraft).mockImplementationOnce(
      async (_input, signal) => {
        await new Promise<void>((resolve) => {
          resolveDiagnosis = resolve;
        });
        expect(signal?.aborted).toBe(true);
        return diagnosisFixture();
      },
    );
    const store = createStore({ api });
    advanceToDraft(store);
    const request = store.getState().requestDiagnosis();
    await Promise.resolve();
    await Promise.resolve();

    store.getState().updateDraft("请求发出后修改的初稿");
    resolveDiagnosis();
    await Promise.allSettled([request]);

    expect(store.getState().session).toMatchObject({
      stage: "draft",
      draftText: "请求发出后修改的初稿",
    });
  });

  it("ignores a comparison response after rewrite content changes", async () => {
    let resolveComparison!: () => void;
    const api = createApi();
    vi.mocked(api.compareRewrite).mockImplementationOnce(
      async (_input, signal) => {
        await new Promise<void>((resolve) => {
          resolveComparison = resolve;
        });
        expect(signal?.aborted).toBe(true);
        return comparisonFixture();
      },
    );
    const store = createStore({ api });
    advanceToFinalRewrite(store, "第一版改写");
    const request = store.getState().requestComparison();
    await Promise.resolve();
    await Promise.resolve();

    store.getState().updateFinalRewrite("请求发出后修改的改写");
    resolveComparison();
    await Promise.allSettled([request]);

    expect(store.getState().session).toMatchObject({
      stage: "finalRewrite",
      finalRewriteText: "请求发出后修改的改写",
      rewriteText: "请求发出后修改的改写",
    });
  });

  it("cancels duplicate diagnosis requests and only applies the latest response", async () => {
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const replacement = diagnosisFixture({ summary: "第二次诊断" });
    const api = createApi();
    vi.mocked(api.diagnoseDraft)
      .mockImplementationOnce(async (_input, signal) => {
        await first;
        expect(signal?.aborted).toBe(true);
        return diagnosisFixture();
      })
      .mockResolvedValueOnce(replacement);
    const store = createStore({ api });
    advanceToDraft(store);

    const stale = store.getState().requestDiagnosis();
    const current = store.getState().requestDiagnosis();
    resolveFirst();
    await Promise.allSettled([stale, current]);

    expect(store.getState().session).toMatchObject({
      stage: "diagnosis",
      diagnosis: replacement,
    });
  });

  it("cancels duplicate comparison requests and only applies the latest response", async () => {
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const replacement = comparisonFixture({
      remainingIssue: "第二次对比的剩余问题",
    });
    const api = createApi();
    vi.mocked(api.compareRewrite)
      .mockImplementationOnce(async (_input, signal) => {
        await first;
        expect(signal?.aborted).toBe(true);
        return comparisonFixture();
      })
      .mockResolvedValueOnce(replacement);
    const store = createStore({ api });
    advanceToFinalRewrite(store, "改写文本");

    const stale = store.getState().requestComparison();
    const current = store.getState().requestComparison();
    resolveFirst();
    await Promise.allSettled([stale, current]);

    expect(store.getState().session).toMatchObject({
      stage: "result",
      comparison: replacement,
    });
  });

  it.each(["reset", "restore"] as const)(
    "%s aborts all inflight requests and prevents stale responses from landing",
    async (action) => {
      let resolveDiagnosis!: () => void;
      const api = createApi();
      vi.mocked(api.diagnoseDraft).mockImplementationOnce(
        async (_input, signal) => {
          await new Promise<void>((resolve) => {
            resolveDiagnosis = resolve;
          });
          expect(signal?.aborted).toBe(true);
          return diagnosisFixture();
        },
      );
      const store = createStore({ api });
      advanceToDraft(store);
      const request = store.getState().requestDiagnosis();
      await Promise.resolve();
      await Promise.resolve();

      if (action === "reset") {
        store.getState().resetSession();
      } else {
        store.getState().restoreSession({
          id: "restored-new",
          stage: "setup",
          provider: "mock",
          model: "",
          promptVersion: "1",
          config: {
            scenarioType: "life",
            difficulty: "easy",
            trainingGoal: "conciseness",
          },
          draftText: "",
          rewriteText: "",
          createdAt: "2026-06-09T02:00:00.000Z",
          updatedAt: "2026-06-09T02:00:00.000Z",
        });
      }
      resolveDiagnosis();
      await Promise.allSettled([request]);

      expect(store.getState().session?.id ?? null).toBe(
        action === "reset" ? null : "restored-new",
      );
      expect(store.getState().loading).toBeNull();
    },
  );

  it("keeps reset state clean when a request pre-save finishes late", async () => {
    const repository = createRepository();
    let resolveSave!: () => void;
    vi.mocked(repository.saveSession).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const api = createApi();
    const store = createStore({ repository, api });
    store.getState().startSession({
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    });

    const request = store.getState().requestTopic();
    await Promise.resolve();
    store.getState().resetSession();
    resolveSave();
    await Promise.allSettled([request]);

    expect(repository.deleteSession).toHaveBeenCalledWith("session-1");
    expect(api.generateTopic).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({
      session: null,
      loading: null,
      error: null,
      saveStatus: "idle",
    });
  });
});

describe("session persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces saves, flushes immediately, and never lets an old session overwrite a new one", async () => {
    const repository = createRepository();
    const controller = createSessionPersistenceController(repository, 500);
    const oldSession = {
      id: "old",
      stage: "setup",
      provider: "mock",
      model: "",
      promptVersion: "1",
      config: {
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
      },
      draftText: "old",
      rewriteText: "",
      createdAt: "2026-06-09T01:00:00.000Z",
      updatedAt: "2026-06-09T01:00:00.000Z",
    } satisfies TrainingSession;
    const newSession = {
      ...oldSession,
      id: "new",
      draftText: "new",
    } satisfies TrainingSession;

    controller.schedule(oldSession);
    controller.schedule(newSession);
    await vi.advanceTimersByTimeAsync(499);
    expect(repository.saveSession).not.toHaveBeenCalled();
    await controller.flush();
    expect(repository.saveSession).toHaveBeenCalledTimes(1);
    expect(repository.saveSession).toHaveBeenCalledWith(newSession);
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.saveSession).toHaveBeenCalledTimes(1);
  });

  it("compensates an in-flight save invalidated by reset and does not report saved", async () => {
    const repository = createRepository();
    let resolveSave!: () => void;
    vi.mocked(repository.saveSession).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const onSaved = vi.fn();
    const controller = createSessionPersistenceController(
      repository,
      500,
      { onSaved },
    );
    const session = setupSession("old");

    controller.schedule(session);
    const saving = controller.flush();
    await Promise.resolve();
    controller.cancelAndInvalidate();
    resolveSave();
    await saving;

    expect(repository.deleteSessionIfUnchanged).toHaveBeenCalledWith(
      session,
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("does not let stale-save compensation delete a new session after reset", async () => {
    const repository = createRepository();
    let resolveOldSave!: () => void;
    vi.mocked(repository.saveSession)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveOldSave = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const controller = createSessionPersistenceController(repository, 500);

    controller.schedule(setupSession("old"));
    const oldSaving = controller.flush();
    await Promise.resolve();
    controller.cancelAndInvalidate();
    const newer = {
      ...setupSession("old"),
      draftText: "newer same-id content",
      updatedAt: "2026-06-09T01:01:00.000Z",
    } satisfies TrainingSession;
    controller.schedule(newer);
    const newSaving = controller.flush();
    resolveOldSave();
    await Promise.all([oldSaving, newSaving]);

    expect(repository.deleteSessionIfUnchanged).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "old",
        draftText: "",
      }),
    );
    expect(repository.deleteSessionIfUnchanged).not.toHaveBeenCalledWith(
      newer,
    );
    expect(repository.saveSession).toHaveBeenLastCalledWith(
      newer,
    );
  });

  it("restores on mount, flushes on unmount, and exposes save failures without clearing text", async () => {
    const repository = createRepository();
    const restored: TrainingSession = {
      id: "restored",
      stage: "setup",
      provider: "mock",
      model: "",
      promptVersion: "1",
      config: {
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
      },
      draftText: "不能丢失",
      rewriteText: "",
      createdAt: "2026-06-09T01:00:00.000Z",
      updatedAt: "2026-06-09T01:00:00.000Z",
    };
    vi.mocked(repository.getActiveSession).mockResolvedValue(restored);
    vi.mocked(repository.saveSession).mockRejectedValue(
      new Error("quota"),
    );
    const store = createStore({ repository });

    const { unmount } = renderHook(
      () => useSessionPersistence(store, repository),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(StrictMode, null, children),
      },
    );
    await act(async () => Promise.resolve());
    expect(store.getState().session).toEqual(restored);

    act(() => store.getState().updateSetup({ difficulty: "challenging" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(store.getState().saveStatus).toBe("error");
    expect(store.getState().session?.draftText).toBe("不能丢失");

    unmount();
    expect(repository.saveSession).toHaveBeenCalled();
  });

  it("starts emergency persistence immediately on pagehide without waiting for the queue", async () => {
    const repository = createRepository();
    let resolveFirst!: () => void;
    vi.mocked(repository.saveSession).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const store = createStore({ repository });
    const { unmount } = renderHook(
      () => useSessionPersistence(store, repository),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(StrictMode, null, children),
      },
    );
    await act(async () => Promise.resolve());
    act(() => {
      store.getState().startSession({
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    act(() => store.getState().updateSetup({ difficulty: "challenging" }));

    window.dispatchEvent(new Event("pagehide"));

    expect(repository.saveSession).toHaveBeenCalledTimes(2);
    expect(repository.saveSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ difficulty: "challenging" }),
      }),
    );
    resolveFirst();
    unmount();
  });

  it("starts emergency persistence immediately when the document becomes hidden", async () => {
    const repository = createRepository();
    const store = createStore({ repository });
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    const { unmount } = renderHook(
      () => useSessionPersistence(store, repository),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(StrictMode, null, children),
      },
    );
    await act(async () => Promise.resolve());
    act(() => {
      store.getState().startSession({
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
      });
    });

    document.dispatchEvent(new Event("visibilitychange"));

    expect(repository.saveSession).toHaveBeenCalledOnce();
    visibility.mockRestore();
    unmount();
  });

  it("does not update store after unmount when an in-flight save settles", async () => {
    const repository = createRepository();
    let resolveSave!: () => void;
    vi.mocked(repository.saveSession).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const store = createStore({ repository });
    const savedSpy = vi.spyOn(store.getState(), "setSaveStatus");
    const errorSpy = vi.spyOn(store.getState(), "setPersistenceError");
    const { unmount } = renderHook(
      () => useSessionPersistence(store, repository),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(StrictMode, null, children),
      },
    );
    await act(async () => Promise.resolve());
    act(() => {
      store.getState().startSession({
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    savedSpy.mockClear();
    errorSpy.mockClear();

    unmount();
    resolveSave();
    await Promise.resolve();
    await Promise.resolve();

    expect(savedSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("keeps and persists a session created while restore is still pending", async () => {
    const repository = createRepository();
    let resolveRestore!: (session: TrainingSession | null) => void;
    vi.mocked(repository.getActiveSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRestore = resolve;
        }),
    );
    const store = createStore({ repository });
    const { unmount } = renderHook(() =>
      useSessionPersistence(store, repository),
    );

    act(() => {
      store.getState().startSession({
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
      });
    });
    resolveRestore({
      id: "stale",
      stage: "setup",
      provider: "mock",
      model: "",
      promptVersion: "1",
      config: {
        scenarioType: "life",
        difficulty: "easy",
        trainingGoal: "conciseness",
      },
      draftText: "旧会话",
      rewriteText: "",
      createdAt: "2026-06-08T01:00:00.000Z",
      updatedAt: "2026-06-08T01:00:00.000Z",
    });
    await act(async () => Promise.resolve());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(store.getState().session?.id).toBe("session-1");
    expect(repository.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-1" }),
    );
    unmount();
  });

  it("does not restore a session returned after an empty-store reset invalidates the restore token", async () => {
    const repository = createRepository();
    let resolveRestore!: (session: TrainingSession | null) => void;
    vi.mocked(repository.getActiveSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRestore = resolve;
        }),
    );
    const store = createStore({ repository });
    const { unmount } = renderHook(() =>
      useSessionPersistence(store, repository),
    );

    act(() => {
      store.getState().resetSession();
    });
    resolveRestore(setupSession("stale-restore"));
    await act(async () => Promise.resolve());

    expect(store.getState().session).toBeNull();
    unmount();
  });

  it("invalidates pending restore but still persists a new session started afterward", async () => {
    const repository = createRepository();
    let resolveRestore!: (session: TrainingSession | null) => void;
    vi.mocked(repository.getActiveSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRestore = resolve;
        }),
    );
    const ids = ["new-session"];
    const store = createStore({
      repository,
      id: () => ids.shift() ?? "unexpected",
    });
    const { unmount } = renderHook(() =>
      useSessionPersistence(store, repository),
    );

    act(() => {
      store.getState().resetSession();
      store.getState().startSession({
        scenarioType: "workplace",
        difficulty: "challenging",
        trainingGoal: "structureClarity",
      });
    });
    resolveRestore(setupSession("stale-restore"));
    await act(async () => Promise.resolve());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(store.getState().session?.id).toBe("new-session");
    expect(repository.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new-session" }),
    );
    unmount();
  });
});

function setupSession(id: string): TrainingSession {
  return {
    id,
    stage: "setup",
    provider: "mock",
    model: "",
    promptVersion: "1",
    config: {
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    },
    draftText: "",
    rewriteText: "",
    createdAt: `2026-06-09T01:00:00.000Z`,
    updatedAt: `2026-06-09T01:00:00.000Z`,
  };
}
