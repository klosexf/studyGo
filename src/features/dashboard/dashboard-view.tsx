"use client";

import { BrainCircuit, History, Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell/app-shell";
import { Card } from "@/components/ui/card";
import {
  DIMENSION_LABELS,
  formatCompletedAt,
  selectDashboard,
} from "@/features/dashboard/dashboard-selectors";
import { HistoryDrawer } from "@/features/history/history-drawer";
import { ProviderSettingsModal } from "@/features/settings/provider-settings-modal";
import type { TrainingRecord } from "@/features/training/types";
import { TrainingRepository } from "@/lib/storage/training-repository";

export type DashboardRepository = Pick<
  TrainingRepository,
  "listRecords" | "clearTrainingData"
>;

const defaultRepository = new TrainingRepository();

export type DashboardViewProps = {
  repository?: DashboardRepository;
};

export function DashboardView({
  repository = defaultRepository,
}: DashboardViewProps) {
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const loadVersionRef = useRef(0);

  useEffect(() => {
    let active = true;
    const version = ++loadVersionRef.current;
    repository.listRecords().then(
      (loaded) => {
        if (active && version === loadVersionRef.current) {
          setRecords(loaded);
          setState("ready");
        }
      },
      () => {
        if (active && version === loadVersionRef.current) {
          setState("error");
        }
      },
    );
    return () => {
      active = false;
    };
  }, [repository]);

  const dashboard = useMemo(() => selectDashboard(records), [records]);

  async function clearTrainingData() {
    loadVersionRef.current += 1;
    await repository.clearTrainingData();
    setRecords([]);
    setState("ready");
  }

  const main =
    state === "loading" ? (
      <section className="dashboard-state" aria-labelledby="dashboard-title">
        <p className="eyebrow">逻辑 × 表达训练</p>
        <h1 id="dashboard-title">训练仪表盘</h1>
        <p role="status">正在读取本地训练记录…</p>
      </section>
    ) : state === "error" ? (
      <section className="dashboard-state" aria-labelledby="dashboard-title">
        <p className="eyebrow">逻辑 × 表达训练</p>
        <h1 id="dashboard-title">训练仪表盘</h1>
        <p role="alert">无法读取本地训练记录，请检查浏览器存储权限。</p>
      </section>
    ) : records.length === 0 ? (
      <section className="dashboard-state dashboard-state--empty" aria-labelledby="dashboard-title">
        <p className="eyebrow">逻辑 × 表达训练</p>
        <h1 id="dashboard-title">训练仪表盘</h1>
        <p>完成第一次训练后，这里会显示真实趋势、能力分布和下一练建议。</p>
        <a className="primary-link" href="/training">开始第一次训练</a>
      </section>
    ) : (
      <DashboardContent records={records} />
    );

  const insights =
    state === "ready" && records.length > 0 ? (
      <div className="insights-stack">
        <p className="eyebrow">Next Practice</p>
        <h2>下一练：{dashboard.recommendedGoalLabel}</h2>
        <p>根据最近训练的最低维度确定，规则在本地计算。</p>
        <a className="primary-link" href="/training">
          开始针对训练
        </a>
        <Card tone="yellow">
          <Target aria-hidden="true" />
          <strong>当前短板</strong>
          <p>
            {dashboard.statistics.weakestDimension
              ? DIMENSION_LABELS[
                  dashboard.statistics.weakestDimension
                ]
              : "暂无"}
          </p>
        </Card>
      </div>
    ) : (
      <div className="insights-stack">
        <BrainCircuit aria-hidden="true" />
        <h2>本地训练洞察</h2>
        <p>所有趋势都来自你的真实训练记录，不注入演示数据。</p>
      </div>
    );

  return (
    <>
      <AppShell
        activeItem="dashboard"
        onHistory={() => setHistoryOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        main={main}
        insights={insights}
      />
      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        records={records}
      />
      <ProviderSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onClearTrainingData={clearTrainingData}
      />
    </>
  );
}

function DashboardContent({ records }: { records: TrainingRecord[] }) {
  const dashboard = useMemo(() => selectDashboard(records), [records]);
  const { statistics } = dashboard;
  const trendData = statistics.recent.map((point, index) => ({
    ...point,
    label: `第 ${index + 1} 次`,
  }));

  return (
    <div className="dashboard-content">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>训练仪表盘</h1>
          <p>已完成 {statistics.totalCount} 次训练</p>
        </div>
        <a className="primary-link" href="/training">开始新训练</a>
      </header>

      <section className="metric-grid" aria-label="训练指标">
        <Card tone="sage">
          <span>改写后逻辑</span>
          <strong>{statistics.averages.rewriteLogic}</strong>
          <small>平均分 / 5</small>
        </Card>
        <Card tone="yellow">
          <span>改写后表达</span>
          <strong>{statistics.averages.rewriteExpression}</strong>
          <small>平均分 / 5</small>
        </Card>
        <Card tone="lavender">
          <span>逻辑提升</span>
          <strong>+{statistics.averages.logicImprovement}</strong>
          <small>平均提升</small>
        </Card>
      </section>

      <section className="chart-grid">
        <Card className="chart-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Recent Progress</p>
              <h2>最近 7 次趋势</h2>
            </div>
          </div>
          <p className="sr-only">
            最近 7 次趋势摘要：
            {trendData
              .map(
                (point) =>
                  `${point.label}初稿逻辑${point.draftLogicScore}，改写逻辑${point.rewriteLogicScore}，改写表达${point.rewriteExpressionScore}`,
              )
              .join("；")}
          </p>
          <div className="chart-frame" aria-hidden="true">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 640, height: 280 }}
              minWidth={0}
              minHeight={280}
            >
              <LineChart data={trendData}>
                <CartesianGrid stroke="#e5e3da" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis domain={[1, 5]} tickLine={false} axisLine={false} />
                <Tooltip />
                <Line dataKey="draftLogicScore" stroke="#999a92" strokeWidth={2} />
                <Line dataKey="rewriteLogicScore" stroke="#10131a" strokeWidth={3} />
                <Line dataKey="rewriteExpressionScore" stroke="#7268ff" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="chart-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Capability</p>
              <h2>能力分布</h2>
            </div>
          </div>
          <p className="sr-only">
            能力分布摘要：
            {dashboard.abilityData
              .map((item) => `${item.label}${item.score}分`)
              .join("；")}
          </p>
          <div className="chart-frame" aria-hidden="true">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 640, height: 280 }}
              minWidth={0}
              minHeight={280}
            >
              <RadarChart data={dashboard.abilityData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="label" tick={{ fontSize: 10 }} />
                <Radar
                  dataKey="score"
                  stroke="#7268ff"
                  fill="#c5c0f7"
                  fillOpacity={0.58}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section aria-labelledby="recent-records-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Archive</p>
            <h2 id="recent-records-title">最近记录</h2>
          </div>
        </div>
        <div className="recent-records">
          {dashboard.latestRecords.map((record) => (
            <Card key={record.id}>
              <History aria-hidden="true" />
              <strong>{record.topic.title}</strong>
              <span>{formatCompletedAt(record.completedAt)}</span>
              <small>
                短板：{DIMENSION_LABELS[record.weakestDimension]}
              </small>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
