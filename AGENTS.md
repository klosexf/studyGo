> version: 0.3.0 | updated_at: 2026-06-15 | owner: @chenxiaofeng
> reader: AI Coding Agent (Codex / Claude Code / Cursor / Qoder)
> scope: `studyGo/` 项目

## 1. 项目概述
- 定位: 单人自用的网页端 AI 逻辑表达教练，通过命题、初稿、诊断、二次改写和复盘训练用户“想清楚、说明白”。
- 核心闭环: 设置训练 → AI 生成命题 → 写初稿 → AI 诊断 → 二次改写 → 对比复盘 → 本地保存 → 更新趋势与下一练。
- 产品原则: AI 不代写完整答案，不评价用户立场对错，只诊断推理质量和表达清晰度。
- 技术栈: Next.js 16 App Router / React 19 / TypeScript / Tailwind CSS 4 / Zustand / Dexie / IndexedDB / Zod / Recharts
- AI 接入: OpenAI / DeepSeek / 智谱 / Mock Provider，通过统一 Provider Adapter 调用。
- 仓库类型: 单工程 Next.js 应用，不是 monorepo。
- 运行环境: Node.js 20+（推荐 22 LTS）/ pnpm 10 / Chromium / macOS
- 数据边界: 无登录、无云数据库、无云同步；训练数据和 Provider 设置只保存在当前浏览器。

## 2. 任务分级（执行前先自评）
| 级别 | 定义 | 处理方式 |
| --- | --- | --- |
| L0 只读 | 查代码、文档、测试、日志，不改文件 | 自动执行 |
| L1 单文件 | 单个组件、纯函数、样式或对应测试内的局部改动；不改公共契约 | 自动执行 + 跑相关测试 |
| L2 跨文件 | 涉及页面、Store、存储、Route Handler、Provider、共享 Schema 或完整交互协作 | 列影响路径 + 跑完整验证 |
| L3 高风险 | 改依赖、数据迁移、凭据、安全策略、AI 契约、Prompt 核心约束或删除文件 | 必须人工确认 |

升级条件：触发以下任一项直接按 L3 处理
- 修改 `package.json`、`pnpm-lock.yaml` 或升级核心依赖。
- 修改 Dexie 数据库版本、表结构、迁移、清空或隔离策略。
- 修改 localStorage 设置结构、结果 marker、版本或迁移行为。
- 修改 API Key 的保存、传输、脱敏或日志行为。
- 放宽 Provider Base URL、DNS、SSRF 或网络地址安全校验。
- 修改 `AIProvider` 公共接口、AI 请求/响应 Schema、评分协议或 Prompt 核心约束。
- 修改“真实 Provider 失败不自动回退 Mock”的行为。
- 删除任何项目文件或训练数据。

L3 实施前必须说明目标、影响文件、数据或安全风险、兼容性、验证方式和回滚点；未获确认前只能做只读分析。

## 3. 快速命令
| 用途 | 命令 |
| --- | --- |
| 安装依赖 | `pnpm install` |
| 启动开发服务 | `pnpm dev` |
| ESLint | `pnpm lint` |
| TypeScript 检查 | `pnpm typecheck` |
| 单元与组件测试 | `pnpm test` |
| 单测过滤 | `pnpm test -- <文件或匹配模式>` |
| 生产构建 | `pnpm build` |
| E2E | `pnpm test:e2e` |
| 查看改动 | `git status --short`（仅当前目录存在 Git 仓库时） |

- UI 验证优先使用 Agent Browser / Playwright / 浏览器实际操作。
- Playwright 基址为 `http://127.0.0.1:3000`，当前 web server 命令为 `npm run dev`。
- 缺少 Playwright Chromium 时运行 `pnpm exec playwright install chromium`。
- 企业证书环境可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已有 Chromium。
- 根目录 `test-*.js` 只检查历史 HTML/设计文档，不属于默认测试链；仅修改对应文档时按需运行 `node <file>`。
- 不要伪造 `make`、`yarn`、独立后端服务等本项目不存在的命令。

