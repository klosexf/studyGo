import {
  TRAINING_DIMENSIONS,
  type TrainingDimension,
  type TrainingRecord,
} from "@/features/training/types";

export interface TrainingAverages {
  draftLogic: number;
  draftExpression: number;
  rewriteLogic: number;
  rewriteExpression: number;
  logicImprovement: number;
  expressionImprovement: number;
}

export interface TrendPoint {
  id: string;
  completedAt: string;
  draftLogicScore: number;
  draftExpressionScore: number;
  rewriteLogicScore: number;
  rewriteExpressionScore: number;
  logicImprovement: number;
  expressionImprovement: number;
}

export interface TrainingStatistics {
  totalCount: number;
  averages: TrainingAverages;
  recent: TrendPoint[];
  dimensionAverages: Partial<Record<TrainingDimension, number>>;
  weakestDimension: TrainingDimension | null;
}

const EMPTY_AVERAGES: TrainingAverages = {
  draftLogic: 0,
  draftExpression: 0,
  rewriteLogic: 0,
  rewriteExpression: 0,
  logicImprovement: 0,
  expressionImprovement: 0,
};

export function roundOneDecimal(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function rawAverage(values: readonly number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function average(values: readonly number[]) {
  return roundOneDecimal(rawAverage(values));
}

export function buildStatistics(
  records: readonly TrainingRecord[],
): TrainingStatistics {
  const sorted = records
    .map((record) => ({ record, time: Date.parse(record.completedAt) }))
    .filter(({ time }) => Number.isFinite(time))
    .sort((a, b) => a.time - b.time)
    .map(({ record }) => record);

  if (sorted.length === 0) {
    return {
      totalCount: 0,
      averages: EMPTY_AVERAGES,
      recent: [],
      dimensionAverages: {},
      weakestDimension: null,
    };
  }

  const rawDimensionAverages = Object.fromEntries(
    TRAINING_DIMENSIONS.map((dimension) => [
      dimension,
      rawAverage(
        sorted.flatMap((record) =>
          record.comparison.rewriteScores
            .filter((score) => score.dimension === dimension)
            .map((score) => score.score),
        ),
      ),
    ]),
  ) as Record<TrainingDimension, number>;
  const dimensionAverages = Object.fromEntries(
    TRAINING_DIMENSIONS.map((dimension) => [
      dimension,
      roundOneDecimal(rawDimensionAverages[dimension]),
    ]),
  ) as Record<TrainingDimension, number>;
  const weakestDimension = TRAINING_DIMENSIONS.reduce((weakest, dimension) =>
    rawDimensionAverages[dimension] < rawDimensionAverages[weakest]
      ? dimension
      : weakest,
  );

  return {
    totalCount: sorted.length,
    averages: {
      draftLogic: average(sorted.map((record) => record.draftLogicScore)),
      draftExpression: average(
        sorted.map((record) => record.draftExpressionScore),
      ),
      rewriteLogic: average(sorted.map((record) => record.rewriteLogicScore)),
      rewriteExpression: average(
        sorted.map((record) => record.rewriteExpressionScore),
      ),
      logicImprovement: average(
        sorted.map((record) => record.logicImprovement),
      ),
      expressionImprovement: average(
        sorted.map((record) => record.expressionImprovement),
      ),
    },
    recent: sorted.slice(-7).map((record) => ({
      id: record.id,
      completedAt: record.completedAt,
      draftLogicScore: roundOneDecimal(record.draftLogicScore),
      draftExpressionScore: roundOneDecimal(record.draftExpressionScore),
      rewriteLogicScore: roundOneDecimal(record.rewriteLogicScore),
      rewriteExpressionScore: roundOneDecimal(record.rewriteExpressionScore),
      logicImprovement: roundOneDecimal(record.logicImprovement),
      expressionImprovement: roundOneDecimal(record.expressionImprovement),
    })),
    dimensionAverages,
    weakestDimension,
  };
}
