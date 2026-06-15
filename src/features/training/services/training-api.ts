import { z } from "zod";

import { rewriteComparisonSchema } from "@/features/training/schemas/comparison";
import { draftDiagnosisSchema } from "@/features/training/schemas/diagnosis";
import type {
  ComparisonRequest,
  DiagnosisRequest,
  ProviderConfig,
  TopicRequest,
} from "@/features/training/schemas/requests";
import { trainingTopicSchema } from "@/features/training/schemas/topic";
import type {
  DraftDiagnosis,
  RewriteComparison,
  TrainingTopic,
} from "@/features/training/types";
import type { ConnectionTestResult } from "@/lib/ai/types";

const publicErrorSchema = z.object({
  error: z.object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    retryable: z.boolean(),
  }),
});

const connectionTestResultSchema = z.object({
  ok: z.literal(true),
  provider: z.enum(["mock", "openai", "deepseek", "zhipu"]),
  model: z.string(),
});

export class AppClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(options: {
    code: string;
    message: string;
    retryable: boolean;
    status: number;
  }) {
    super(options.message);
    this.name = "AppClientError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      status: this.status,
    };
  }
}

export interface TrainingApi {
  generateTopic(
    request: TopicRequest,
    signal?: AbortSignal,
  ): Promise<TrainingTopic>;
  diagnoseDraft(
    request: DiagnosisRequest,
    signal?: AbortSignal,
  ): Promise<DraftDiagnosis>;
  compareRewrite(
    request: ComparisonRequest,
    signal?: AbortSignal,
  ): Promise<RewriteComparison>;
  testProvider(
    provider: ProviderConfig,
    signal?: AbortSignal,
  ): Promise<ConnectionTestResult>;
}

type Fetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export function createTrainingApi(options: {
  fetcher?: Fetcher;
} = {}): TrainingApi {
  const fetcher = options.fetcher ?? fetch;

  return {
    generateTopic: (request, signal) =>
      post(
        fetcher,
        "/api/ai/topic",
        request,
        trainingTopicSchema,
        signal,
      ),
    diagnoseDraft: (request, signal) =>
      post(
        fetcher,
        "/api/ai/diagnosis",
        request,
        draftDiagnosisSchema,
        signal,
      ),
    compareRewrite: (request, signal) =>
      post(
        fetcher,
        "/api/ai/comparison",
        request,
        rewriteComparisonSchema,
        signal,
      ),
    testProvider: (provider, signal) =>
      post(
        fetcher,
        "/api/providers/test",
        provider,
        connectionTestResultSchema,
        signal,
      ),
  };
}

async function post<T>(
  fetcher: Fetcher,
  endpoint: string,
  body: unknown,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new AppClientError({
        code: "REQUEST_ABORTED",
        message: "请求已取消。",
        retryable: true,
        status: 0,
      });
    }
    throw new AppClientError({
      code: "NETWORK_ERROR",
      message: "网络连接失败，请检查网络后重试。",
      retryable: true,
      status: 0,
    });
  }

  const payload = await readJson(response, signal);
  if (!response.ok) {
    const parsed = publicErrorSchema.safeParse(payload);
    throw new AppClientError({
      code: parsed.success ? parsed.data.error.code : "HTTP_ERROR",
      message: parsed.success
        ? parsed.data.error.message
        : "服务请求失败，请稍后重试。",
      retryable: parsed.success
        ? parsed.data.error.retryable
        : response.status >= 500,
      status: response.status,
    });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AppClientError({
      code: "INVALID_RESPONSE",
      message: "服务返回了无法识别的数据，请重试。",
      retryable: true,
      status: 502,
    });
  }
  return parsed.data;
}

async function readJson(
  response: Response,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new AppClientError({
        code: "REQUEST_ABORTED",
        message: "请求已取消。",
        retryable: true,
        status: 0,
      });
    }
    if (response.ok) {
      throw new AppClientError({
        code: "INVALID_RESPONSE",
        message: "服务返回了无法识别的数据，请重试。",
        retryable: true,
        status: 502,
      });
    }
    return null;
  }
}
