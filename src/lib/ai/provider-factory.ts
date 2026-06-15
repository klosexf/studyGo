import type { ProviderConfig } from "@/features/training/schemas/requests";
import { mockProvider } from "@/lib/ai/providers/mock-provider";
import { createOpenAICompatibleProvider } from "@/lib/ai/providers/openai-compatible";
import { createZhipuProvider } from "@/lib/ai/providers/zhipu";
import type { AIProvider } from "@/lib/ai/types";

export function createProvider(config: ProviderConfig): AIProvider {
  if (config.provider === "mock") {
    return mockProvider;
  }
  if (config.provider === "zhipu") {
    return createZhipuProvider({ ...config, provider: "zhipu" });
  }
  return createOpenAICompatibleProvider({
    ...config,
    provider: config.provider as "openai" | "deepseek",
  });
}
