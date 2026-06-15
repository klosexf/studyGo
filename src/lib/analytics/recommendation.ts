import {
  TRAINING_DIMENSIONS,
  type TrainingDimension,
  type TrainingRecord,
} from "@/features/training/types";

const DEFAULT_GOAL: TrainingDimension = "argumentSufficiency";
const SCORE_EPSILON = 1e-9;

function completedAtTime(record: TrainingRecord) {
  return Date.parse(record.completedAt);
}

function byCompletedAtDescending(a: TrainingRecord, b: TrainingRecord) {
  return completedAtTime(b) - completedAtTime(a);
}

export function recommendGoal(
  records: readonly TrainingRecord[],
): TrainingDimension {
  const recent = records
    .filter((record) => Number.isFinite(completedAtTime(record)))
    .sort(byCompletedAtDescending);

  if (recent.length === 0) {
    return DEFAULT_GOAL;
  }

  if (recent.length < 3) {
    return recent[0].weakestDimension;
  }

  const latestThree = recent.slice(0, 3);
  const averages = new Map<TrainingDimension, number>();

  for (const dimension of TRAINING_DIMENSIONS) {
    const total = latestThree.reduce((sum, record) => {
      const score = record.comparison.rewriteScores.find(
        (item) => item.dimension === dimension,
      );
      return sum + (score?.score ?? 5);
    }, 0);
    averages.set(dimension, total / latestThree.length);
  }

  return TRAINING_DIMENSIONS.reduce((weakest, dimension) => {
    const difference =
      (averages.get(dimension) ?? 5) - (averages.get(weakest) ?? 5);
    return difference < -SCORE_EPSILON ? dimension : weakest;
  });
}
