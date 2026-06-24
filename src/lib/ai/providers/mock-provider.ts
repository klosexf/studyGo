import { rewriteComparisonSchema } from "@/features/training/schemas/comparison";
import {
  draftDiagnosisSchema,
  type dimensionScoreSchema,
} from "@/features/training/schemas/diagnosis";
import {
  comparisonRequestSchema,
  diagnosisRequestSchema,
  topicRequestSchema,
} from "@/features/training/schemas/requests";
import { trainingTopicSchema } from "@/features/training/schemas/topic";
import {
  TRAINING_DIMENSIONS,
  type DraftDiagnosis,
  type TrainingDimension,
} from "@/features/training/types";
import type { AIProvider } from "@/lib/ai/types";
import { roundOneDecimal } from "@/lib/analytics/statistics";
import type { z } from "zod";

type DimensionScore = z.infer<typeof dimensionScoreSchema>;

const MOCK_CONFIG = {
  provider: "mock",
  baseUrl: "",
  apiKey: "",
  model: "",
} as const;

const LOGIC_DIMENSIONS = TRAINING_DIMENSIONS.slice(0, 4);
const EXPRESSION_DIMENSIONS = TRAINING_DIMENSIONS.slice(4);

const TOPIC_TEMPLATES = {
  workplace: [
    {
      title: "效率还是质量",
      background: "团队需要在交付速度和成果质量之间做出取舍。",
      mainQuestion: "资源有限时，团队应该优先效率还是质量？",
      tags: ["项目交付", "团队协作"],
    },
    {
      title: "公开还是私下",
      background: "同事的方案存在明显问题，你需要决定反馈方式。",
      mainQuestion: "发现同事方案有问题时，应该公开讨论还是私下沟通？",
      tags: ["反馈方式", "职场沟通"],
    },
    {
      title: "专才还是通才",
      background: "职业发展中，深耕单一领域和拓展综合能力各有收益。",
      mainQuestion: "职业早期应该优先成为专才还是通才？",
      tags: ["职业发展", "能力选择"],
    },
  ],
  life: [
    {
      title: "稳定还是成长",
      background: "两种生活选择分别提供稳定保障和更大的成长空间。",
      mainQuestion: "人生选择中应该优先稳定还是成长？",
      tags: ["生活选择", "个人成长"],
    },
    {
      title: "独处还是社交",
      background: "有限的休息时间可以用于独处恢复，也可以用于维系关系。",
      mainQuestion: "压力较大时，应该优先独处还是社交？",
      tags: ["时间分配", "人际关系"],
    },
    {
      title: "计划还是随机",
      background: "旅行既可以提前详细规划，也可以保留临场决定的空间。",
      mainQuestion: "旅行应该详细计划还是保持随机？",
      tags: ["旅行方式", "生活体验"],
    },
  ],
} as const;

const GOAL_CONSTRAINTS: Record<TrainingDimension, string> = {
  structureClarity: "使用先结论、后理由的结构",
  argumentSufficiency: "每个主要理由至少补充一项依据",
  hiddenAssumption: "明确写出观点成立的关键前提",
  counterargumentAwareness: "回应一个有力的反方观点",
  clearConclusion: "用一句明确主张开头并收束全文",
  specificLanguage: "至少使用一个具体对象、动作或例子",
  smoothConnection: "标明因果或转折关系",
  conciseness: "删除重复铺垫，保留关键判断",
};

const EVIDENCE: Record<TrainingDimension, string> = {
  structureClarity: "检查是否先给主张，并用连接词组织理由。",
  argumentSufficiency: "检查是否提供原因和可验证的例子。",
  hiddenAssumption: "检查是否说明观点成立的条件或前提。",
  counterargumentAwareness: "检查是否正面回应反方理由或风险。",
  clearConclusion: "检查开头或结尾是否有明确结论。",
  specificLanguage: "检查是否使用具体对象、动作和实例。",
  smoothConnection: "检查句间是否有因果、递进或转折关系。",
  conciseness: "检查篇幅是否适中且没有明显重复。",
};

