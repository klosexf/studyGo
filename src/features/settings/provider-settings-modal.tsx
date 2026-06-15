"use client";

import { Eye, EyeOff } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  validateClientProviderConfig,
  type ProviderValidationErrors,
} from "@/features/settings/provider-config-validation";
import {
  DEFAULT_PROVIDER_SETTINGS,
  clearProviderSettings,
  loadProviderSettings,
  saveProviderSettings,
  type ProviderProfile,
  type ProviderSettings,
} from "@/features/settings/provider-settings-store";
import {
  PROVIDER_IDS,
  type ProviderId,
} from "@/features/training/types";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ClearOperation = {
  generation: number;
  token: number;
};

export type ProviderSettingsAdapter = {
  load: () => ProviderSettings;
  save: (settings: ProviderSettings) => void;
  clear: () => void | Promise<void>;
};

const browserStorageAdapter: ProviderSettingsAdapter = {
  load: () => loadProviderSettings(),
  save: (settings) => saveProviderSettings(settings),
  clear: () => clearProviderSettings(),
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  mock: "Mock",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  zhipu: "智谱",
};

export type ProviderSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storage?: ProviderSettingsAdapter;
  fetcher?: Fetcher;
  onClearTrainingData: () => Promise<void>;
};

export function ProviderSettingsModal({
  open,
  onOpenChange,
  storage = browserStorageAdapter,
  fetcher = fetch,
  onClearTrainingData,
}: ProviderSettingsModalProps) {
  const [settings, setSettings] = useState<ProviderSettings>(
    DEFAULT_PROVIDER_SETTINGS,
  );
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] =
    useState<ProviderValidationErrors>({});
  const [confirmProviderClear, setConfirmProviderClear] = useState(false);
  const [confirmTrainingClear, setConfirmTrainingClear] = useState(false);
  const [providerClearPending, setProviderClearPending] = useState(false);
  const [trainingClearPending, setTrainingClearPending] = useState(false);
  const tabsId = useId();
  const panelId = `${tabsId}-panel`;
  const mountedRef = useRef(false);
  const openRef = useRef(open);
  const providerRef = useRef(settings.selectedProvider);
  const testRequestIdRef = useRef(0);
  const testControllerRef = useRef<AbortController | null>(null);
  const clearTokenRef = useRef(0);
  const modalGenerationRef = useRef(0);
  const providerClearInFlightRef = useRef<ClearOperation | null>(null);
  const trainingClearInFlightRef = useRef<ClearOperation | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      testRequestIdRef.current += 1;
      testControllerRef.current?.abort();
      testControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    openRef.current = open;
    if (!open) {
      modalGenerationRef.current += 1;
      testRequestIdRef.current += 1;
      testControllerRef.current?.abort();
      testControllerRef.current = null;
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (!active) {
        return;
      }
      try {
        setSettings(storage.load());
        setError(null);
      } catch {
        setSettings(DEFAULT_PROVIDER_SETTINGS);
        setError("无法读取 Provider 设置");
      }
      setStatus(null);
      setFieldErrors({});
      setShowKey(false);
      setTesting(false);
      setConfirmProviderClear(false);
      setConfirmTrainingClear(false);
      setProviderClearPending(providerClearInFlightRef.current !== null);
      setTrainingClearPending(trainingClearInFlightRef.current !== null);
    });
    return () => {
      active = false;
    };
  }, [open, storage]);

  const provider = settings.selectedProvider;
  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  const profile = settings.profiles[provider];
  const validation = validateClientProviderConfig({
    provider,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
  });
  const canTest = validation.success;

  function selectProvider(nextProvider: ProviderId) {
    testRequestIdRef.current += 1;
    testControllerRef.current?.abort();
    testControllerRef.current = null;
    providerRef.current = nextProvider;
    setTesting(false);
    setSettings((current) => ({
      ...current,
      selectedProvider: nextProvider,
    }));
    setShowKey(false);
    setStatus(null);
    setError(null);
    setFieldErrors({});
  }

  function updateProfile(patch: Partial<ProviderProfile>) {
    setSettings((current) => ({
      ...current,
      profiles: {
        ...current.profiles,
        [provider]: {
          ...current.profiles[provider],
          ...patch,
        },
      },
    }));
    setStatus(null);
    setError(null);
    setFieldErrors({});
  }

  function handleSave() {
    const result = validateClientProviderConfig({
      provider,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      model: profile.model,
    });
    if (!result.success) {
      setFieldErrors(result.errors);
      setError("Provider 配置有误，请检查标记字段");
      setStatus(null);
      return;
    }
    try {
      storage.save(settings);
      setStatus("设置已保存");
      setError(null);
      setFieldErrors({});
    } catch {
      setError("无法保存 Provider 设置");
      setStatus(null);
    }
  }

  async function handleTest() {
    if (testing) {
      return;
    }
    const result = validateClientProviderConfig({
      provider,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      model: profile.model,
    });
    if (!result.success) {
      setFieldErrors(result.errors);
      setError("Provider 配置有误，请检查标记字段");
      setStatus(null);
      return;
    }
    const requestId = ++testRequestIdRef.current;
    const requestProvider = provider;
    testControllerRef.current?.abort();
    const controller = new AbortController();
    testControllerRef.current = controller;
    setTesting(true);
    setStatus(null);
    setError(null);
    try {
      const response = await fetcher("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...result.config,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("provider test failed");
      }
      const responseBody = (await response.json()) as { ok?: boolean };
      if (!responseBody.ok) {
        throw new Error("provider test failed");
      }
      if (
        !mountedRef.current ||
        !openRef.current ||
        requestId !== testRequestIdRef.current ||
        requestProvider !== providerRef.current
      ) {
        return;
      }
      const testedAt = new Date().toISOString();
      setSettings((current) => ({
        ...current,
        profiles: {
          ...current.profiles,
          [requestProvider]: {
            ...current.profiles[requestProvider],
            lastTest: { ok: true, testedAt },
          },
        },
      }));
      setFieldErrors({});
      setStatus("连接成功");
    } catch {
      if (
        mountedRef.current &&
        openRef.current &&
        requestId === testRequestIdRef.current &&
        requestProvider === providerRef.current &&
        !controller.signal.aborted
      ) {
        setError("连接失败，请检查配置后重试");
      }
    } finally {
      if (
        mountedRef.current &&
        openRef.current &&
        requestId === testRequestIdRef.current &&
        requestProvider === providerRef.current
      ) {
        setTesting(false);
        testControllerRef.current = null;
      }
    }
  }

  async function handleProviderClear() {
    if (providerClearInFlightRef.current) {
      return;
    }
    const operation = {
      generation: modalGenerationRef.current,
      token: ++clearTokenRef.current,
    };
    providerClearInFlightRef.current = operation;
    setProviderClearPending(true);
    try {
      await storage.clear();
      if (
        !mountedRef.current ||
        !openRef.current ||
        operation.generation !== modalGenerationRef.current
      ) {
        return;
      }
      setSettings(DEFAULT_PROVIDER_SETTINGS);
      setConfirmProviderClear(false);
      setStatus("Provider 设置已清除");
      setError(null);
    } catch {
      if (
        mountedRef.current &&
        openRef.current &&
        operation.generation === modalGenerationRef.current
      ) {
        setError("无法清除 Provider 设置");
      }
    } finally {
      if (providerClearInFlightRef.current?.token === operation.token) {
        providerClearInFlightRef.current = null;
        if (mountedRef.current) {
          setProviderClearPending(false);
        }
      }
    }
  }

  async function handleTrainingClear() {
    if (trainingClearInFlightRef.current) {
      return;
    }
    const operation = {
      generation: modalGenerationRef.current,
      token: ++clearTokenRef.current,
    };
    trainingClearInFlightRef.current = operation;
    setTrainingClearPending(true);
    try {
      await onClearTrainingData();
      if (
        !mountedRef.current ||
        !openRef.current ||
        operation.generation !== modalGenerationRef.current
      ) {
        return;
      }
      setConfirmTrainingClear(false);
      setStatus("训练数据已清空");
      setError(null);
    } catch {
      if (
        mountedRef.current &&
        openRef.current &&
        operation.generation === modalGenerationRef.current
      ) {
        setError("无法清空训练数据");
      }
    } finally {
      if (trainingClearInFlightRef.current?.token === operation.token) {
        trainingClearInFlightRef.current = null;
        if (mountedRef.current) {
          setTrainingClearPending(false);
        }
      }
    }
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % PROVIDER_IDS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + PROVIDER_IDS.length) % PROVIDER_IDS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = PROVIDER_IDS.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    const nextProvider = PROVIDER_IDS[nextIndex];
    selectProvider(nextProvider);
    document.getElementById(`${tabsId}-${nextProvider}`)?.focus();
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="本地设置"
      description="配置 AI Provider。API Key 仅保存在当前浏览器。"
    >
      <div className="provider-tabs" role="tablist" aria-label="AI Provider">
        {PROVIDER_IDS.map((id, index) => (
          <button
            key={id}
            id={`${tabsId}-${id}`}
            type="button"
            role="tab"
            aria-controls={panelId}
            aria-selected={provider === id}
            tabIndex={provider === id ? 0 : -1}
            onClick={() => selectProvider(id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {PROVIDER_LABELS[id]}
          </button>
        ))}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${provider}`}
        tabIndex={0}
        className="settings-form"
      >
        {provider === "mock" ? (
          <p className="settings-note">
            Mock 无需 API Key，可离线完成完整训练闭环。
          </p>
        ) : (
          <>
            <label className="field">
              <span>Base URL</span>
              <input
                aria-invalid={Boolean(fieldErrors.baseUrl)}
                aria-describedby={
                  fieldErrors.baseUrl ? "base-url-error" : undefined
                }
                value={profile.baseUrl}
                onChange={(event) =>
                  updateProfile({ baseUrl: event.target.value })
                }
              />
              {fieldErrors.baseUrl ? (
                <small id="base-url-error" className="field-error">
                  {fieldErrors.baseUrl}
                </small>
              ) : null}
            </label>
            <label className="field">
              <span>API Key</span>
              <span className="secret-field">
                <input
                  aria-label="API Key"
                  aria-invalid={Boolean(fieldErrors.apiKey)}
                  aria-describedby={
                    fieldErrors.apiKey ? "api-key-error" : undefined
                  }
                  type={showKey ? "text" : "password"}
                  value={profile.apiKey}
                  autoComplete="new-password"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) =>
                    updateProfile({ apiKey: event.target.value })
                  }
                />
                <button
                  type="button"
                  aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
                  onClick={() => setShowKey((visible) => !visible)}
                >
                  {showKey ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </button>
              </span>
              {fieldErrors.apiKey ? (
                <small id="api-key-error" className="field-error">
                  {fieldErrors.apiKey}
                </small>
              ) : null}
            </label>
            <label className="field">
              <span>模型</span>
              <input
                aria-invalid={Boolean(fieldErrors.model)}
                aria-describedby={
                  fieldErrors.model ? "model-error" : undefined
                }
                value={profile.model}
                onChange={(event) =>
                  updateProfile({ model: event.target.value })
                }
              />
              {fieldErrors.model ? (
                <small id="model-error" className="field-error">
                  {fieldErrors.model}
                </small>
              ) : null}
            </label>
          </>
        )}

        {provider !== "mock" && !canTest ? (
          <p className="form-hint">请填写 API Key 和模型后测试连接</p>
        ) : null}
        {error ? <p role="alert" className="form-error">{error}</p> : null}
        {status ? <p role="status" className="form-success">{status}</p> : null}

        <div className="settings-actions">
          <Button variant="primary" onClick={handleSave}>
            保存设置
          </Button>
          <Button
            variant="lavender"
            disabled={!canTest || testing}
            onClick={handleTest}
          >
            {testing ? "正在测试" : "测试连接"}
          </Button>
        </div>
      </div>

      <section className="danger-zone" aria-label="数据管理">
        <h3>数据管理</h3>
        <p>Provider 设置与训练数据互相独立，清除操作不可撤销。</p>
        <div className="danger-zone__actions">
          {confirmProviderClear ? (
            <Button
              variant="danger"
              disabled={providerClearPending}
              aria-busy={providerClearPending}
              onClick={handleProviderClear}
            >
              {providerClearPending
                ? "正在清除 Provider 设置"
                : "确认清除 Provider 设置"}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setConfirmProviderClear(true)}
            >
              清除 Provider 设置
            </Button>
          )}
          {confirmTrainingClear ? (
            <Button
              variant="danger"
              disabled={trainingClearPending}
              aria-busy={trainingClearPending}
              onClick={handleTrainingClear}
            >
              {trainingClearPending
                ? "正在清空训练数据"
                : "确认清空训练数据"}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setConfirmTrainingClear(true)}
            >
              清空训练数据
            </Button>
          )}
        </div>
      </section>
    </Modal>
  );
}
