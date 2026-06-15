import { expect, test, type Page } from "@playwright/test";

const DRAFT_TEXT =
  "我认为团队在面对重要项目延期时，应该优先公开真实进度，并及时调整交付范围。首先，透明沟通能够让相关成员基于同一事实做决定，避免问题继续累积。其次，负责人需要说明延期原因、已经采取的措施和新的时间节点，而不是只给出模糊承诺。例如，可以把原计划拆成必须交付、可以延后和需要协商三部分，让业务方理解取舍。有人担心公开问题会影响信任，但长期隐瞒造成的损失更大。只要同时给出责任人、补救方案和复盘安排，坦诚反而能建立稳定预期。因此，团队应当用清晰事实、具体行动和可验证节点处理延期。";

const REWRITE_TEXT =
  "我的结论是，重要项目出现延期后，团队应立即公开真实进度，并围绕核心目标重新安排交付。理由有三点。第一，共享准确事实能避免成员继续按照失效计划投入资源。第二，重新划分必须交付、可以延后和需要协商的内容，可以把有限时间放在最高价值事项上。第三，明确责任人、补救动作和检查节点，能够把道歉转化为可验证的改进。反对者可能认为公开延期会削弱客户信任，但隐瞒只会让对方更晚发现风险，失去调整空间。例如，负责人可以在当天给出影响清单，次日确认缩减范围，并每两天同步一次进度。因此，透明说明加上具体补救，比模糊承诺更能维护合作关系。";

test.beforeEach(async ({ page }) => {
  await resetBrowserData(page);
});

test("首次进入为空状态，CTA 可进入训练且没有虚构分数", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "训练仪表盘" }),
  ).toBeVisible();
  await expect(page.getByText("完成第一次训练后")).toBeVisible();
  await expect(page.getByRole("region", { name: "训练指标" })).toHaveCount(0);

  await page.getByRole("link", { name: "开始第一次训练" }).click();
  await expect(page).toHaveURL(/\/training$/);
  await expect(
    page.getByRole("heading", { name: "设置训练" }),
  ).toBeVisible();
});

test("Mock 完整训练保存后在仪表盘显示真实记录与指标", async ({ page }) => {
  const topicTitle = await completeMockTraining(page);

  await expect(page.getByText("训练记录已保存")).toBeVisible();
  await page.getByRole("button", { name: "返回仪表盘" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("已完成 1 次训练")).toBeVisible();
  await expect(page.getByRole("region", { name: "训练指标" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "最近记录" }),
  ).toBeVisible();
  await expect(page.getByText(topicTitle).first()).toBeVisible();
});

test("草稿自动保存后刷新仍恢复阶段和文本", async ({ page }) => {
  await reachDraft(page);
  await page.getByRole("textbox", { name: "初稿" }).fill(DRAFT_TEXT);
  await expect(page.getByText("已自动保存")).toBeVisible({ timeout: 5_000 });

  await page.reload();

  await expect(page.getByRole("heading", { name: "写初稿" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "初稿" })).toHaveValue(
    DRAFT_TEXT,
  );
});

test("结果页刷新通过 marker 恢复且记录不重复", async ({ page }) => {
  await completeMockTraining(page);
  await expect(page.getByText("训练记录已保存")).toBeVisible();

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "结果复盘" }),
  ).toBeVisible();
  await expect(page.getByText("训练记录已保存")).toBeVisible();
  await page.getByRole("button", { name: "返回仪表盘" }).click();
  await expect(page.getByText("已完成 1 次训练")).toBeVisible();
});

test("历史记录支持打开、筛选和查看完整复盘", async ({ page }) => {
  const topicTitle = await completeMockTraining(page);
  await expect(page.getByText("训练记录已保存")).toBeVisible();
  await page.getByRole("button", { name: "历史记录" }).click();

  const drawer = page.getByRole("dialog", { name: "历史记录" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("searchbox", { name: "关键词" }).fill(topicTitle);
  await expect(drawer.getByText("共 1 条")).toBeVisible();
  await drawer.getByRole("button", { name: new RegExp(topicTitle) }).click();

  await expect(drawer.getByRole("heading", { name: "完整复盘" })).toBeVisible();
  await expect(drawer.getByText("初稿全文")).toBeVisible();
  await expect(drawer.getByText("改写全文")).toBeVisible();
  await expect(drawer.getByText("下一练建议")).toBeVisible();
});

test("DeepSeek profile 保存后关闭、刷新和切换 Provider 仍持久化", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSettings(page);

  await configureDeepSeek(dialog);
  await dialog.getByRole("button", { name: "保存设置" }).click();
  await expect(dialog.getByText("设置已保存")).toBeVisible();
  await dialog.press("Escape");
  await expect(dialog).toBeHidden();

  await page.reload();
  const reopened = await openSettings(page);
  await expect(
    reopened.getByRole("tab", { name: "DeepSeek" }),
  ).toHaveAttribute("aria-selected", "true");
  await expectDeepSeekProfile(reopened);

  await reopened.getByRole("tab", { name: "Mock" }).click();
  await reopened.getByRole("tab", { name: "DeepSeek" }).click();
  await expectDeepSeekProfile(reopened);
});

test("清除 Provider 设置后训练记录和仪表盘指标仍保留", async ({
  page,
}) => {
  await completeMockTraining(page);
  await expect(page.getByText("训练记录已保存")).toBeVisible();
  await page.getByRole("button", { name: "返回仪表盘" }).click();
  await expect(page.getByText("已完成 1 次训练")).toBeVisible();
  await expect(page.getByRole("region", { name: "训练指标" })).toBeVisible();

  const dialog = await openSettings(page);
  await configureDeepSeek(dialog);
  await dialog.getByRole("button", { name: "保存设置" }).click();
  await expect(dialog.getByText("设置已保存")).toBeVisible();

  await dialog.getByRole("button", { name: "清除 Provider 设置" }).click();
  await dialog
    .getByRole("button", { name: "确认清除 Provider 设置" })
    .click();
  await expect(dialog.getByText("Provider 设置已清除")).toBeVisible();
  await expect(
    dialog.getByRole("tab", { name: "Mock" }),
  ).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: "DeepSeek" }).click();
  await expect(dialog.getByLabel("Base URL")).toHaveValue(
    "https://api.deepseek.com",
  );
  await expect(dialog.getByRole("textbox", { name: "API Key" })).toHaveValue(
    "",
  );
  await expect(dialog.getByLabel("模型")).toHaveValue("");
  await dialog.press("Escape");
  await expect(dialog).toBeHidden();

  await expect(page.getByText("已完成 1 次训练")).toBeVisible();
  await expect(page.getByRole("region", { name: "训练指标" })).toBeVisible();
  await page.getByRole("button", { name: "历史记录" }).click();
  await expect(page.getByRole("dialog", { name: "历史记录" })).toContainText(
    "共 1 条",
  );
});

