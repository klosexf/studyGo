import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrainingWorkspace } from "@/features/training/components/training-workspace";
import {
  countCharacters,
  DraftView,
} from "@/features/training/components/draft-view";
import { DiagnosisView } from "@/features/training/components/diagnosis-view";
import { ResultView } from "@/features/training/components/result-view";
import { StageTabs } from "@/features/training/components/stage-tabs";
import { AppClientError, type TrainingApi } from "@/features/training/services/training-api";
import type { ProviderSettingsAdapter } from "@/features/settings/provider-settings-modal";
import { DEFAULT_PROVIDER_SETTINGS } from "@/features/settings/provider-settings-store";
import type {
  TrainingRecord,
  TrainingSession,
} from "@/features/training/types";
import type { TrainingRepository } from "@/lib/storage/training-repository";
import {
  coachingFeedbackFixture,
  comparisonFixture,
  diagnosisFixture,
  trainingRecord,
  trainingTopic,
} from "@/../tests/fixtures/training";

const text = (length: number) => "论".repeat(length);

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
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

function createSettingsStorage(): ProviderSettingsAdapter {
  return {
    load: vi.fn(() => structuredClone(DEFAULT_PROVIDER_SETTINGS)),
    save: vi.fn(),
    clear: vi.fn(),
  };
}

