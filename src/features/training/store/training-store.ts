import { createStore, type StoreApi } from "zustand/vanilla";

import {
  loadProviderSettings,
  type ProviderSettings,
} from "@/features/settings/provider-settings-store";
import {
  providerConfigSchema,
  type ProviderConfig,
} from "@/features/training/schemas/requests";
import { assertTransition } from "@/features/training/state-machine";
import {
  AppClientError,
  createTrainingApi,
  type TrainingApi,
} from "@/features/training/services/training-api";
import type {
  CoachingFeedback,
  CoachingRoundState,
  DraftDiagnosis,
  RewriteComparison,
  TrainingConfig,
  TrainingSession,
  TrainingTopic,
} from "@/features/training/types";
import { TrainingRepository } from "@/lib/storage/training-repository";

export type AiOperation = "topic" | "diagnosis" | "coaching" | "comparison";
export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface TrainingStoreState {
  session: TrainingSession | null;
  loading: AiOperation | null;
  error: AppClientError | null;
  saveStatus: SaveStatus;
  persistenceEpoch: number;
  requestRevision: number;
  startSession(config: TrainingConfig): void;
  updateSetup(update: Partial<TrainingConfig>): void;
  setTopic(topic: TrainingTopic): void;
  startDraft(): void;
  updateDraft(text: string): void;
  setDiagnosis(diagnosis: DraftDiagnosis): void;
  startCoaching(): void;
  updateCoachingAnswer(text: string): void;
  requestCoachingFeedback(): Promise<void>;
  startFinalRewrite(): void;
  updateFinalRewrite(text: string): void;
  updateRewrite(text: string): void;
  setComparison(comparison: RewriteComparison): void;
  goBack(): void;
  restoreSession(session: TrainingSession): void;
  resetSession(): void;
  requestTopic(): Promise<void>;
  regenerateTopic(): Promise<void>;
  requestDiagnosis(): Promise<void>;
  requestComparison(): Promise<void>;
  setSaveStatus(status: SaveStatus): void;
  setPersistenceError(error: unknown): void;
}

export type TrainingStore = StoreApi<TrainingStoreState>;

export interface TrainingStoreDependencies {
  repository?: TrainingRepository;
  api?: TrainingApi;
  clock?: () => Date;
  id?: () => string;
  loadSettings?: () => ProviderSettings;
}

const promptVersion = "1";

