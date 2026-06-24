import { z } from "zod";

import { trainingDimensionSchema } from "@/features/training/schemas/topic";

const requiredText = z.string().trim().min(1);
const coachingText = requiredText.max(1000);
const shortText = requiredText.max(160);

export const plannedCoachingRoundSchema = z.object({
  id: z.string().trim().min(1).max(40),
  objective: shortText,
  targetDimension: trainingDimensionSchema,
  question: coachingText,
  successCriteria: coachingText,
});

export const plannedCoachingRoundsSchema = z
  .array(plannedCoachingRoundSchema)
  .min(1)
  .max(3)
  .refine(
    (rounds) => new Set(rounds.map((round) => round.id)).size === rounds.length,
    { message: "Planned coaching round ids must be unique" },
  )
  .refine(
    (rounds) =>
      new Set(rounds.map((round) => round.targetDimension)).size ===
      rounds.length,
    { message: "Planned coaching round target dimensions must be unique" },
  );

export const coachingFeedbackSchema = z
  .object({
    roundId: z.string().trim().min(1).max(40),
    attempt: z.number().int().min(1).max(3),
    status: z.enum(["passed", "needs_followup", "recorded_weakness"]),
    feedback: coachingText,
    capturedUserMaterial: z.array(requiredText.max(300)).max(5),
    gap: coachingText,
    followUpQuestion: coachingText.optional(),
  })
  .strict()
  .refine(
    (feedback) =>
      feedback.status === "needs_followup"
        ? Boolean(feedback.followUpQuestion)
        : true,
    {
      message: "Follow-up question is required when a round needs follow-up",
      path: ["followUpQuestion"],
    },
  );
