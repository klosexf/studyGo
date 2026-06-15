# 逻辑表达训练产品 Next.js MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有静态原型开发为支持 Mock、OpenAI、DeepSeek、智谱、本地持久化和完整五步训练闭环的 Next.js 单人自用 MVP。

**Architecture:** 使用 Next.js App Router 统一承载 React UI 与本机 Route Handlers。训练领域逻辑、Provider Adapter、Dexie 存储、Zustand 会话状态和 UI 分模块组织；真实与 Mock Provider 共用 Zod 契约。

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Zustand, Dexie, Zod, Recharts, Vitest, React Testing Library, Playwright, pnpm

---

## 文件结构

```text
src/
├── app/
│   ├── api/ai/{topic,diagnosis,comparison}/route.ts
│   ├── api/providers/test/route.ts
│   ├── training/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── app-shell/{app-shell,sidebar,insights-rail}.tsx
│   ├── feedback/{error-banner,loading-card}.tsx
│   └── ui/{button,card,modal,drawer}.tsx
├── features/
│   ├── dashboard/{dashboard-view,dashboard-selectors}.tsx
│   ├── history/{history-drawer,history-filters}.tsx
│   ├── settings/{provider-settings-modal,provider-settings-store}.tsx
│   └── training/
│       ├── components/{stage-tabs,setup-view,topic-view,draft-view,diagnosis-view,result-view}.tsx
│       ├── schemas/{topic,diagnosis,comparison,requests}.ts
│       ├── services/training-api.ts
│       ├── store/training-store.ts
│       ├── state-machine.ts
│       └── types.ts
└── lib/
    ├── ai/{provider-factory,types}.ts
    ├── ai/providers/{openai-compatible,zhipu,mock-provider}.ts
    ├── ai/prompts/{topic,diagnosis,comparison,repair}.ts
    ├── analytics/{recommendation,statistics}.ts
    ├── storage/{database,training-repository}.ts
    └── errors/app-error.ts
tests/
├── e2e/training-flow.spec.ts
├── fixtures/training.ts
├── setup.ts
└── unit/
```

### Task 1: 初始化 Next.js 工程与测试基线

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `tests/setup.ts`
- Create: `tests/unit/app-smoke.test.tsx`

- [ ] **Step 1: 初始化依赖**

Run:

```bash
pnpm init
pnpm add next react react-dom zustand dexie dexie-react-hooks zod recharts clsx lucide-react
pnpm add -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react playwright @playwright/test eslint eslint-config-next
```

Expected: `package.json` 与 `pnpm-lock.yaml` 创建成功。

- [ ] **Step 2: 写失败的应用冒烟测试**

```tsx
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

it("renders the empty dashboard", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { name: "训练仪表盘" })).toBeInTheDocument();
  expect(screen.getByText("开始第一次训练")).toBeInTheDocument();
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run tests/unit/app-smoke.test.tsx`

Expected: FAIL，缺少页面、别名或测试配置。

- [ ] **Step 4: 配置脚本、TypeScript、Vitest 与最小页面**

`package.json` scripts:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

最小页面必须渲染 `训练仪表盘` 与 `开始第一次训练`。

- [ ] **Step 5: 验证基线**

Run:

```bash
pnpm test
pnpm build
```

Expected: 测试通过，Next.js 构建成功。

### Task 2: 定义领域类型、Schema 与训练状态机

**Files:**
- Create: `src/features/training/types.ts`
- Create: `src/features/training/schemas/topic.ts`
- Create: `src/features/training/schemas/diagnosis.ts`
- Create: `src/features/training/schemas/comparison.ts`
- Create: `src/features/training/schemas/requests.ts`
- Create: `src/features/training/state-machine.ts`
- Create: `tests/unit/training-schemas.test.ts`
- Create: `tests/unit/training-state-machine.test.ts`

- [ ] **Step 1: 写 Schema 和状态流转失败测试**

核心断言：

