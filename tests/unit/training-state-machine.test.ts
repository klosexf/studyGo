import { describe, expect, it } from "vitest";

import {
  assertTransition,
  canTransition,
} from "@/features/training/state-machine";
import type { TrainingStage } from "@/features/training/types";

const stages: TrainingStage[] = [
  "setup",
  "topic",
  "draft",
  "diagnosis",
  "result",
];

const allowedTransitions = new Set([
  "setup:topic",
  "topic:setup",
  "topic:draft",
  "draft:topic",
  "draft:diagnosis",
  "diagnosis:result",
  "result:setup",
]);

describe("training state machine", () => {
  it("allows every specified transition", () => {
    for (const transition of allowedTransitions) {
      const [from, to] = transition.split(":") as [TrainingStage, TrainingStage];
      expect(canTransition(from, to), transition).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    }
  });

  it("rejects every unspecified transition with a clear error", () => {
    for (const from of stages) {
      for (const to of stages) {
        const transition = `${from}:${to}`;
        if (allowedTransitions.has(transition)) {
          continue;
        }

        expect(canTransition(from, to), transition).toBe(false);
        expect(
          () => assertTransition(from, to),
          transition,
        ).toThrow(`Invalid training stage transition: ${from} -> ${to}`);
      }
    }
  });
});
