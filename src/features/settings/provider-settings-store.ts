import { z } from "zod";

import {
  PROVIDER_IDS,
  type ProviderId,
} from "@/features/training/types";

export const CURRENT_KEY = "logic-trainer.settings.v1";
export const LEGACY_KEYS = [
  "logic-trainer.settings",
  "logic-expression-training.provider-settings",
] as const;
export const PROVIDER_SETTINGS_STORAGE_KEY = CURRENT_KEY;

const lastTestSchema = z.object({
  ok: z.boolean(),
  testedAt: z.iso.datetime(),
  message: z.string().trim().min(1).optional(),
});

const providerProfileSchema = z.object({
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
  lastTest: lastTestSchema.nullable(),
});

const providerSettingsSchema = z.object({
  selectedProvider: z.enum(PROVIDER_IDS),
  profiles: z.object({
    mock: providerProfileSchema,
    openai: providerProfileSchema,
    deepseek: providerProfileSchema,
    zhipu: providerProfileSchema,
  }),
});

const providerSettingsEnvelopeSchema = z.object({
  version: z.literal(1),
  settings: providerSettingsSchema,
});

export type ProviderProfile = z.infer<typeof providerProfileSchema>;
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;
type ProviderSettingsEnvelope = z.infer<
  typeof providerSettingsEnvelopeSchema
>;

export class ProviderSettingsStorageError extends Error {
  constructor(operation: "save" | "clear") {
    super(`Unable to ${operation} provider settings`);
    this.name = "ProviderSettingsStorageError";
  }
}

const defaultProfiles: Record<ProviderId, ProviderProfile> = {
  mock: {
    baseUrl: "",
    apiKey: "",
    model: "",
    lastTest: null,
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "",
    lastTest: null,
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    apiKey: "",
    model: "",
    lastTest: null,
  },
  zhipu: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "",
    model: "",
    lastTest: null,
  },
};

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  selectedProvider: "mock",
  profiles: defaultProfiles,
};

function resolveStorageForLoad(storage?: Storage): Storage | null {
  if (storage) {
    return storage;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveStorageForMutation(
  operation: "save" | "clear",
  storage?: Storage,
): Storage | null {
  if (storage) {
    return storage;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    throw new ProviderSettingsStorageError(operation);
  }
}

function defaultSettings(): ProviderSettings {
  return providerSettingsSchema.parse(DEFAULT_PROVIDER_SETTINGS);
}

export function loadProviderSettings(
  storage?: Storage,
): ProviderSettings {
  const target = resolveStorageForLoad(storage);
  if (!target) {
    return defaultSettings();
  }

  let currentValue: string | null;
  try {
    currentValue = target.getItem(CURRENT_KEY);
  } catch {
    return defaultSettings();
  }

  if (currentValue) {
    const parsed = parseStoredSettings(currentValue);
    if (!parsed) {
      return defaultSettings();
    }
    if (parsed.needsMigration) {
      persistEnvelope(target, parsed.settings);
    }
    return parsed.settings;
  }

  for (const legacyKey of LEGACY_KEYS) {
    let legacyValue: string | null;
    try {
      legacyValue = target.getItem(legacyKey);
    } catch {
      return defaultSettings();
    }
    if (!legacyValue) {
      continue;
    }
    const parsed = parseStoredSettings(legacyValue);
    if (!parsed) {
      continue;
    }
    persistEnvelope(target, parsed.settings);
    removeStoredKey(target, legacyKey);
    return parsed.settings;
  }

  return defaultSettings();
}

export function saveProviderSettings(
  settings: ProviderSettings,
  storage?: Storage,
) {
  const target = resolveStorageForMutation("save", storage);
  if (!target) {
    return;
  }

  const validated = providerSettingsSchema.parse(settings);
  persistEnvelope(target, validated);
}

export function clearProviderSettings(storage?: Storage) {
  const target = resolveStorageForMutation("clear", storage);
  if (!target) {
    return;
  }

  let failed = false;
  for (const key of [CURRENT_KEY, ...LEGACY_KEYS]) {
    try {
      target.removeItem(key);
    } catch {
      failed = true;
    }
  }
  if (failed) {
    throw new ProviderSettingsStorageError("clear");
  }
}

function parseStoredSettings(serialized: string): {
  settings: ProviderSettings;
  needsMigration: boolean;
} | null {
  try {
    const value: unknown = JSON.parse(serialized);
    const envelope = providerSettingsEnvelopeSchema.safeParse(value);
    if (envelope.success) {
      return {
        settings: envelope.data.settings,
        needsMigration: false,
      };
    }
    const legacy = providerSettingsSchema.safeParse(value);
    return legacy.success
      ? { settings: legacy.data, needsMigration: true }
      : null;
  } catch {
    return null;
  }
}

function persistEnvelope(
  storage: Storage,
  settings: ProviderSettings,
) {
  const envelope: ProviderSettingsEnvelope = {
    version: 1,
    settings,
  };
  try {
    storage.setItem(CURRENT_KEY, JSON.stringify(envelope));
  } catch {
    throw new ProviderSettingsStorageError("save");
  }
}

function removeStoredKey(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    throw new ProviderSettingsStorageError("clear");
  }
}
