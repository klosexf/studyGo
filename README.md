# 理序：逻辑表达训练

单人自用的逻辑与表达训练 MVP。产品通过“设置、命题、初稿、诊断改写、结果复盘”五步流程，帮助用户练习观点组织、论证和表达。首次打开不包含演示数据，所有统计均来自当前浏览器中的真实训练记录。

## 本地运行

需要 Node.js 20+ 和 pnpm。普通用户安装 pnpm 后，应确保 `pnpm` 所在目录已加入 `PATH`，终端中运行 `pnpm --version` 能正常输出版本。

```bash
pnpm install
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 测试与构建

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

E2E 使用 Playwright 自带的 Chromium。首次运行前安装对应浏览器：

```bash
pnpm exec playwright install chromium
```

企业证书环境无法下载 bundled Chromium 时，可临时指定已有 Chromium
可执行文件：

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/path/to/chromium" pnpm test:e2e
```

未设置该环境变量时，仍使用 Playwright bundled Chromium。

桌面流程使用 Playwright Chromium 项目，移动端使用同一 Chromium 的 Pixel 5 视口执行布局 smoke。

## AI Provider

默认使用 Mock Provider，不需要 API Key，也可以完成完整训练闭环。可在“本地设置”中选择并配置：

- OpenAI
- DeepSeek
- 智谱
- Mock

真实 Provider 支持配置 Base URL、API Key 和模型。设置保存后，后续训练会使用所选 Provider；真实请求失败时不会自动切换为 Mock，以免混淆结果来源。

## 数据与安全

- Provider 配置保存在当前浏览器的 `localStorage`。
- 训练草稿、会话和历史记录保存在当前浏览器的 IndexedDB。
- API Key 不写入训练历史，但仍是保存在浏览器中的明文敏感信息。
- 本项目仅适合可信设备上的本机自用，不建议部署为多人共享服务。
- 自定义 Base URL 会由本机服务端请求，请只填写可信的 HTTPS 地址。
- “清除 Provider 设置”和“清空训练数据”相互独立，操作不可撤销。
- 清理浏览器站点数据、切换浏览器或使用新的浏览器配置后，本地数据不会自动迁移。

## 项目结构

```text
src/app/                 Next.js 页面与 API Route
src/components/          应用外壳、反馈和基础 UI
src/features/dashboard/  仪表盘统计展示
src/features/history/    历史筛选与复盘
src/features/settings/   Provider 配置
src/features/training/   训练状态、Schema、Store 与五步界面
src/lib/ai/              Provider Adapter、Prompt 与 Mock
src/lib/analytics/       本地推荐和趋势统计
src/lib/storage/         Dexie 数据库与 Repository
tests/unit/              Vitest/Testing Library 测试
tests/e2e/               Playwright 端到端测试
```

## 产品边界

当前版本没有账号、登录、云同步、多人协作或跨设备备份。数据仅属于当前浏览器。产品提供诊断、追问和改写任务，不提供完整代写范文。
