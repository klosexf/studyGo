import { z } from "zod";

import {
  aiResultSourceSchema,
  completeDimensionScoresSchema,
  diagnosisConfidenceSchema,
  oneDecimalNumberSchema,
  scoreSchema,
} from "@/features/training/schemas/diagnosis";
import { trainingDimensionSchema } from "@/features/training/schemas/topic";

const requiredText = z.string().trim().min(1);
const coachingText = requiredText.max(1000);
const coachingPoint = requiredText.max(500);

export const rewriteComparisonSchema = z.object({
  draftLogicScore: scoreSchema,
  draftExpressionScore: scoreSchema,
  rewriteLogicScore: scoreSchema,
  rewriteExpressionScore: scoreSchema,
  logicImprovement: oneDecimalNumberSchema,
  expressionImprovement: oneDecimalNumberSchema,
  improvedPoints: z.array(coachingPoint).min(1),
  remainingIssue: coachingText,
  nextTrainingSuggestion: coachingText,
  rewriteScores: completeDimensionScoresSchema,
  weakestDimension: trainingDimensionSchema,
  confidence: diagnosisConfidenceSchema,
  source: aiResultSourceSchema,
});