export function createTrainingStore(
  dependencies: TrainingStoreDependencies = {},
): TrainingStore {
  const repository =
    dependencies.repository ?? new TrainingRepository();
  const api = dependencies.api ?? createTrainingApi();
  const clock = dependencies.clock ?? (() => new Date());
  const createId = dependencies.id ?? (() => crypto.randomUUID());
  const settingsLoader =
    dependencies.loadSettings ?? (() => loadProviderSettings());
  const activeRequests = new Map<
    AiOperation,
    { id: number; controller: AbortController }
  >();
  let nextRequestId = 0;

  const store = createStore<TrainingStoreState>((set, get) => {
    const failStage = (message: string): never => {
      const error = new AppClientError({
        code: "INVALID_STAGE",
        message,
        retryable: false,
        status: 0,
      });
      set({ error });
      throw error;
    };

    const requireSession = () => {
      const session = get().session;
      if (!session) {
        return failStage("当前没有可操作的训练会话。");
      }
      return session;
    };

    const updatedAt = () => clock().toISOString();

    const invalidateOperation = (operation: AiOperation) => {
      const active = activeRequests.get(operation);
      active?.controller.abort();
      if (active) {
        activeRequests.delete(operation);
        if (get().loading === operation) {
          set({ loading: null });
        }
      }
    };

    const beginRequest = (
      operation: AiOperation,
      fingerprint: string,
    ) => {
      activeRequests.get(operation)?.controller.abort();
      const request = {
        id: ++nextRequestId,
        controller: new AbortController(),
        revision: get().requestRevision,
        fingerprint,
      };
      activeRequests.set(operation, request);
      set({ loading: operation, error: null });
      return request;
    };

    const isCurrentRequest = (
      operation: AiOperation,
      requestId: number,
      sessionId: string,
      stage: TrainingSession["stage"],
      revision: number,
      fingerprint: string,
    ) => {
      const active = activeRequests.get(operation);
      const session = get().session;
      return (
        active?.id === requestId &&
        session?.id === sessionId &&
        session.stage === stage &&
        get().requestRevision === revision &&
        requestFingerprint(operation, session) === fingerprint
      );
    };

    const finishRequest = (
      operation: AiOperation,
      requestId: number,
    ) => {
      if (activeRequests.get(operation)?.id === requestId) {
        activeRequests.delete(operation);
        set({ loading: null });
      }
    };

    const handleRequestError = (
      operation: AiOperation,
      requestId: number,
      error: unknown,
    ) => {
      if (activeRequests.get(operation)?.id !== requestId) {
        return;
      }
      const clientError =
        error instanceof AppClientError
          ? error
          : new AppClientError({
              code: "CLIENT_ERROR",
              message: "操作失败，请重试。",
              retryable: true,
              status: 0,
            });
      set({ error: clientError });
      throw clientError;
    };

    const saveBeforeRequest = async (session: TrainingSession) => {
      set({ saveStatus: "saving" });
      try {
        await repository.saveSession(session);
        const current = get().session;
        if (!sameSessionSnapshot(current, session)) {
          await repository.deleteSessionIfUnchanged(session);
          throw new AppClientError({
            code: "REQUEST_ABORTED",
            message: "请求已取消。",
            retryable: true,
            status: 0,
          });
        }
        set({ saveStatus: "saved" });
      } catch (error) {
        if (!sameSessionSnapshot(get().session, session)) {
          throw error instanceof AppClientError
            ? error
            : new AppClientError({
                code: "REQUEST_ABORTED",
                message: "请求已取消。",
                retryable: true,
                status: 0,
              });
        }
        const clientError = persistenceError(error);
        set({ saveStatus: "error", error: clientError });
        throw clientError;
      }
    };

    const applyCoachingFeedback = (feedback: CoachingFeedback) => {
      const session = get().session;
      if (!session || session.stage !== "coaching") {
        return;
      }
      const currentRound = session.coachingRounds[session.currentRoundIndex];
      if (!currentRound || currentRound.planned.id !== feedback.roundId) {
        return;
      }
      const terminal =
        feedback.status === "passed" ||
        feedback.status === "recorded_weakness";
      const updatedRounds = session.coachingRounds.map((round, index) => {
        if (index !== session.currentRoundIndex) {
          return round;
        }
        const status: CoachingRoundState["status"] =
          feedback.status === "passed" ||
          feedback.status === "recorded_weakness"
            ? feedback.status
            : "pending";
        return {
          ...round,
          attempts: [...round.attempts, feedback],
          userAnswers: [...round.userAnswers, session.currentAnswer],
          status,
        };
      });
      const nextIndex =
        terminal && session.currentRoundIndex < updatedRounds.length - 1
          ? session.currentRoundIndex + 1
          : session.currentRoundIndex;
      set({
        session: {
          ...session,
          coachingRounds: updatedRounds,
          currentRoundIndex: nextIndex,
          currentAnswer: terminal ? "" : session.currentAnswer,
          updatedAt: updatedAt(),
        },
        error: null,
        saveStatus: "idle",
      });
    };

    return {
      session: null,
      loading: null,
      error: null,
      saveStatus: "idle",
      persistenceEpoch: 0,
      requestRevision: 0,

      startSession(config) {
        abortAll(activeRequests);
        const now = updatedAt();
        const provider = resolveProvider(settingsLoader());
        set({
          session: {
            id: createId(),
            stage: "setup",
            provider: provider.provider,
            model: provider.model,
            promptVersion,
            config,
            draftText: "",
            rewriteText: "",
            createdAt: now,
            updatedAt: now,
          },
          loading: null,
          error: null,
          saveStatus: "idle",
          persistenceEpoch: get().persistenceEpoch + 1,
          requestRevision: get().requestRevision + 1,
        });
      },

      updateSetup(update) {
        const session = requireSession();
        if (session.stage !== "setup") {
          return failStage("训练设置只能在 setup stage 修改。");
        }
        invalidateOperation("topic");
        set({
          session: {
            ...session,
            config: { ...session.config, ...update },
            updatedAt: updatedAt(),
          },
          error: null,
          saveStatus: "idle",
          requestRevision: get().requestRevision + 1,
        });
      },

      setTopic(topic) {
        const session = requireSession();
        if (session.stage !== "setup") {
          return failStage("命题只能从 setup stage 设置。");
        }
        assertTransition(session.stage, "topic");
        set({
          session: {
            ...session,
            stage: "topic",
            topic,
            updatedAt: updatedAt(),
          },
          error: null,
          saveStatus: "idle",
        });
      },

      startDraft() {
        const session = requireSession();
        if (session.stage !== "topic") {
          return failStage("初稿只能从 topic stage 开始。");
        }
        assertTransition(session.stage, "draft");
        set({
          session: {
            ...session,
            stage: "draft",
            updatedAt: updatedAt(),
          },
          error: null,
          saveStatus: "idle",
        });
      },

      updateDraft(text) {
        const session = requireSession();
        if (session.stage !== "draft") {
          return failStage("初稿只能在 draft stage 修改。");
        }
        invalidateOperation("diagnosis");
        set({
          session: {
            ...session,
            draftText: text,
            updatedAt: updatedAt(),
          },
          error: null,
          saveStatus: "idle",
          requestRevision: get().requestRevision + 1,
        });
      },

      setDiagnosis(diagnosis) {
        const session = requireSession();
        if (session.stage !== "draft") {
          return failStage("诊断只能从 draft stage 设置。");
        }
        assertTransition(session.stage, "diagnosis");
        set({
          session: {
            ...session,
            stage: "diagnosis",
            diagnosis,
            updatedAt: updatedAt(),
          },
          error: null,
          saveStatus: "idle",
        });
      },

      startCoaching() {
        const session = requireSession();
        if (session.stage !== "diagnosis") {
          return failStage("追问训练只能从 diagnosis stage 开始。");
        }
        assertTransition(session.stage, "coaching");
        set({
          session: {
            ...session,
            stage: "coaching",
            coachingRounds: session.diagnosis.plannedCoachingRounds.map(
              (planned): CoachingRoundState => ({
                planned,
                attempts: [],
                userAnswers: [],
                status: "pending",
              }),
            ),
            currentRoundIndex: 0,
            currentAnswer: "",
            updatedAt: updatedAt(),
          },
          error: null,
          saveStatus: "idle",
          requestRevision: get().requestRevision + 1,
        });
      },

      updateCoachingAnswer(text) {
        const session = requireSession();
        if (session.stage !== "coaching") {
          return failStage("追问回答只能在 coaching stage 修改。");
        }
        invalidateOperation("coaching");
        set({
          session: {
            ...session,
            currentAnswer: text,
            updatedAt: updatedAt(),
          },
          error: null,
          saveStatus: "idle",
          requestRevision: get().requestRevision + 1,
        });
      },

      async requestCoachingFeedback() {
        const session = requireSession();
        if (session.stage !== "coaching") {
          return failStage("只能在 coaching stage 请求追问反馈。");
        }
        const currentRound = session.coachingRounds[session.currentRoundIndex];
        if (!currentRound) {
          return failStage("当前没有可请求的追问轮次。");
        }
        const request = beginRequest(
          "coaching",
          requestFingerprint("coaching", session),
        );
        try {
          await saveBeforeRequest(session);
          const feedback = await api.coachRound(
            {
              provider: providerForSession(session, settingsLoader()),
              topic: session.topic,
              draftText: session.draftText,
              diagnosis: session.diagnosis,
              plannedRound: currentRound.planned,
              previousRounds: session.coachingRounds.flatMap((round) =>
                round.attempts,
              ),
              userAnswer: session.currentAnswer,
              attempt: currentRound.attempts.length + 1,
            },
            request.controller.signal,
          );
          if (
            isCurrentRequest(
              "coaching",
              request.id,
              session.id,
              "coaching",
              request.revision,
              request.fingerprint,
            )
          ) {
            applyCoachingFeedback(feedback);
          }
        } catch (error) {
          handleRequestError("coaching", request.id, error);
        } finally {
          finishRequest("coaching", request.id);
        }
      },

      startFinalRewrite() {
        const session = requireSession();
        if (session.stage !== "coaching") {
          return failStage("最终复述只能从 coaching stage 开始。");
        }
        if (session.coachingRounds.some((round) => round.status === "pending")) {
          return failStage("完成所有追问轮次后才能进入最终复述。");
        }
        assertTransition(session.stage, "finalRewrite");
        const finalRewriteText = session.finalRewriteText ?? session.rewriteText;
        set({
          session: {
            ...session,
            stage: "finalRewrite",
            finalRewriteText,
            rewriteText: finalRewriteText,
            updatedAt: updatedAt(),
          },
          error: null,
          saveStatus: "idle",
          requestRevision: get().requestRevision + 1,
        });
      },

      updateFinalRewrite(text) {
        const session = requireSession();
        if (session.stage !== "finalRewrite") {
          return failStage("最终复述只能在 finalRewrite stage 修改。");
        }
        invalidateOperation("comparison");
        set({
          session: {
            ...session,
            finalRewriteText: text,
            rewriteText: text,
            updatedAt: updatedAt(),
          },
          error: null,
          saveStatus: "idle",
          requestRevision: get().requestRevision + 1,
        });
      },

      updateRewrite(text) {
        const session = requireSession();
        if (session.stage !== "diagnosis") {
          return failStage("改写只能在 diagnosis stage 修改。");
        }
        invalidateOperation("comparison");
        set({
          session: {
            ...session,
            rewriteText: text,
            updatedAt: updatedAt(),
          },
          error: null,
          saveStatus: "idle",
          requestRevision: get().requestRevision + 1,
        });
      },

      setComparison(comparison) {
        const session = requireSession();
        if (session.stage !== "finalRewrite") {
          return failStage("对比结果只能从 finalRewrite stage 设置。");
        }
        assertTransition(session.stage, "result");
        set({
          session: {
            ...session,
            stage: "result",
            comparison,
            updatedAt: updatedAt(),
          },
          error: null,
          saveStatus: "idle",
        });
      },

      goBack() {
        const session = requireSession();
        if (session.stage === "topic") {
          assertTransition("topic", "setup");
          set({
            session: {
              ...baseSession(session),
              stage: "setup",
              updatedAt: updatedAt(),
            },
            error: null,
            saveStatus: "idle",
          });
          return;
        }
        if (session.stage === "draft") {
          assertTransition("draft", "topic");
          set({
            session: {
              ...session,
              stage: "topic",
              updatedAt: updatedAt(),
            },
            error: null,
            saveStatus: "idle",
          });
          return;
        }
        if (session.stage === "result") {
          assertTransition("result", "setup");
          set({
            session: {
              ...baseSession(session),
              stage: "setup",
              updatedAt: updatedAt(),
            },
            error: null,
            saveStatus: "idle",
          });
          return;
        }
        return failStage(
          `当前 ${session.stage} stage 不允许返回上一步。`,
        );
      },

      restoreSession(session) {
        abortAll(activeRequests);
        set({
          session,
          loading: null,
          error: null,
          saveStatus: "saved",
          persistenceEpoch: get().persistenceEpoch + 1,
          requestRevision: get().requestRevision + 1,
        });
      },

      resetSession() {
        const sessionId = get().session?.id;
        abortAll(activeRequests);
        set({
          session: null,
          loading: null,
          error: null,
          saveStatus: "idle",
          persistenceEpoch: get().persistenceEpoch + 1,
          requestRevision: get().requestRevision + 1,
        });
        if (sessionId) {
          void repository.deleteSession(sessionId).catch((error) => {
            get().setPersistenceError(error);
          });
        }
      },

      async requestTopic() {
        const session = requireSession();
        if (session.stage !== "setup") {
          return failStage("只能在 setup stage 请求命题。");
        }
        const request = beginRequest(
          "topic",
          requestFingerprint("topic", session),
        );
        try {
          await saveBeforeRequest(session);
          const topic = await api.generateTopic(
            {
              provider: providerForSession(session, settingsLoader()),
              ...session.config,
              recentTopicTags: [],
            },
            request.controller.signal,
          );
          if (
            isCurrentRequest(
              "topic",
              request.id,
              session.id,
              "setup",
              request.revision,
              request.fingerprint,
            )
          ) {
            get().setTopic(topic);
          }
        } catch (error) {
          handleRequestError("topic", request.id, error);
        } finally {
          finishRequest("topic", request.id);
        }
      },

      async regenerateTopic() {
        const session = requireSession();
        if (session.stage !== "topic") {
          return failStage("只能在 topic stage 重新生成命题。");
        }
        const request = beginRequest(
          "topic",
          requestFingerprint("topic", session),
        );
        try {
          await saveBeforeRequest(session);
          const topic = await api.generateTopic(
            {
              provider: providerForSession(session, settingsLoader()),
              ...session.config,
              recentTopicTags: session.topic.topicTags,
            },
            request.controller.signal,
          );
          if (
            isCurrentRequest(
              "topic",
              request.id,
              session.id,
              "topic",
              request.revision,
              request.fingerprint,
            )
          ) {
            set({
              session: {
                ...session,
                topic,
                updatedAt: updatedAt(),
              },
              error: null,
              saveStatus: "idle",
            });
          }
        } catch (error) {
          handleRequestError("topic", request.id, error);
        } finally {
          finishRequest("topic", request.id);
        }
      },

      async requestDiagnosis() {
        const session = requireSession();
        if (session.stage !== "draft") {
          return failStage("只能在 draft stage 请求诊断。");
        }
        const request = beginRequest(
          "diagnosis",
          requestFingerprint("diagnosis", session),
        );
        try {
          await saveBeforeRequest(session);
          const diagnosis = await api.diagnoseDraft(
            {
              provider: providerForSession(session, settingsLoader()),
              topic: session.topic,
              draftText: session.draftText,
            },
            request.controller.signal,
          );
          if (
            isCurrentRequest(
              "diagnosis",
              request.id,
              session.id,
              "draft",
              request.revision,
              request.fingerprint,
            )
          ) {
            get().setDiagnosis(diagnosis);
          }
        } catch (error) {
          handleRequestError("diagnosis", request.id, error);
        } finally {
          finishRequest("diagnosis", request.id);
        }
      },

      async requestComparison() {
        const session = requireSession();
        if (session.stage !== "finalRewrite") {
          return failStage(
            "只能在 finalRewrite stage 请求改写对比。",
          );
        }
        const request = beginRequest(
          "comparison",
          requestFingerprint("comparison", session),
        );
        try {
          await saveBeforeRequest(session);
          const comparison = await api.compareRewrite(
            {
              provider: providerForSession(session, settingsLoader()),
              topic: session.topic,
              draftText: session.draftText,
              rewriteText: session.finalRewriteText,
              diagnosis: session.diagnosis,
            },
            request.controller.signal,
          );
          if (
            isCurrentRequest(
              "comparison",
              request.id,
              session.id,
              "finalRewrite",
              request.revision,
              request.fingerprint,
            )
          ) {
            get().setComparison(comparison);
          }
        } catch (error) {
          handleRequestError("comparison", request.id, error);
        } finally {
          finishRequest("comparison", request.id);
        }
      },

      setSaveStatus(saveStatus) {
        set({ saveStatus });
      },

      setPersistenceError(error) {
        set({
          saveStatus: "error",
          error: persistenceError(error),
        });
      },
    };
  });

  return store;
}

