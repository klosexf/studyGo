import {
  createChatCompletionsProvider,
  type ProviderResolver,
  type RealProviderConfig,
} from "@/lib/ai/providers/openai-compatible";

type ZhipuConfig = Omit<RealProviderConfig, "provider"> & {
  provider: "zhipu";
};
type FetchLike = typeof globalThis.fetch;

export function createZhipuProvider(
  config: ZhipuConfig,
  fetchImpl: FetchLike = globalThis.fetch,
  resolver?: ProviderResolver,
) {
  return createChatCompletionsProvider({ config, fetchImpl, resolver });
}
