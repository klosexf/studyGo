import {
  TRAINING_STAGES,
  type TrainingStage,
} from "@/features/training/types";

const LABELS: Record<TrainingStage, string> = {
  setup: "设置训练",
  topic: "确认命题",
  draft: "写初稿",
  diagnosis: "诊断改写",
  result: "结果复盘",
};

export function StageTabs({
  stage,
  onBack,
}: {
  stage: TrainingStage;
  onBack?: () => void;
}) {
  const current = TRAINING_STAGES.indexOf(stage);
  const backTarget =
    stage === "topic" ? "setup" : stage === "draft" ? "topic" : null;
  return (
    <nav
      className={`stage-tabs${stage === "topic" ? " stage-tabs--topic" : ""}`}
      aria-label="训练进度"
    >
      <ol>
        {TRAINING_STAGES.map((item, index) => {
          const state =
            index < current
              ? "completed"
              : index === current
                ? "current"
                : "pending";
          const status =
            state === "completed"
              ? "已完成"
              : state === "current"
                ? "当前步骤"
                : "待进行";
          const content = (
            <>
              <span aria-hidden="true">{index + 1}</span>
              <span>{LABELS[item]}</span>
              <small>{status}</small>
            </>
          );
          return (
            <li
              key={item}
              data-state={state}
              aria-current={item === stage ? "step" : undefined}
            >
              {item === backTarget ? (
                <button type="button" onClick={onBack}>
                  {content}
                </button>
              ) : (
                <span>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