function resolveProvider(settings: ProviderSettings): ProviderConfig {
  const selected = settings.selectedProvider;
  const profile = settings.profiles[selected];
  const parsed = providerConfigSchema.safeParse({
    provider: selected,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
  });
  if (parsed.success) {
    return parsed.data;
  }
  return {
    provider: "mock",
    baseUrl: "",
    apiKey: "",
    model: "",
  };
}

function providerForSession(
  session: TrainingSession,
  settings: ProviderSettings,
): ProviderConfig {
  if (session.provider === "mock") {
    return {
      provider: "mock",
      baseUrl: "",
      apiKey: "",
      model: session.model,
    };
  }
  const profile = settings.profiles[session.provider];
  return providerConfigSchema.parse({
    provider: session.provider,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: session.model,
  });
}

function baseSession(session: TrainingSession) {
  return {
    id: session.id,
    provider: session.provider,
    model: session.model,
    promptVersion: session.promptVersion,
    config: session.config,
    draftText: session.draftText,
    rewriteText: session.rewriteText,
    createdAt: session.createdAt,
  };
}

function abortAll(
  requests: Map<
    AiOperation,
    { id: number; controller: AbortController }
  >,
) {
  for (const request of requests.values()) {
    request.controller.abort();
  }
  requests.clear();
}

