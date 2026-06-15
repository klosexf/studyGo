# 确认命题模块视觉复刻 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将训练第 2 步的导航和命题主体按指定效果图复刻，同时保留提示面板、操作按钮和现有业务逻辑。

**Architecture:** 在 `TopicView` 与 `StageTabs` 上增加确认命题阶段专用标记，以局部 CSS 覆盖共享训练样式。组件数据和回调接口保持不变，响应式仅处理横向滚动与双列转单列。

**Tech Stack:** Next.js 16、React 19、TypeScript、CSS、Vitest、Testing Library

---

### Task 1: 锁定确认命题专用结构

**Files:**
- Modify: `tests/unit/training-workspace.test.tsx`
- Modify: `src/features/training/components/topic-view.tsx`
- Modify: `src/features/training/components/stage-tabs.tsx`

- [ ] **Step 1: 写入失败测试**

增加断言，要求确认命题根节点包含 `training-stage--topic`，详情区域包含
`topic-detail-card`，且导航在 topic 阶段包含 `stage-tabs--topic`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test tests/unit/training-workspace.test.tsx`

Expected: FAIL，缺少上述专用类名。

- [ ] **Step 3: 添加最小结构标记**

为 `TopicView` 根节点、详情卡和 `StageTabs` 导航添加专用类名，不改变内容、
回调或数据映射。

- [ ] **Step 4: 运行测试并确认通过**

Run: `pnpm test tests/unit/training-workspace.test.tsx`

Expected: PASS。

### Task 2: 复刻桌面和窄屏样式

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: 添加确认命题局部样式**

限定在 `.training-stage--topic` 和 `.stage-tabs--topic` 下实现效果图中的字号、
间距、颜色、圆角、边框、卡片尺寸和双列布局。

- [ ] **Step 2: 添加窄屏规则**

在窄屏下保持阶段导航横向滚动，将详情卡改为单列，并缩放标题和卡片内边距。

- [ ] **Step 3: 运行静态验证**

Run: `pnpm typecheck && pnpm lint`

Expected: 两条命令均退出码 0。

### Task 3: 浏览器视觉验证

**Files:**
- Verify: `逻辑表达训练产品_UI效果图.html`
- Verify: `src/app/training/page.tsx`

- [ ] **Step 1: 启动本地开发服务器**

Run: `pnpm dev`

Expected: 本地训练页面可访问。

- [ ] **Step 2: 进入确认命题阶段**

使用 Mock Provider 生成命题，确认页面进入第 2 步且动态数据正常显示。

- [ ] **Step 3: 对照桌面效果**

检查五阶段导航、标题框、背景说明、黄色命题卡、标签和双列详情卡的几何、
颜色与排版；按差异迭代 CSS。

- [ ] **Step 4: 检查窄屏**

确认无页面级横向溢出，阶段导航可滚动，详情卡为单列，提示和操作仍可用。

- [ ] **Step 5: 完整回归**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: 所有命令退出码 0。

