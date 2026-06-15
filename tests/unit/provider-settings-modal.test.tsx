import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProviderSettingsModal } from "@/features/settings/provider-settings-modal";
import { validateClientProviderConfig } from "@/features/settings/provider-config-validation";
import {
  DEFAULT_PROVIDER_SETTINGS,
  type ProviderSettings,
} from "@/features/settings/provider-settings-store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function storageAdapter(initial = DEFAULT_PROVIDER_SETTINGS) {
  let settings: ProviderSettings = structuredClone(initial);
  return {
    load: vi.fn(() => structuredClone(settings)),
    save: vi.fn((next: ProviderSettings) => {
      settings = structuredClone(next);
    }),
    clear: vi.fn(() => {
      settings = structuredClone(DEFAULT_PROVIDER_SETTINGS);
    }),
  };
}

describe("ProviderSettingsModal", () => {
  it("shares client-safe validation for Mock and real provider configs", () => {
    expect(
      validateClientProviderConfig({
        provider: "mock",
        baseUrl: "",
        apiKey: "",
        model: "",
      }).success,
    ).toBe(true);
    expect(
      validateClientProviderConfig({
        provider: "zhipu",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        apiKey: "key",
        model: "glm-4",
      }).success,
    ).toBe(true);
  });
  it("edits separate provider profiles and saves without duplicating defaults", async () => {
    const user = userEvent.setup();
    const storage = storageAdapter();

    render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={vi.fn()}
        onClearTrainingData={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(within(dialog).getByRole("tab", { name: "OpenAI" }));
    expect(within(dialog).getByLabelText("Base URL")).toHaveValue(
      "https://api.openai.com/v1",
    );
    await user.type(within(dialog).getByLabelText("API Key"), "secret-openai");
    await user.type(within(dialog).getByLabelText("模型"), "gpt-test");
    await user.click(within(dialog).getByRole("button", { name: "保存设置" }));

    expect(storage.save).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedProvider: "openai",
        profiles: expect.objectContaining({
          openai: expect.objectContaining({
            apiKey: "secret-openai",
            model: "gpt-test",
          }),
        }),
      }),
    );
  });

  it("supports password visibility and validates real providers before testing", async () => {
    const user = userEvent.setup();
    const storage = storageAdapter();
    const fetcher = vi.fn();

    render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={fetcher}
        onClearTrainingData={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(within(dialog).getByRole("tab", { name: "DeepSeek" }));
    const keyInput = within(dialog).getByLabelText("API Key");
    expect(keyInput).toHaveAttribute("type", "password");
    expect(keyInput).toHaveAttribute("autocomplete", "new-password");
    expect(keyInput).toHaveAttribute("spellcheck", "false");
    expect(keyInput).toHaveAttribute("autocapitalize", "none");
    expect(keyInput).toHaveAttribute("autocorrect", "off");
    await user.click(within(dialog).getByRole("button", { name: "显示 API Key" }));
    expect(keyInput).toHaveAttribute("type", "text");

    expect(within(dialog).getByRole("button", { name: "测试连接" })).toBeDisabled();
    expect(within(dialog).getByText("请填写 API Key 和模型后测试连接")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["", "Base URL 不能为空"],
    ["not-a-url", "请输入有效的 Base URL"],
    ["ftp://api.example.com/v1", "Base URL 仅支持 HTTPS，或本机 HTTP"],
    ["http://api.example.com/v1", "Base URL 仅支持 HTTPS，或本机 HTTP"],
    ["https://10.0.0.1/v1", "Base URL 不能使用私网或元数据地址"],
  ])(
    "blocks save and test for invalid Base URL %s",
    async (baseUrl, expectedMessage) => {
      const user = userEvent.setup();
      const storage = storageAdapter();
      const fetcher = vi.fn();

      render(
        <ProviderSettingsModal
          open
          onOpenChange={vi.fn()}
          storage={storage}
          fetcher={fetcher}
          onClearTrainingData={vi.fn()}
        />,
      );

      const dialog = await screen.findByRole("dialog", { name: "本地设置" });
      await user.click(within(dialog).getByRole("tab", { name: "OpenAI" }));
      const urlInput = within(dialog).getByLabelText("Base URL");
      await user.clear(urlInput);
      if (baseUrl) {
        await user.type(urlInput, baseUrl);
      }
      await user.type(within(dialog).getByLabelText("API Key"), "test-key");
      await user.type(within(dialog).getByLabelText("模型"), "gpt-test");

      await user.click(within(dialog).getByRole("button", { name: "保存设置" }));
      expect(storage.save).not.toHaveBeenCalled();
      expect(within(dialog).getByText(expectedMessage)).toBeInTheDocument();
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Provider 配置有误",
      );

      await user.click(within(dialog).getByRole("button", { name: "测试连接" }));
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("allows empty Mock config to save and test", async () => {
    const user = userEvent.setup();
    const storage = storageAdapter();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, provider: "mock", model: "mock-v1" }),
      ),
    );

    render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={fetcher}
        onClearTrainingData={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(within(dialog).getByRole("button", { name: "保存设置" }));
    await user.click(within(dialog).getByRole("button", { name: "测试连接" }));

    expect(storage.save).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await within(dialog).findByText("连接成功")).toBeInTheDocument();
  });

  it("posts a connection test, shows progress and never prints the key", async () => {
    const user = userEvent.setup();
    let resolveTest!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveTest = resolve;
    });
    const fetcher = vi.fn(() => pending);

    render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storageAdapter()}
        fetcher={fetcher}
        onClearTrainingData={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(within(dialog).getByRole("tab", { name: "智谱" }));
    await user.type(within(dialog).getByLabelText("API Key"), "zhipu-secret");
    await user.type(within(dialog).getByLabelText("模型"), "glm-4");
    await user.click(within(dialog).getByRole("button", { name: "测试连接" }));

    expect(within(dialog).getByRole("button", { name: "正在测试" })).toBeDisabled();
    resolveTest(
      new Response(
        JSON.stringify({ ok: true, provider: "zhipu", model: "glm-4" }),
      ),
    );
    expect(await within(dialog).findByText("连接成功")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/providers/test",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(dialog).not.toHaveTextContent("zhipu-secret");
  });

  it("aborts an old provider test and ignores its late result after switching tabs", async () => {
    const user = userEvent.setup();
    const requests: Array<{
      resolve: (response: Response) => void;
      signal: AbortSignal;
    }> = [];
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          requests.push({ resolve, signal: init?.signal as AbortSignal });
        }),
    );

    render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storageAdapter()}
        fetcher={fetcher}
        onClearTrainingData={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(within(dialog).getByRole("tab", { name: "OpenAI" }));
    await user.type(within(dialog).getByLabelText("API Key"), "old-key");
    await user.type(within(dialog).getByLabelText("模型"), "old-model");
    await user.click(within(dialog).getByRole("button", { name: "测试连接" }));

    expect(requests).toHaveLength(1);
    await user.click(within(dialog).getByRole("tab", { name: "Mock" }));
    expect(requests[0].signal.aborted).toBe(true);

    requests[0].resolve(
      new Response(
        JSON.stringify({ ok: true, provider: "openai", model: "old-model" }),
      ),
    );
    await Promise.resolve();

    expect(within(dialog).queryByText("连接成功")).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("tab", { name: "Mock" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("aborts provider tests when the modal closes or unmounts", async () => {
    const user = userEvent.setup();
    let capturedSignal: AbortSignal | undefined;
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>(() => {
          capturedSignal = init?.signal as AbortSignal;
        }),
    );
    const view = render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storageAdapter()}
        fetcher={fetcher}
        onClearTrainingData={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(within(dialog).getByRole("button", { name: "测试连接" }));
    expect(capturedSignal?.aborted).toBe(false);

    view.rerender(
      <ProviderSettingsModal
        open={false}
        onOpenChange={vi.fn()}
        storage={storageAdapter()}
        fetcher={fetcher}
        onClearTrainingData={vi.fn()}
      />,
    );
    expect(capturedSignal?.aborted).toBe(true);

    view.unmount();
  });

  it("locks provider and training clear actions while pending", async () => {
    const user = userEvent.setup();
    const providerClear = deferred<void>();
    const trainingClear = deferred<void>();
    const storage = storageAdapter();
    storage.clear.mockImplementation(() => providerClear.promise);
    const onClearTrainingData = vi.fn(() => trainingClear.promise);

    render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={vi.fn()}
        onClearTrainingData={onClearTrainingData}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(
      within(dialog).getByRole("button", { name: "清除 Provider 设置" }),
    );
    const providerButton = within(dialog).getByRole("button", {
      name: "确认清除 Provider 设置",
    });
    await user.dblClick(providerButton);
    expect(storage.clear).toHaveBeenCalledOnce();
    expect(providerButton).toBeDisabled();
    expect(providerButton).toHaveAttribute("aria-busy", "true");
    providerClear.resolve();

    await user.click(
      await within(dialog).findByRole("button", { name: "清空训练数据" }),
    );
    const trainingButton = within(dialog).getByRole("button", {
      name: "确认清空训练数据",
    });
    await user.dblClick(trainingButton);
    expect(onClearTrainingData).toHaveBeenCalledOnce();
    expect(trainingButton).toBeDisabled();
    expect(trainingButton).toHaveAttribute("aria-busy", "true");
    trainingClear.resolve();
    expect(
      await within(dialog).findByText("训练数据已清空"),
    ).toBeInTheDocument();
  });

  it("keeps provider clear locked across close and reopen without leaking stale results", async () => {
    const user = userEvent.setup();
    const firstClear = deferred<void>();
    const storage = storageAdapter();
    storage.clear
      .mockImplementationOnce(() => firstClear.promise)
      .mockResolvedValueOnce(undefined);
    const view = render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={vi.fn()}
        onClearTrainingData={vi.fn()}
      />,
    );

    let dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(
      within(dialog).getByRole("button", { name: "清除 Provider 设置" }),
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "确认清除 Provider 设置",
      }),
    );
    expect(storage.clear).toHaveBeenCalledOnce();

    view.rerender(
      <ProviderSettingsModal
        open={false}
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={vi.fn()}
        onClearTrainingData={vi.fn()}
      />,
    );
    view.rerender(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={vi.fn()}
        onClearTrainingData={vi.fn()}
      />,
    );

    dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(
      within(dialog).getByRole("button", { name: "清除 Provider 设置" }),
    );
    const lockedButton = within(dialog).getByRole("button", {
      name: "正在清除 Provider 设置",
    });
    expect(lockedButton).toBeDisabled();
    await user.click(lockedButton);
    expect(storage.clear).toHaveBeenCalledOnce();

    firstClear.resolve();
    await waitFor(() => expect(lockedButton).toBeEnabled());
    expect(within(dialog).queryByText("Provider 设置已清除")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();

    await user.click(lockedButton);
    await waitFor(() => expect(storage.clear).toHaveBeenCalledTimes(2));
    expect(
      await within(dialog).findByText("Provider 设置已清除"),
    ).toBeInTheDocument();
  });

  it("keeps training clear locked across close and reopen without leaking stale results", async () => {
    const user = userEvent.setup();
    const firstClear = deferred<void>();
    const onClearTrainingData = vi
      .fn()
      .mockImplementationOnce(() => firstClear.promise)
      .mockResolvedValueOnce(undefined);
    const storage = storageAdapter();
    const view = render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={vi.fn()}
        onClearTrainingData={onClearTrainingData}
      />,
    );

    let dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(
      within(dialog).getByRole("button", { name: "清空训练数据" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "确认清空训练数据" }),
    );
    expect(onClearTrainingData).toHaveBeenCalledOnce();

    view.rerender(
      <ProviderSettingsModal
        open={false}
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={vi.fn()}
        onClearTrainingData={onClearTrainingData}
      />,
    );
    view.rerender(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={vi.fn()}
        onClearTrainingData={onClearTrainingData}
      />,
    );

    dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(
      within(dialog).getByRole("button", { name: "清空训练数据" }),
    );
    const lockedButton = within(dialog).getByRole("button", {
      name: "正在清空训练数据",
    });
    expect(lockedButton).toBeDisabled();
    await user.click(lockedButton);
    expect(onClearTrainingData).toHaveBeenCalledOnce();

    firstClear.resolve();
    await waitFor(() => expect(lockedButton).toBeEnabled());
    expect(within(dialog).queryByText("训练数据已清空")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();

    await user.click(lockedButton);
    await waitFor(() => expect(onClearTrainingData).toHaveBeenCalledTimes(2));
    expect(
      await within(dialog).findByText("训练数据已清空"),
    ).toBeInTheDocument();
  });

  it("implements an ARIA tabs keyboard model", async () => {
    const user = userEvent.setup();
    render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storageAdapter()}
        fetcher={vi.fn()}
        onClearTrainingData={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "本地设置" });
    const tabs = within(dialog).getAllByRole("tab");
    const panel = within(dialog).getByRole("tabpanel");

    for (const tab of tabs) {
      expect(tab).toHaveAttribute("id");
      expect(tab).toHaveAttribute("aria-controls", panel.id);
    }
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
    expect(panel).toHaveAttribute("aria-labelledby", tabs[0].id);
    expect(panel).toHaveAttribute("tabindex", "0");

    tabs[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(tabs[3]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(tabs[3]).toHaveFocus();
  });

  it("shows a sanitized connection error", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "连接失败" }), { status: 502 }),
    );

    render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storageAdapter()}
        fetcher={fetcher}
        onClearTrainingData={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(within(dialog).getByRole("tab", { name: "OpenAI" }));
    await user.type(within(dialog).getByLabelText("API Key"), "never-render-this");
    await user.type(within(dialog).getByLabelText("模型"), "gpt-test");
    await user.click(within(dialog).getByRole("button", { name: "测试连接" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("连接失败");
    expect(dialog).not.toHaveTextContent("never-render-this");
  });

  it("clears provider settings behind its own confirmation", async () => {
    const user = userEvent.setup();
    const storage = storageAdapter({
      ...DEFAULT_PROVIDER_SETTINGS,
      selectedProvider: "openai",
    });

    render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={vi.fn()}
        onClearTrainingData={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(within(dialog).getByRole("button", { name: "清除 Provider 设置" }));
    expect(storage.clear).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "确认清除 Provider 设置" }));

    expect(storage.clear).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole("tab", { name: "Mock" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("reports provider storage and training storage failures", async () => {
    const user = userEvent.setup();
    const storage = storageAdapter();
    storage.save.mockImplementationOnce(() => {
      throw new Error("quota with api-key");
    });
    const clearTraining = vi.fn().mockRejectedValue(new Error("database blocked"));

    render(
      <ProviderSettingsModal
        open
        onOpenChange={vi.fn()}
        storage={storage}
        fetcher={vi.fn()}
        onClearTrainingData={clearTraining}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "本地设置" });
    await user.click(within(dialog).getByRole("button", { name: "保存设置" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("无法保存 Provider 设置");

    await user.click(within(dialog).getByRole("button", { name: "清空训练数据" }));
    await user.click(within(dialog).getByRole("button", { name: "确认清空训练数据" }));
    await waitFor(() => expect(clearTraining).toHaveBeenCalledOnce());
    expect(within(dialog).getByRole("alert")).toHaveTextContent("无法清空训练数据");
  });
});
