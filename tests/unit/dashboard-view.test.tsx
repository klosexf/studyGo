import type { ComponentProps, ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const responsiveContainerProps = vi.hoisted(
  () => [] as Array<Record<string, unknown>>,
);

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();

  return {
    ...actual,
    ResponsiveContainer: ({
      children,
      ...props
    }: ComponentProps<typeof actual.ResponsiveContainer> & {
      children?: ReactNode;
    }) => {
      responsiveContainerProps.push(props);
      return <div data-testid="responsive-container">{children}</div>;
    },
  };
});

import { DashboardView } from "@/features/dashboard/dashboard-view";
import { trainingRecord } from "@/../tests/fixtures/training";
import type { TrainingRecord } from "@/features/training/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function repository(records: TrainingRecord[] = []) {
  return {
    listRecords: vi.fn().mockResolvedValue(records),
    clearTrainingData: vi.fn().mockResolvedValue(undefined),
  };
}

describe("DashboardView", () => {
  beforeEach(() => {
    responsiveContainerProps.length = 0;
  });

  it("keeps the dashboard in a loading state until local records hydrate", async () => {
    const pending = deferred<TrainingRecord[]>();
    const repo = {
      listRecords: vi.fn(() => pending.promise),
      clearTrainingData: vi.fn(),
    };

    render(<DashboardView repository={repo} />);

    expect(screen.getByRole("status")).toHaveTextContent("正在读取本地训练记录");
    expect(screen.queryByText("开始第一次训练")).not.toBeInTheDocument();

    pending.resolve([]);
    expect(await screen.findByText("开始第一次训练")).toBeInTheDocument();
  });

  it("shows an honest empty state without invented scores", async () => {
    render(<DashboardView repository={repository()} />);

    expect(await screen.findByRole("heading", { name: "训练仪表盘" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "开始第一次训练" })).toHaveAttribute(
      "href",
      "/training",
    );
    expect(screen.queryByText(/平均分/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 分/)).not.toBeInTheDocument();
  });

  it("renders statistics, accessible chart summaries and recent records", async () => {
    const records = [
      trainingRecord({
        id: "work",
        completedAt: "2026-06-08T03:00:00.000Z",
        topic: {
          ...trainingRecord().topic,
          title: "项目延期怎么沟通",
          scenarioType: "workplace",
        },
        config: {
          ...trainingRecord().config,
          scenarioType: "workplace",
        },
      }),
      trainingRecord({
        id: "life",
        completedAt: "2026-06-07T03:00:00.000Z",
      }),
    ];

    render(<DashboardView repository={repository(records)} />);

    expect(await screen.findByText("已完成 2 次训练")).toBeInTheDocument();
    expect(screen.getByText(/最近 7 次趋势摘要/)).toBeInTheDocument();
    expect(screen.getByText(/能力分布摘要/)).toBeInTheDocument();
    expect(screen.getByText("项目延期怎么沟通")).toBeInTheDocument();
    expect(screen.getByText("稳定还是成长")).toBeInTheDocument();
    expect(screen.getByText(/下一练/)).toBeInTheDocument();
  });

  it("gives both responsive charts a non-negative initial size without warnings", async () => {
    const warn = vi.spyOn(console, "warn");

    render(<DashboardView repository={repository([trainingRecord()])} />);

    await screen.findByText("已完成 1 次训练");

    expect(responsiveContainerProps).toHaveLength(2);
    for (const props of responsiveContainerProps) {
      expect(props).toMatchObject({
        initialDimension: { width: 640, height: 280 },
        minWidth: 0,
        minHeight: 280,
        width: "100%",
        height: "100%",
      });
    }
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(
      /width\(-1\)|height\(-1\)/,
    );

    warn.mockRestore();
  });

  it("filters history and opens a complete record review", async () => {
    const user = userEvent.setup();
    const records = [
      trainingRecord({
        id: "work",
        completedAt: "2026-06-08T03:00:00.000Z",
        topic: {
          ...trainingRecord().topic,
          title: "项目延期怎么沟通",
          scenarioType: "workplace",
        },
        config: {
          ...trainingRecord().config,
          scenarioType: "workplace",
        },
      }),
      trainingRecord({ id: "life" }),
    ];

    render(<DashboardView repository={repository(records)} />);
    await screen.findByText("已完成 2 次训练");
    await user.click(screen.getByRole("button", { name: "历史记录" }));

    const drawer = await screen.findByRole("dialog", { name: "历史记录" });
    await user.click(within(drawer).getByRole("button", { name: "职场" }));
    expect(within(drawer).getByText("项目延期怎么沟通")).toBeInTheDocument();
    expect(within(drawer).queryByText("稳定还是成长")).not.toBeInTheDocument();

    await user.type(within(drawer).getByRole("searchbox"), "延期");
    await user.click(within(drawer).getByRole("button", { name: /项目延期怎么沟通/ }));

    expect(within(drawer).getByRole("heading", { name: "完整复盘" })).toBeInTheDocument();
    expect(
      within(drawer).getByRole("heading", { name: "命题" }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole("heading", { name: "初稿与诊断" }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole("heading", { name: "改写与对比" }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole("heading", { name: "记录信息" }),
    ).toBeInTheDocument();
  });

  it("shows every persisted field in the complete record review", async () => {
    const user = userEvent.setup();
    const record = trainingRecord({
      id: "complete-review",
      provider: "deepseek",
      model: "deepseek-chat",
      completedAt: "2026-06-08T08:30:00.000Z",
      topic: {
        ...trainingRecord().topic,
        title: "是否接受临时加班",
        background: "团队在发布前一天发现关键问题。",
        mainQuestion: "应该接受临时加班还是延期发布？",
        writingTask: "请给出结论、依据和边界条件。",
        constraints: ["不超过 300 字", "回应延期方案"],
        scoringFocus: ["argumentSufficiency", "clearConclusion"],
        topicTags: ["项目发布", "加班决策"],
      },
      draftText: "这是完整初稿全文。",
      rewriteText: "这是完整改写全文。",
      diagnosis: {
        ...trainingRecord().diagnosis,
        summary: "诊断总结字段",
        keyLogicIssue: "关键逻辑问题字段",
        keyExpressionIssue: "关键表达问题字段",
        socraticQuestion: "苏格拉底追问字段？",
        rewriteTask: "改写任务字段",
        logicScore: 2.5,
        expressionScore: 3.5,
        coverageCount: 8,
        confidence: "high",
        scores: trainingRecord().diagnosis.scores.map((score, index) => ({
          ...score,
          score: 2 + index * 0.4,
          evidence: `初稿证据 ${index + 1}`,
        })),
      },
      comparison: {
        ...trainingRecord().comparison,
        draftLogicScore: 2.5,
        draftExpressionScore: 3.5,
        rewriteLogicScore: 4,
        rewriteExpressionScore: 4.5,
        logicImprovement: 1.5,
        expressionImprovement: 1,
        improvedPoints: ["改进点一", "改进点二"],
        remainingIssue: "剩余问题字段",
        nextTrainingSuggestion: "下一练建议字段",
        rewriteScores: trainingRecord().comparison.rewriteScores.map(
          (score, index) => ({
            ...score,
            score: 2.1 + index * 0.4,
            evidence: `改写证据 ${index + 1}`,
          }),
        ),
        weakestDimension: "structureClarity",
        source: "real",
      },
      weakestDimension: "structureClarity",
      draftLogicScore: 2.5,
      draftExpressionScore: 3.5,
      rewriteLogicScore: 4,
      rewriteExpressionScore: 4.5,
      logicImprovement: 1.5,
      expressionImprovement: 1,
      confidence: "high",
    });

    render(<DashboardView repository={repository([record])} />);
    await screen.findByText("已完成 1 次训练");
    await user.click(screen.getByRole("button", { name: "历史记录" }));
    const drawer = await screen.findByRole("dialog", { name: "历史记录" });
    await user.click(
      within(drawer).getByRole("button", {
        name: /是否接受临时加班/,
      }),
    );

    for (const text of [
      "是否接受临时加班",
      "团队在发布前一天发现关键问题。",
      "应该接受临时加班还是延期发布？",
      "请给出结论、依据和边界条件。",
      "不超过 300 字",
      "回应延期方案",
      "论证充分",
      "结论明确",
      "项目发布",
      "加班决策",
      "这是完整初稿全文。",
      "诊断总结字段",
      "关键逻辑问题字段",
      "关键表达问题字段",
      "苏格拉底追问字段？",
      "改写任务字段",
      "初稿证据 1",
      "初稿证据 8",
      "这是完整改写全文。",
      "改写证据 1",
      "改写证据 8",
      "改进点一",
      "改进点二",
      "剩余问题字段",
      "下一练建议字段",
      "DeepSeek",
      "deepseek-chat",
      "真实 AI",
      "高",
    ]) {
      expect(within(drawer).getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(within(drawer).getAllByText("结构清晰").length).toBeGreaterThan(0);
    expect(within(drawer).getByText("8 / 8")).toBeInTheDocument();
    expect(within(drawer).getByText("+1.5")).toBeInTheDocument();
    expect(within(drawer).getByText("+1")).toBeInTheDocument();
    expect(within(drawer).getByText(/2026/)).toBeInTheDocument();
  });

  it("clears training data only after a second confirmation and refreshes", async () => {
    const user = userEvent.setup();
    const repo = repository([trainingRecord()]);

    render(<DashboardView repository={repo} />);
    await screen.findByText("已完成 1 次训练");
    await user.click(screen.getByRole("button", { name: "本地设置" }));
    await user.click(await screen.findByRole("button", { name: "清空训练数据" }));

    expect(repo.clearTrainingData).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认清空训练数据" }));

    await waitFor(() => expect(repo.clearTrainingData).toHaveBeenCalledOnce());
    expect(await screen.findByText("开始第一次训练")).toBeInTheDocument();
  });

  it("does not let a stale initial load overwrite cleared training data", async () => {
    const user = userEvent.setup();
    const initialLoad = deferred<TrainingRecord[]>();
    const clear = deferred<void>();
    const repo = {
      listRecords: vi.fn(() => initialLoad.promise),
      clearTrainingData: vi.fn(() => clear.promise),
    };

    render(<DashboardView repository={repo} />);
    await user.click(screen.getByRole("button", { name: "本地设置" }));
    await user.click(await screen.findByRole("button", { name: "清空训练数据" }));
    await user.click(screen.getByRole("button", { name: "确认清空训练数据" }));

    clear.resolve();
    expect(await screen.findByText("开始第一次训练")).toBeInTheDocument();

    initialLoad.resolve([trainingRecord({ id: "stale-record" })]);
    await waitFor(() => {
      expect(screen.queryByText("已完成 1 次训练")).not.toBeInTheDocument();
    });
  });

  it("paginates filtered history by 20 and resets to page one after filtering", async () => {
    const user = userEvent.setup();
    const records = Array.from({ length: 45 }, (_, index) =>
      trainingRecord({
        id: `record-${index + 1}`,
        completedAt: new Date(
          Date.UTC(2026, 5, 8, 12, 0, index),
        ).toISOString(),
        topic: {
          ...trainingRecord().topic,
          title: `训练记录 ${String(index + 1).padStart(2, "0")}`,
          scenarioType: index < 5 ? "workplace" : "life",
        },
        config: {
          ...trainingRecord().config,
          scenarioType: index < 5 ? "workplace" : "life",
        },
      }),
    );

    render(<DashboardView repository={repository(records)} />);
    await screen.findByText("已完成 45 次训练");
    await user.click(screen.getByRole("button", { name: "历史记录" }));
    const drawer = await screen.findByRole("dialog", { name: "历史记录" });

    expect(within(drawer).getByText("共 45 条")).toBeInTheDocument();
    expect(within(drawer).getByText("第 1 / 3 页")).toBeInTheDocument();
    expect(
      within(drawer).getAllByRole("button", { name: /训练记录/ }),
    ).toHaveLength(20);
    expect(
      within(drawer).getByRole("button", { name: "上一页" }),
    ).toBeDisabled();

    await user.click(within(drawer).getByRole("button", { name: "下一页" }));
    expect(within(drawer).getByText("第 2 / 3 页")).toBeInTheDocument();

    await user.click(within(drawer).getByRole("button", { name: "职场" }));
    expect(within(drawer).getByText("共 5 条")).toBeInTheDocument();
    expect(within(drawer).getByText("第 1 / 1 页")).toBeInTheDocument();
    expect(
      within(drawer).getAllByRole("button", { name: /训练记录/ }),
    ).toHaveLength(5);
  });

  it("keeps a selected history detail available independently of pagination", async () => {
    const user = userEvent.setup();
    const records = Array.from({ length: 21 }, (_, index) =>
      trainingRecord({
        id: `paged-${index + 1}`,
        completedAt: new Date(
          Date.UTC(2026, 5, 8, 12, 0, index),
        ).toISOString(),
        topic: {
          ...trainingRecord().topic,
          title: `分页记录 ${index + 1}`,
        },
      }),
    );

    render(<DashboardView repository={repository(records)} />);
    await screen.findByText("已完成 21 次训练");
    await user.click(screen.getByRole("button", { name: "历史记录" }));
    const drawer = await screen.findByRole("dialog", { name: "历史记录" });
    await user.click(within(drawer).getByRole("button", { name: "下一页" }));
    const onlyRecord = within(drawer).getByRole("button", {
      name: /分页记录 1/,
    });
    await user.click(onlyRecord);

    expect(
      within(drawer).getByRole("heading", { name: "完整复盘" }),
    ).toBeInTheDocument();
    expect(within(drawer).getAllByText("分页记录 1").length).toBeGreaterThan(0);
  });

  it("marks user supplied history text with a long-text wrapping class", async () => {
    const user = userEvent.setup();
    const longText = "A".repeat(300);
    const record = trainingRecord({
      id: "long-text",
      draftText: longText,
      topic: {
        ...trainingRecord().topic,
        background: longText,
      },
    });

    render(<DashboardView repository={repository([record])} />);
    await screen.findByText("已完成 1 次训练");
    await user.click(screen.getByRole("button", { name: "历史记录" }));
    const drawer = await screen.findByRole("dialog", { name: "历史记录" });
    await user.click(
      within(drawer).getByRole("button", { name: /稳定还是成长/ }),
    );

    for (const node of within(drawer).getAllByText(longText)) {
      expect(node).toHaveClass("user-long-text");
    }
  });

  it("surfaces repository failures without showing fabricated data", async () => {
    const repo = repository();
    repo.listRecords.mockRejectedValueOnce(new Error("indexeddb unavailable"));

    render(<DashboardView repository={repo} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("无法读取本地训练记录");
    expect(screen.queryByText("开始第一次训练")).not.toBeInTheDocument();
  });
});
