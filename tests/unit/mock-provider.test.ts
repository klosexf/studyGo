import { describe, expect, it } from "vitest";

import { rewriteComparisonSchema } from "@/features/training/schemas/comparison";
import { draftDiagnosisSchema } from "@/features/training/schemas/diagnosis";
import { trainingTopicSchema } from "@/features/training/schemas/topic";
import { TRAINING_DIMENSIONS } from "@/features/training/types";
import { mockProvider } from "@/lib/ai/providers/mock-provider";
import type {
  ConnectionTestResult,
  DraftDiagnosisInput,
  RewriteComparisonInput,
  TopicGenerationInput,
} from "@/lib/ai/types";
import {
  diagnosisFixture,
  trainingTopic,
} from "@/../tests/fixtures/training";

const topicInput: TopicGenerationInput = {
  scenarioType: "life",
  difficulty: "medium",
  trainingGoal: "argumentSufficiency",
  recentTopicTags: [],
};

describe("mockProvider", () => {
  it("generates deterministic, valid topics and rotates away from recent tags", async () => {
    const first = await mockProvider.generateTopic(topicInput);
    const repeated = await mockProvider.generateTopic(topicInput);
    const rotated = await mockProvider.generateTopic({
      ...topicInput,
      recentTopicTags: [first.topicTags[0]],
    });

    expect(repeated).toEqual(first);
    expect(trainingTopicSchema.parse(first)).toEqual(first);
    expect(first.qualityCheck).toEqual({
      hasClearOpinion: true,
      hasTwoSidedness: true,
      requiresNoExpertKnowledge: true,
      avoidsHighPrivacy: true,
      matchesTrainingGoal: true,
    });
    expect(rotated.topicTags[0]).not.toBe(first.topicTags[0]);
  });

  it("rejects a template when any of its topic tags overlaps recent tags", async () => {
    const topic = await mockProvider.generateTopic({
      ...topicInput,
      recentTopicTags: ["个人成长"],
    });

    expect(topic.title).toBe("独处还是社交");
    expect(topic.topicTags).not.toContain("个人成长");
    expect(() => trainingTopicSchema.parse(topic)).not.toThrow();
  });

  it("uses the stable candidate with the fewest overlaps when none is disjoint", async () => {
    const topic = await mockProvider.generateTopic({
      ...topicInput,
      recentTopicTags: ["生活选择", "时间分配", "人际关系", "旅行方式"],
    });

    expect(topic.title).toBe("稳定还是成长");
    expect(() => trainingTopicSchema.parse(topic)).not.toThrow();
  });

  it("diagnoses deterministically with eight unique dimensions and no ghostwritten essay", async () => {
    const input: DraftDiagnosisInput = {
      topic: trainingTopic,
      draftText: "我认为成长更重要，因为长期机会更多。例如新项目能积累经验。",
    };
    const diagnosis = await mockProvider.diagnoseDraft(input);

    expect(await mockProvider.diagnoseDraft(input)).toEqual(diagnosis);
    expect(draftDiagnosisSchema.parse(diagnosis)).toEqual(diagnosis);
    expect(diagnosis.scores.map(({ dimension }) => dimension)).toEqual(
      TRAINING_DIMENSIONS,
    );
    expect(
      new Set(diagnosis.scores.map(({ dimension }) => dimension)).size,
    ).toBe(8);
    expect(diagnosis.coverageCount).toBe(8);
    const average = (scores: typeof diagnosis.scores) =>
      Math.round(
        (scores.reduce((sum, { score }) => sum + score, 0) / scores.length) *
          10,
      ) / 10;
    expect(diagnosis.logicScore).toBe(average(diagnosis.scores.slice(0, 4)));
    expect(diagnosis.expressionScore).toBe(
      average(diagnosis.scores.slice(4)),
    );
    expect(Object.values(diagnosis).join("")).not.toContain(
      "下面是一篇完整范文",
    );
  });

  it("does not reward negated keywords or claim an unclear short text has a stance", async () => {
    const neutral = await mockProvider.diagnoseDraft({
      topic: trainingTopic,
      draftText: "内容很短。",
    });
    const negated = await mockProvider.diagnoseDraft({
      topic: trainingTopic,
      draftText: "没有理由，没有例子，转折也不过关。",
    });
    const score = (dimension: (typeof TRAINING_DIMENSIONS)[number]) =>
      negated.scores.find((item) => item.dimension === dimension)!.score;
    const neutralScore = (dimension: (typeof TRAINING_DIMENSIONS)[number]) =>
      neutral.scores.find((item) => item.dimension === dimension)!.score;

    expect(score("argumentSufficiency")).toBeLessThanOrEqual(
      neutralScore("argumentSufficiency"),
    );
    expect(score("specificLanguage")).toBeLessThanOrEqual(
      neutralScore("specificLanguage"),
    );
    expect(score("counterargumentAwareness")).toBeLessThanOrEqual(
      neutralScore("counterargumentAwareness"),
    );
    expect(negated.summary).not.toMatch(/已表达立场|形成基本观点/);
  });

  it("compares deterministically, recalculates aggregates, and rewards improved features", async () => {
    const draftText = "成长更好。";
    const rewriteText =
      "我认为成长更重要，因为长期能力会扩大选择。例如，新项目能积累经验。不过，稳定也能降低风险，因此我会在生活有保障时选择成长。";
    const input: RewriteComparisonInput = {
      topic: trainingTopic,
      draftText,
      rewriteText,
      diagnosis: diagnosisFixture(),
    };
    const comparison = await mockProvider.compareRewrite(input);
    const logicScores = comparison.rewriteScores.slice(0, 4);
    const expressionScores = comparison.rewriteScores.slice(4);
    const average = (scores: typeof logicScores) =>
      Math.round(
        (scores.reduce((sum, { score }) => sum + score, 0) / scores.length) *
          10,
      ) / 10;

    expect(await mockProvider.compareRewrite(input)).toEqual(comparison);
    expect(rewriteComparisonSchema.parse(comparison)).toEqual(comparison);
    expect(comparison.rewriteLogicScore).toBe(average(logicScores));
    expect(comparison.rewriteExpressionScore).toBe(average(expressionScores));
    expect(comparison.logicImprovement).toBe(
      Math.round(
        (comparison.rewriteLogicScore - comparison.draftLogicScore) * 10,
      ) / 10,
    );
    expect(comparison.expressionImprovement).toBe(
      Math.round(
        (comparison.rewriteExpressionScore -
          comparison.draftExpressionScore) *
          10,
      ) / 10,
    );
    for (const rewriteScore of comparison.rewriteScores) {
      const draftScore = input.diagnosis.scores.find(
        ({ dimension }) => dimension === rewriteScore.dimension,
      );
      expect(rewriteScore.score).toBeGreaterThanOrEqual(draftScore!.score);
    }
  });

  it("returns legal comparison output for very short text", async () => {
    const comparison = await mockProvider.compareRewrite({
      topic: trainingTopic,
      draftText: "支持。",
      rewriteText: "仍支持。",
      diagnosis: diagnosisFixture(),
    });

    expect(() => rewriteComparisonSchema.parse(comparison)).not.toThrow();
  });

  it("keeps every diagnosis and comparison text field concise and non-ghostwriting", async () => {
    const diagnosis = await mockProvider.diagnoseDraft({
      topic: trainingTopic,
      draftText: "我认为成长更重要，因为它能增加未来选择。",
    });
    const comparison = await mockProvider.compareRewrite({
      topic: trainingTopic,
      draftText: "我认为成长更重要。",
      rewriteText:
        "我认为成长更重要，因为它能增加未来选择。例如学习新技能能扩大工作机会。不过稳定也能降低风险。",
      diagnosis,
    });
    const collectStrings = (value: unknown): string[] => {
      if (typeof value === "string") {
        return [value];
      }
      if (Array.isArray(value)) {
        return value.flatMap(collectStrings);
      }
      if (value && typeof value === "object") {
        return Object.values(value).flatMap(collectStrings);
      }
      return [];
    };
    const textFields = [
      ...collectStrings(diagnosis),
      ...collectStrings(comparison),
    ];

    expect(textFields.every((text) => Array.from(text).length < 200)).toBe(true);
    expect(textFields.join("\n")).not.toMatch(
      /参考范文|完整改写如下|你可以这样写/,
    );
  });

  it("reports a successful mock connection explicitly", async () => {
    const expected: ConnectionTestResult = {
      ok: true,
      provider: "mock",
      model: "mock",
    };

    await expect(mockProvider.testConnection()).resolves.toEqual(expected);
  });
});
