"use client";

import { useEffect } from "react";

import type { TrainingStore } from "@/features/training/store/training-store";
import type { TrainingSession } from "@/features/training/types";
import type { TrainingRepository } from "@/lib/storage/training-repository";

export interface SessionPersistenceController {
  schedule(session: TrainingSession | null): void;
  flush(): Promise<void>;
  emergencyFlush(): Promise<void>;
  cancelAndInvalidate(): void;
  captureGeneration(): number;
  isGenerationCurrent(generation: number): boolean;
  dispose(): Promise<void>;
}

export function createSessionPersistenceController(
  repository: Pick<
    TrainingRepository,
    "saveSession" | "deleteSessionIfUnchanged"
  >,
  delay = 500,
  callbacks: {
    onSaving?: () => void;
    onSaved?: () => void;
    onError?: (error: unknown) => void;
  } = {},
): SessionPersistenceController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: TrainingSession | null = null;
  let generation = 0;
  let queue = Promise.resolve();
  let disposed = false;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const persistSnapshot = async (
    session: TrainingSession,
    operationGeneration: number,
  ) => {
    try {
      await repository.saveSession(session);
      if (disposed) {
        return;
      }
      if (operationGeneration === generation) {
        callbacks.onSaved?.();
      } else {
        await repository.deleteSessionIfUnchanged(session);
      }
    } catch (error) {
      if (!disposed && operationGeneration === generation) {
        callbacks.onError?.(error);
      }
    }
  };

  const takePending = () => {
    clearTimer();
    const session = pending;
    pending = null;
    return session;
  };

  const persistPending = () => {
    const session = takePending();
    if (!session) {
      return queue;
    }
    const operationGeneration = generation;
    if (!disposed) {
      callbacks.onSaving?.();
    }
    queue = queue.then(() =>
      persistSnapshot(session, operationGeneration),
    );
    return queue;
  };

  const emergencyFlush = () => {
    const session = takePending();
    if (!session) {
      return Promise.resolve();
    }
    const operationGeneration = generation;
    if (!disposed) {
      callbacks.onSaving?.();
    }
    return persistSnapshot(session, operationGeneration);
  };

  return {
    schedule(session) {
      clearTimer();
      pending = session;
      generation += 1;
      if (!session) {
        return;
      }
      timer = setTimeout(() => {
        void persistPending();
      }, delay);
    },
    flush: persistPending,
    emergencyFlush,
    cancelAndInvalidate() {
      clearTimer();
      pending = null;
      generation += 1;
    },
    captureGeneration() {
      return generation;
    },
    isGenerationCurrent(capturedGeneration) {
      return capturedGeneration === generation;
    },
    async dispose() {
      const session = takePending();
      disposed = true;
      generation += 1;
      if (session) {
        await repository.saveSession(session).catch(() => undefined);
      }
    },
  };
}

export function useSessionPersistence(
  store: TrainingStore,
  repository: TrainingRepository,
  options: { restore?: boolean } = {},
) {
  useEffect(() => {
    let active = true;
    const controller = createSessionPersistenceController(
      repository,
      500,
      {
        onSaving: () => store.getState().setSaveStatus("saving"),
        onSaved: () => store.getState().setSaveStatus("saved"),
        onError: (error) =>
          store.getState().setPersistenceError(error),
      },
    );
    const restoreGeneration = controller.captureGeneration();

    const unsubscribe = store.subscribe((state, previous) => {
      const epochChanged =
        state.persistenceEpoch !== previous.persistenceEpoch;
      if (epochChanged) {
        controller.cancelAndInvalidate();
      }
      if (
        !epochChanged &&
        state.session === previous.session
      ) {
        return;
      }
      if (!state.session) {
        return;
      }
      controller.schedule(state.session);
    });

    if (options.restore !== false) {
      void repository.getActiveSession().then(
        (session) => {
          if (
            !active ||
            !controller.isGenerationCurrent(restoreGeneration)
          ) {
            return;
          }
          const currentSession = store.getState().session;
          if (session && !currentSession) {
            store.getState().restoreSession(session);
          } else if (currentSession) {
            controller.schedule(currentSession);
          }
        },
        (error) => {
          if (
            active &&
            controller.isGenerationCurrent(restoreGeneration)
          ) {
            store.getState().setPersistenceError(error);
          }
        },
      );
    } else if (store.getState().session) {
      controller.schedule(store.getState().session);
    }

    const flushBestEffort = () => {
      void controller.emergencyFlush();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushBestEffort();
      }
    };
    window.addEventListener("pagehide", flushBestEffort);
    document.addEventListener(
      "visibilitychange",
      onVisibilityChange,
    );

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("pagehide", flushBestEffort);
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );
      void controller.dispose();
    };
  }, [options.restore, repository, store]);
}
