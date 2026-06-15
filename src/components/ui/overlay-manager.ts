import { lockBodyScroll } from "@/components/ui/scroll-lock";

export const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type OverlayEntry = {
  id: string;
  panel: HTMLElement;
};

type SavedAttributes = {
  ariaHidden: string | null;
  inert: boolean;
};

const overlayStack: OverlayEntry[] = [];
const savedBackgroundAttributes = new Map<Element, SavedAttributes>();
let unlockBodyScroll: (() => void) | null = null;
let backgroundObserver: MutationObserver | null = null;

export function ensureOverlayRoot() {
  if (typeof document === "undefined") {
    return null;
  }

  let root = document.getElementById("overlay-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "overlay-root";
    document.body.append(root);
  }

  return root;
}

function focusOverlay(entry: OverlayEntry) {
  const target =
    entry.panel.querySelector<HTMLElement>(focusableSelector) ?? entry.panel;
  target.focus();
}

function isolateElement(element: Element, root: HTMLElement) {
  if (element === root || savedBackgroundAttributes.has(element)) {
    return;
  }

  savedBackgroundAttributes.set(element, {
    ariaHidden: element.getAttribute("aria-hidden"),
    inert: element.hasAttribute("inert"),
  });
  element.setAttribute("inert", "");
  element.setAttribute("aria-hidden", "true");
}

function isolateBackground(root: HTMLElement) {
  for (const child of Array.from(document.body.children)) {
    isolateElement(child, root);
  }
}

function restoreBackground() {
  for (const [element, saved] of savedBackgroundAttributes) {
    if (saved.ariaHidden === null) {
      element.removeAttribute("aria-hidden");
    } else {
      element.setAttribute("aria-hidden", saved.ariaHidden);
    }

    if (saved.inert) {
      element.setAttribute("inert", "");
    } else {
      element.removeAttribute("inert");
    }
  }

  savedBackgroundAttributes.clear();
}

function keepFocusInTopOverlay(event: FocusEvent) {
  const topOverlay = overlayStack.at(-1);
  if (
    topOverlay &&
    event.target instanceof Node &&
    !topOverlay.panel.contains(event.target)
  ) {
    focusOverlay(topOverlay);
  }
}

export function registerOverlay(id: string, panel: HTMLElement) {
  const root = ensureOverlayRoot();
  if (!root) {
    return;
  }

  if (overlayStack.length === 0) {
    unlockBodyScroll = lockBodyScroll();
    isolateBackground(root);
    backgroundObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            isolateElement(node, root);
          }
        }
      }
    });
    backgroundObserver.observe(document.body, { childList: true });
    document.addEventListener("focusin", keepFocusInTopOverlay);
  }

  overlayStack.push({ id, panel });
  focusOverlay({ id, panel });
}

export function unregisterOverlay(id: string) {
  const index = overlayStack.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return false;
  }

  const wasTop = index === overlayStack.length - 1;
  overlayStack.splice(index, 1);

  if (overlayStack.length === 0) {
    backgroundObserver?.disconnect();
    backgroundObserver = null;
    document.removeEventListener("focusin", keepFocusInTopOverlay);
    restoreBackground();
    unlockBodyScroll?.();
    unlockBodyScroll = null;
  } else if (wasTop) {
    focusOverlay(overlayStack.at(-1)!);
  }

  return wasTop;
}

export function isTopOverlay(id: string) {
  return overlayStack.at(-1)?.id === id;
}