```ts
expect(topicSchema.parse(validTopic).title).toBe("稳定还是成长");
expect(() => topicSchema.parse({ title: "" })).toThrow();
expect(canTransition("setup", "topic")).toBe(true);
expect(canTransition("setup", "result")).toBe(false);
expect(canTransition("draft", "topic")).toBe(true);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/unit/training-schemas.test.ts tests/unit/training-state-machine.test.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现领域契约**

必须定义：

```ts
type TrainingStage = "setup" | "topic" | "draft" | "diagnosis" | "result";
type ProviderId = "mock" | "openai" | "deepseek" | "zhipu";
type ScenarioType = "workplace" | "life";
type Difficulty = "easy" | "medium" | "challenging";
```

`TrainingTopic`、`DraftDiagnosis`、`RewriteComparison` 必须与 PRD 输出字段一致。分数统一为 `1..5` 数值，维度使用受控枚举。

- [ ] **Step 4: 实现显式状态机**

只允许：

```ts
const transitions = {
  setup: ["topic"],
  topic: ["setup", "draft"],
  draft: ["topic", "diagnosis"],
  diagnosis: ["result"],
  result: ["setup"],
} satisfies Record<TrainingStage, TrainingStage[]>;
```

- [ ] **Step 5: 验证**

Run: `pnpm vitest run tests/unit/training-schemas.test.ts tests/unit/training-state-machine.test.ts`

Expected: PASS。

### Task 3: 实现推荐、趋势与 Mock Provider

**Files:**
- Create: `src/lib/analytics/recommendation.ts`
- Create: `src/lib/analytics/statistics.ts`
- Create: `src/lib/ai/types.ts`
- Create: `src/lib/ai/providers/mock-provider.ts`
- Create: `tests/fixtures/training.ts`
- Create: `tests/unit/recommendation.test.ts`
- Create: `tests/unit/statistics.test.ts`
- Create: `tests/unit/mock-provider.test.ts`

- [ ] **Step 1: 写规则测试**

覆盖：

```ts
expect(recommendGoal([])).toBe("argument_sufficiency");
expect(recommendGoal([recordWithWeakness("counterargument")])).toBe("counterargument");
expect(buildStatistics(records).recent).toHaveLength(7);
expect(await mockProvider.generateTopic(input)).toEqual(
  await mockProvider.generateTopic(input)
);
```

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm vitest run tests/unit/recommendation.test.ts tests/unit/statistics.test.ts tests/unit/mock-provider.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现确定性分析函数**

推荐规则严格实现：0 次默认、1-2 次最近最低、3 次以上最近三次平均最低、同分逻辑优先。

- [ ] **Step 4: 实现 Mock Provider**

Mock 必须：

- 根据场景与难度生成结构化命题。
- 根据初稿长度与关键词给出稳定诊断。
- 生成初稿/改写分数、改进点、剩余问题。
- 返回 `source: "mock"`，不得伪装真实 AI。

- [ ] **Step 5: 验证**

Run: `pnpm vitest run tests/unit/recommendation.test.ts tests/unit/statistics.test.ts tests/unit/mock-provider.test.ts`

Expected: PASS。

### Task 4: 实现真实 Provider Adapter 与 API 路由

**Files:**
- Create: `src/lib/ai/providers/openai-compatible.ts`
- Create: `src/lib/ai/providers/zhipu.ts`
- Create: `src/lib/ai/provider-factory.ts`
- Create: `src/lib/ai/prompts/topic.ts`
- Create: `src/lib/ai/prompts/diagnosis.ts`
- Create: `src/lib/ai/prompts/comparison.ts`
- Create: `src/lib/ai/prompts/repair.ts`
- Create: `src/lib/errors/app-error.ts`
- Create: `src/app/api/ai/topic/route.ts`
- Create: `src/app/api/ai/diagnosis/route.ts`
- Create: `src/app/api/ai/comparison/route.ts`
- Create: `src/app/api/providers/test/route.ts`
- Create: `tests/unit/provider-adapters.test.ts`
- Create: `tests/unit/ai-routes.test.ts`

- [ ] **Step 1: 写 Provider 请求转换失败测试**

使用 mock `fetch` 断言：

```ts
expect(request.url).toBe("https://api.deepseek.com/chat/completions");
expect(request.headers.get("authorization")).toBe("Bearer test-key");
expect(body.response_format).toEqual({ type: "json_object" });
```

智谱测试使用其独立 Adapter，但输出必须归一化为同一领域 Schema。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/unit/provider-adapters.test.ts tests/unit/ai-routes.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 Provider Factory**

```ts
export function createProvider(config: ProviderConfig): AIProvider {
  if (config.provider === "mock") return mockProvider;
  if (config.provider === "zhipu") return createZhipuProvider(config);
  return createOpenAICompatibleProvider(config);
}
```

OpenAI 与 DeepSeek共用兼容层，但使用各自默认 Base URL；所有 Base URL 和模型允许覆盖。

- [ ] **Step 4: 实现 JSON 提取与一次修复**

首次结果解析失败时调用 repair prompt；第二次失败抛出 `AI_RESPONSE_INVALID`。错误响应不得包含 API Key、完整请求头或完整用户文本。

- [ ] **Step 5: 实现 Route Handlers**

所有路由执行：

```ts
const request = requestSchema.parse(await req.json());
const provider = createProvider(request.providerConfig);
const result = await provider.generateTopic(request.payload);
return Response.json(topicSchema.parse(result));
```

分别替换为对应方法和 Schema。

- [ ] **Step 6: 验证**

Run: `pnpm vitest run tests/unit/provider-adapters.test.ts tests/unit/ai-routes.test.ts`

Expected: PASS。

### Task 5: 实现 Dexie 存储与 Provider 设置

**Files:**
- Create: `src/lib/storage/database.ts`
- Create: `src/lib/storage/training-repository.ts`
- Create: `src/features/settings/provider-settings-store.ts`
- Create: `tests/unit/training-repository.test.ts`
- Create: `tests/unit/provider-settings.test.ts`

- [ ] **Step 1: 写持久化失败测试**

使用 `fake-indexeddb`，覆盖：

```ts
await repository.saveSession(session);
expect(await repository.getActiveSession()).toMatchObject({ stage: "draft" });
await repository.completeSession(record);
expect(await repository.listRecords()).toHaveLength(1);
expect(loadProviderSettings().provider).toBe("mock");
```

- [ ] **Step 2: 安装测试依赖并运行失败测试**

Run:

```bash
pnpm add -D fake-indexeddb
pnpm vitest run tests/unit/training-repository.test.ts tests/unit/provider-settings.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 Dexie 数据库**