const COACHING_OBJECTIVES: Record<
  TrainingDimension,
  { objective: string; question: string; successCriteria: string }
> = {
  structureClarity: {
    objective: "结构与表达",
    question: "如果要让别人更快听懂，你会先说什么、后说什么？",
    successCriteria: "用户说明表达顺序或信息取舍。",
  },
  argumentSufficiency: {
    objective: "理由与证据",
    question: "有什么具体事实、经验或例子能支持这个判断？",
    successCriteria: "用户给出至少一个具体支撑材料。",
  },
  hiddenAssumption: {
    objective: "立场与边界",
    question: "这个观点在什么条件下成立？有没有例外？",
    successCriteria: "用户说出至少一个判断条件或边界。",
  },
  counterargumentAwareness: {
    objective: "反方回应",
    question: "反对你的人最可能怎么说？你如何回应？",
    successCriteria: "用户概括一个反方理由并给出回应方向。",
  },
  clearConclusion: {
    objective: "立场清晰",
    question: "如果只能用一句话表达结论，你会怎么说？",
    successCriteria: "用户给出一句明确可判断的主张。",
  },
  specificLanguage: {
    objective: "具体表达",
    question: "能不能补一个具体对象、动作或例子？",
    successCriteria: "用户补出具体对象、动作或例子。",
  },
  smoothConnection: {
    objective: "连接关系",
    question: "这几个理由之间是什么关系：因果、递进还是转折？",
    successCriteria: "用户说明句间逻辑关系。",
  },
  conciseness: {
    objective: "表达压缩",
    question: "如果删掉重复铺垫，只保留关键判断，你会保留哪几句？",
    successCriteria: "用户能指出需要保留的关键判断。",
  },
};

