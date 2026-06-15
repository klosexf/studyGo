import { Button } from "@/components/ui/button";
import { DIMENSION_LABELS } from "@/features/dashboard/dashboard-selectors";
import type {
  Difficulty,
  ProviderId,
  ScenarioType,
  TrainingConfig,
  TrainingDimension,
} from "@/features/training/types";

const PROVIDERS: Record<ProviderId, string> = {
  mock: "Mock 模拟",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  zhipu: "智谱",
};

const RECOMMENDATION_LABELS: Record<TrainingDimension, string> = {
  structureClarity: "结构 / 层次清晰",
  argumentSufficiency: "论证 / 证据充分",
  hiddenAssumption: "假设 / 前提意识",
  counterargumentAwareness: "反方 / 风险意识",
  clearConclusion: "结论 / 立场明确",
  specificLanguage: "表达 / 语言具体",
  smoothConnection: "衔接 / 推理流畅",
  conciseness: "精简 / 表达有力",
};

export function SetupView({
  config,
  provider,
  loading,
  onChange,
  onGenerate,
}: {
  config: TrainingConfig;
  provider: ProviderId;
  loading: boolean;
  onChange: (update: Partial<TrainingConfig>) => void;
  onGenerate: () => void;
}) {
  return (
    <section className="training-stage" aria-labelledby="setup-title">
      <div className="setup-grid">
        <div className="setup-card setup-card--choices">
          <h2>选择训练场景</h2>

          <fieldset className="choice-section">
            <legend className="sr-only">训练场景</legend>
            <div className="scenario-grid">
              {([
                ["workplace", "职场观点", "汇报、决策、协作与资源争取。"],
                ["life", "生活价值观点", "价值判断、关系边界与成长选择。"],
              ] as const).map(([value, title, copy]) => (
                <label
                  key={value}
                  className="choice-card"
                  data-selected={config.scenarioType === value}
                >
                  <input
                    type="radio"
                    name="scenario"
                    checked={config.scenarioType === value}
                    onChange={() =>
                      onChange({ scenarioType: value as ScenarioType })
                    }
                  />
                  <strong>{title}</strong>
                  <span>{copy}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="choice-section difficulty-section">
            <legend>选择难度</legend>
            <div className="training-segments">
              {([
                ["easy", "简单"],
                ["medium", "中等"],
                ["challenging", "有挑战"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={config.difficulty === value}
                  onClick={() => onChange({ difficulty: value as Difficulty })}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="setup-card setup-card--recommendation">
          <label className="recommendation-goal">
            <span>系统推荐训练重点</span>
            <select
              aria-label="本次训练目标"
              value={config.trainingGoal}
              onChange={(event) =>
                onChange({
                  trainingGoal: event.target.value as TrainingDimension,
                })
              }
            >
              {Object.entries(DIMENSION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <h2>{RECOMMENDATION_LABELS[config.trainingGoal]}</h2>
          <p className="recommendation-copy">
            最近 3 次训练中，你经常缺少这一维度的有效表达。本次命题会重点暴露这个问题。
          </p>
          <ul className="recommendation-list">
            <li>读取最近 5 次主题并去重</li>
            <li>使用中等难度真实场景</li>
            <li>约束中加入反方回应</li>
          </ul>
          <div className="recommendation-actions">
            <Button variant="lavender" disabled={loading} onClick={onGenerate}>
              {loading ? "正在生成…" : "生成训练命题"}
            </Button>
            <span className="source-badge">来源：{PROVIDERS[provider]}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
