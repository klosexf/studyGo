> version: 0.4.0 | updated_at: 2026-06-15 | owner: @chenxiaofeng
> reader: AI Coding Agent (Codex / Claude Code / Cursor / Qoder)
> scope: `studyGo/` 项目

# 理序 Agent Map

本文件只提供项目地图和违反后会直接造成问题的规则。模块细节以链接的源码、测试和规格为准。

适配原则：只写当前源码、测试、`package.json` 或已确认规格能够证明的规则；外部最佳实践只有在本项目存在对应能力时才采用。

## 1. 项目地图

- 产品：单人本地使用的 AI 逻辑表达教练。
- 闭环：设置 → 命题 → 初稿 → 诊断改写 → 结果复盘 → 本地保存 → 趋势与下一练。
- 原则：AI 只诊断、追问和对比，不评价立场，不代写完整答案。
- 技术：Next.js 16、React 19、TypeScript、Zustand、Dexie/IndexedDB、Zod、Recharts、Vitest、Playwright。
- 边界：无登录、云同步、多用户、付费、社区、语音和原生 App。

关键入口：

| 领域 | 入口 |
| --- | --- |
| 产品范围 | [`逻辑表达训练产品 · 单人自用版 MVP PRD.md`](./逻辑表达训练产品%20·%20单人自用版%20MVP%20PRD.md) |
| 技术架构 | [`逻辑表达训练产品_开发技术方案.md`](./逻辑表达训练产品_开发技术方案.md) |
| 已确认规格 | [`docs/superpowers/specs/`](./docs/superpowers/specs/) |
| 页面与 API | [`src/app/`](./src/app/) |
| 训练流程 | [`src/features/training/`](./src/features/training/) |
| Provider 与 Prompt | [`src/lib/ai/`](./src/lib/ai/) |
| 本地存储 | [`src/lib/storage/`](./src/lib/storage/) |
| 测试 | [`tests/`](./tests/) |

事实优先级：

> 自动化检查 > 当前源码与测试 > 已确认规格 > PRD > 技术方案 > 口头约定

文档与实现冲突时，以源码和测试为准，并明确指出差异。

## 2. 架构硬规则

1. UI 调用链必须保持 `React UI → training-api → Route Handler → Provider Adapter`。
   - WHY：绕过任一层会丢失统一校验、错误清洗或供应商隔离。
   - HOW：页面调用 [`training-api.ts`](./src/features/training/services/training-api.ts)，外部 AI 调用仅放在 [`src/lib/ai/providers/`](./src/lib/ai/providers/)。

2. 请求、AI 输出和持久化数据必须经过 Zod 校验。
   - WHY：TypeScript 类型不能验证运行时网络或浏览器数据。
   - HOW：复用 [`schemas/`](./src/features/training/schemas/) 和 [`training-repository.ts`](./src/lib/storage/training-repository.ts)，禁止用类型断言绕过。

3. Prompt 只能放在 [`src/lib/ai/prompts/`](./src/lib/ai/prompts/)。
   - WHY：散落 Prompt 会导致版本、注入防护和输出契约失控。
   - HOW：组件和 Route Handler 只传结构化输入。

4. 趋势、聚合分、短板和推荐必须由确定性函数计算。
   - WHY：历史统计必须可复现，不能随模型漂移。
   - HOW：修改 [`src/lib/analytics/`](./src/lib/analytics/) 并补单元测试。

## 3. 训练与异步硬规则

- 状态机固定为 `setup → topic → draft → diagnosis → result`；合法回退见 [`state-machine.ts`](./src/features/training/state-machine.ts)。
- AI 请求前必须保存会话；失败时停留当前步骤并保留用户文本。
- 重复请求必须取消旧请求；文本、步骤或会话变化后，旧响应不得写回。
- 一次训练固定 Provider ID 和模型；真实 Provider 失败不得静默切换 Mock。
- 初稿和改写按 grapheme cluster 计数，必须为 200–400 个字符。
- 结果未保存时不得离开结果页；保存失败只能重试保存，不能重复调用 AI。
- 刷新结果页必须通过已有记录恢复，不能重复写记录。

实现与测试入口：
[`training-store.ts`](./src/features/training/store/training-store.ts)、
[`use-session-persistence.ts`](./src/features/training/hooks/use-session-persistence.ts)、
[`training-workspace.tsx`](./src/features/training/components/training-workspace.tsx)、
[`training-store.test.ts`](./tests/unit/training-store.test.ts)。

## 4. 数据与安全硬规则

- API Key 只允许存在于版本化 Provider 设置和发往本地 Route Handler 的 JSON 请求体。
- 禁止把 Key 写入源码、IndexedDB、训练记录、URL、日志、错误、截图或测试快照。
- 禁止宣称 localStorage 中的 Key 已加密或适合不可信设备。
- 训练全文只存 IndexedDB，不存 localStorage。
- Provider 设置清除与训练数据清空必须保持为两个独立确认操作。
- 禁止放宽 HTTPS、私网/元数据地址、请求前 DNS 重解析和禁止重定向策略。
- 禁止用删库或清浏览器数据掩盖迁移、恢复或并发问题。