interface TextFeatures {
  length: number;
  conclusion: boolean;
  reason: boolean;
  assumption: boolean;
  counterargument: boolean;
  example: boolean;
  connection: boolean;
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function hasAffirmed(text: string, pattern: RegExp, negated: RegExp) {
  return has(text, pattern) && !has(text, negated);
}

function analyzeText(text: string): TextFeatures {
  return {
    length: Array.from(text.trim()).length,
    conclusion: hasAffirmed(
      text,
      /我认为|我的观点|结论是|因此应|所以应|应该/,
      /没有(?:明确)?(?:观点|结论|立场)|不应该/,
    ),
    reason: hasAffirmed(
      text,
      /因为|理由是|原因是|依据是|在于|这意味着/,
      /没有(?:任何)?(?:理由|原因|依据)|缺少(?:理由|原因|依据)/,
    ),
    assumption: hasAffirmed(
      text,
      /前提是|如果|只要|除非|取决于|条件是/,
      /没有(?:任何)?(?:前提|条件)|缺少(?:前提|条件)/,
    ),
    counterargument: hasAffirmed(
      text,
      /不过[，,]|但是|然而|尽管|反方认为|风险是|另一方面/,
      /不过关|没有(?:反方|转折|风险回应)|缺少(?:反方|转折|风险回应)/,
    ),
    example: hasAffirmed(
      text,
      /例如|比如|举例|具体来说|案例是|事实是/,
      /没有(?:任何)?(?:例子|案例|事实)|缺少(?:例子|案例|事实)/,
    ),
    connection: hasAffirmed(
      text,
      /因此|所以|首先|其次|同时|此外|不过[，,]|但是|然而/,
      /不过关|没有(?:连接词|转折)|缺少(?:连接词|转折)/,
    ),
  };
}

function clampScore(value: number) {
  return Math.min(5, Math.max(1, roundOneDecimal(value)));
}

function scoreFeatures(features: TextFeatures): Record<TrainingDimension, number> {
  const lengthBase = features.length >= 120 ? 1 : features.length >= 50 ? 0.5 : 0;
  return {
    structureClarity: clampScore(
      2 + lengthBase + Number(features.conclusion) + Number(features.connection),
    ),
    argumentSufficiency: clampScore(
      2 + lengthBase + Number(features.reason) + Number(features.example),
    ),
    hiddenAssumption: clampScore(
      2 + lengthBase + Number(features.assumption) * 1.5,
    ),
    counterargumentAwareness: clampScore(
      2 + lengthBase + Number(features.counterargument) * 1.5,
    ),
    clearConclusion: clampScore(
      2 + lengthBase + Number(features.conclusion) * 1.5,
    ),
    specificLanguage: clampScore(
      2 + lengthBase + Number(features.example) * 1.5,
    ),
    smoothConnection: clampScore(
      2 + lengthBase + Number(features.connection) * 1.5,
    ),
    conciseness: clampScore(
      2.5 +
        Number(features.length >= 30 && features.length <= 320) * 1.5 +
        Number(features.length > 0 && features.length < 220) * 0.5,
    ),
  };
}

function toDimensionScores(
  scores: Record<TrainingDimension, number>,
): DimensionScore[] {
  return TRAINING_DIMENSIONS.map((dimension) => ({
    dimension,
    score: scores[dimension],
    evidence: EVIDENCE[dimension],
  }));
}

function aggregate(
  scores: readonly DimensionScore[],
  dimensions: readonly TrainingDimension[],
) {
  return roundOneDecimal(
    scores
      .filter(({ dimension }) => dimensions.includes(dimension))
      .reduce((sum, { score }) => sum + score, 0) / dimensions.length,
  );
}

function weakest(scores: readonly DimensionScore[]) {
  return TRAINING_DIMENSIONS.reduce((current, dimension) => {
    const score = scores.find((item) => item.dimension === dimension)?.score ?? 5;
    const currentScore =
      scores.find((item) => item.dimension === current)?.score ?? 5;
    return score < currentScore ? dimension : current;
  });
}

function confidenceFor(length: number): DraftDiagnosis["confidence"] {
  if (length >= 100) {
    return "high";
  }
  if (length >= 35) {
    return "medium";
  }
  return "low";
}

function plannedRoundFor(dimension: TrainingDimension) {
  const objective = COACHING_OBJECTIVES[dimension];
  return {
    id: dimension,
    targetDimension: dimension,
    ...objective,
  };
}

export const mockProvider: AIProvider = {
  async generateTopic(rawInput) {
    const input = topicRequestSchema.parse({
      ...rawInput,
      provider: MOCK_CONFIG,
    });
    const templates = TOPIC_TEMPLATES[input.scenarioType];
    const recentTags = new Set(input.recentTopicTags);
    const overlapCount = (tags: readonly string[]) =>
      tags.filter((tag) => recentTags.has(tag)).length;
    const template =
      templates.find(({ tags }) => overlapCount(tags) === 0) ??
      templates.reduce((best, candidate) =>
        overlapCount(candidate.tags) < overlapCount(best.tags)
          ? candidate
          : best,
      );
    const difficultyText = {
      easy: "给出一个主要理由即可。",
      medium: "比较两种选择的收益与代价。",
      challenging: "同时说明适用条件，并回应潜在风险。",
    }[input.difficulty];
    const secondaryFocus =
      input.trainingGoal === "clearConclusion"
        ? "argumentSufficiency"
        : "clearConclusion";

    return trainingTopicSchema.parse({
      title: template.title,
      scenarioType: input.scenarioType,
      difficulty: input.difficulty,
      background: `${template.background}${difficultyText}`,
      mainQuestion: template.mainQuestion,
      writingTask: "请在 200 至 400 字内给出观点、理由和必要的回应。",
      constraints: [
        GOAL_CONSTRAINTS[input.trainingGoal],
        "不得依赖专业资料或披露敏感隐私",
        difficultyText,
      ],
      scoringFocus: [input.trainingGoal, secondaryFocus],
      topicTags: [...template.tags],
      qualityCheck: {
        hasClearOpinion: true,
        hasTwoSidedness: true,
        requiresNoExpertKnowledge: true,
        avoidsHighPrivacy: true,
        matchesTrainingGoal: true,
      },
    });
  },

  async diagnoseDraft(rawInput) {
    const input = diagnosisRequestSchema.parse({
      ...rawInput,
      provider: MOCK_CONFIG,
    });
    const features = analyzeText(input.draftText);
    const scores = toDimensionScores(scoreFeatures(features));
    const weakestDimension = weakest(scores);

    return draftDiagnosisSchema.parse({
      summary:
        !features.conclusion
          ? "文本尚未形成明确立场，请先写出一句可判断的主张。"
          : features.length < 35
            ? "文本较短，已有明确立场，但论证信息不足。"
          : "文本已经形成基本观点，可以继续补强依据和回应。",
      keyLogicIssue: `当前最需要补强的是 ${weakestDimension}，请把判断依据写得更完整。`,
      keyExpressionIssue: features.example
        ? "已有具体内容，但句间关系还可以标注得更清楚。"
        : "表述偏抽象，需要加入具体对象、动作或例子。",
      socraticQuestion: "什么具体事实或判断标准最能支持你的结论？",
      rewriteTask: `${GOAL_CONSTRAINTS[weakestDimension]}，只改写自己的文本，不需要完整范文。`,
      scores,
      logicScore: aggregate(scores, LOGIC_DIMENSIONS),
      expressionScore: aggregate(scores, EXPRESSION_DIMENSIONS),
      coverageCount: TRAINING_DIMENSIONS.length,
      confidence: confidenceFor(features.length),
      source: "mock",
      plannedCoachingRounds: [plannedRoundFor(weakestDimension)],
    });
  },

  async compareRewrite(rawInput) {
    const input = comparisonRequestSchema.parse({
      ...rawInput,
      provider: MOCK_CONFIG,
    });
    const computedRewrite = scoreFeatures(analyzeText(input.rewriteText));
    const rewriteScores = input.diagnosis.scores.map((draftScore) => ({
      dimension: draftScore.dimension,
      score: clampScore(
        Math.max(draftScore.score, computedRewrite[draftScore.dimension]),
      ),
      evidence: EVIDENCE[draftScore.dimension],
    }));
    const draftLogicScore = aggregate(input.diagnosis.scores, LOGIC_DIMENSIONS);
    const draftExpressionScore = aggregate(
      input.diagnosis.scores,
      EXPRESSION_DIMENSIONS,
    );
    const rewriteLogicScore = aggregate(rewriteScores, LOGIC_DIMENSIONS);
    const rewriteExpressionScore = aggregate(
      rewriteScores,
      EXPRESSION_DIMENSIONS,
    );
    const weakestDimension = weakest(rewriteScores);
    const improvedDimensions = rewriteScores
      .filter((score) => {
        const draftScore = input.diagnosis.scores.find(
          (item) => item.dimension === score.dimension,
        );
        return score.score > (draftScore?.score ?? score.score);
      })
      .map(({ dimension }) => dimension);

    return rewriteComparisonSchema.parse({
      draftLogicScore,
      draftExpressionScore,
      rewriteLogicScore,
      rewriteExpressionScore,
      logicImprovement: roundOneDecimal(rewriteLogicScore - draftLogicScore),
      expressionImprovement: roundOneDecimal(
        rewriteExpressionScore - draftExpressionScore,
      ),
      improvedPoints:
        improvedDimensions.length > 0
          ? improvedDimensions.map(
              (dimension) => `改写后提升了 ${dimension} 的可见特征。`,
            )
          : ["改写保持了原有观点，下一步需要补充更具体的依据。"],
      remainingIssue: `当前最低维度是 ${weakestDimension}，仍需针对性补强。`,
      nextTrainingSuggestion: GOAL_CONSTRAINTS[weakestDimension],
      rewriteScores,
      weakestDimension,
      confidence: confidenceFor(Array.from(input.rewriteText).length),
      source: "mock",
    });
  },

  async testConnection() {
    return {
      ok: true,
      provider: "mock",
      model: "mock",
    };
  },
};
