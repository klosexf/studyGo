import type { z } from "zod";

import type {
  coachingFeedbackSchema,
  plannedCoachingRoundSchema,
} from "@/features/training/schemas/coaching";
import type { rewriteComparisonSchema } from "@/features/training/schemas/comparison";
import type {
  dimensionScoreSchema,
  draftDiagnosisSchema,
} from "@/features/training/schemas/diagnosis";
import type { trainingTopicSchema } from "@/features/training/schemas/topic";

export const TRAINING_STAGES = [
  "setup",
  "topic",
  "draft",
  "diagnosis",
  "coaching",
  "finalRewrite",
  "result",
] as const;

export type TrainingStage = (typeof TRAINING_STAGES)[number];

export const PROVIDER_IDS = ["mock", "openai", "deepseek", "zhipu"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const SCENARIO_TYPES = ["workplace", "life"] as const;

export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export const DIFFICULTIES = ["easy", "medium", "challenging"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

export const TRAINING_DIMENSIONS = [
  "structureClarity",
  "argumentSufficiency",
  "hiddenAssumption",
  "counterargumentAwareness",
  "clearConclusion",
  "specificLanguage",
  "smoothConnection",
  "conciseness",
] as const;

export type TrainingDimension = (typeof TRAINING_DIMENSIONS)[number];

export type DiagnosisConfidence = "low" | "medium" | "high";
export type AiResultSource = "mock" | "real";
export type Score = number;

export type TrainingTopic = z.infer<typeof trainingTopicSchema>;
export type DimensionScore = z.infer<typeof dimensionScoreSchema>;
export type DraftDiagnosis = z.infer<typeof draftDiagnosisSchema>;
export type RewriteComparison = z.infer<typeof rewriteComparisonSchema>;
export type PlannedCoachingRound = z.infer<typeof plannedCoachingRoundSchema>;
export type CoachingFeedback = z.infer<typeof coachingFeedbackSchema>;

export interface TrainingConfig {
  scenarioType: ScenarioType;
  difficulty: Difficulty;
  trainingGoal: TrainingDimension;
}

export interface TrainingSessionBase {
  id: string;
  provider: ProviderId;
  model: string;
  promptVersion: string;
  config: TrainingConfig;
  draftText: string;
  rewriteText: string;
  finalRewriteText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoachingRoundState {
  planned: PlannedCoachingRound;
  attempts: CoachingFeedback[];
  userAnswers: string[];
  status: "pending" | "passed" | "recorded_weakness";
}

export type TrainingSession =
  | (TrainingSessionBase & {
      stage: "setup";
      topic?: never;
      diagnosis?: never;
      comparison?: never;
    })
  | (TrainingSessionBase & {
      stage: "topic";
      topic: TrainingTopic;
      diagnosis?: never;
      comparison?: never;
    })
  | (TrainingSessionBase & {
      stage: "draft";
      topic: TrainingTopic;
      diagnosis?: never;
      comparison?: never;
    })
  | (TrainingSessionBase & {
      stage: "diagnosis";
      topic: TrainingTopic;
      diagnosis: DraftDiagnosis;
      comparison?: never;
    })
  | (TrainingSessionBase & {
      stage: "coaching";
      topic: TrainingTopic;
      diagnosis: DraftDiagnosis;
      coachingRounds: CoachingRoundState[];
      currentRoundIndex: number;
      currentAnswer: string;
      comparison?: never;
    })
  | (TrainingSessionBase & {
      stage: "finalRewrite";
      topic: TrainingTopic;
      diagnosis: DraftDiagnosis;
      coachingRounds: CoachingRoundState[];
      finalRewriteText: string;
      comparison?: never;
    })
  | (TrainingSessionBase & {
      stage: "result";
      topic: TrainingTopic;
      diagnosis: DraftDiagnosis;
      coachingRounds?: CoachingRoundState[];
      finalRewriteText?: string;
      comparison: RewriteComparison;
    });

export interface TrainingRecord extends TrainingSessionBase {
  topic: TrainingTopic;
  diagnosis: DraftDiagnosis;
  coachingRounds?: CoachingRoundState[];
  finalRewriteText?: string;
  comparison: RewriteComparison;
  weakestDimension: TrainingDimension;
  draftLogicScore: Score;
  draftExpressionScore: Score;
  rewriteLogicScore: Score;
  rewriteExpressionScore: Score;
  logicImprovement: number;
  expressionImprovement: number;
  confidence: DiagnosisConfidence;
  completedAt: string;
}
