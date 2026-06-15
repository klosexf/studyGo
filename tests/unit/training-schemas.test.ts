import { describe, expect, expectTypeOf, it } from "vitest";

import { rewriteComparisonSchema } from "@/features/training/schemas/comparison";
import { draftDiagnosisSchema } from "@/features/training/schemas/diagnosis";
import {
  comparisonRequestSchema,
  diagnosisRequestSchema,
  providerConfigSchema,
  providerTestRequestSchema,
  topicRequestSchema,
} from "@/features/training/schemas/requests";
import { trainingTopicSchema } from "@/features/training/schemas/topic";
import {
  TRAINING_DIMENSIONS,
  type DraftDiagnosis,
  type RewriteComparison,
  type TrainingSession,
  type TrainingTopic,
} from "@/features/training/types";

const dimensionScores = TRAINING_DIMENSIONS.map((dimension, index) => {
  const wholeScore = 1 + (index % 5);

  return {
    dimension,
    score: wholeScore < 5 && index % 2 === 0 ? wholeScore + 0.5 : wholeScore,
    evidence: `${dimension} 的评分依据`,
  };
});

const validTopic = {
  title: "稳定还是成长",
  scenarioType: "life",
  difficulty: "medium",
  background: "两种职业选择各有收益与风险。",
  mainQuestion: "职业早期应该优先稳定还是成长？",
  writingTask: "请在200-400字内说明你的观点。",
  constraints: ["先给结论", "回应一个反方观点"],
  scoringFocus: ["argumentSufficiency", "counterargumentAwareness"],
  topicTags: ["职业选择", "成长"],
  qualityCheck: {
    hasClearOpinion: true,
    hasTwoSidedness: true,
    requiresNoExpertKnowledge: true,
    avoidsHighPrivacy: true,
    matchesTrainingGoal: true,
  },
} as const;

const validDiagnosis = {
  summary: "观点明确，但论证链条仍有缺口。",
  keyLogicIssue: "没有说明成长为何比短期稳定更重要。",
  keyExpressionIssue: "第二段的指代对象不清楚。",
  socraticQuestion: "你用什么标准判断成长机会值得承担风险？",
  rewriteTask: "补充判断标准，并回应稳定优先的反方观点。",
  scores: dimensionScores,
  logicScore: 3.5,
  expressionScore: 4,
  coverageCount: 8,
  confidence: "high",
  source: "real",
} as const;

const validComparison = {
  draftLogicScore: 3,
  draftExpressionScore: 3.5,
  rewriteLogicScore: 4,
  rewriteExpressionScore: 4.5,
  logicImprovement: 1,
  expressionImprovement: 1,
  improvedPoints: ["补充了判断标准", "回应了反方观点"],
  remainingIssue: "例子仍然偏抽象。",
  nextTrainingSuggestion: "下一次重点训练语言具体性。",
  rewriteScores: dimensionScores,
  weakestDimension: "specificLanguage",
  confidence: "high",
  source: "mock",
} as const;

describe("training topic schema", () => {
  it("uses the eight scoring dimensions from the technical design", () => {
    expect(TRAINING_DIMENSIONS).toEqual([
      "structureClarity",
      "argumentSufficiency",
      "hiddenAssumption",
      "counterargumentAwareness",
      "clearConclusion",
      "specificLanguage",
      "smoothConnection",
      "conciseness",
    ]);
    expect(trainingTopicSchema.parse(validTopic).topicTags).toEqual([
      "职业选择",
      "成长",
    ]);
  });

  it("counts title length by Unicode code points", () => {
    const fifteenCodePoints = "😀".repeat(15);
    expect(
      trainingTopicSchema.parse({ ...validTopic, title: fifteenCodePoints })
        .title,
    ).toBe(fifteenCodePoints);
    expect(() =>
      trainingTopicSchema.parse({
        ...validTopic,
        title: "😀".repeat(16),
      }),
    ).toThrow();
  });

  it("requires all quality checks to be true", () => {
    expect(() =>
      trainingTopicSchema.parse({
        ...validTopic,
        qualityCheck: {
          ...validTopic.qualityCheck,
          hasTwoSidedness: false,
        },
      }),
    ).toThrow();
  });

  it("enforces unique scoring focus and collection sizes", () => {
    expect(() =>
      trainingTopicSchema.parse({
        ...validTopic,
        scoringFocus: ["argumentSufficiency", "argumentSufficiency"],
      }),
    ).toThrow();
    expect(() =>
      trainingTopicSchema.parse({ ...validTopic, constraints: ["只有一个"] }),
    ).toThrow();
    expect(() =>
      trainingTopicSchema.parse({
        ...validTopic,
        topicTags: ["一", "二", "三", "四", "五"],
      }),
    ).toThrow();
  });

  it("rejects whitespace-only array items", () => {
    expect(() =>
      trainingTopicSchema.parse({
        ...validTopic,
        constraints: ["先给结论", "   "],
      }),
    ).toThrow();
    expect(() =>
      trainingTopicSchema.parse({
        ...validTopic,
        topicTags: ["职业选择", "   "],
      }),
    ).toThrow();
  });
});