function persistenceError(_error: unknown) {
  return new AppClientError({
    code: "SAVE_FAILED",
    message: "自动保存失败，当前文本仍保留在页面中。",
    retryable: true,
    status: 0,
  });
}

function sameSessionSnapshot(
  current: TrainingSession | null,
  captured: TrainingSession,
) {
  return (
    current !== null &&
    stableRequestValue(current) === stableRequestValue(captured)
  );
}

function requestFingerprint(
  operation: AiOperation,
  session: TrainingSession,
) {
  if (operation === "topic") {
    return stableRequestValue(session.config);
  }
  if (operation === "diagnosis") {
    return stableRequestValue({
      topic: "topic" in session ? session.topic : null,
      draftText: session.draftText,
    });
  }
  if (operation === "coaching") {
    return stableRequestValue({
      topic: "topic" in session ? session.topic : null,
      draftText: session.draftText,
      diagnosis: "diagnosis" in session ? session.diagnosis : null,
      currentRoundIndex:
        "currentRoundIndex" in session ? session.currentRoundIndex : null,
      currentAnswer: "currentAnswer" in session ? session.currentAnswer : null,
      coachingRounds:
        "coachingRounds" in session ? session.coachingRounds : null,
    });
  }
  return stableRequestValue({
    topic: "topic" in session ? session.topic : null,
    draftText: session.draftText,
    rewriteText:
      "finalRewriteText" in session && session.finalRewriteText !== undefined
        ? session.finalRewriteText
        : session.rewriteText,
    diagnosis: "diagnosis" in session ? session.diagnosis : null,
  });
}

function stableRequestValue(value: unknown) {
  return JSON.stringify(value);
}