## 4. 仓库结构
```text
.
├── src/
│   ├── app/                         # App Router 页面与 Route Handlers
│   │   ├── api/ai/                  # topic / diagnosis / comparison
│   │   ├── api/providers/test/      # Provider 连接测试
│   │   └── training/                # 五步训练页面
│   ├── components/
│   │   ├── app-shell/               # 三栏应用外壳
│   │   ├── feedback/                # 加载与错误反馈
│   │   └── ui/                      # Button、Card、Modal、Drawer、Overlay
│   ├── features/
│   │   ├── dashboard/               # 仪表盘与数据选择器
│   │   ├── history/                 # 历史筛选与复盘
│   │   ├── settings/                # Provider 配置与 localStorage
│   │   └── training/                # 状态机、Store、Schema、服务与五步组件
│   └── lib/
│       ├── ai/                      # Provider、Prompt、Factory 与 URL 安全
│       ├── analytics/               # 趋势、短板与推荐纯函数
│       ├── errors/                  # 统一应用错误
│       └── storage/                 # Dexie 数据库与 Repository
├── tests/
│   ├── unit/                        # Vitest / React Testing Library
│   ├── e2e/                         # Playwright 完整训练闭环
│   └── fixtures/                    # 稳定测试数据
├── docs/superpowers/specs/          # 已确认设计规格
├── docs/superpowers/plans/          # 实施计划
├── package.json                     # 依赖与真实脚本入口
├── pnpm-lock.yaml                   # 依赖锁文件
├── playwright.config.ts             # E2E 配置
└── vitest.config.ts                 # 单元与组件测试配置
```

## 5. 关键约定
1. UI 不直接调用外部 AI 服务；遵循 `React UI -> training-api -> Route Handler -> Provider Adapter`。
2. Route Handler 负责请求校验、Provider 调用、响应校验和统一错误，不保存训练历史。
3. 业务层只依赖统一 `AIProvider`；供应商差异放在 `src/lib/ai/providers/`。
4. Prompt 只放在 `src/lib/ai/prompts/`，不得在页面组件或 Route Handler 临时拼接。
5. 所有请求、AI 输出和持久化数据必须经过 Zod 校验，禁止用类型断言绕过运行时校验。
6. Zustand vanilla store 管理当前会话、AI 请求和保存状态；长期数据走 Dexie/IndexedDB。
7. IndexedDB 保存 `sessions`、`records` 和 `quarantine`，禁止保存 API Key。
8. localStorage 保存版本化 Provider 设置和结果恢复 marker，禁止保存训练全文。
9. 趋势、聚合分、短板和下一练使用确定性 TypeScript 纯函数计算，不调用 AI 二次总结。
10. 训练状态机固定为 `setup → topic → draft → diagnosis → result`；只允许 `topic → setup`、`draft → topic` 和 `result → setup` 回退。
11. AI 失败时停留当前步骤并保留文本；AI 请求前强制保存当前会话。
12. 输入停止约 500ms 后自动保存；页面隐藏、pagehide 和卸载时执行尽力保存。
13. 重复 AI 操作取消旧请求并忽略过期响应；修改文本、步骤或会话后，旧响应不得写回。
14. 一次训练固定 Provider ID 和模型；Base URL 与 API Key 按会话 Provider 在每次请求时读取当前设置。
15. 初稿和二次改写按 grapheme cluster 计数，必须为 200–400 个字符。
16. 真实 Provider 超时为 60 秒；格式校验失败只允许一次 JSON 修复请求。
17. 诊断必须覆盖八个唯一维度；分数为 1–5，最多一位小数。
18. 逻辑分、表达分、覆盖数、提升值和最低维度由服务端根据维度分重新计算。
19. 真实 Provider 失败不得静默回退 Mock；Mock 结果必须明确标识并保持可重复。
20. 需求、方案和计划优先延续 `docs/superpowers/specs/` 与 `docs/superpowers/plans/` 的现有习惯。

### 当前持久化事实
- Dexie 数据库名为 `logic-expression-training`，当前版本为 v2。
- `completeSession` 必须在事务内写入 `records` 并删除同 ID `sessions`。
- 损坏且未被并发替换的数据移入 `quarantine`，不得静默污染正常记录。
- Provider 设置主键为 `logic-trainer.settings.v1`，结构为 `{ version: 1, settings }`。
- 旧设置键会迁移到 v1 envelope，并删除旧凭据副本。
- 结果 marker 为 `logic-trainer.current-result`，用于刷新恢复结果页和防止重复写记录。
- 清空训练数据会清空 `sessions`、`records`、`quarantine`，但不清 Provider 设置。
- 清除 Provider 设置不会删除训练记录。

