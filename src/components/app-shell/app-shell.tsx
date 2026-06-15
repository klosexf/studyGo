import type { ReactNode } from "react";

import { InsightsRail } from "./insights-rail";
import { Sidebar, type SidebarProps } from "./sidebar";

export type AppShellProps = SidebarProps & {
  main: ReactNode;
  insights: ReactNode;
};

export function AppShell({ main, insights, ...sidebarProps }: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar {...sidebarProps} />
      <main className="app-main" aria-label="主要内容">
        {main}
      </main>
      <InsightsRail>{insights}</InsightsRail>
    </div>
  );
}
