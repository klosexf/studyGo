import { describe, expect, it } from "vitest";

import { TRAINING_DIMENSIONS } from "@/features/training/types";
import { recommendGoal } from "@/lib/analytics/recommendation";
import {
  dimensionScores,
  trainingRecord,
} from "@/../tests/fixtures/training";

describe("recommendGoal", () => {
  it("defaults to argument sufficiency without history", () => {
    expect(recommendGoal([])).toBe("argumentSufficiency");
  });

  it("uses the newest record weakness for one or two records", () => {
    const newest = trainingRecord({
      id: "newest",
      completedAt: "2026-06-03T00:00:00.000Z",
      weakestDimension: "specificLanguage",
    });
    const older = trainingRecord({
      id: "older",
      completedAt: "2026-06-01T00:00:00.000Z",
      weakestDimension: "hiddenAssumption",
    });

    expect(recommendGoal([newest])).toBe("specificLanguage");
    expect(recommendGoal([newest, older])).toBe("specificLanguage");
    expect(recommendGoal([older, newest])).toBe("specificLanguage");
  });

  it("sorts timezone offsets by parsed time and filters invalid dates", () => {
    const earlierDespiteText = trainingRecord({
      completedAt: "2026-06-01T00:30:00+08:00",
      weakestDimension: "specificLanguage",
    });
    const laterUtc = trainingRecord({
      completedAt: "2026-05-31T20:00:00Z",
      weakestDimension: "hiddenAssumption",
    });
    const invalid = trainingRecord({
      completedAt: "not-a-date",
      weakestDimension: "conciseness",
    });

    expect(recommendGoal([earlierDespiteText, invalid, laterUtc])).toBe(
      "hiddenAssumption",
    );
    expect(recommendGoal([invalid])).toBe("argumentSufficiency");
  });

  it("uses the lowest recent-three rewrite average for three or more records", () => {
    const oldIgnored = trainingRecord({
      completedAt: "2026-05-01T00:00:00.000Z",
      comparison: {
        ...trainingRecord().comparison,
        rewriteScores: dimensionScores({ conciseness: 1 }),
      },
    });
    const recent = [1, 2, 3].map((day) =>
      trainingRecord({
        id: `recent-${day}`,
        completedAt: `2026-06-0${day}T00:00:00.000Z`,
        comparison: {
          ...trainingRecord().comparison,
          rewriteScores: dimensionScores({ smoothConnection: 2 }),
        },
      }),
    );

    expect(recommendGoal([recent[1], oldIgnored, recent[2], recent[0]])).toBe(
      "smoothConnection",
    );
  });

  it("breaks average ties by logic group then fixed dimension order", () => {
    const tiedScores = dimensionScores({
      hiddenAssumption: 1,
      counterargumentAwareness: 1,
      clearConclusion: 1,
      specificLanguage: 1,
    });
    const records = [1, 2, 3].map((day) =>
      trainingRecord({
        completedAt: `2026-06-0${day}T00:00:00.000Z`,
        comparison: {
          ...trainingRecord().comparison,
          rewriteScores: tiedScores,
        },
      }),
    );

    expect(TRAINING_DIMENSIONS.indexOf("hiddenAssumption")).toBeLessThan(
      TRAINING_DIMENSIONS.indexOf("counterargumentAwareness"),
    );
    expect(recommendGoal(records)).toBe("hiddenAssumption");
  });

  it("uses raw averages when one-decimal displays would look tied", () => {
    const perRecordScores = [
      { structureClarity: 2.3, argumentSufficiency: 2.3 },
      { structureClarity: 2.3, argumentSufficiency: 2.3 },
      { structureClarity: 2.4, argumentSufficiency: 2.3 },
    ];
    const records = perRecordScores.map((overrides, index) =>
      trainingRecord({
        completedAt: `2026-06-0${index + 1}T00:00:00.000Z`,
        comparison: {
          ...trainingRecord().comparison,
          rewriteScores: dimensionScores({
            ...Object.fromEntries(
              TRAINING_DIMENSIONS.map((dimension) => [dimension, 4]),
            ),
            ...overrides,
          }),
        },
      }),
    );

    expect(recommendGoal(records)).toBe("argumentSufficiency");
  });

  it("treats floating-point equivalents as a one-decimal tie", () => {
    const scores = dimensionScores({
      ...Object.fromEntries(
        TRAINING_DIMENSIONS.map((dimension) => [dimension, 4]),
      ),
      structureClarity: 3.4000000000000004,
      argumentSufficiency: 3.4,
    });
    const records = [1, 2, 3].map((day) =>
      trainingRecord({
        completedAt: `2026-06-0${day}T00:00:00.000Z`,
        comparison: {
          ...trainingRecord().comparison,
          rewriteScores: scores,
        },
      }),
    );

    expect(recommendGoal(records)).toBe("structureClarity");
  });
});