```ts
class LogicTrainingDatabase extends Dexie {
  sessions!: Table<TrainingSession, string>;
  records!: Table<TrainingRecord, string>;
}
```

索引至少包含 `updatedAt`、`completedAt`、`scenarioType` 和 `trainingGoal`。

- [ ] **Step 4: 实现 Repository 和设置存储**

- `saveSession`
- `getActiveSession`
- `deleteSession`
- `completeSession`，使用事务写记录并删会话
- `listRecords`
- `getRecord`
- `clearTrainingData`
- `loadProviderSettings`
- `saveProviderSettings`
- `clearProviderSettings`

- [ ] **Step 5: 验证**

Run: `pnpm vitest run tests/unit/training-repository.test.ts tests/unit/provider-settings.test.ts`

Expected: PASS。

### Task 6: 建立设计系统与应用外壳

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/modal.tsx`
- Create: `src/components/ui/drawer.tsx`
- Create: `src/components/app-shell/app-shell.tsx`
- Create: `src/components/app-shell/sidebar.tsx`
- Create: `src/components/app-shell/insights-rail.tsx`
- Create: `tests/unit/app-shell.test.tsx`

- [ ] **Step 1: 写外壳失败测试**

断言导航包含“训练仪表盘、历史记录、本地设置”，并且主内容和洞察栏具备可访问标签。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/unit/app-shell.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 落地视觉 Token**

在 `globals.css` 定义：

```css
:root {
  --canvas: #f2f1ed;
  --ivory: #ffffff;
  --charcoal: #10131a;
  --ink: #20211f;
  --muted: #999a92;
  --line: #e5e3da;
  --sage: #e5eddd;
  --yellow: #ffe8b5;
  --lavender: #c5c0f7;
  --accent-yellow: #ffc83d;
  --accent-purple: #7268ff;
  --danger: #c86659;
}
```

实现宽屏三栏、中宽双栏和移动单栏断点。

- [ ] **Step 4: 实现 AppShell 和通用覆盖层**

保留现有静态效果图的品牌、三栏结构、圆角、低阴影与功能色。抽屉和 Modal 支持 Escape 关闭、焦点返回和遮罩点击。

- [ ] **Step 5: 验证**

Run: `pnpm vitest run tests/unit/app-shell.test.tsx`

Expected: PASS。

### Task 7: 实现空状态仪表盘、历史抽屉和设置弹窗

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/features/dashboard/dashboard-view.tsx`
- Create: `src/features/dashboard/dashboard-selectors.ts`
- Create: `src/features/history/history-drawer.tsx`
- Create: `src/features/history/history-filters.ts`
- Create: `src/features/settings/provider-settings-modal.tsx`
- Create: `tests/unit/dashboard-view.test.tsx`
- Create: `tests/unit/history-settings.test.tsx`

