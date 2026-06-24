import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useId, useState } from "react";
import { DIMENSION_LABELS } from "@/features/dashboard/dashboard-selectors";
import {
  countCharacters,
  validTrainingText,
} from "@/features/training/components/draft-view";
import type {
  DraftDiagnosis,
  TrainingTopic,
} from "@/features/training/types";

export function DiagnosisView({
  topic,
  diagnosis,
  value,
  loading,
  onChange,
  onSubmit,
  onAbort,
  submitLabel = "查看结果复盘",
  loadingLabel = "正在对比…",
  hideEditor = false,
}: {
  topic: TrainingTopic;
  diagnosis: DraftDiagnosis;
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAbort: () => void;
  submitLabel?: string;
  loadingLabel?: string;
  hideEditor?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const count = countCharacters(value);
  const invalid = !validTrainingText(value);
  const showError = touched && invalid;
  const fieldId = useId();
  const countId = `${fieldId}-rewrite-count`;
  const errorId = `${fieldId}-rewrite-error`;
  return (
    <section className="training-stage" aria-labelledby="diagnosis-title">
      <header className="training-heading">
        <p className="eyebrow">Step 4</p>
        <h1 id="diagnosis-title" tabIndex={-1}>诊断与改写</h1>
        <p>根据提示自行改写。系统不会提供完整范文。</p>
      </header>
      <div className="diagnosis-grid">
        <div className="feedback-stack">
          <Feedback title="诊断总结" value={diagnosis.summary} />
          <Feedback title="关键逻辑问题" value={diagnosis.keyLogicIssue} />
          <Feedback title="关键表达问题" value={diagnosis.keyExpressionIssue} />
          <Feedback title="苏格拉底追问" value={diagnosis.socraticQuestion} />
          <Feedback title="改写任务" value={diagnosis.rewriteTask} />
          <Card className="score-card">
            <h3>八维诊断</h3>
            <div className="score-list">
              {diagnosis.scores.map((score) => (
                <div key={score.dimension}>
                  <span>
                    {DIMENSION_LABELS[score.dimension]}
                    <small>{score.evidence}</small>
                  </span>
                  <strong>{score.score}</strong>
                </div>
              ))}
            </div>
            <p>
              逻辑 {diagnosis.logicScore} · 表达 {diagnosis.expressionScore} ·
              覆盖 {diagnosis.coverageCount}/8 · 置信度 {diagnosis.confidence} ·
              来源 {diagnosis.source === "real" ? "真实 AI" : "Mock"}
            </p>
          </Card>
        </div>
        <div>
          <Card className="topic-summary" tone="yellow">
            <strong>{topic.title}</strong>
            <p>{topic.mainQuestion}</p>
          </Card>
          {hideEditor ? null : (
            <>
              <label className="editor-field">
                <span>二次改写</span>
                <textarea
                  aria-label="二次改写"
                  aria-invalid={showError}
                  aria-describedby={
                    showError ? `${countId} ${errorId}` : countId
                  }
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="根据诊断重新组织自己的表达。"
                />
              </label>
              <div className="editor-meta">
                <span id={countId} data-invalid={showError}>
                  {count} / 400
                </span>
              </div>
              {showError ? (
                <p id={errorId} role="alert" className="field-error">
                  请输入 200 至 400 个字符
                </p>
              ) : null}
            </>
          )}
          <div className="training-actions">
            <Button
              variant="danger"
              disabled={loading}
              onClick={onAbort}
            >
              不再二次改写
            </Button>
            <Button
              variant="primary"
              disabled={(!hideEditor && !validTrainingText(value)) || loading}
              onClick={onSubmit}
            >
              {loading ? loadingLabel : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Feedback({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <h3>{title}</h3>
      <p>{value}</p>
    </Card>
  );
}
