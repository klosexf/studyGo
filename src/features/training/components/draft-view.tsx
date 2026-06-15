import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useId, useState } from "react";
import { PropositionHintPanel } from "@/features/training/components/proposition-hint-panel";
import type { SaveStatus, } from "@/features/training/store/training-store";
import type { TrainingTopic } from "@/features/training/types";

const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("zh", { granularity: "grapheme" })
    : null;

export function countCharacters(value: string) {
  return graphemeSegmenter
    ? [...graphemeSegmenter.segment(value)].length
    : Array.from(value).length;
}

export function validTrainingText(value: string) {
  const length = countCharacters(value);
  return length >= 200 && length <= 400;
}

export function trainingTextError(count: number) {
  if (count > 0 && count < 200) {
    return `至少还需要 ${200 - count} 个字`;
  }
  if (count > 400) {
    return `已超过 ${count - 400} 个字`;
  }
  return null;
}

const SAVE_LABELS: Record<SaveStatus, string> = {
  idle: "等待输入",
  saving: "正在自动保存",
  saved: "已自动保存",
  error: "自动保存失败",
};

export function DraftView({
  topic,
  value,
  saveStatus,
  loading,
  onChange,
  onBack,
  onSubmit,
}: {
  topic: TrainingTopic;
  value: string;
  saveStatus: SaveStatus;
  loading: boolean;
  onChange: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const [touched, setTouched] = useState(false);
  const count = countCharacters(value);
  const invalid = !validTrainingText(value);
  const showError = touched && invalid;
  const fieldId = useId();
  const countId = `${fieldId}-draft-count`;
  const errorId = `${fieldId}-draft-error`;
  return (
    <section className="training-stage" aria-labelledby="draft-title">
      <header className="training-heading">
        <p className="eyebrow">Step 3</p>
        <h1 id="draft-title" tabIndex={-1}>写初稿</h1>
      </header>
      <Card className="topic-summary" tone="yellow">
        <strong>{topic.title}</strong>
        <p>{topic.mainQuestion}</p>
      </Card>
      <PropositionHintPanel
        topic={topic}
        defaultCollapsed
        title="写作提示"
        subtitle="随时查看，帮助你保持回答方向"
      />
      <label className="editor-field">
        <span>初稿</span>
        <textarea
          aria-label="初稿"
          aria-invalid={showError}
          aria-describedby={showError ? `${countId} ${errorId}` : countId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="先给出结论，再写理由、例子和必要的反方回应。"
        />
      </label>
      <div className="editor-meta">
        <span id={countId} data-invalid={showError}>
          {count} / 400
        </span>
        <span>{SAVE_LABELS[saveStatus]}</span>
      </div>
      {showError ? (
        <p id={errorId} role="alert" className="field-error">
          请输入 200 至 400 个字符
        </p>
      ) : null}
      <div className="training-actions">
        <Button variant="ghost" onClick={onBack}>返回命题</Button>
        <Button
          variant="primary"
          disabled={!validTrainingText(value) || loading}
          onClick={onSubmit}
        >
          {loading ? "正在诊断…" : "提交初稿诊断"}
        </Button>
      </div>
    </section>
  );
}