- [ ] **Step 1: 写用户行为失败测试**

覆盖：

- 无记录显示“开始第一次训练”。
- 有记录显示三张指标卡和最近列表。
- 历史可按场景和关键字筛选。
- 设置可切换 Provider、编辑 Base URL/Key/模型。
- 清空训练数据和清空 Provider 设置需要分别确认。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/unit/dashboard-view.test.tsx tests/unit/history-settings.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现仪表盘**

空状态不得显示虚构分数。数据状态使用 Recharts 展示最近七次趋势和能力分布。

- [ ] **Step 4: 实现历史与设置**

Provider 默认值集中定义：

```ts
const defaults = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "" },
  deepseek: { baseUrl: "https://api.deepseek.com", model: "" },
  zhipu: { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "" },
};
```

模型字段保留为空时，UI 必须提示用户填写，不硬编码可能过期的模型名称。

- [ ] **Step 5: 验证**

Run: `pnpm vitest run tests/unit/dashboard-view.test.tsx tests/unit/history-settings.test.tsx`

Expected: PASS。

### Task 8: 实现训练 Store、API Client 与自动保存

**Files:**
- Create: `src/features/training/store/training-store.ts`
- Create: `src/features/training/services/training-api.ts`
- Create: `src/features/training/hooks/use-session-persistence.ts`
- Create: `tests/unit/training-store.test.ts`
- Create: `tests/unit/training-api.test.ts`

- [ ] **Step 1: 写 Store 失败测试**

覆盖创建会话、合法流转、非法流转拒绝、请求失败保留文本、恢复会话和完成后清理。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/unit/training-store.test.ts tests/unit/training-api.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 Store**

Store action 至少包括：

```ts
startSession
updateSetup
setTopic
updateDraft
setDiagnosis
updateRewrite
setComparison
goBack
restoreSession
resetSession
```

所有阶段变化通过 `canTransition`。

- [ ] **Step 4: 实现 API Client 与 500ms 防抖持久化**

请求前调用 `saveSession`。错误统一转换为 `{ code, message, retryable }`，不得清空 Store。

- [ ] **Step 5: 验证**

Run: `pnpm vitest run tests/unit/training-store.test.ts tests/unit/training-api.test.ts`

Expected: PASS。

### Task 9: 实现五步训练工作台

