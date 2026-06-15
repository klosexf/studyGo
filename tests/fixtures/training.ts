import type {
  DraftDiagnosis,
  RewriteComparison,
  TrainingDimension,
  TrainingRecord,
  TrainingTopic,
} from "@/features/training/types";
import { TRAINING_DIMENSIONS } from "@/features/training/types";

export const mockProviderConfig = {
  provider: "mock",
  baseUrl: "",
  apiKey: "",
  model: "",
} as const;

export const trainingTopic: TrainingTopic = {
  title: "稳定还是成长",
  scenarioType: "life",
  difficulty: "medium",
  background: "你正在比较两种各有收益与风险的职业选择。",
  mainQuestion: "职业早期应该优先稳定还是成长？",
  writingTask: "请在 200 至 400 字内说明你的观点。",
  constraints: ["先给出明确结论", "回应一个反方观点"],
  scoringFocus: ["argumentSufficiency", "counterargumentAwareness"],
  topicTags: ["职业选择", "成长"],
  qualityCheck: {
    hasClearOpinion: true,
    hasTwoSidedness: true,
    requiresNoExpertKnowledge: true,
    avoidsHighPrivacy: true,
    matchesTrainingGoal: true,
  },
};

export function dimensionScores(
  overrides: Partial<Record<TrainingDimension, number>> = {},
) {
  return TRAINING_DIMENSIONS.map((dimension) => ({
    dimension,
    score: overrides[dimension] ?? 3,
    evidence: `${dimension} 的测试依据`,
  }));
}

export function diagnosisFixture(
  overrides: Partial<DraftDiagnosis> = {},
): DraftDiagnosis {
  return {
    summary: "观点明确，论证仍可补充。",
    keyLogicIssue: "理由与结论之间缺少一层说明。",
    keyExpressionIssue: "部分表述较抽象。",
    socraticQuestion: "什么具体事实支持你的判断？",
    rewriteTask: "补充例子，并回应一个反方观点。",
    scores: dimensionScores(),
    logicScore: 3,
    expressionScore: 3,
    coverageCount: 8,
    confidence: "medium",
    source: "mock",
    ...overrides,
  };
}

export function comparisonFixture(
  overrides: Partial<RewriteComparison> = {},
): RewriteComparison {
  return {
    draftLogicScore: 3,
    draftExpressionScore: 3,
    rewriteLogicScore: 3.5,
    rewriteExpressionScore: 3.5,
    logicImprovement: 0.5,
    expressionImprovement: 0.5,
    improvedPoints: ["补充了具体依据"],
    remainingIssue: "反方回应还可以更完整。",
    nextTrainingSuggestion: "下一次继续训练反方意识。",
    rewriteScores: dimensionScores({
      counterargumentAwareness: 2.5,
    }),
    weakestDimension: "counterargumentAwareness",
    confidence: "medium",
    source: "mock",
    ...overrides,
  };
}

export function trainingRecord(
  overrides: Partial<TrainingRecord> = {},
): TrainingRecord {
  const completedAt = overrides.completedAt ?? "2026-06-01T12:00:00.000Z";

  return {
    id: overrides.id ?? completedAt,
    provider: "mock",
    model: "mock-v1",
    promptVersion: "1",
    config: {
      scenarioType: "life",
      difficulty: "medium",
      trainingGoal: "argumentSufficiency",
    },
    draftText: "我认为成长更重要，因为它能带来长期机会。",
    rewriteText:
      "我认为成长更重要，因为长期能力会扩大未来选择。例如，承担新项目能积累可迁移经验。不过，稳定也能降低风险，因此应以基本生活有保障为前提。",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: completedAt,
    topic: trainingTopic,
    diagnosis: diagnosisFixture(),
    comparison: comparisonFixture(),
    weakestDimension: "counterargumentAwareness",
    draftLogicScore: 3,
    draftExpressionScore: 3,
    rewriteLogicScore: 3.5,
    rewriteExpressionScore: 3.5,
    logicImprovement: 0.5,
    expressionImprovement: 0.5,
    confidence: "medium",
    completedAt,
    ...overrides,
  };
}
