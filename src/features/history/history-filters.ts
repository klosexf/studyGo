import type {
  ScenarioType,
  TrainingRecord,
} from "@/features/training/types";
import { DIMENSION_LABELS } from "@/features/dashboard/dashboard-selectors";

export type HistoryScenarioFilter = "all" | ScenarioType;

const SCENARIO_LABELS: Record<ScenarioType, string> = {
  workplace: "职场",
  life: "生活",
};

export function filterHistory(
  records: readonly TrainingRecord[],
  scenario: HistoryScenarioFilter,
  keyword: string,
) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase("zh-CN");

  return [...records]
    .filter((record) => {
      if (
        scenario !== "all" &&
        record.config.scenarioType !== scenario
      ) {
        return false;
      }
      if (!normalizedKeyword) {
        return true;
      }
      const searchable = [
        record.topic.title,
        record.config.scenarioType,
        SCENARIO_LABELS[record.config.scenarioType],
        record.config.trainingGoal,
        DIMENSION_LABELS[record.config.trainingGoal],
        record.weakestDimension,
        DIMENSION_LABELS[record.weakestDimension],
      ]
        .join(" ")
        .toLocaleLowerCase("zh-CN");
      return searchable.includes(normalizedKeyword);
    })
    .sort(
      (left, right) =>
        Date.parse(right.completedAt) - Date.parse(left.completedAt),
    );
}
