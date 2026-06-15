import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DIMENSION_LABELS } from "@/features/dashboard/dashboard-selectors";
import type { TrainingSession } from "@/features/training/types";

export function ResultView({
  session,
  saveStatus,
  onRetrySave,
  onDashboard,
  onAgain,
}: {
  session: Extract<TrainingSession, { stage: "result" }>;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onRetrySave: () => void;
  onDashboard: () => void;
  onAgain: () => void;
}) {
  const { comparison } = session;
  const canLeave = saveStatus === "saved";
  return (
    <section className="training-stage" aria-labelledby="result-title">
      <header className="training-heading">
        <p className="eyebrow">Step 5</p>
        <h1 id="result-title" tabIndex={-1}>结果复盘</h1>
        <p role="status" aria-live="polite">
          {saveStatus === "saving"
            ? "正在保存训练记录…"
            : saveStatus === "saved"
              ? "训练记录已保存"
              : saveStatus === "error"
                ? "训练记录保存失败，请保留当前页面后重试。"
                : "训练记录等待保存。"}
        </p>
        {!canLeave ? (
          <p>
            {saveStatus === "error"
              ? "保存失败，请重试保存后再离开结果页。"
              : "请先完成保存后再离开结果页。"}
          </p>
        ) : null}
        {saveStatus === "error" ? (
          <Button variant="secondary" onClick={onRetrySave}>
            重试保存
          </Button>
        ) : null}
      </header>
      <section className="metric-grid" aria-label="本次训练指标">
        <Card tone="sage">
          <span>逻辑分</span>
          <strong>
            {comparison.draftLogicScore} → {comparison.rewriteLogicScore}
          </strong>
          <small>提升 +{comparison.logicImprovement}</small>
        </Card>
        <Card tone="yellow">
          <span>表达分</span>
          <strong>
            {comparison.draftExpressionScore} → {comparison.rewriteExpressionScore}
          </strong>
          <small>提升 +{comparison.expressionImprovement}</small>
        </Card>
        <Card>
          <span>诊断置信度</span>
          <strong>{confidenceLabel(comparison.confidence)}</strong>
          <small>覆盖度 {session.diagnosis.coverageCount}/8</small>
        </Card>
        <Card tone="lavender"><span>当前短板</span><strong>{DIMENSION_LABELS[comparison.weakestDimension]}</strong></Card>
      </section>
      <div className="training-detail-grid">
        <Card>
          <h2>初稿全文</h2>
          <p className="user-long-text">{session.draftText}</p>
        </Card>
        <Card>
          <h2>改写全文</h2>
          <p className="user-long-text">{session.rewriteText}</p>
        </Card>
      </div>
      <Card className="score-card">
        <h2>八维前后对比</h2>
        <div className="score-list">
          {session.diagnosis.scores.map((draftScore) => {
            const rewrite = comparison.rewriteScores.find(
              ({ dimension }) => dimension === draftScore.dimension,
            );
            return (
              <div key={draftScore.dimension}>
                <span>{DIMENSION_LABELS[draftScore.dimension]}</span>
                <strong>{draftScore.score} → {rewrite?.score ?? "-"}</strong>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="training-detail-grid">
        <Card>
          <h3>已经改进</h3>
          <ul>{comparison.improvedPoints.map((point) => <li key={point}>{point}</li>)}</ul>
        </Card>
        <Card>
          <h3>仍需注意</h3>
          <p>{comparison.remainingIssue}</p>
          <h3>下一练建议</h3>
          <p>{comparison.nextTrainingSuggestion}</p>
        </Card>
      </div>
      <p className="source-badge">
        来源：{comparison.source === "real" ? "真实 AI" : "Mock"} ·
        Provider {session.provider} · 模型 {session.model || "默认"}
      </p>
      <div className="training-actions">
        <Button
          variant="secondary"
          disabled={!canLeave}
          onClick={onDashboard}
        >
          返回仪表盘
        </Button>
        <Button
          variant="primary"
          disabled={!canLeave}
          onClick={onAgain}
        >
          再练一次
        </Button>
      </div>
    </section>
  );
}

function confidenceLabel(confidence: "low" | "medium" | "high") {
  return {
    low: "较低",
    medium: "中等",
    high: "较高",
  }[confidence];
}
