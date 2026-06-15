"use client";

import { useMemo, useState } from "react";

import { Drawer } from "@/components/ui/drawer";
import {
  DIMENSION_LABELS,
  formatCompletedAt,
} from "@/features/dashboard/dashboard-selectors";
import {
  filterHistory,
  type HistoryScenarioFilter,
} from "@/features/history/history-filters";
import type { TrainingRecord } from "@/features/training/types";

const PROVIDER_LABELS = {
  mock: "Mock",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  zhipu: "智谱",
} as const;

const CONFIDENCE_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
} as const;

export const HISTORY_PAGE_SIZE = 20;

export type HistoryDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: readonly TrainingRecord[];
};

export function HistoryDrawer({
  open,
  onOpenChange,
  records,
}: HistoryDrawerProps) {
  const [scenario, setScenario] =
    useState<HistoryScenarioFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<TrainingRecord | null>(null);
  const [page, setPage] = useState(1);
  const filtered = useMemo(
    () => filterHistory(records, scenario, keyword),
    [keyword, records, scenario],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / HISTORY_PAGE_SIZE),
  );
  const pagedRecords = filtered.slice(
    (page - 1) * HISTORY_PAGE_SIZE,
    page * HISTORY_PAGE_SIZE,
  );

  function resetListState() {
    setSelected(null);
    setPage(1);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="历史记录"
      description="筛选并复看保存在当前浏览器中的完整训练。"
    >
      <div className="history-toolbar">
        <div className="segmented-control" aria-label="场景筛选">
          {([
            ["all", "全部"],
            ["workplace", "职场"],
            ["life", "生活"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={scenario === value}
              onClick={() => {
                setScenario(value);
                resetListState();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>关键词</span>
          <input
            type="search"
            value={keyword}
            placeholder="搜索命题、目标或短板"
            onChange={(event) => {
              setKeyword(event.target.value);
              resetListState();
            }}
          />
        </label>
      </div>

      {selected ? (
        <RecordDetail
          record={selected}
          onBack={() => setSelected(null)}
        />
      ) : (
        <div className="history-list">
          <div className="history-pagination__summary">
            <span>共 {filtered.length} 条</span>
            <span>第 {page} / {totalPages} 页</span>
          </div>
          {filtered.length === 0 ? (
            <p className="muted-copy">没有匹配的训练记录。</p>
          ) : (
            pagedRecords.map((record) => (
              <button
                key={record.id}
                type="button"
                className="history-item"
                onClick={() => setSelected(record)}
              >
                <span>
                  <strong className="user-long-text">
                    {record.topic.title}
                  </strong>
                  <small>
                    {record.config.scenarioType === "workplace"
                      ? "职场"
                      : "生活"}
                    {" · "}
                    {formatCompletedAt(record.completedAt)}
                  </small>
                </span>
                <span>
                  短板：{DIMENSION_LABELS[record.weakestDimension]}
                </span>
              </button>
            ))
          )}
          <div className="history-pagination" aria-label="历史分页">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              上一页
            </button>
            <button
              type="button"
              disabled={page === totalPages || filtered.length === 0}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function RecordDetail({
  record,
  onBack,
}: {
  record: TrainingRecord;
  onBack: () => void;
}) {
  return (
    <article className="record-detail">
      <button type="button" className="text-button" onClick={onBack}>
        返回记录列表
      </button>
      <h3>完整复盘</h3>
      <section aria-labelledby="review-topic">
        <h4 id="review-topic">命题</h4>
        <DetailRow label="标题" value={record.topic.title} />
        <DetailRow label="背景" value={record.topic.background} />
        <DetailRow label="核心问题" value={record.topic.mainQuestion} />
        <DetailRow label="写作任务" value={record.topic.writingTask} />
        <DetailList label="约束" values={record.topic.constraints} />
        <DetailList
          label="评分重点"
          values={record.topic.scoringFocus.map(
            (dimension) => DIMENSION_LABELS[dimension],
          )}
        />
        <DetailList label="标签" values={record.topic.topicTags} />
      </section>

      <section aria-labelledby="review-draft">
        <h4 id="review-draft">初稿与诊断</h4>
        <DetailRow label="初稿全文" value={record.draftText} />
        <DetailRow label="诊断总结" value={record.diagnosis.summary} />
        <DetailRow
          label="关键逻辑问题"
          value={record.diagnosis.keyLogicIssue}
        />
        <DetailRow
          label="关键表达问题"
          value={record.diagnosis.keyExpressionIssue}
        />
        <DetailRow
          label="苏格拉底追问"
          value={record.diagnosis.socraticQuestion}
        />
        <DetailRow label="改写任务" value={record.diagnosis.rewriteTask} />
        <ScoreTable
          caption="初稿 8 维评分"
          scores={record.diagnosis.scores}
        />
        <dl className="detail-metrics">
          <Metric label="逻辑分" value={record.diagnosis.logicScore} />
          <Metric label="表达分" value={record.diagnosis.expressionScore} />
          <Metric
            label="覆盖维度"
            value={`${record.diagnosis.coverageCount} / 8`}
          />
          <Metric
            label="诊断置信度"
            value={CONFIDENCE_LABELS[record.diagnosis.confidence]}
          />
        </dl>
      </section>

      <section aria-labelledby="review-rewrite">
        <h4 id="review-rewrite">改写与对比</h4>
        <DetailRow label="改写全文" value={record.rewriteText} />
        <dl className="detail-metrics">
          <Metric
            label="逻辑分"
            value={`${record.comparison.draftLogicScore} → ${record.comparison.rewriteLogicScore}`}
          />
          <Metric
            label="逻辑提升"
            value={signed(record.comparison.logicImprovement)}
          />
          <Metric
            label="表达分"
            value={`${record.comparison.draftExpressionScore} → ${record.comparison.rewriteExpressionScore}`}
          />
          <Metric
            label="表达提升"
            value={signed(record.comparison.expressionImprovement)}
          />
        </dl>
        <ScoreTable
          caption="改写 8 维评分"
          scores={record.comparison.rewriteScores}
        />
        <DetailList
          label="改进点"
          values={record.comparison.improvedPoints}
        />
        <DetailRow
          label="剩余问题"
          value={record.comparison.remainingIssue}
        />
        <DetailRow
          label="下一练建议"
          value={record.comparison.nextTrainingSuggestion}
        />
        <DetailRow
          label="最低维度"
          value={DIMENSION_LABELS[record.comparison.weakestDimension]}
        />
      </section>

      <section aria-labelledby="review-meta">
        <h4 id="review-meta">记录信息</h4>
        <dl className="detail-metrics">
          <Metric
            label="结果来源"
            value={
              record.comparison.source === "real" ? "真实 AI" : "Mock"
            }
          />
          <Metric
            label="Provider"
            value={PROVIDER_LABELS[record.provider]}
          />
          <Metric label="模型" value={record.model || "未设置"} />
          <Metric
            label="完成时间"
            value={formatFullDate(record.completedAt)}
          />
          <Metric
            label="最终短板"
            value={DIMENSION_LABELS[record.weakestDimension]}
          />
          <Metric
            label="记录置信度"
            value={CONFIDENCE_LABELS[record.confidence]}
          />
        </dl>
      </section>
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <strong>{label}</strong>
      <p className="user-long-text">{value}</p>
    </div>
  );
}

function DetailList({
  label,
  values,
}: {
  label: string;
  values: readonly string[];
}) {
  return (
    <div className="detail-row">
      <strong>{label}</strong>
      <ul>
        {values.map((value) => (
          <li key={value} className="user-long-text">{value}</li>
        ))}
      </ul>
    </div>
  );
}

function ScoreTable({
  caption,
  scores,
}: {
  caption: string;
  scores: TrainingRecord["diagnosis"]["scores"];
}) {
  return (
    <div className="score-table-wrap">
      <table className="score-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">维度</th>
            <th scope="col">分数</th>
            <th scope="col">依据</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((score) => (
            <tr key={score.dimension}>
              <th scope="row">{DIMENSION_LABELS[score.dimension]}</th>
              <td>{formatScore(score.score)}</td>
              <td className="user-long-text">{score.evidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="user-long-text">{value}</dd>
    </div>
  );
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function formatScore(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function formatFullDate(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(time);
}
