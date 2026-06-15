import {
  TRAINING_DIMENSIONS,
  type TrainingDimension,
  type TrainingRecord,
} from "@/features/training/types";
import { recommendGoal } from "@/lib/analytics/recommendation";
import { buildStatistics } from "@/lib/analytics/statistics";

export const DIMENSION_LABELS: Record<TrainingDimension, string> = {
  structureClarity: "结构清晰",
  argumentSufficiency: "论证充分",
  hiddenAssumption: "隐含假设",
  counterargumentAwareness: "反方意识",
  clearConclusion: "结论明确",
  specificLanguage: "表达具体",
  smoothConnection: "衔接流畅",
  conciseness: "简洁凝练",
};

export function selectDashboard(records: readonly TrainingRecord[]) {
  const statistics = buildStatistics(records);
  const recommendedGoal = recommendGoal(records);
  const latestRecords = [...records]
    .filter((record) => Number.isFinite(Date.parse(record.completedAt)))
    .sort(
      (left, right) =>
        Date.parse(right.completedAt) - Date.parse(left.completedAt),
    )
    .slice(0, 5);
  const abilityData = TRAINING_DIMENSIONS.map((dimension) => ({
    dimension,
    label: DIMENSION_LABELS[dimension],
    score: statistics.dimensionAverages[dimension] ?? 0,
  }));

  return {
    statistics,
    recommendedGoal,
    recommendedGoalLabel: DIMENSION_LABELS[recommendedGoal],
    latestRecords,
    abilityData,
  };
}

export function formatCompletedAt(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}
