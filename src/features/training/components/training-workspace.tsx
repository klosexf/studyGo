"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useStore } from "zustand/react";

import { AppShell } from "@/components/app-shell/app-shell";
import { ErrorBanner } from "@/components/feedback/error-banner";
import { LoadingCard } from "@/components/feedback/loading-card";
import { Card } from "@/components/ui/card";
import {
  DIMENSION_LABELS,
  selectDashboard,
} from "@/features/dashboard/dashboard-selectors";
import { HistoryDrawer } from "@/features/history/history-drawer";
import {
  ProviderSettingsModal,
  type ProviderSettingsAdapter,
} from "@/features/settings/provider-settings-modal";
import { DiagnosisView } from "@/features/training/components/diagnosis-view";
import { DraftView } from "@/features/training/components/draft-view";
import { ResultView } from "@/features/training/components/result-view";
import { SetupView } from "@/features/training/components/setup-view";
import { StageTabs } from "@/features/training/components/stage-tabs";
import { TopicView } from "@/features/training/components/topic-view";
import { useSessionPersistence } from "@/features/training/hooks/use-session-persistence";
import {
  createTrainingApi,
  type TrainingApi,
} from "@/features/training/services/training-api";
import {
  createTrainingStore,
  type TrainingStore,
} from "@/features/training/store/training-store";
import type {
  TrainingRecord,
  TrainingSession,
  TrainingStage,
} from "@/features/training/types";
import { recommendGoal } from "@/lib/analytics/recommendation";
import { TrainingRepository } from "@/lib/storage/training-repository";

export const CURRENT_RESULT_KEY = "logic-trainer.current-result";
let volatileCurrentResultId: string | null = null;
let useVolatileResultMarker = false;

const defaultRepository = new TrainingRepository();
const defaultApi = createTrainingApi();
const STAGE_HEADING_IDS: Record<TrainingStage, string> = {
  setup: "setup-title",
  topic: "topic-title",
  draft: "draft-title",
  diagnosis: "diagnosis-title",
  result: "result-title",
};
const STAGE_ANNOUNCEMENTS: Record<TrainingStage, string> = {
  setup: "已进入第1步：设置",
  topic: "已进入第2步：命题",
  draft: "已进入第3步：初稿",
  diagnosis: "已进入第4步：诊断改写",
  result: "已进入第5步：结果复盘",
};
const STAGE_HEADERS: Record<
  TrainingStage,
  { title: string; subtitle: string }
> = {
  setup: { title: "设置训练", subtitle: "第 1 步 / 5" },
  topic: { title: "确认命题", subtitle: "第 2 步 / 5" },
  draft: { title: "写初稿", subtitle: "第 3 步 / 5" },
  diagnosis: { title: "诊断改写", subtitle: "第 4 步 / 5" },
  result: { title: "结果复盘", subtitle: "第 5 步 / 5" },
};
const HISTORY_GUARD_KEY = "__logicTrainerUnsavedResultGuard";
const HISTORY_BASE_KEY = "__logicTrainerUnsavedResultBase";

export function TrainingWorkspace({
  repository = defaultRepository,
  api = defaultApi,
  settingsStorage,
}: {
  repository?: TrainingRepository;
  api?: TrainingApi;
  settingsStorage?: ProviderSettingsAdapter;
}) {
  const [dependencies] = useState(() => ({
    repository,
    api,
    settingsStorage,
  }));
  const [store] = useState(() =>
    createTrainingStore({
      repository: dependencies.repository,
      api: dependencies.api,
    }),
  );
  const [ready, setReady] = useState(false);
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const [session, loadedRecords] = await Promise.all([
          dependencies.repository.getActiveSession(),
          dependencies.repository.listRecords(),
        ]);
        if (!active) {
          return;
        }
        setRecords(loadedRecords);
        if (session) {
          store.getState().restoreSession(session);
        } else {
          const resultId = readCurrentResultId();
          const resultRecovery = resultId
            ? await recoverMarkedResult(dependencies.repository, resultId)
            : { status: "none" as const };
          if (!active) {
            return;
          }
          if (resultRecovery.status === "found") {
            store.getState().restoreSession(
              recordToResultSession(resultRecovery.record),
            );
          } else {
            if (resultRecovery.status === "missing") {
              clearCurrentResultId();
            } else if (resultRecovery.status === "error") {
              clearCurrentResultId();
              setBootError(
                "无法恢复上次训练结果，已为你创建新的训练会话。",
              );
            }
            store.getState().startSession({
              scenarioType: "life",
              difficulty: "medium",
              trainingGoal: recommendGoal(loadedRecords),
            });
          }
        }
        setReady(true);
      } catch {
        if (active) {
          setBootError("无法读取本地训练数据，请检查浏览器存储权限。");
          setReady(true);
        }
      }
    }
    void bootstrap();
    return () => {
      active = false;
    };
  }, [dependencies.repository, store]);

  if (!ready) {
    return (
      <AppShell
        activeItem="training"
        main={<LoadingCard label="正在恢复训练进度…" />}
        insights={<p>正在读取本地会话。</p>}
      />
    );
  }

  return (
    <TrainingWorkspaceReady
      store={store}
      repository={dependencies.repository}
      settingsStorage={dependencies.settingsStorage}
      records={records}
      setRecords={setRecords}
      bootError={bootError}
    />
  );
}