describe("score and diagnosis schemas", () => {
  it("accepts integers or one decimal within 1..5", () => {
    expect(draftDiagnosisSchema.parse(validDiagnosis).logicScore).toBe(3.5);
    expect(
      rewriteComparisonSchema.parse(validComparison).rewriteExpressionScore,
    ).toBe(4.5);
  });

  it.each([0.9, 1.25, 4.99, 5.1])("rejects invalid score %s", (score) => {
    expect(() =>
      draftDiagnosisSchema.parse({ ...validDiagnosis, logicScore: score }),
    ).toThrow();
  });

  it("requires diagnosis scores to cover all eight dimensions once", () => {
    expect(draftDiagnosisSchema.parse(validDiagnosis).scores).toHaveLength(8);
    expect(() =>
      draftDiagnosisSchema.parse({
        ...validDiagnosis,
        scores: dimensionScores.slice(0, 7),
        coverageCount: 7,
      }),
    ).toThrow();
    expect(() =>
      draftDiagnosisSchema.parse({
        ...validDiagnosis,
        scores: [
          ...dimensionScores.slice(0, 7),
          { ...dimensionScores[0], evidence: "重复维度" },
        ],
      }),
    ).toThrow();
  });

  it("requires coverageCount to match scores length", () => {
    expect(() =>
      draftDiagnosisSchema.parse({
        ...validDiagnosis,
        coverageCount: 7,
      }),
    ).toThrow();
  });

  it("limits diagnostic coaching text and evidence length", () => {
    expect(() =>
      draftDiagnosisSchema.parse({
        ...validDiagnosis,
        summary: "长".repeat(1001),
      }),
    ).toThrow();
    expect(() =>
      draftDiagnosisSchema.parse({
        ...validDiagnosis,
        scores: dimensionScores.map((score, index) =>
          index === 0
            ? { ...score, evidence: "长".repeat(501) }
            : score,
        ),
      }),
    ).toThrow();
  });
});

describe("rewrite comparison schema", () => {
  it("parses the technical-design comparison fields", () => {
    const parsed = rewriteComparisonSchema.parse(validComparison);
    expect(parsed.improvedPoints).toHaveLength(2);
    expect(parsed.nextTrainingSuggestion).toContain("语言具体性");
    expect(parsed.weakestDimension).toBe("specificLanguage");
  });

  it("allows negative one-decimal improvements", () => {
    expect(
      rewriteComparisonSchema.parse({
        ...validComparison,
        logicImprovement: -0.5,
      }).logicImprovement,
    ).toBe(-0.5);
  });

  it("rejects imprecise improvements and incomplete rewrite scores", () => {
    expect(() =>
      rewriteComparisonSchema.parse({
        ...validComparison,
        expressionImprovement: 0.25,
      }),
    ).toThrow();
    expect(() =>
      rewriteComparisonSchema.parse({
        ...validComparison,
        rewriteScores: dimensionScores.slice(0, 7),
      }),
    ).toThrow();
    expect(() =>
      rewriteComparisonSchema.parse({
        ...validComparison,
        improvedPoints: ["   "],
      }),
    ).toThrow();
  });

  it("limits comparison coaching text to prevent full ghostwriting", () => {
    expect(() =>
      rewriteComparisonSchema.parse({
        ...validComparison,
        improvedPoints: ["长".repeat(501)],
      }),
    ).toThrow();
    expect(() =>
      rewriteComparisonSchema.parse({
        ...validComparison,
        nextTrainingSuggestion: "长".repeat(1001),
      }),
    ).toThrow();
  });
});

