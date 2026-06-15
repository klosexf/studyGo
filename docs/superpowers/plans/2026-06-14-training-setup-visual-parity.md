# Training Setup Visual Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将训练第 1 步按同源高保真设计稿重构，同时保持现有训练流程行为。

**Architecture:** 在 `TrainingWorkspace` 中增加训练页顶部区域，由 `StageTabs` 继续负责流程状态；`SetupView` 只负责设置双卡内容。样式限定在训练相关类名中，避免影响仪表盘、弹窗和后续业务组件。

**Tech Stack:** Next.js 16、React 19、TypeScript、CSS、Vitest、Testing Library、Playwright

---

### Task 1: Lock the target structure

**Files:**
- Modify: `tests/unit/training-workspace.test.tsx`

- [ ] 添加回归测试，断言第 1 步显示顶部搜索框、完整五步文案、双卡内容和推荐 CTA。
- [ ] 运行 `pnpm test tests/unit/training-workspace.test.tsx`，确认测试因缺少目标结构而失败。

### Task 2: Rebuild the React structure

**Files:**
- Modify: `src/features/training/components/training-workspace.tsx`
- Modify: `src/features/training/components/setup-view.tsx`
- Modify: `src/features/training/components/stage-tabs.tsx`

- [ ] 增加训练页顶部标题、副标题与搜索框。
- [ ] 将进度标签文案同步为“设置训练、确认命题、写初稿、诊断改写、结果复盘”。
- [ ] 将设置页重构为左侧选择卡和右侧推荐卡。
- [ ] 保持 `onChange`、`onGenerate`、loading 和 Provider 信息的现有行为。
- [ ] 运行目标单元测试并确认通过。

### Task 3: Match the design visually

**Files:**
- Modify: `src/app/globals.css`

- [ ] 实现顶部、进度条、双卡、场景胶囊、难度按钮、推荐清单和 CTA 的桌面样式。
- [ ] 增加中等宽度和移动端单列规则，保证无横向溢出。
- [ ] 保持第 2 至第 5 步内容样式可用。

### Task 4: Verify

**Files:**
- Test: `tests/unit/training-workspace.test.tsx`
- Test: `tests/e2e/training-flow.spec.ts`

- [ ] 运行 `pnpm test tests/unit/training-workspace.test.tsx`。
- [ ] 运行 `pnpm typecheck` 和 `pnpm lint`。
- [ ] 启动本地开发服务器，在浏览器检查桌面和移动视口。
- [ ] 运行训练流程相关 E2E，确认设置页交互和后续步骤未回归。
