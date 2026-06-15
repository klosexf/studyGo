import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  CURRENT_KEY,
  DEFAULT_PROVIDER_SETTINGS,
  LEGACY_KEYS,
  ProviderSettingsStorageError,
  PROVIDER_SETTINGS_STORAGE_KEY,
  clearProviderSettings,
  loadProviderSettings,
  saveProviderSettings,
  type ProviderSettings,
} from "@/features/settings/provider-settings-store";

describe("provider settings storage", () => {
  let storage: Map<string, string>;
  let injectedStorage: Storage;

  beforeEach(() => {
    storage = new Map<string, string>();
    injectedStorage = {
      get length() {
        return storage.size;
      },
      clear: () => storage.clear(),
      getItem: (key) => storage.get(key) ?? null,
      key: (index) => [...storage.keys()][index] ?? null,
      removeItem: (key) => {
        storage.delete(key);
      },
      setItem: (key, value) => {
        storage.set(key, value);
      },
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to mock with empty credentials and provider defaults", () => {
    const settings = loadProviderSettings(injectedStorage);

    expect(settings).toEqual(DEFAULT_PROVIDER_SETTINGS);
    expect(settings.selectedProvider).toBe("mock");
    expect(settings.profiles.mock.apiKey).toBe("");
    expect(settings.profiles.openai.baseUrl).toBe(
      "https://api.openai.com/v1",
    );
    expect(settings.profiles.deepseek.baseUrl).toBe(
      "https://api.deepseek.com",
    );
    expect(settings.profiles.zhipu.baseUrl).toBe(
      "https://open.bigmodel.cn/api/paas/v4",
    );
  });

  it("preserves a separate profile for all three real providers", () => {
    const settings: ProviderSettings = {
      ...DEFAULT_PROVIDER_SETTINGS,
      selectedProvider: "zhipu",
      profiles: {
        ...DEFAULT_PROVIDER_SETTINGS.profiles,
        openai: {
          baseUrl: "https://openai.example/v1",
          apiKey: "openai-secret",
          model: "gpt-test",
          lastTest: null,
        },
        deepseek: {
          baseUrl: "https://deepseek.example",
          apiKey: "deepseek-secret",
          model: "deepseek-test",
          lastTest: {
            ok: true,
            testedAt: "2026-06-08T01:00:00.000Z",
          },
        },
        zhipu: {
          baseUrl: "https://zhipu.example/v4",
          apiKey: "zhipu-secret",
          model: "glm-test",
          lastTest: {
            ok: false,
            testedAt: "2026-06-08T02:00:00.000Z",
            message: "连接失败",
          },
        },
      },
    };

    saveProviderSettings(settings, injectedStorage);

    expect(loadProviderSettings(injectedStorage)).toEqual(settings);
    expect(JSON.parse(injectedStorage.getItem(CURRENT_KEY)!)).toEqual({
      version: 1,
      settings,
    });
  });

  it("migrates the current unversioned settings shape to the v1 envelope", () => {
    const legacySettings: ProviderSettings = {
      ...DEFAULT_PROVIDER_SETTINGS,
      selectedProvider: "deepseek",
      profiles: {
        ...DEFAULT_PROVIDER_SETTINGS.profiles,
        deepseek: {
          ...DEFAULT_PROVIDER_SETTINGS.profiles.deepseek,
          apiKey: "legacy-secret",
          model: "deepseek-chat",
        },
      },
    };
    injectedStorage.setItem(CURRENT_KEY, JSON.stringify(legacySettings));

    expect(loadProviderSettings(injectedStorage)).toEqual(legacySettings);
    expect(JSON.parse(injectedStorage.getItem(CURRENT_KEY)!)).toEqual({
      version: 1,
      settings: legacySettings,
    });
  });

  it("migrates a legacy key and removes the old credential copy", () => {
    const legacySettings: ProviderSettings = {
      ...DEFAULT_PROVIDER_SETTINGS,
      selectedProvider: "openai",
    };
    injectedStorage.setItem(
      LEGACY_KEYS[0],
      JSON.stringify(legacySettings),
    );

    expect(loadProviderSettings(injectedStorage)).toEqual(legacySettings);
    expect(injectedStorage.getItem(LEGACY_KEYS[0])).toBeNull();
    expect(JSON.parse(injectedStorage.getItem(CURRENT_KEY)!)).toEqual({
      version: 1,
      settings: legacySettings,
    });
  });

  it.each([
    "{broken-json",
    JSON.stringify({ selectedProvider: "unknown", profiles: {} }),
    JSON.stringify({
      version: 2,
      settings: DEFAULT_PROVIDER_SETTINGS,
    }),
    JSON.stringify({
      ...DEFAULT_PROVIDER_SETTINGS,
      profiles: {
        ...DEFAULT_PROVIDER_SETTINGS.profiles,
        openai: {
          ...DEFAULT_PROVIDER_SETTINGS.profiles.openai,
          apiKey: 42,
        },
      },
    }),
  ])("falls back to defaults for damaged or invalid stored data", (value) => {
    injectedStorage.setItem(PROVIDER_SETTINGS_STORAGE_KEY, value);

    expect(loadProviderSettings(injectedStorage)).toEqual(
      DEFAULT_PROVIDER_SETTINGS,
    );
  });

  it("clears saved settings", () => {
    saveProviderSettings(
      {
        ...DEFAULT_PROVIDER_SETTINGS,
        selectedProvider: "openai",
      },
      injectedStorage,
    );
    for (const key of LEGACY_KEYS) {
      injectedStorage.setItem(key, "legacy-api-key");
    }

    clearProviderSettings(injectedStorage);

    expect(
      injectedStorage.getItem(PROVIDER_SETTINGS_STORAGE_KEY),
    ).toBeNull();
    for (const key of LEGACY_KEYS) {
      expect(injectedStorage.getItem(key)).toBeNull();
    }
    expect(loadProviderSettings(injectedStorage)).toEqual(
      DEFAULT_PROVIDER_SETTINGS,
    );
  });

  it("is safe when window is unavailable during SSR", () => {
    vi.stubGlobal("window", undefined);

    expect(loadProviderSettings()).toEqual(DEFAULT_PROVIDER_SETTINGS);
    expect(() => saveProviderSettings(DEFAULT_PROVIDER_SETTINGS)).not.toThrow();
    expect(() => clearProviderSettings()).not.toThrow();
  });

  it("supports injected storage without reading browser localStorage", () => {
    saveProviderSettings(
      { ...DEFAULT_PROVIDER_SETTINGS, selectedProvider: "deepseek" },
      injectedStorage,
    );

    expect(loadProviderSettings(injectedStorage).selectedProvider).toBe(
      "deepseek",
    );
  });

  it("returns defaults when the localStorage getter or getItem fails", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("security error");
      },
    });
    expect(loadProviderSettings()).toEqual(DEFAULT_PROVIDER_SETTINGS);

    const failingStorage = {
      ...injectedStorage,
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadProviderSettings(failingStorage)).toEqual(
      DEFAULT_PROVIDER_SETTINGS,
    );
  });

  it("throws a sanitized custom error when saving fails", () => {
    const secret = "must-not-appear";
    const failingStorage = {
      ...injectedStorage,
      setItem: () => {
        throw new Error(`quota ${secret}`);
      },
    };

    expect(() =>
      saveProviderSettings(
        {
          ...DEFAULT_PROVIDER_SETTINGS,
          profiles: {
            ...DEFAULT_PROVIDER_SETTINGS.profiles,
            openai: {
              ...DEFAULT_PROVIDER_SETTINGS.profiles.openai,
              apiKey: secret,
            },
          },
        },
        failingStorage,
      ),
    ).toThrow(ProviderSettingsStorageError);

    try {
      saveProviderSettings(DEFAULT_PROVIDER_SETTINGS, failingStorage);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain("quota");
    }
  });

  it("throws a sanitized custom error when clearing any key fails", () => {
    const failingStorage = {
      ...injectedStorage,
      removeItem: () => {
        throw new Error("legacy-api-key");
      },
    };

    expect(() => clearProviderSettings(failingStorage)).toThrow(
      ProviderSettingsStorageError,
    );
    try {
      clearProviderSettings(failingStorage);
    } catch (error) {
      expect(String(error)).not.toContain("legacy-api-key");
    }
  });
});