## 6. 硬性禁止项
- 禁止把 API Key 写入源码、IndexedDB、训练记录、URL、日志、错误信息、截图、测试快照或提交内容。
- 禁止宣称 localStorage 中的 API Key 已加密或完全安全。
- 禁止在组件中绕过 Route Handler 直接调用 OpenAI、DeepSeek 或智谱。
- 禁止在真实 Provider 失败后自动切换为 Mock。
- 禁止使用 `dangerouslySetInnerHTML` 渲染 AI 或用户内容。
- 禁止在组件中拼接 Prompt 或自行解析供应商专用响应。
- 禁止放宽 `provider-url.ts` 的 HTTPS、私网、云元数据、DNS 重解析或禁止重定向约束。
- 禁止让旧 AI 响应、旧恢复结果或旧保存任务覆盖新会话。
- 禁止绕过状态机直接进入 diagnosis 或 result。
- 禁止输出完整范文、整段代写或替用户完成二次改写。
- 禁止因用户立场不同而扣分。
- 禁止把训练全文写入 localStorage。
- 禁止把 Provider 设置清除与训练数据清空合并为一个操作。
- 禁止在业务组件重复实现 Modal/Drawer 的焦点圈定、背景隔离和滚动锁。
- 禁止删除 `docs/superpowers/specs/`、`docs/superpowers/plans/` 历史文档。
- 禁止把 `.next/`、`node_modules/`、Playwright 报告、截图或临时 HTML 当成业务源码。

## 7. 标准执行顺序（L1+）
0. 跨会话续跑：先读取相关 `docs/superpowers/specs/`、`docs/superpowers/plans/`、当前代码、测试和已有改动。项目当前没有约定 `progress.md` 或 `bugs.md`，不得自行创建。
1. 复述目标：说清楚要做什么、明确不做什么。
2. 自评级别：说明 L1/L2/L3；L3 在实施前请求人工确认。
3. 列影响路径：说明新增、修改、删除哪些文件；删除文件直接升级 L3。
4. 给步骤：拆成可独立验证的几步。
5. 先写测试：功能或 bug 修复先补能证明行为的失败测试。
6. 实施：遵循现有模块边界，每步后运行对应局部测试。
7. 总验证：按 §8 验证矩阵执行；跨模块改动至少运行 lint、typecheck、test 和 build。
8. UI 验证：使用浏览器实际验证桌面与受影响移动视口。
9. 输出风险：说明影响范围、可回滚点、已知失败和后续事项。
10. 若发现代码、测试和规格不一致，先记录差异并以代码与测试为事实，不得静默覆盖现有行为。

## 8. 验证闭环
- 核心自动化验证：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`
- 完整流程验证：`pnpm test:e2e`
- 局部验证：`pnpm test -- <文件或匹配模式>`
- UI 改动不能只靠单测；必须实际验证对应交互、桌面布局和受影响移动视口。
- 若本机缺少 pnpm、Chromium 或开发服务，必须写明阻塞，不得默认“应该没问题”。

### 改动-验证配对
| 改动类型 | 最低验证 |
| --- | --- |
| 纯函数、Schema、Store | 相关 Vitest + `pnpm typecheck` |
| React 组件和交互 | 相关 Testing Library + `pnpm typecheck` |
| Route Handler 或 Provider | Route/Provider 合约测试 + `pnpm typecheck` |
| IndexedDB/localStorage | Repository/设置测试 + 迁移、隔离或失败路径测试 |
| Prompt、AI Schema、评分 | Schema + Mock + Provider Adapter + Route 合约测试 |
| Overlay、导航保护、恢复 | App shell / workspace 测试 + 关键 E2E |
| 样式和响应式 | 相关测试 + 浏览器桌面/移动实际验证 |
| 跨模块功能 | lint + typecheck + test + build |
| 完整训练闭环 | 上述验证 + E2E |

### 状态-验证配对
- 无命令 = 无证据；没有可执行验证结果，不得写成“已完成”或“已验证”。
- 命令失败必须记录首个关键错误、失败数量和是否与本次改动相关。
- 不得用单元测试代替 UI 手测，不得用构建成功代替行为验证。
- E2E 失败时保留并说明 Playwright trace、截图或报告路径。
- 用户明确反馈已测试或回测正常时，可以记录用户确认，但不得伪装成自动化验证通过。
- 当前已知基线（2026-06-15）：TypeScript 检查通过；Vitest 318/320 通过，存在 2 个既有失败；ESLint 在 `proposition-hint-panel.tsx` 有 8 个既有未转义引号错误。后续执行时必须重新验证，不得永久假定该基线不变。

### 关键行为闭环
- 结果保存前先写 `logic-trainer.current-result` marker。
- 结果未保存时阻止仪表盘、新训练、浏览器返回和页面卸载；历史与设置仍可打开。
- 结果保存失败时保留结果页并提供重试，禁止重复生成 AI 结果。
- 刷新结果页时从已完成记录恢复，不得重复写入记录。
- Overlay 通过 `#overlay-root` portal、栈式 Escape、焦点圈定、背景 `inert`/`aria-hidden` 和引用计数滚动锁工作。
- `1400px` 以下应用壳改为两列并把洞察栏移到主区下方；`760px` 以下改为单列。

