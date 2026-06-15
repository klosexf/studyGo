import { z } from "zod";

import type { ProviderConfig } from "@/features/training/schemas/requests";
import type {
  ProviderId,
} from "@/features/training/types";

export type ProviderField =
  | "baseUrl"
  | "apiKey"
  | "model";

export type ProviderValidationErrors = Partial<
  Record<ProviderField, string>
>;

export type ProviderConfigInput = {
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
};

const blockedHostnames = new Set([
  "metadata.google.internal",
  "metadata.google",
  "metadata.azure.internal",
]);
const loopbackHostnames = new Set(["localhost", "127.0.0.1", "::1"]);

function isBlockedLiteralIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some(
      (octet) =>
        !Number.isInteger(octet) || octet < 0 || octet > 255,
    )
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function validateClientBaseUrl(value: string) {
  if (!value.trim()) {
    return "Base URL 不能为空";
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "请输入有效的 Base URL";
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  const isLoopback = loopbackHostnames.has(hostname);

  if (
    blockedHostnames.has(hostname) ||
    (isBlockedLiteralIpv4(hostname) && !isLoopback) ||
    hostname === "::" ||
    /^f[cd][0-9a-f]{2}:/.test(hostname) ||
    /^fe[89ab][0-9a-f]:/.test(hostname)
  ) {
    return "Base URL 不能使用私网或元数据地址";
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return "Base URL 不能包含凭据、查询参数或片段";
  }

  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopback)
  ) {
    return "Base URL 仅支持 HTTPS，或本机 HTTP";
  }

  return null;
}

const mockConfigSchema = z.object({
  provider: z.literal("mock"),
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
});

const realConfigSchema = z
  .object({
    provider: z.enum(["openai", "deepseek", "zhipu"]),
    baseUrl: z.string(),
    apiKey: z.string().trim().min(1, "API Key 不能为空"),
    model: z.string().trim().min(1, "模型不能为空"),
  })
  .superRefine((config, context) => {
    const message = validateClientBaseUrl(config.baseUrl);
    if (message) {
      context.addIssue({
        code: "custom",
        path: ["baseUrl"],
        message,
      });
    }
  });

const clientProviderConfigSchema = z.discriminatedUnion("provider", [
  mockConfigSchema,
  realConfigSchema,
]);

export function validateClientProviderConfig(
  input: ProviderConfigInput,
):
  | { success: true; config: ProviderConfig }
  | { success: false; errors: ProviderValidationErrors } {
  const result = clientProviderConfigSchema.safeParse(input);
  if (result.success) {
    return { success: true, config: result.data };
  }

  const errors: ProviderValidationErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (
      (field === "baseUrl" ||
        field === "apiKey" ||
        field === "model") &&
      !errors[field]
    ) {
      errors[field] = issue.message;
    }
  }
  return { success: false, errors };
}
