import type { TrainingStage } from "@/features/training/types";

const transitions = {
  setup: ["topic"],
  topic: ["setup", "draft"],
  draft: ["topic", "diagnosis"],
  diagnosis: ["result"],
  result: ["setup"],
} as const satisfies Record<TrainingStage, readonly TrainingStage[]>;

export function canTransition(
  from: TrainingStage,
  to: TrainingStage,
): boolean {
  return (transitions[from] as readonly TrainingStage[]).includes(to);
}

export function assertTransition(
  from: TrainingStage,
  to: TrainingStage,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid training stage transition: ${from} -> ${to}`);
  }
}
