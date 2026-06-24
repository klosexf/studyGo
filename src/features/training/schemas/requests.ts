import { z } from "zod";

import {
  coachingFeedbackSchema,
  plannedCoachingRoundSchema,
} from "@/features/training/schemas/coaching";
import { draftDiagnosisSchema } from "@/features/training/schemas/diagnosis";
import {
  trainingDimensionSchema,
  trainingTopicSchema,
} from "@/features/training/schemas/topic";
import {
  DIFFICULTIES,
  SCENARIO_TYPES,
} from "@/features/training/types";
import { isSafeProviderBaseUrl } from "@/lib/ai/provider-url";

const requiredText = z.string().trim().min(1);

const mockProviderConfigSchema = z.object({
  provider: z.literal("mock"),
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
});

const realProviderConfigSchema = z.object({
  provider: z.enum(["openai", "deepseek", "zhipu"]),
  baseUrl: z.url().refine(isSafeProviderBaseUrl, {
    message: "Base URL does not meet the provider URL security policy",
  }),
  apiKey: requiredText,
  model: requiredText,
});

export const providerConfigSchema = z.discriminatedUnion("provider", [
  mockProviderConfigSchema,
  realProviderConfigSchema,
]);

export const topicRequestSchema = z.object({
  provider: providerConfigSchema,
  scenarioType: z.enum(SCENARIO_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  trainingGoal: trainingDimensionSchema,
  recentWeakness: trainingDimensionSchema.nullable().optional(),
  recentTopicTags: z.array(requiredText).max(5).default([]),
});

export const diagnosisRequestSchema = z.object({
  provider: providerConfigSchema,
  topic: trainingTopicSchema,
  draftText: requiredText.max(400),
});

export const coachingRequestSchema = z.object({
  provider: providerConfigSchema,
  topic: trainingTopicSchema,
  draftText: requiredText.max(400),
  diagnosis: draftDiagnosisSchema,
  plannedRound: plannedCoachingRoundSchema,
  previousRounds: z.array(coachingFeedbackSchema).max(3).default([]),
  userAnswer: requiredText.max(1000),
  attempt: z.number().int().min(1).max(3),
});

export const comparisonRequestSchema = z.object({
  provider: providerConfigSchema,
  topic: trainingTopicSchema,
  draftText: requiredText.max(400),
  rewriteText: requiredText.max(400),
  diagnosis: draftDiagnosisSchema,
});

export const providerTestRequestSchema = providerConfigSchema;

export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type TopicRequest = z.infer<typeof topicRequestSchema>;
export type DiagnosisRequest = z.infer<typeof diagnosisRequestSchema>;
export type CoachingRequest = z.infer<typeof coachingRequestSchema>;
export type ComparisonRequest = z.infer<typeof comparisonRequestSchema>;
