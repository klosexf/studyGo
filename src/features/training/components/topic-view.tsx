import { Button } from "@/components/ui/button";
import { PropositionHintPanel } from "@/features/training/components/proposition-hint-panel";
import type { TrainingTopic } from "@/features/training/types";

const SCENARIO_LABELS = {
  workplace: "职场观点",
  life: "生活价值观点",
} as const;

const DIFFICULTY_LABELS = {
  easy: "简单",
  medium: "中等",
  challenging: "挑战",
} as const;

export function TopicView({
  topic,
  loading,
  onRegenerate,
  onBack,
  onStart,
}: {
  topic: TrainingTopic;
  loading: boolean;
  onRegenerate: () => void;
  onBack: () => void;
  onStart: () => void;
}) {
  return (
    <section
      className="training-stage training-stage--topic"
      aria-labelledby="topic-title"
    >
      <article className="topic-card">
        <div className="topic-tags">
          <span className="tag sage">{SCENARIO_LABELS[topic.scenarioType]}</span>
          <span className="tag yellow">{DIFFICULTY_LABELS[topic.difficulty]}</span>
          {topic.topicTags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>

        <h2 id="topic-title" tabIndex={-1}>
          {topic.title}
        </h2>

        <div className="topic-block">
          <strong>场景背景</strong>
          <p>{topic.background}</p>
        </div>

        <div className="topic-block">
          <strong>主问题</strong>
          <p>{topic.mainQuestion}</p>
        </div>

        <div className="topic-block">
          <strong>表达任务</strong>
          <p>{topic.writingTask}</p>
        </div>
      </article>

      <PropositionHintPanel topic={topic} />

      <div className="training-actions">
        <Button variant="ghost" onClick={onBack}>
          返回设置
        </Button>
        <Button variant="secondary" disabled={loading} onClick={onRegenerate}>
          {loading ? "正在重新生成…" : "重新生成"}
        </Button>
        <Button variant="primary" disabled={loading} onClick={onStart}>
          开始写初稿
        </Button>
      </div>
    </section>
  );
}
