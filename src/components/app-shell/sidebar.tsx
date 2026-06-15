"use client";

import {
  BookOpenText,
  History,
  LayoutDashboard,
  Settings,
} from "lucide-react";

export type SidebarProps = {
  activeItem?: "dashboard" | "history" | "settings" | "training";
  dashboardHref?: string;
  dashboardDisabled?: boolean;
  navigationDisabled?: boolean;
  trainingHref?: string;
  onDashboardNavigate?: () => void;
  onHistory?: () => void;
  onSettings?: () => void;
  onStartTraining?: () => void;
};

export function Sidebar({
  activeItem,
  dashboardHref = "/",
  dashboardDisabled = false,
  navigationDisabled = false,
  trainingHref = "/training",
  onDashboardNavigate,
  onHistory,
  onSettings,
  onStartTraining,
}: SidebarProps) {
  const isDashboardDisabled = dashboardDisabled || navigationDisabled;

  function activeProps(item: SidebarProps["activeItem"]) {
    return activeItem === item
      ? {
          "aria-current": "page" as const,
          "data-active": "true",
          className: "is-active",
        }
      : {};
  }

  return (
    <aside className="app-sidebar" aria-label="产品导航">
      <div className="app-brand">
        <span className="app-brand__mark" aria-hidden="true">
          理
        </span>
        <span>
          <strong>理序</strong>
          <small>逻辑 × 表达训练</small>
        </span>
      </div>

      <p className="app-nav-label">Workspace</p>
      <nav className="app-nav" aria-label="主导航">
        {isDashboardDisabled ? (
          <button
            type="button"
            aria-disabled="true"
            title="请先保存训练结果"
            onClick={(event) => event.preventDefault()}
            {...activeProps("dashboard")}
          >
            <LayoutDashboard aria-hidden="true" />
            <span>训练仪表盘</span>
          </button>
        ) : (
          <a
            href={dashboardHref}
            {...activeProps("dashboard")}
            onClick={(event) => {
              if (onDashboardNavigate) {
                event.preventDefault();
                onDashboardNavigate();
              }
            }}
          >
            <LayoutDashboard aria-hidden="true" />
            <span>训练仪表盘</span>
          </a>
        )}
        <button
          type="button"
          onClick={onHistory}
          {...activeProps("history")}
        >
          <History aria-hidden="true" />
          <span>历史记录</span>
        </button>
        <button
          type="button"
          onClick={onSettings}
          {...activeProps("settings")}
        >
          <Settings aria-hidden="true" />
          <span>本地设置</span>
        </button>
      </nav>

      <div className="app-sidebar__meta">
        <BookOpenText aria-hidden="true" />
        <strong>本地自用版</strong>
        <p>无需登录，训练记录仅保存在当前浏览器。</p>
        {navigationDisabled ? (
          <button
            type="button"
            aria-disabled="true"
            title="请先保存训练结果"
            onClick={(event) => event.preventDefault()}
            {...activeProps("training")}
          >
            开始训练
          </button>
        ) : (
          <a
            href={trainingHref}
            {...activeProps("training")}
            onClick={(event) => {
              if (onStartTraining) {
                event.preventDefault();
                onStartTraining();
              }
            }}
          >
            开始训练
          </a>
        )}
      </div>
    </aside>
  );
}