test("清空训练数据后 Provider 配置仍保留", async ({ page }) => {
  await completeMockTraining(page);
  await expect(page.getByText("训练记录已保存")).toBeVisible();
  await page.getByRole("button", { name: "返回仪表盘" }).click();
  await expect(page.getByText("已完成 1 次训练")).toBeVisible();

  const dialog = await openSettings(page);
  await configureDeepSeek(dialog);
  await dialog.getByRole("button", { name: "保存设置" }).click();
  await expect(dialog.getByText("设置已保存")).toBeVisible();

  await dialog.getByRole("button", { name: "清空训练数据" }).click();
  await dialog.getByRole("button", { name: "确认清空训练数据" }).click();
  await expect(dialog.getByText("训练数据已清空")).toBeVisible();
  await dialog.press("Escape");
  await expect(dialog).toBeHidden();

  await expect(page.getByText("完成第一次训练后")).toBeVisible();
  await expect(page.getByRole("region", { name: "训练指标" })).toHaveCount(0);

  const reopened = await openSettings(page);
  await expect(
    reopened.getByRole("tab", { name: "DeepSeek" }),
  ).toHaveAttribute("aria-selected", "true");
  await expectDeepSeekProfile(reopened);
});

test("@mobile 首页和训练页保持单栏且没有横向溢出", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "训练仪表盘" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "开始第一次训练" }).click();
  await expect(page.getByRole("heading", { name: "设置训练" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

async function resetBrowserData(page: Page) {
  const origin = "http://127.0.0.1:3000";
  await page.route(`${origin}/`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>storage reset</title>",
    }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.unroute(`${origin}/`);
}

async function reachDraft(page: Page) {
  await page.goto("/training");
  await expect(page.getByRole("heading", { name: "设置训练" })).toBeVisible();
  await page.getByRole("button", { name: "生成训练命题" }).click();
  await expect(page.getByText("命题质量检查")).toBeVisible();
  const topicTitle =
    (await page.getByRole("heading", { level: 1 }).textContent())?.trim()
    || "稳定还是成长";
  await page.getByRole("button", { name: "开始写初稿" }).click();
  await expect(page.getByRole("heading", { name: "写初稿" })).toBeVisible();
  return topicTitle;
}

async function reachResultWithoutWaitingForSave(page: Page) {
  const topicTitle = await reachDiagnosis(page);
  await page.getByRole("button", { name: "查看结果复盘" }).click();
  await expect(page.getByRole("heading", { name: "结果复盘" })).toBeVisible();
  return topicTitle;
}

async function reachDiagnosis(page: Page) {
  const topicTitle = await reachDraft(page);
  await page.getByRole("textbox", { name: "初稿" }).fill(DRAFT_TEXT);
  await page.getByRole("button", { name: "提交初稿诊断" }).click();
  await expect(
    page.getByRole("heading", { name: "诊断与改写" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "二次改写" }).fill(REWRITE_TEXT);
  return topicTitle;
}

async function completeMockTraining(page: Page) {
  const title = await reachResultWithoutWaitingForSave(page);
  await expect(page.getByText("训练记录已保存")).toBeVisible();
  return title;
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "本地设置" }).click();
  const dialog = page.getByRole("dialog", { name: "本地设置" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function configureDeepSeek(
  dialog: ReturnType<Page["getByRole"]>,
) {
  await dialog.getByRole("tab", { name: "DeepSeek" }).click();
  await dialog.getByLabel("Base URL").fill("https://deepseek.example.com/v1");
  await dialog
    .getByRole("textbox", { name: "API Key" })
    .fill("sk-deepseek-e2e");
  await dialog.getByLabel("模型").fill("deepseek-e2e-model");
}

async function expectDeepSeekProfile(
  dialog: ReturnType<Page["getByRole"]>,
) {
  await expect(dialog.getByLabel("Base URL")).toHaveValue(
    "https://deepseek.example.com/v1",
  );
  await expect(dialog.getByRole("textbox", { name: "API Key" })).toHaveValue(
    "sk-deepseek-e2e",
  );
  await expect(dialog.getByLabel("模型")).toHaveValue("deepseek-e2e-model");
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}
