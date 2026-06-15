import { z } from "zod";

import {
  DIFFICULTIES,
  SCENARIO_TYPES,
  TRAINING_DIMENSIONS,
} from "@/features/training/types";

const requiredText = z.string().trim().min(1);

export const trainingDimensionSchema = z.enum(TRAINING_DIMENSIONS);

export const topicQualityCheckSchema = z
  .object({
    hasClearOpinion: z.boolean(),
    hasTwoSidedness: z.boolean(),
    requiresNoExpertKnowledge: z.boolean(),
    avoidsHighPrivacy: z.boolean(),
    matchesTrainingGoal: z.boolean(),
  })
  .refine((checks) => Object.values(checks).every(Boolean), {
    message: "All topic quality checks must pass",
  });

export const trainingTopicSchema = z.object({
  title: requiredText.refine((title) => Array.from(title).length <= 15, {
    message: "Title must contain at most 15 Unicode characters",
  }),
  scenarioType: z.enum(SCENARIO_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  background: requiredText,
  mainQuestion: requiredText,
  writingTask: requiredText,
  constraints: z.array(requiredText).min(2).max(3),
  scoringFocus: z
    .array(trainingDimensionSchema)
    .min(1)
    .max(2)
    .refine((dimensions) => new Set(dimensions).size === dimensions.length, {
      message: "Scoring focus dimensions must be unique",
    }),
  topicTags: z.array(requiredText).min(2).max(4),
  qualityCheck: topicQualityCheckSchema,
});
