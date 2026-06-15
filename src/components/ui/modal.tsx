"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  focusableSelector,
  ensureOverlayRoot,
  isTopOverlay,
  registerOverlay,
  unregisterOverlay,
} from "@/components/ui/overlay-manager";

export type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const overlayId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = ensureOverlayRoot();
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setPortalRoot(root);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open || !portalRoot) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const trigger = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    registerOverlay(overlayId, panel);

    return () => {
      const wasTop = unregisterOverlay(overlayId);
      if (wasTop) {
        trigger?.focus();
      }
    };
  }, [open, overlayId, portalRoot]);

  if (!open || !portalRoot) {
    return null;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!isTopOverlay(overlayId)) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const controls = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );
    if (controls.length === 0) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }

    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className="overlay-backdrop"
      data-testid="modal-backdrop"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (
          isTopOverlay(overlayId) &&
          event.target === event.currentTarget
        ) {
          onOpenChange(false);
        }
      }}
    >
      <div
        ref={panelRef}
        className="overlay-panel modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="overlay-header">
          <div>
            <p className="overlay-eyebrow">Logic Expression</p>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
        </header>
        <div className="overlay-content">{children}</div>
      </div>
    </div>,
    portalRoot,
  );
}