**Files:**
- Create: `src/app/training/page.tsx`
- Create: `src/features/training/components/stage-tabs.tsx`
- Create: `src/features/training/components/setup-view.tsx`
- Create: `src/features/training/components/topic-view.tsx`
- Create: `src/features/training/components/draft-view.tsx`
- Create: `src/features/training/components/diagnosis-view.tsx`
- Create: `src/features/training/components/result-view.tsx`
- Create: `src/components/feedback/error-banner.tsx`
- Create: `src/components/feedback/loading-card.tsx`
- Create: `tests/unit/training-workspace.test.tsx`

- [ ] **Step 1: 写完整组件流失败测试**

使用 Mock API，依次断言：

```text
设置训练 → 确认命题 → 写初稿 → 诊断与改写 → 结果复盘
```

并验证 199 字不可提交、200 字可提交、改写为空不可查看结果。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/unit/training-workspace.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现 Setup 与 Topic**

生成中禁用重复提交；生成失败停留 Setup。Topic 支持重新生成与返回设置。

- [ ] **Step 4: 实现 Draft 与 Diagnosis**

编辑器实时计数、显示自动保存状态。诊断页展示五类反馈并要求用户自行改写，不提供完整范文。

- [ ] **Step 5: 实现 Result**

结果页完成 Dexie 事务保存，显示来源标记、分数对比、改进点、剩余问题和下一练。

- [ ] **Step 6: 验证**

Run: `pnpm vitest run tests/unit/training-workspace.test.tsx`

Expected: PASS。

### Task 10: 端到端测试、视觉验证与收尾

**Files:**
- Create: `tests/e2e/training-flow.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `README.md` if created, otherwise Create: `README.md`

- [ ] **Step 1: 写 E2E 测试**

覆盖：

```ts
test("completes a mock training and persists history", async ({ page }) => {
  await page.goto("/");
  await page.getByText("开始第一次训练").click();
  // 选择配置、生成命题、输入 200+ 字、诊断、改写、完成。
  await expect(page.getByText("结果复盘")).toBeVisible();
  await page.reload();
  await page.goto("/");
  await expect(page.getByText(/最近训练/)).toBeVisible();
});
```

另写刷新恢复、历史复看、清空数据、设置保存测试。

- [ ] **Step 2: 运行全部静态验证**

Run:

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: 全部成功，无 TypeScript 或 lint 错误。

- [ ] **Step 3: 运行 E2E**

Run: `pnpm test:e2e`

Expected: Mock 训练、恢复、历史和设置流程全部通过。

- [ ] **Step 4: 浏览器视觉验收**

在以下视口检查仪表盘、五个阶段、历史抽屉和设置弹窗：

```text
1440 × 1050
1024 × 900
390 × 844
```

确认：

- 宽屏三栏完整。
- 中宽洞察内容并入主区。
- 移动端单栏且阶段条可滚动。
- 无文字裁切、按钮遮挡或横向页面溢出。

- [ ] **Step 5: 编写运行说明**

README 必须包含：

```bash
pnpm install
pnpm dev
pnpm test
pnpm test:e2e
```

并说明 API Key 仅保存在当前浏览器、本项目适用于本机自用、Mock 无需配置。

- [ ] **Step 6: 最终验收**

重新从空 IndexedDB 开始手工完成一次 Mock 训练，确认首次为空状态、刷新不丢草稿、完成后出现真实本地记录。

## 计划自检

- 规格中的页面、Provider、Mock、Schema、本地存储、恢复、统计、错误、响应式和测试均有对应任务。
- 未包含登录、云同步、付费、社区、语音或完整范文等超出 MVP 的功能。
- 类型名称统一使用 `TrainingStage`、`ProviderId`、`TrainingTopic`、`DraftDiagnosis`、`RewriteComparison`、`TrainingSession` 和 `TrainingRecord`。
- 当前目录不是 Git 仓库，因此计划不包含 commit 步骤；实施过程中不得初始化 Git，除非用户另行要求。