function createRepository(options: {
  active?: TrainingSession | null;
  records?: TrainingRecord[];
} = {}) {
  let active = options.active ?? null;
  let records = [...(options.records ?? [])];
  return {
    saveSession: vi.fn(async (session: TrainingSession) => {
      active = session;
    }),
    getActiveSession: vi.fn(async () => active),
    deleteSession: vi.fn(async () => {
      active = null;
    }),
    deleteSessionIfUnchanged: vi.fn(async () => true),
    completeSession: vi.fn(async (record: TrainingRecord) => {
      records = [record, ...records.filter(({ id }) => id !== record.id)];
      active = null;
    }),
    listRecords: vi.fn(async () => records),
    getRecord: vi.fn(async (id: string) =>
      records.find((record) => record.id === id),
    ),
    clearTrainingData: vi.fn(async () => {
      active = null;
      records = [];
    }),
  } as unknown as TrainingRepository;
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

function resultSession(
  record = trainingRecord(),
): Extract<TrainingSession, { stage: "result" }> {
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

async function renderWorkspace(options: {
  repository?: TrainingRepository;
  api?: TrainingApi;
} = {}) {
  const repository = options.repository ?? createRepository();
  const api = options.api ?? createApi();
  render(<TrainingWorkspace repository={repository} api={api} />);
  await screen.findByRole("heading", { name: "设置训练" });
  return { repository, api };
}

async function reachDraft() {
  await userEvent.click(screen.getByRole("button", { name: "生成训练命题" }));
  await screen.findByRole("heading", { name: trainingTopic.title });
  await userEvent.click(screen.getByRole("button", { name: "开始写初稿" }));
  return screen.getByRole("textbox", { name: "初稿" });
}

async function reachDiagnosis() {
  const draft = await reachDraft();
  fireEvent.change(draft, { target: { value: text(200) } });
  await userEvent.click(screen.getByRole("button", { name: "提交初稿诊断" }));
  await screen.findByRole("heading", { name: "诊断与改写" });
  return screen.getByRole("textbox", { name: "二次改写" });
}

describe("TrainingWorkspace", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    window.localStorage.clear();
  });

  it("completes the five-stage mock flow and records accurate results once", async () => {
    const repository = createRepository();
    const api = createApi();
    await renderWorkspace({ repository, api });

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByRole("navigation", { name: "训练进度" })).toBeInTheDocument();

    const draft = await reachDraft();
    fireEvent.change(draft, { target: { value: text(199) } });
    expect(screen.getByText("199 / 400")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交初稿诊断" })).toBeDisabled();

    fireEvent.change(draft, { target: { value: text(200) } });
    expect(screen.getByRole("button", { name: "提交初稿诊断" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "提交初稿诊断" }));

    const rewrite = await screen.findByRole("textbox", { name: "二次改写" });
    expect(screen.getByRole("button", { name: "查看结果复盘" })).toBeDisabled();
    fireEvent.change(rewrite, { target: { value: text(200) } });
    await userEvent.click(screen.getByRole("button", { name: "查看结果复盘" }));

    await screen.findByRole("heading", { name: "结果复盘" });
    await waitFor(() => expect(repository.completeSession).toHaveBeenCalledTimes(1));
    const record = vi.mocked(repository.completeSession).mock.calls[0][0];
    expect(record).toMatchObject({
      id: expect.any(String),
      weakestDimension: "counterargumentAwareness",
      draftLogicScore: 3,
      rewriteLogicScore: 3.5,
      provider: "mock",
      promptVersion: "1",
    });
    expect(api.generateTopic).toHaveBeenCalledTimes(1);
    expect(api.diagnoseDraft).toHaveBeenCalledTimes(1);
    expect(api.compareRewrite).toHaveBeenCalledTimes(1);

    await act(async () => {
      await Promise.resolve();
    });
    expect(repository.completeSession).toHaveBeenCalledTimes(1);
  });

  it("renders training stages as a semantic progress list without tab roles", () => {
    const onBack = vi.fn();
    render(<StageTabs stage="draft" onBack={onBack} />);

    const progress = screen.getByRole("navigation", { name: "训练进度" });
    expect(progress.querySelectorAll("ol > li")).toHaveLength(5);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByText("写初稿").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: /命题.*已完成/ })).toBeEnabled();
    expect(screen.getByText("设置训练").closest("li")).toHaveTextContent(
      "设置训练已完成",
    );
    expect(screen.getByText("诊断改写").closest("li")).toHaveTextContent(
      "诊断改写待进行",
    );
    fireEvent.click(screen.getByRole("button", { name: /命题.*已完成/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("renders the setup stage with the approved dashboard composition", async () => {
    await renderWorkspace();

    expect(
      screen.getByRole("searchbox", {
        name: "搜索命题、训练记录或短板",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("第 1 步 / 5")).toBeInTheDocument();
    expect(screen.getByText("确认命题")).toBeInTheDocument();
    expect(screen.getByText("写初稿")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "选择训练场景" }),
    ).toBeInTheDocument();
    expect(screen.getByText("系统推荐训练重点")).toBeInTheDocument();
    expect(screen.getByText("论证 / 证据充分")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /生活价值观点/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "中等" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "生成训练命题" }),
    ).toBeEnabled();
    const insights = screen.getByRole("complementary", {
      name: "训练洞察",
    });
    expect(insights).toHaveTextContent("训练建议");
    expect(insights).toHaveTextContent("能力评分");
    expect(insights).toHaveTextContent("论证充分");
    expect(insights).toHaveTextContent("暂无评分");
  });

  it("counts grapheme clusters instead of Unicode code points", () => {
    expect(countCharacters("e\u0301")).toBe(1);
    expect(countCharacters("👨‍👩‍👧‍👦")).toBe(1);
    expect(countCharacters("👍🏽")).toBe(1);
  });

  it("announces a fixed draft error only after blur and removes it when valid", async () => {
    function DraftHarness() {
      const [value, setValue] = useState("");
      return (
        <DraftView
          topic={trainingTopic}
          value={value}
          saveStatus="idle"
          loading={false}
          onChange={setValue}
          onBack={vi.fn()}
          onSubmit={vi.fn()}
        />
      );
    }

    const { container } = render(<DraftHarness />);
    const textarea = screen.getByRole("textbox", { name: "初稿" });
    const counter = screen.getByText("0 / 400");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(textarea).toHaveAttribute("aria-invalid", "false");
    expect(textarea).toHaveAttribute("aria-describedby", counter.id);

    await userEvent.type(textarea, "论");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.blur(textarea);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("请输入 200 至 400 个字符");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea.getAttribute("aria-describedby")).toBe(
      `${counter.id} ${alert.id}`,
    );

    await userEvent.type(textarea, "证");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "请输入 200 至 400 个字符",
    );

    fireEvent.change(textarea, { target: { value: text(200) } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(textarea).toHaveAttribute("aria-invalid", "false");
    expect(textarea).toHaveAttribute("aria-describedby", counter.id);
  });

  it("announces a fixed rewrite error only after blur and removes it when valid", async () => {
    function RewriteHarness() {
      const [value, setValue] = useState("");
      return (
        <DiagnosisView
          topic={trainingTopic}
          diagnosis={diagnosisFixture()}
          value={value}
          loading={false}
          onChange={setValue}
          onSubmit={vi.fn()}
          onAbort={vi.fn()}
        />
      );
    }

    const { container } = render(<RewriteHarness />);
    const textarea = screen.getByRole("textbox", { name: "二次改写" });
    const counter = screen.getByText("0 / 400");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(textarea).toHaveAttribute("aria-invalid", "false");
    expect(textarea).toHaveAttribute("aria-describedby", counter.id);

    await userEvent.type(textarea, "论");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.blur(textarea);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("请输入 200 至 400 个字符");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea.getAttribute("aria-describedby")).toBe(
      `${counter.id} ${alert.id}`,
    );

    await userEvent.type(textarea, "证");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "请输入 200 至 400 个字符",
    );

    fireEvent.change(textarea, { target: { value: text(200) } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(textarea).toHaveAttribute("aria-invalid", "false");
    expect(textarea).toHaveAttribute("aria-describedby", counter.id);
  });

  it("renders the approved topic confirmation card structure", async () => {
    await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: "生成训练命题" }));
    const topicHeading = await screen.findByRole("heading", {
      name: trainingTopic.title,
    });
    expect(topicHeading.closest("section")).toHaveClass(
      "training-stage--topic",
    );
    expect(
      screen.getByRole("navigation", { name: "训练进度" }),
    ).toHaveClass("stage-tabs--topic");
    const topicCard = topicHeading.closest(".topic-card");
    expect(topicCard).toBeInTheDocument();
    expect(topicCard).toHaveTextContent("生活价值观点");
    expect(topicCard).toHaveTextContent("中等");
    expect(topicCard).toHaveTextContent("职业选择");
    expect(topicCard).toHaveTextContent("场景背景");
    expect(topicCard).toHaveTextContent("主问题");
    expect(topicCard).toHaveTextContent("表达任务");
    expect(screen.queryByRole("heading", { name: "表达约束" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "评分重点" })).not.toBeInTheDocument();
  });

  it("shows the complete topic, diagnosis, and result contracts", async () => {
    await renderWorkspace();

    await userEvent.click(screen.getByRole("button", { name: "生成训练命题" }));
    await screen.findByRole("heading", { name: trainingTopic.title });
    expect(screen.getByText("生活价值观点")).toBeInTheDocument();
    expect(screen.getByText("中等")).toBeInTheDocument();
    expect(screen.getByText(trainingTopic.background)).toBeInTheDocument();
    expect(screen.getByText(trainingTopic.mainQuestion)).toBeInTheDocument();
    expect(screen.getByText(trainingTopic.writingTask)).toBeInTheDocument();
    for (const tag of trainingTopic.topicTags) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole("button", { name: "开始写初稿" }));
    fireEvent.change(screen.getByRole("textbox", { name: "初稿" }), {
      target: { value: text(200) },
    });
    await userEvent.click(screen.getByRole("button", { name: "提交初稿诊断" }));
    await screen.findByRole("heading", { name: "诊断与改写" });
    const diagnosis = diagnosisFixture();
    expect(screen.getByText(diagnosis.summary)).toBeInTheDocument();
    expect(screen.getByText(diagnosis.keyLogicIssue)).toBeInTheDocument();
    expect(screen.getByText(diagnosis.keyExpressionIssue)).toBeInTheDocument();
    expect(screen.getByText(diagnosis.socraticQuestion)).toBeInTheDocument();
    expect(screen.getByText(diagnosis.rewriteTask)).toBeInTheDocument();
    expect(
      screen.getByText(/逻辑 3 · 表达 3 · 覆盖 8\/8/),
    ).toBeInTheDocument();
    for (const score of diagnosis.scores) {
      expect(screen.getByText(score.evidence)).toBeInTheDocument();
    }

    fireEvent.change(screen.getByRole("textbox", { name: "二次改写" }), {
      target: { value: text(200) },
    });
    await userEvent.click(screen.getByRole("button", { name: "查看结果复盘" }));
    await screen.findByRole("heading", { name: "结果复盘" });
    const comparison = comparisonFixture();
    expect(screen.getAllByText("3 → 3.5")).toHaveLength(2);
    expect(screen.getAllByText(/提升 \+0.5/)).toHaveLength(2);
    expect(screen.getByText("诊断置信度")).toBeInTheDocument();
    expect(screen.getByText("中等")).toBeInTheDocument();
    expect(screen.getByText("覆盖度 8/8")).toBeInTheDocument();
    expect(screen.getAllByText(text(200))).toHaveLength(2);
    expect(screen.getByText(comparison.improvedPoints[0])).toBeInTheDocument();
    expect(screen.getByText(comparison.remainingIssue)).toBeInTheDocument();
    expect(screen.getByText(comparison.nextTrainingSuggestion)).toBeInTheDocument();
    expect(screen.getByText(/来源：Mock · Provider mock/)).toBeInTheDocument();
    expect(screen.getAllByText("3 → 3")).toHaveLength(7);
    expect(screen.getByText("3 → 2.5")).toBeInTheDocument();
  });

  it("retries a failed result save without duplicate records or sessions", async () => {
    const repository = createRepository();
    vi.mocked(repository.completeSession)
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockImplementationOnce(async (record: TrainingRecord) => {
        await createRepository().completeSession(record);
        const original = createRepository({ records: [record] });
        vi.mocked(repository.listRecords).mockImplementation(original.listRecords);
        vi.mocked(repository.getRecord).mockImplementation(original.getRecord);
        vi.mocked(repository.getActiveSession).mockResolvedValue(null);
      });
    await renderWorkspace({ repository });
    const rewrite = await reachDiagnosis();
    fireEvent.change(rewrite, { target: { value: text(200) } });
    await userEvent.click(screen.getByRole("button", { name: "查看结果复盘" }));

    expect(await screen.findByText(/训练记录保存失败/)).toBeInTheDocument();
    const retrySave = screen.getByRole("button", { name: "重试保存" });
    expect(retrySave).toBeEnabled();
    await userEvent.click(retrySave);

    await screen.findByText("训练记录已保存");
    expect(repository.completeSession).toHaveBeenCalledTimes(2);
    expect(await repository.listRecords()).toHaveLength(1);
    expect(await repository.getActiveSession()).toBeNull();
  });

  it.each([
    ["idle", "请先完成保存后再离开结果页。"],
    ["error", "保存失败，请重试保存后再离开结果页。"],
  ] as const)(
    "blocks result actions while completion state is %s",
    async (completionState, message) => {
      const onDashboard = vi.fn();
      const onAgain = vi.fn();
      render(
        <ResultView
          session={resultSession()}
          saveStatus={completionState}
          onRetrySave={vi.fn()}
          onDashboard={onDashboard}
          onAgain={onAgain}
        />,
      );

      expect(screen.getByText(message)).toBeInTheDocument();
      const dashboard = screen.getByRole("button", { name: "返回仪表盘" });
      const again = screen.getByRole("button", { name: "再练一次" });
      expect(dashboard).toBeDisabled();
      expect(again).toBeDisabled();
      fireEvent.click(dashboard);
      fireEvent.click(again);
      expect(onDashboard).not.toHaveBeenCalled();
      expect(onAgain).not.toHaveBeenCalled();
    },
  );

  it("keeps the result marker when save fails and blocked actions are clicked", async () => {
    const repository = createRepository();
    vi.mocked(repository.completeSession).mockRejectedValue(
      new Error("storage unavailable"),
    );
    await renderWorkspace({ repository });
    const rewrite = await reachDiagnosis();
    fireEvent.change(rewrite, { target: { value: text(200) } });
    await userEvent.click(screen.getByRole("button", { name: "查看结果复盘" }));
    await screen.findByText(/训练记录保存失败/);
    const marker = window.localStorage.getItem("logic-trainer.current-result");

    fireEvent.click(screen.getByRole("button", { name: "返回仪表盘" }));
    fireEvent.click(screen.getByRole("button", { name: "再练一次" }));

    expect(marker).not.toBeNull();
    expect(window.localStorage.getItem("logic-trainer.current-result")).toBe(
      marker,
    );
    expect(screen.getByRole("heading", { name: "结果复盘" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "训练仪表盘" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("disables both sidebar navigation actions while a result is unsaved", async () => {
    const pendingSave = deferred<void>();
    const repository = createRepository({
      active: resultSession(),
    });
    vi.mocked(repository.completeSession).mockReturnValue(pendingSave.promise);

    render(<TrainingWorkspace repository={repository} api={createApi()} />);
    await screen.findByRole("heading", { name: "结果复盘" });
    await screen.findByText("正在保存训练记录…");

    expect(
      screen.getByRole("button", { name: "训练仪表盘" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "开始训练" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.queryByRole("link", { name: "训练仪表盘" })).toBeNull();
    expect(screen.queryByRole("link", { name: "开始训练" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "历史记录" }));
    expect(
      await screen.findByRole("dialog", { name: "历史记录" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "本地设置" }));
    expect(
      await screen.findByRole("dialog", { name: "本地设置" }),
    ).toBeInTheDocument();

    pendingSave.resolve();
  });

  it("blocks hard navigation only while a result is unsaved", async () => {
    const pendingSave = deferred<void>();
    const repository = createRepository({
      active: resultSession(),
    });
    vi.mocked(repository.completeSession).mockReturnValue(pendingSave.promise);

    render(<TrainingWorkspace repository={repository} api={createApi()} />);
    await screen.findByText("正在保存训练记录…");

    const blockedEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(blockedEvent);
    expect(blockedEvent.defaultPrevented).toBe(true);
    expect(blockedEvent.returnValue).toBe(false);

    pendingSave.resolve();
    await screen.findByText("训练记录已保存");

    const allowedEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(allowedEvent);
    expect(allowedEvent.defaultPrevented).toBe(false);
  });

  it("restores the history guard on popstate and stops blocking after save", async () => {
    const pendingSave = deferred<void>();
    const repository = createRepository({
      active: resultSession(),
    });
    vi.mocked(repository.completeSession).mockReturnValue(pendingSave.promise);
    const pushState = vi.spyOn(window.history, "pushState");
    const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);

    render(
      <StrictMode>
        <TrainingWorkspace repository={repository} api={createApi()} />
      </StrictMode>,
    );
    await screen.findByText("正在保存训练记录…");
    expect(pushState).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });

    expect(go).toHaveBeenCalledWith(1);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "结果尚未保存，无法离开",
    );

    pendingSave.resolve();
    await screen.findByText("训练记录已保存");
    const callsAfterSave = go.mock.calls.length;

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });
    expect(go).toHaveBeenCalledTimes(callsAfterSave);

    pushState.mockRestore();
    go.mockRestore();
  });

  it("focuses and announces the restored initial stage and every stage change", async () => {
    await renderWorkspace();

    const setupHeading = screen.getByRole("heading", { name: "设置训练" });
    await waitFor(() => expect(setupHeading).toHaveFocus());
    expect(screen.getByText("已进入第1步：设置")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "生成训练命题" }));
    const topicHeading = await screen.findByRole("heading", {
      name: trainingTopic.title,
    });
    await waitFor(() => expect(topicHeading).toHaveFocus());
    expect(screen.getByText("已进入第2步：命题")).toBeInTheDocument();
  });

  it("keeps repository, api, and settings storage bound to the first render", async () => {
    let resolveSession!: (session: TrainingSession | null) => void;
    const firstRepository = createRepository();
    vi.mocked(firstRepository.getActiveSession).mockImplementation(
      () => new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const secondRepository = createRepository();
    const firstApi = createApi();
    const secondApi = createApi();
    const firstStorage = createSettingsStorage();
    const secondStorage = createSettingsStorage();
    const view = render(
      <TrainingWorkspace
        repository={firstRepository}
        api={firstApi}
        settingsStorage={firstStorage}
      />,
    );

    view.rerender(
      <TrainingWorkspace
        repository={secondRepository}
        api={secondApi}
        settingsStorage={secondStorage}
      />,
    );
    resolveSession(null);
    await screen.findByRole("heading", { name: "设置训练" });
    await userEvent.click(screen.getByRole("button", { name: "生成训练命题" }));
    await screen.findByRole("heading", { name: trainingTopic.title });
    await userEvent.click(screen.getByRole("button", { name: "本地设置" }));
    await screen.findByRole("dialog", { name: "本地设置" });

    expect(secondRepository.getActiveSession).not.toHaveBeenCalled();
    expect(firstApi.generateTopic).toHaveBeenCalledOnce();
    expect(secondApi.generateTopic).not.toHaveBeenCalled();
    expect(firstStorage.load).toHaveBeenCalled();
    expect(secondStorage.load).not.toHaveBeenCalled();
  });

  it("writes the durable result marker before completing and restores after remount", async () => {
    const repository = createRepository();
    vi.mocked(repository.completeSession).mockImplementation(
      async (record: TrainingRecord) => {
        expect(window.localStorage.getItem("logic-trainer.current-result")).toBe(
          record.id,
        );
        const stored = createRepository({ records: [record] });
        vi.mocked(repository.listRecords).mockImplementation(stored.listRecords);
        vi.mocked(repository.getRecord).mockImplementation(stored.getRecord);
        vi.mocked(repository.getActiveSession).mockResolvedValue(null);
      },
    );
    const mounted = render(
      <TrainingWorkspace repository={repository} api={createApi()} />,
    );
    await screen.findByRole("heading", { name: "设置训练" });
    const rewrite = await reachDiagnosis();
    fireEvent.change(rewrite, { target: { value: text(200) } });
    await userEvent.click(screen.getByRole("button", { name: "查看结果复盘" }));
    await screen.findByText("训练记录已保存");
    mounted.unmount();

    render(<TrainingWorkspace repository={repository} api={createApi()} />);
    await screen.findByRole("heading", { name: "结果复盘" });
    expect(repository.completeSession).toHaveBeenCalledTimes(1);
  });

  it("clears the durable result marker when starting another training", async () => {
    const record = trainingRecord({ id: "completed-result" });
    window.localStorage.setItem("logic-trainer.current-result", record.id);
    const repository = createRepository({ records: [record] });
    render(<TrainingWorkspace repository={repository} api={createApi()} />);
    await screen.findByRole("heading", { name: "结果复盘" });

    await userEvent.click(screen.getByRole("button", { name: "再练一次" }));

    expect(window.localStorage.getItem("logic-trainer.current-result")).toBeNull();
    await screen.findByRole("heading", { name: "设置训练" });
  });

  it("clears the durable result marker when a saved result returns to dashboard", async () => {
    const record = trainingRecord({ id: "dashboard-result" });
    window.localStorage.setItem("logic-trainer.current-result", record.id);
    const repository = createRepository({ records: [record] });
    render(<TrainingWorkspace repository={repository} api={createApi()} />);
    await screen.findByText("训练记录已保存");

    fireEvent.click(screen.getByRole("button", { name: "返回仪表盘" }));

    expect(window.localStorage.getItem("logic-trainer.current-result")).toBeNull();
  });

  it("enforces Unicode draft and rewrite limits at 200 to 400 characters", async () => {
    await renderWorkspace();
    const rewrite = await reachDiagnosis();

    fireEvent.change(rewrite, { target: { value: text(401) } });
    expect(screen.getByText("401 / 400")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看结果复盘" })).toBeDisabled();

    fireEvent.change(rewrite, { target: { value: `${"😀".repeat(200)}` } });
    expect(screen.getByText("200 / 400")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看结果复盘" })).toBeEnabled();
  });

  it("keeps user text after an API failure and retries the same operation", async () => {
    const api = createApi();
    vi.mocked(api.diagnoseDraft)
      .mockRejectedValueOnce(
        new AppClientError({
          code: "NETWORK_ERROR",
          message: "网络连接失败，请检查网络后重试。",
          retryable: true,
          status: 0,
        }),
      )
      .mockResolvedValueOnce(diagnosisFixture());
    await renderWorkspace({ api });
    const draft = await reachDraft();
    fireEvent.change(draft, { target: { value: text(200) } });

    await userEvent.click(screen.getByRole("button", { name: "提交初稿诊断" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("网络连接失败");
    expect(screen.getByRole("textbox", { name: "初稿" })).toHaveValue(text(200));

    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    await screen.findByRole("heading", { name: "诊断与改写" });
    expect(api.diagnoseDraft).toHaveBeenCalledTimes(2);
  });

  it.each(["topic", "draft", "diagnosis"] as const)(
    "restores a persisted %s stage without starting over",
    async (stage) => {
      const base = trainingRecord({ id: `restore-${stage}` });
      const session = {
        id: base.id,
        stage,
        provider: base.provider,
        model: base.model,
        promptVersion: base.promptVersion,
        config: base.config,
        draftText: stage === "topic" ? "" : text(200),
        rewriteText: stage === "diagnosis" ? text(200) : "",
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
        topic: base.topic,
        ...(stage === "diagnosis" ? { diagnosis: base.diagnosis } : {}),
      } as TrainingSession;
      const repository = createRepository({ active: session });

      render(<TrainingWorkspace repository={repository} api={createApi()} />);

      const expected = {
        topic: base.topic.title,
        draft: "写初稿",
        diagnosis: "诊断与改写",
      }[stage];
      await screen.findByRole("heading", { name: expected });
      expect(repository.getActiveSession).toHaveBeenCalled();
    },
  );

  it("restores a completed result from its record and does not complete twice", async () => {
    const record = trainingRecord({ id: "completed-result" });
    window.localStorage.setItem("logic-trainer.current-result", record.id);
    const repository = createRepository({ records: [record] });

    const first = render(
      <TrainingWorkspace repository={repository} api={createApi()} />,
    );
    await screen.findByRole("heading", { name: "结果复盘" });
    expect(repository.completeSession).not.toHaveBeenCalled();
    first.unmount();

    render(<TrainingWorkspace repository={repository} api={createApi()} />);
    await screen.findByRole("heading", { name: "结果复盘" });
    expect(repository.completeSession).not.toHaveBeenCalled();
  });

  it("clears a result marker immediately when its record no longer exists", async () => {
    window.localStorage.setItem("logic-trainer.current-result", "missing-result");
    const repository = createRepository();

    render(<TrainingWorkspace repository={repository} api={createApi()} />);

    await screen.findByRole("heading", { name: "设置训练" });
    expect(window.localStorage.getItem("logic-trainer.current-result")).toBeNull();
  });

  it("clears the marker and shows a recovery notice when record lookup fails", async () => {
    window.localStorage.setItem("logic-trainer.current-result", "broken-result");
    const repository = createRepository();
    vi.mocked(repository.getRecord).mockRejectedValue(
      new Error("IndexedDB unavailable"),
    );

    render(<TrainingWorkspace repository={repository} api={createApi()} />);

    await screen.findByRole("heading", { name: "设置训练" });
    expect(window.localStorage.getItem("logic-trainer.current-result")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "无法恢复上次训练结果",
    );
  });

  it("opens history and settings without losing the current draft", async () => {
    await renderWorkspace();
    const draft = await reachDraft();
    fireEvent.change(draft, { target: { value: text(200) } });

    await userEvent.click(screen.getByRole("button", { name: "历史记录" }));
    expect(await screen.findByRole("dialog", { name: "历史记录" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "本地设置" }));
    expect(await screen.findByRole("dialog", { name: "本地设置" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("textbox", { name: "初稿" })).toHaveValue(text(200));
  });
});
