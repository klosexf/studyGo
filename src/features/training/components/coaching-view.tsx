import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ReactNode } from "react";
import {
  countCharacters,
  validTrainingText,
} from "@/features/training/components/draft-view";
import type {
  CoachingRoundState,
  DraftDiagnosis,
  TrainingTopic,
} from "@/features/training/types";

export function CoachingView({
  topic,
  diagnosis,
  rounds,
  currentRoundIndex,
  value,
  loading,
  onChange,
  onSubmit,
  onContinue,
}: {
  topic: TrainingTopic;
  diagnosis: DraftDiagnosis;
  rounds: CoachingRoundState[];
  currentRoundIndex: number;
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onContinue: () => void;
}) {
  const currentRound = rounds[currentRoundIndex];
  const allResolved = rounds.every((round) => round.status !== "pending");
  const canSubmit = value.trim().length > 0 && !loading && !allResolved;

  return (
    <section className="training-stage coaching-stage" aria-labelledby="coaching-title">
      <header className="training-heading">
        <p className="eyebrow">Step 5</p>
        <h1 id="coaching-title" tabIndex={-1}>
          教练追问
        </h1>
        <p>围绕初稿中的关键短板追问。每轮是否继续，取决于你的回答是否补足当前目标。</p>
      </header>

      <div className="coaching-layout">
        <Card className="topic-summary" tone="yellow">
          <strong>{topic.title}</strong>
          <p>{topic.mainQuestion}</p>
        </Card>

        <div className="coaching-thread" aria-label="追问对话">
          <ChatBubble role="coach" title="诊断焦点">
            <p>{diagnosis.keyLogicIssue}</p>
          </ChatBubble>
          {rounds.map((round, index) => (
            <RoundMessages
              key={round.planned.id}
              round={round}
              active={index === currentRoundIndex}
            />
          ))}
          {currentRound && currentRound.status === "pending" ? (
            <ChatBubble role="coach" title={currentRound.planned.objective}>
              <p>{currentRound.planned.question}</p>
              <small>{currentRound.planned.successCriteria}</small>
            </ChatBubble>
          ) : null}
        </div>

        <div className="coaching-composer">
          {allResolved ? (
            <Button variant="primary" onClick={onContinue}>
              进入最终复述
            </Button>
          ) : (
            <>
              <label className="editor-field">
                <span>追问回答</span>
                <textarea
                  aria-label="追问回答"
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  placeholder="先回答当前问题，不需要一次写成完整文章。"
                />
              </label>
              <div className="training-actions">
                <Button
                  variant="primary"
                  disabled={!canSubmit}
                  onClick={onSubmit}
                >
                  {loading ? "正在反馈…" : "发送回答"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function FinalRewriteView({
  topic,
  value,
  loading,
  onChange,
  onSubmit,
  onAbort,
}: {
  topic: TrainingTopic;
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAbort: () => void;
}) {
  const count = countCharacters(value);
  const invalid = !validTrainingText(value);

  return (
    <section className="training-stage" aria-labelledby="final-rewrite-title">
      <header className="training-heading">
        <p className="eyebrow">Step 6</p>
        <h1 id="final-rewrite-title" tabIndex={-1}>
          最终复述
        </h1>
        <p>把追问中补出的材料整合进自己的表达。系统只做对比，不提供完整范文。</p>
      </header>
      <div className="diagnosis-grid">
        <Card className="topic-summary" tone="yellow">
          <strong>{topic.title}</strong>
          <p>{topic.mainQuestion}</p>
        </Card>
        <div>
          <label className="editor-field">
            <span>最终复述</span>
            <textarea
              aria-label="最终复述"
              aria-invalid={invalid}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="用 200 至 400 个字符重新组织自己的观点。"
            />
          </label>
          <div className="editor-meta">
            <span data-invalid={invalid}>{count} / 400</span>
          </div>
          {invalid ? (
            <p role="alert" className="field-error">
              请输入 200 至 400 个字符
            </p>
          ) : null}
          <div className="training-actions">
            <Button variant="danger" disabled={loading} onClick={onAbort}>
              放弃本次训练
            </Button>
            <Button
              variant="primary"
              disabled={invalid || loading}
              onClick={onSubmit}
            >
              {loading ? "正在对比…" : "查看结果复盘"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function RoundMessages({
  round,
  active,
}: {
  round: CoachingRoundState;
  active: boolean;
}) {
  return (
    <>
      {round.userAnswers.map((answer, index) => (
        <ChatBubble key={`${round.planned.id}-answer-${index}`} role="user">
          <p>{answer}</p>
        </ChatBubble>
      ))}
      {round.attempts.map((attempt, index) => (
        <ChatBubble
          key={`${round.planned.id}-feedback-${index}`}
          role="coach"
          title={
            attempt.status === "passed"
              ? "已补足"
              : attempt.status === "recorded_weakness"
                ? "记录为短板"
                : active
                  ? "继续追问"
                  : "追问反馈"
          }
        >
          <p>{attempt.feedback}</p>
          {attempt.gap ? <small>{attempt.gap}</small> : null}
          {attempt.followUpQuestion ? <p>{attempt.followUpQuestion}</p> : null}
        </ChatBubble>
      ))}
    </>
  );
}

function ChatBubble({
  role,
  title,
  children,
}: {
  role: "coach" | "user";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`chat-bubble chat-bubble--${role}`}>
      {title ? <strong>{title}</strong> : null}
      {children}
    </div>
  );
}
