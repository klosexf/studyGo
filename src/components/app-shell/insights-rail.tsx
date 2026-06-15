import type { ReactNode } from "react";

export type InsightsRailProps = {
  children: ReactNode;
};

export function InsightsRail({ children }: InsightsRailProps) {
  return (
    <aside className="insights-rail" aria-label="训练洞察">
      {children}
    </aside>
  );
}
