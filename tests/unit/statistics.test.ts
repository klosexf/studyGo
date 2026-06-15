import { describe, expect, it } from "vitest";

import { buildStatistics } from "@/lib/analytics/statistics";
import {
  comparisonFixture,
  dimensionScores,
  trainingRecord,
} from "@/../tests/fixtures/training";

describe("buildStatistics", () => {
  it("returns an explicit zero state for empty history", () => {
    expect(buildStatistics([])).toEqual({
      totalCount: 0,
      averages: {
        draftLogic: 0,
        draftExpression: 0,
        rewriteLogic: 0,
        rewriteExpression: 0,
        logicImprovement: 0,
        expressionImprovement: 0,
      },
      recent: [],
      dimensionAverages: {},
      weakestDimension: null,
    });
  });

  it("sorts by completedAt and keeps only the latest seven in ascending order", () => {
    const records = Array.from({ length: 9 }, (_, index) =>
      trainingRecord({
        id: String(index + 1),
        completedAt: `2026-06-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    ).reverse();

    const statistics = buildStatistics(records);

    expect(statistics.recent).toHaveLength(7);
    expect(statistics.recent.map(({ id }) => id)).toEqual([
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
  });

  it("sorts timezone offsets by parsed time and filters invalid dates", () => {
    const statistics = buildStatistics([
      trainingRecord({
        id: "text-later-time-earlier",
        completedAt: "2026-06-01T00:30:00+08:00",
      }),
      trainingRecord({
        id: "text-earlier-time-later",
        completedAt: "2026-05-31T20:00:00Z",
      }),
      trainingRecord({
        id: "invalid",
        completedAt: "not-a-date",
      }),
    ]);

    expect(statistics.totalCount).toBe(2);
    expect(statistics.recent.map(({ id }) => id)).toEqual([
      "text-later-time-earlier",
      "text-earlier-time-later",
    ]);
  });

  it("rounds aggregate scores and improvements to one decimal", () => {
    const records = [
      trainingRecord({
        draftLogicScore: 3.14,
        draftExpressionScore: 2.95,
        rewriteLogicScore: 3.88,
        rewriteExpressionScore: 3.74,
        logicImprovement: 0.74,
        expressionImprovement: 0.79,
      }),
      trainingRecord({
        draftLogicScore: 3.55,
        draftExpressionScore: 3.44,
        rewriteLogicScore: 4.11,
        rewriteExpressionScore: 4.2,
        logicImprovement: 0.56,
        expressionImprovement: 0.76,
      }),
    ];

    expect(buildStatistics(records).averages).toEqual({
      draftLogic: 3.3,
      draftExpression: 3.2,
      rewriteLogic: 4,
      rewriteExpression: 4,
      logicImprovement: 0.7,
      expressionImprovement: 0.8,
    });
  });

  it("rounds every recent trend score and improvement to one decimal", () => {
    const statistics = buildStatistics([
      trainingRecord({
        id: "precise",
        draftLogicScore: 3.14,
        draftExpressionScore: 2.95,
        rewriteLogicScore: 3.88,
        rewriteExpressionScore: 3.74,
        logicImprovement: 0.74,
        expressionImprovement: 0.79,
      }),
    ]);

    expect(statistics.recent[0]).toEqual({
      id: "precise",
      completedAt: "2026-06-01T12:00:00.000Z",
      draftLogicScore: 3.1,
      draftExpressionScore: 3,
      rewriteLogicScore: 3.9,
      rewriteExpressionScore: 3.7,
      logicImprovement: 0.7,
      expressionImprovement: 0.8,
    });
  });

  it("averages rewrite dimensions and reports the lowest one", () => {
    const record = trainingRecord({
      comparison: comparisonFixture({
        rewriteScores: dimensionScores({
          argumentSufficiency: 2.34,
          specificLanguage: 2.36,
        }),
      }),
    });

    const statistics = buildStatistics([record]);

    expect(statistics.dimensionAverages.argumentSufficiency).toBe(2.3);
    expect(statistics.dimensionAverages.specificLanguage).toBe(2.4);
    expect(statistics.weakestDimension).toBe("argumentSufficiency");
  });

  it("selects the weakest dimension from raw averages before display rounding", () => {
    const record = trainingRecord({
      comparison: comparisonFixture({
        rewriteScores: dimensionScores({
          structureClarity: 2.34,
          argumentSufficiency: 2.31,
        }),
      }),
    });

    const statistics = buildStatistics([record]);

    expect(statistics.dimensionAverages.structureClarity).toBe(2.3);
    expect(statistics.dimensionAverages.argumentSufficiency).toBe(2.3);
    expect(statistics.weakestDimension).toBe("argumentSufficiency");
  });
});