## 9. 验收标准（DoD）
- [ ] 目标与非目标已说明
- [ ] 任务级别与影响路径已列出
- [ ] 改动遵守 MVP 范围和现有模块边界
- [ ] 未绕过状态机、Zod、Route Handler 或 Provider Adapter
- [ ] 用户文本在错误、重试、刷新和恢复路径中不会丢失
- [ ] 过期请求、恢复和保存结果不会覆盖更新后的会话
- [ ] 未泄露 API Key、请求头、完整 Prompt 或 Provider 原始错误
- [ ] 相关单元、组件、存储或合约测试已执行并说明结果
- [ ] 跨模块改动已运行 lint、typecheck、test 和 build
- [ ] 完整闭环或关键交互改动已运行 E2E
- [ ] UI 改动已完成桌面和受影响移动视口手测，或已说明阻塞
- [ ] 未引入与项目无关的命令、目录或技术栈描述
- [ ] 未验证项、已知失败和真实阻塞已明确说明
- [ ] 风险、回滚点和后续事项已输出

## 10. 回滚协议
| 改动类型 | 可回滚点 | 回滚方式 | 影响范围 |
| --- | --- | --- | --- |
| 普通 TypeScript / React / CSS | 上一提交或本次补丁 | 回滚对应提交或精确撤销本次改动 | 当前项目 |
| `package.json` / `pnpm-lock.yaml` | 上一提交 | 两个文件一起回滚，重新安装并跑完整验证 | 依赖、构建与测试 |
| IndexedDB Schema / 数据迁移 | 上一提交 + 浏览器数据检查 | 回退代码并执行兼容迁移，禁止直接删库掩盖问题 | 当前浏览器训练数据 |
| localStorage 设置 / marker | 上一提交 + 旧键检查 | 回退代码并验证旧设置、结果恢复和迁移 | Provider 配置与结果恢复 |
| Prompt / Provider / 评分协议 | 上一版本号 | 回退实现并保留历史记录中的版本可解释性 | AI 输出和历史记录 |

- 禁止使用 `git reset --hard`、`git checkout --` 或删除浏览器数据来覆盖用户改动，除非用户明确授权并已说明数据损失。
- 回滚持久化代码时必须同时检查已经写入的 IndexedDB/localStorage 数据，不能只回退源码。

## 11. 文档与事实优先级
- 当前代码、自动化测试和 `package.json` > `docs/superpowers/specs/` > MVP PRD > 开发技术方案 > `docs/superpowers/plans/` > 页面清单、设计文档和效果图 > 临时说明
- 文档与源码冲突时，以当前源码和测试为准，并明确指出差异。
- 根目录 `test-*.js` 与历史 HTML 只约束对应设计文档，不覆盖当前 React 应用事实。
- 本文件仅约束 `studyGo/` 项目，不覆盖相邻目录或其他仓库。
- `AGENTS.md` 只记录长期稳定规则，不记录临时任务状态。