function TrainingWorkspaceReady({
  store,
  repository,
  settingsStorage,
  records,
  setRecords,
  bootError,
}: {
  store: TrainingStore;
  repository: TrainingRepository;
  settingsStorage?: ProviderSettingsAdapter;
  records: TrainingRecord[];
  setRecords: Dispatch<SetStateAction<TrainingRecord[]>>;
  bootError: string | null;
}) {
  useSessionPersistence(store, repository, { restore: false });
  const state = useStore(store);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [completion, setCompletion] = useState<{
    id: string;
    state: "idle" | "saving" | "saved" | "error";
  } | null>(null);
  const completingRef = useRef<string | null>(null);

  useEffect(() => {
    const stage = state.session?.stage;
    if (!stage) {
      return;
    }
    const focusHeading = () => {
      document.getElementById(STAGE_HEADING_IDS[stage])?.focus();
    };
    const frameId =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(focusHeading)
        : window.setTimeout(focusHeading, 0);
    return () => {
      if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frameId);
      } else {
        window.clearTimeout(frameId);
      }
    };
  }, [state.session?.stage]);

  const saveResult = useCallback(async (
    session: Extract<TrainingSession, { stage: "result" }>,
  ) => {
    if (completingRef.current === session.id) {
      return;
    }
    writeCurrentResultId(session.id);
    completingRef.current = session.id;
    await Promise.resolve();
    setCompletion({ id: session.id, state: "saving" });
    const record = resultSessionToRecord(session);
    try {
      const existing = await repository.getRecord(session.id);
      if (!existing) {
        await repository.completeSession(record);
      }
      setRecords((current) => [
        existing ?? record,
        ...current.filter(({ id }) => id !== session.id),
      ]);
      setCompletion({ id: session.id, state: "saved" });
    } catch {
      setCompletion({ id: session.id, state: "error" });
    } finally {
      completingRef.current = null;
    }
  }, [repository, setRecords]);

  useEffect(() => {
    const session = state.session;
    if (!session || session.stage !== "result") {
      completingRef.current = null;
      return;
    }
    if (completion?.id === session.id) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void saveResult(session);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [completion?.id, saveResult, state.session]);

  const session = state.session;
  const completionState =
    session && completion?.id === session.id ? completion.state : "idle";
  const navigationBlocked =
    session?.stage === "result" && completionState !== "saved";
  const navigationGuardMessage = useUnsavedResultGuard(navigationBlocked);
  const retry = () => {
    if (!session) {
      return;
    }
    if (session.stage === "setup") {
      void store.getState().requestTopic().catch(() => undefined);
    } else if (session.stage === "topic") {
      void store.getState().regenerateTopic().catch(() => undefined);
    } else if (session.stage === "draft") {
      void store.getState().requestDiagnosis().catch(() => undefined);
    } else if (session.stage === "diagnosis") {
      void store.getState().requestComparison().catch(() => undefined);
    }
  };

  const abortRewrite = () => {
    store.getState().resetSession();
    clearCurrentResultId();
    window.location.assign("/");
  };

  const main = (
    <div className="training-workspace">
      {session ? (
        <>
          <header className="training-topbar">
            <div>
              {session.stage === "setup" ? (
                <h1 id="setup-title" tabIndex={-1}>
                  {STAGE_HEADERS[session.stage].title}
                </h1>
              ) : (
                <p className="training-topbar__title">
                  {STAGE_HEADERS[session.stage].title}
                </p>
              )}
              <p>{STAGE_HEADERS[session.stage].subtitle}</p>
            </div>
            <label className="training-search">
              <span className="sr-only">搜索命题、训练记录或短板</span>
              <input
                type="search"
                aria-label="搜索命题、训练记录或短板"
                placeholder="搜索命题、训练记录或短板"
              />
            </label>
          </header>
          <StageTabs stage={session.stage} onBack={store.getState().goBack} />
          <p className="stage-announcement" aria-live="polite">
            {STAGE_ANNOUNCEMENTS[session.stage]}
          </p>
        </>
      ) : null}
      {bootError ? <ErrorBanner message={bootError} /> : null}
      {navigationGuardMessage ? (
        <p role="alert">{navigationGuardMessage}</p>
      ) : null}
      {state.error ? (
        <ErrorBanner
          message={state.error.message}
          onRetry={state.error.retryable ? retry : undefined}
        />
      ) : null}
      {state.loading ? (
        <LoadingCard
          label={{
            topic: "正在生成训练命题…",
            diagnosis: "正在分析初稿…",
            comparison: "正在对比两版表达…",
          }[state.loading]}
        />
      ) : null}
      {session ? (
        <StageView
          session={session}
          store={store}
          completionState={completionState}
          onRetrySave={() => {
            if (session.stage === "result") {
              void saveResult(session);
            }
          }}
          onAbortRewrite={abortRewrite}
          records={records}
        />
      ) : (
        <LoadingCard label="正在创建训练…" />
      )}
    </div>
  );

  return (
    <>
      <AppShell
        activeItem="training"
        navigationDisabled={navigationBlocked}
        onDashboardNavigate={() => {
          if (navigationBlocked) {
            return;
          }
          if (session?.stage === "result") {
            clearCurrentResultId();
          }
          window.location.assign("/");
        }}
        onStartTraining={() => {
          if (navigationBlocked) {
            return;
          }
          if (session?.stage === "result") {
            clearCurrentResultId();
          }
          window.location.assign("/training");
        }}
        onHistory={() => setHistoryOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        main={main}
        insights={<TrainingInsights session={session} records={records} />}
      />
      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        records={records}
      />
      <ProviderSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        storage={settingsStorage}
        onClearTrainingData={async () => {
          await repository.clearTrainingData();
          setRecords([]);
        }}
      />
    </>
  );
}

function useUnsavedResultGuard(blocked: boolean) {
  const [message, setMessage] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!blocked) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [blocked]);

  useEffect(() => {
    if (!blocked) {
      const token = tokenRef.current;
      tokenRef.current = null;
      if (
        token
        && readHistoryMarker(window.history.state, HISTORY_GUARD_KEY) === token
      ) {
        window.history.go(-1);
      }
      return;
    }

    const currentToken = readHistoryMarker(
      window.history.state,
      HISTORY_GUARD_KEY,
    );
    const token =
      tokenRef.current
      ?? `result-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    tokenRef.current = token;

    if (currentToken !== token) {
      const currentState = historyStateObject(window.history.state);
      window.history.replaceState(
        { ...currentState, [HISTORY_BASE_KEY]: token },
        "",
        window.location.href,
      );
      window.history.pushState(
        { ...currentState, [HISTORY_GUARD_KEY]: token },
        "",
        window.location.href,
      );
    }

    const handlePopState = () => {
      setMessage("结果尚未保存，无法离开");
      window.history.go(1);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [blocked]);

  return blocked ? message : null;
}

function historyStateObject(state: unknown): Record<string, unknown> {
  return state && typeof state === "object"
    ? state as Record<string, unknown>
    : { previousState: state };
}

function readHistoryMarker(state: unknown, key: string) {
  if (!state || typeof state !== "object") {
    return null;
  }
  const value = (state as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function StageView({
  session,
  store,
  completionState,
  onRetrySave,
  onAbortRewrite,
  records,
}: {
  session: TrainingSession;
  store: TrainingStore;
  completionState: "idle" | "saving" | "saved" | "error";
  onRetrySave: () => void;
  onAbortRewrite: () => void;
  records: TrainingRecord[];
}) {
  const actions = store.getState();
  if (session.stage === "setup") {
    return (
      <SetupView
        config={session.config}
        provider={session.provider}
        loading={actions.loading === "topic"}
        onChange={actions.updateSetup}
        onGenerate={() => void actions.requestTopic().catch(() => undefined)}
      />
    );
  }
  if (session.stage === "topic") {
    return (
      <TopicView
        topic={session.topic}
        loading={actions.loading === "topic"}
        onBack={actions.goBack}
        onRegenerate={() =>
          void actions.regenerateTopic().catch(() => undefined)
        }
        onStart={actions.startDraft}
      />
    );
  }
  if (session.stage === "draft") {
    return (
      <DraftView
        topic={session.topic}
        value={session.draftText}
        saveStatus={actions.saveStatus}
        loading={actions.loading === "diagnosis"}
        onChange={actions.updateDraft}
        onBack={actions.goBack}
        onSubmit={() =>
          void actions.requestDiagnosis().catch(() => undefined)
        }
      />
    );
  }
  if (session.stage === "diagnosis") {
    return (
      <DiagnosisView
        topic={session.topic}
        diagnosis={session.diagnosis}
        value={session.rewriteText}
        loading={actions.loading === "comparison"}
        onChange={actions.updateRewrite}
        onSubmit={() =>
          void actions.requestComparison().catch(() => undefined)
        }
        onAbort={onAbortRewrite}
      />
    );
  }
  return (
    <ResultView
      session={session}
      saveStatus={completionState}
      onRetrySave={onRetrySave}
      onDashboard={() => {
        if (completionState !== "saved") {
          return;
        }
        clearCurrentResultId();
        window.location.assign("/");
      }}
      onAgain={() => {
        if (completionState !== "saved") {
          return;
        }
        clearCurrentResultId();
        actions.resetSession();
        actions.startSession({
          scenarioType: session.config.scenarioType,
          difficulty: session.config.difficulty,
          trainingGoal: recommendGoal(records),
        });
      }}
    />
  );
}

function TrainingInsights({
  session,
  records,
}: {
  session: TrainingSession | null;
  records: TrainingRecord[];
}) {
  if (!session) {
    return <p>训练准备中。</p>;
  }
  const abilityData = selectDashboard(records).abilityData;
  const copy = {
    setup: ["先设定目标", "目标越具体，诊断反馈越聚焦。"],
    topic: ["读清约束", "先识别问题中的冲突，再决定立场。"],
    draft: ["先完成再优化", "用结论、理由、例子和回应组织初稿。"],
    diagnosis: ["自己完成改写", "诊断提供方向，不替代你的表达。"],
    result: ["关注迁移", "把本次最低维度带到下一次训练。"],
  }[session.stage];
  return (
    <div className="insights-stack training-insights">
      <p className="eyebrow">训练建议</p>
      <h2>{copy[0]}</h2>
      <p>{copy[1]}</p>
      <Card tone="sage">
        <strong>训练目标</strong>
        <p>{DIMENSION_LABELS[session.config.trainingGoal]}</p>
      </Card>
      <section className="training-score-summary" aria-labelledby="training-score-title">
        <div>
          <p className="eyebrow">Local Record</p>
          <h3 id="training-score-title">能力评分</h3>
        </div>
        <div className="training-score-list">
          {abilityData.map((item) => (
            <div key={item.dimension}>
              <span>{item.label}</span>
              <strong>
                {item.score > 0 ? `${item.score} / 5` : "暂无评分"}
              </strong>
              <span
                className="training-score-track"
                aria-hidden="true"
              >
                <span style={{ width: `${(item.score / 5) * 100}%` }} />
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function resultSessionToRecord(
  session: Extract<TrainingSession, { stage: "result" }>,
): TrainingRecord {
  const completedAt = new Date().toISOString();
  return {
    id: session.id,
    provider: session.provider,
    model: session.model,
    promptVersion: session.promptVersion,
    config: session.config,
    draftText: session.draftText,
    rewriteText: session.rewriteText,
    createdAt: session.createdAt,
    updatedAt: completedAt,
    topic: session.topic,
    diagnosis: session.diagnosis,
    comparison: session.comparison,
    weakestDimension: session.comparison.weakestDimension,
    draftLogicScore: session.comparison.draftLogicScore,
    draftExpressionScore: session.comparison.draftExpressionScore,
    rewriteLogicScore: session.comparison.rewriteLogicScore,
    rewriteExpressionScore: session.comparison.rewriteExpressionScore,
    logicImprovement: session.comparison.logicImprovement,
    expressionImprovement: session.comparison.expressionImprovement,
    confidence: session.comparison.confidence,
    completedAt,
  };
}

function recordToResultSession(record: TrainingRecord): TrainingSession {
  return {
    id: record.id,
    stage: "result",
    provider: record.provider,
    model: record.model,
    promptVersion: record.promptVersion,
    config: record.config,
    draftText: record.draftText,
    rewriteText: record.rewriteText,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    topic: record.topic,
    diagnosis: record.diagnosis,
    comparison: record.comparison,
  };
}

function readCurrentResultId() {
  try {
    return window.localStorage.getItem(CURRENT_RESULT_KEY)
      ?? (useVolatileResultMarker ? volatileCurrentResultId : null);
  } catch {
    return volatileCurrentResultId;
  }
}

function writeCurrentResultId(id: string) {
  volatileCurrentResultId = id;
  try {
    window.localStorage.setItem(CURRENT_RESULT_KEY, id);
    useVolatileResultMarker = false;
  } catch {
    useVolatileResultMarker = true;
    // The in-memory marker still supports recovery during this page lifetime.
  }
}

function clearCurrentResultId() {
  volatileCurrentResultId = null;
  useVolatileResultMarker = false;
  try {
    window.localStorage.removeItem(CURRENT_RESULT_KEY);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

async function recoverMarkedResult(
  repository: TrainingRepository,
  id: string,
) {
  try {
    const record = await repository.getRecord(id);
    if (record) {
      return { status: "found" as const, record };
    }
    return { status: "missing" as const };
  } catch {
    return { status: "error" as const };
  }
}
