import type {
  CoachingFeedback,
  Difficulty,
  DraftDiagnosis,
  PlannedCoachingRound,
  ProviderId,
  RewriteComparison,
  ScenarioType,
  TrainingDimension,
  TrainingTopic,
} from "@/features/training/types";

export interface TopicGenerationInput {
  scenarioType: ScenarioType;
  difficulty: Difficulty;
  trainingGoal: TrainingDimension;
  recentWeakness?: TrainingDimension | null;
  recentTopicTags?: string[];
}

export interface DraftDiagnosisInput {
  topic: TrainingTopic;
  draftText: string;
}

export interface RewriteComparisonInput {
  topic: TrainingTopic;
  draftText: string;
  rewriteText: string;
  diagnosis: DraftDiagnosis;
}

export interface CoachingInput {
  topic: TrainingTopic;
  draftText: string;
  diagnosis: DraftDiagnosis;
  plannedRound: PlannedCoachingRound;
  previousRounds: CoachingFeedback[];
  userAnswer: string;
  attempt: number;
}

export interface ConnectionTestResult {
  ok: true;
  provider: ProviderId;
  model: string;
}

export interface AIProvider {
  generateTopic(input: TopicGenerationInput): Promise<TrainingTopic>;
  diagnoseDraft(input: DraftDiagnosisInput): Promise<DraftDiagnosis>;
  coachRound(input: CoachingInput): Promise<CoachingFeedback>;
  compareRewrite(input: RewriteComparisonInput): Promise<RewriteComparison>;
  testConnection(): Promise<ConnectionTestResult>;
}