describe("provider and request schemas", () => {
  const mockConfig = {
    provider: "mock",
    baseUrl: "",
    apiKey: "",
    model: "",
  } as const;
  const openAiConfig = {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "secret",
    model: "gpt-5-mini",
  } as const;

  it("allows Mock without a URL, API key, or model", () => {
    expect(providerConfigSchema.parse(mockConfig).provider).toBe("mock");
  });

  it.each(["openai", "deepseek", "zhipu"] as const)(
    "requires an HTTP(S) URL, API key, and model for %s",
    (provider) => {
      for (const baseUrl of ["ftp://example.com/v1", "file:///tmp/api"]) {
        expect(() =>
          providerConfigSchema.parse({
            provider,
            baseUrl,
            apiKey: "secret",
            model: "model-name",
          }),
        ).toThrow();
      }
      expect(() =>
        providerConfigSchema.parse({
          provider,
          baseUrl: "https://example.com/v1",
          apiKey: "",
          model: "model-name",
        }),
      ).toThrow();
    },
  );

  it.each([
    "http://api.example.com/v1",
    "https://0.0.0.0/v1",
    "https://10.0.0.1/v1",
    "https://169.254.169.254/latest",
    "https://[::]/v1",
    "https://[::ffff:10.0.0.1]/v1",
    "https://[::ffff:127.0.0.1]/v1",
    "https://api.example.com/v1?token=secret",
    "https://api.example.com/v1#fragment",
  ])("rejects unsafe provider base URL %s", (baseUrl) => {
    expect(() =>
      providerConfigSchema.parse({
        ...openAiConfig,
        baseUrl,
      }),
    ).toThrow();
  });

  it.each([
    "https://api.example.com/v1",
    "http://localhost:11434/v1",
    "http://127.0.0.1:8000/v1",
    "http://[::1]:8080/v1",
  ])("accepts safe provider base URL %s", (baseUrl) => {
    expect(
      providerConfigSchema.parse({
        ...openAiConfig,
        baseUrl,
      }).baseUrl,
    ).toBe(baseUrl);
  });

  it("uses recentTopicTags in topic requests", () => {
    const parsed = topicRequestSchema.parse({
      provider: openAiConfig,
      scenarioType: "workplace",
      difficulty: "challenging",
      trainingGoal: "counterargumentAwareness",
      recentWeakness: null,
      recentTopicTags: ["协作"],
    });
    expect(parsed.recentTopicTags).toEqual(["协作"]);
    expect(() =>
      topicRequestSchema.parse({
        provider: openAiConfig,
        scenarioType: "workplace",
        difficulty: "challenging",
        trainingGoal: "counterargumentAwareness",
        recentTopicTags: ["   "],
      }),
    ).toThrow();
  });

  it("parses diagnosis, comparison, and provider-test requests", () => {
    expect(
      diagnosisRequestSchema.parse({
        provider: mockConfig,
        topic: validTopic,
        draftText: "这是一段足够用于诊断的初稿文本。",
      }).provider.provider,
    ).toBe("mock");

    expect(
      comparisonRequestSchema.parse({
        provider: mockConfig,
        topic: validTopic,
        draftText: "这是初稿。",
        rewriteText: "这是补充判断标准后的改写稿。",
        diagnosis: validDiagnosis,
      }).rewriteText,
    ).toContain("改写稿");

    expect(providerTestRequestSchema.parse(openAiConfig).provider).toBe("openai");
  });
});

describe("derived domain types and staged sessions", () => {
  it("derives response types from their schemas", () => {
    expectTypeOf<TrainingTopic>().toEqualTypeOf<
      ReturnType<typeof trainingTopicSchema.parse>
    >();
    expectTypeOf<DraftDiagnosis>().toEqualTypeOf<
      ReturnType<typeof draftDiagnosisSchema.parse>
    >();
    expectTypeOf<RewriteComparison>().toEqualTypeOf<
      ReturnType<typeof rewriteComparisonSchema.parse>
    >();
  });

  it("requires accumulated data for each training stage", () => {
    type SetupSession = Extract<TrainingSession, { stage: "setup" }>;
    expectTypeOf<SetupSession["topic"]>().toEqualTypeOf<undefined>();
    expectTypeOf<SetupSession["diagnosis"]>().toEqualTypeOf<undefined>();
    expectTypeOf<SetupSession["comparison"]>().toEqualTypeOf<undefined>();
    expectTypeOf<
      Extract<TrainingSession, { stage: "topic" }>
    >().toMatchTypeOf<{ stage: "topic"; topic: TrainingTopic }>();
    expectTypeOf<
      Extract<TrainingSession, { stage: "draft" }>
    >().toMatchTypeOf<{ stage: "draft"; topic: TrainingTopic }>();
    expectTypeOf<
      Extract<TrainingSession, { stage: "diagnosis" }>
    >().toMatchTypeOf<{
      stage: "diagnosis";
      topic: TrainingTopic;
      diagnosis: DraftDiagnosis;
    }>();
    expectTypeOf<
      Extract<TrainingSession, { stage: "result" }>
    >().toMatchTypeOf<{
      stage: "result";
      topic: TrainingTopic;
      diagnosis: DraftDiagnosis;
      comparison: RewriteComparison;
    }>();
  });
});
