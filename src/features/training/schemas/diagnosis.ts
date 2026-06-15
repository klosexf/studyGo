import { z } from "zod";

import { trainingDimensionSchema } from "@/features/training/schemas/topic";
import { TRAINING_DIMENSIONS } from "@/features/training/types";

const requiredText = z.string().trim().min(1);
const coachingText = requiredText.max(1000);
const evidenceText = requiredText.max(500);
const hasAtMostOneDecimal = (value: number) =>
  Math.abs(value * 10 - Math.round(value * 10)) < Number.EPSILON * 100;

export const scoreSchema = z
  .number()
  .min(1)
  .max(5)
  .refine(hasAtMostOneDecimal, {
    message: "Score must be an integer or have one decimal place",
  });

export const oneDecimalNumberSchema = z.number().refine(hasAtMostOneDecimal, {
  message: "Value must be an integer or have one decimal place",
});

export const diagnosisConfidenceSchema = z.enum(["low", "medium", "high"]);
export const aiResultSourceSchema = z.enum(["mock", "real"]);

export const dimensionScoreSchema = z.object({
  dimension: trainingDimensionSchema,
  score: scoreSchema,
  evidence: evidenceText,
});

export const completeDimensionScoresSchema = z
  .array(dimensionScoreSchema)
  .length(8)
  .refine(
    (scores) =>
      new Set(scores.map(({ dimension }) => dimension)).size ===
      TRAINING_DIMENSIONS.length,
    { message: "Scores must cover all eight dimensions exactly once" },
  );

export const draftDiagnosisSchema = z
  .object({
    summary: coachingText,
    keyLogicIssue: coachingText,
    keyExpressionIssue: coachingText,
    socraticQuestion: coachingText,
    rewriteTask: coachingText,
    scores: completeDimensionScoresSchema,
    logicScore: scoreSchema,
    expressionScore: scoreSchema,
    coverageCount: z.number().int().min(0).max(8),
    confidence: diagnosisConfidenceSchema,
    source: aiResultSourceSchema,
  })
  .refine(({ coverageCount, scores }) => coverageCount === scores.length, {
    message: "Coverage count must match the number of dimension scores",
    path: ["coverageCount"],
  });