存储事实与迁移以
[`database.ts`](./src/lib/storage/database.ts)、
[`training-repository.ts`](./src/lib/storage/training-repository.ts) 和
[`provider-settings-store.ts`](./src/features/settings/provider-settings-store.ts)
为准。

## 5. AI 产品硬规则

- 禁止完整范文、整段代写或替用户完成改写。
- 禁止因用户立场不同而扣分。
- 诊断必须引用或概括用户文本证据，只突出关键问题。
- 八个评分维度必须完整且唯一；分数为 1–5，最多一位小数。
- 聚合分、提升值、覆盖数和最低维度必须由服务端重算。
- AI 或用户内容必须作为普通文本渲染，禁止 `dangerouslySetInnerHTML`。
- 真实 Provider 只允许一次 JSON 修复重试，默认超时 60 秒。

具体协议以 [`schemas/`](./src/features/training/schemas/)、[`prompts/`](./src/lib/ai/prompts/) 和 [`provider-adapters.test.ts`](./tests/unit/provider-adapters.test.ts) 为准。

## 6. UI 硬规则

- 复用现有 AppShell、Modal、Drawer 和 Overlay Manager，不另建弹层基础设施。
- Overlay 必须保留 portal、顶层 Escape、焦点圈定、背景隔离和引用计数滚动锁。
- 训练阶段是语义进度列表，不是 ARIA tabs；Provider 切换才使用 tabs。
- 图表必须有文字/数值摘要，不能只靠颜色表达。
- UI 改动必须用浏览器实际验证；纯 curl 不能证明页面渲染正确。

入口：
[`app-shell/`](./src/components/app-shell/)、
[`ui/`](./src/components/ui/)、
[`globals.css`](./src/app/globals.css)、
[`app-shell.test.tsx`](./tests/unit/app-shell.test.tsx)。

## 7. 风险分级

| 级别 | 范围 | 要求 |
| --- | --- | --- |
| L0 | 只读分析 | 自动执行 |
| L1 | 单组件、纯函数、样式或对应测试 | 自动执行 + 局部验证 |
| L2 | 页面、Store、存储、Route、Provider、共享 Schema | 先列影响路径 + 完整验证 |
| L3 | 依赖、数据迁移、凭据、安全、AI 契约、删除文件 | 实施前人工确认 |

以下直接升级 L3：修改 `package.json`/`pnpm-lock.yaml`、Dexie Schema、localStorage 格式、API Key 行为、Provider URL 安全、公共 AI Schema/Prompt 契约或删除文件。

## 8. 执行与验证

执行顺序：

1. 读取相关源码、测试和 [`docs/superpowers/`](./docs/superpowers/)。
2. 说明目标、非目标、级别和影响路径。
3. 功能或 bug 先补失败测试，再实施最小改动。
4. 运行局部测试，再运行影响范围要求的完整验证。
5. UI 改动必须启动应用并实际操作桌面及受影响移动视口。
6. 输出命令、结果、风险、回滚点和未验证项。

真实命令：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

- 跨模块改动至少执行前四项。
- 完整闭环、导航、恢复或关键 UI 改动追加 E2E。
- 缺少 pnpm、Chromium 或服务时明确记录阻塞，不得写成已通过。
- `test-*.js` 只检查历史 HTML/设计文档，不能替代应用测试。

API 验证规范：

- 仅用于现有 `/api/ai/*` 和 `/api/providers/test` Route Handler；本项目没有独立后端服务。
- 每条 `curl` 独立执行，禁止用 `&&` 串联多个请求。
- 响应写入 `/tmp/<name>.json`，再用独立 `python3` 命令解析。
- 本项目无登录/token 流程；Provider 配置按请求 Schema 传入，示例优先使用 Mock，禁止在命令历史中写真实 Key。
- 排查顺序：Route Handler → Provider Adapter → 终端开发日志 → 浏览器 Network/Console → IndexedDB/localStorage。

## 9. 错误输出规范

新增 lint、校验或守卫的错误信息必须包含：

```text
✗ WHAT：哪个文件/请求违反了什么规则
  WHY：该规则防止什么架构、数据或安全问题
  HOW：应修改到哪一层，或使用哪个已有入口
```

只输出“违规”“失败”或错误码而没有 WHY + HOW，不算合格错误信息。

## 10. 完成定义

- [ ] 目标、非目标、风险级别和影响路径已说明
- [ ] 相关测试先失败后通过
- [ ] 未绕过状态机、Zod、Route Handler、Provider Adapter 或存储边界
- [ ] 用户文本、凭据和历史数据在失败路径中安全
- [ ] lint、typecheck、test、build 按影响范围执行
- [ ] UI/完整闭环已实际自测，不只编译通过
- [ ] 所有失败与阻塞均包含 WHAT + WHY + HOW
- [ ] 风险、回滚点和未验证项已输出

## 11. 规则演进

采用 Bad Case 驱动：

> Agent 犯错 → 判断是否可自动化检查 → 能自动化则加测试/lint/CI；不能自动化且全局适用才写本文件；模块细节写入对应规格或源码旁测试。

当前项目没有既定 CI 配置；优先补 Vitest、Playwright、ESLint 或 `package.json` 脚本，只有用户要求引入 CI 时才新增流水线。

`AGENTS.md` 必须保持在 200 行以内。新增规则前先删除重复说明，禁止把它扩展成操作手册。
