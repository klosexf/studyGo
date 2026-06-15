import { describe, expect, it, vi } from "vitest";

import {
  AppClientError,
  createTrainingApi,
} from "@/features/training/services/training-api";
import {
  comparisonFixture,
  diagnosisFixture,
  mockProviderConfig,
  trainingTopic,
} from "@/../tests/fixtures/training";

describe("training API client", () => {
  it("posts provider-mapped requests and parses valid responses", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.provider).toEqual(mockProviderConfig);
      return Response.json(trainingTopic);
    });
    const api = createTrainingApi({ fetcher });

    await expect(
      api.generateTopic({
        provider: mockProviderConfig,
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
        recentTopicTags: [],
      }),
    ).resolves.toEqual(trainingTopic);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/ai/topic",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects successful responses that violate the response schema", async () => {
    const api = createTrainingApi({
      fetcher: vi.fn(async () => Response.json({ title: "" })),
    });

    await expect(
      api.generateTopic({
        provider: mockProviderConfig,
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
        recentTopicTags: [],
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: true,
      status: 502,
    });
  });

  it("normalizes non-2xx errors without exposing request credentials", async () => {
    const api = createTrainingApi({
      fetcher: vi.fn(async () =>
        Response.json(
          {
            error: {
              code: "PROVIDER_ERROR",
              message: "上游服务失败",
              retryable: true,
            },
          },
          { status: 502 },
        ),
      ),
    });

    const error = await api
      .diagnoseDraft({
        provider: {
          ...mockProviderConfig,
          provider: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "secret-key",
          model: "model",
        },
        topic: trainingTopic,
        draftText: "有效初稿",
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppClientError);
    expect(error).toMatchObject({
      code: "PROVIDER_ERROR",
      message: "上游服务失败",
      retryable: true,
      status: 502,
    });
    expect(JSON.stringify(error)).not.toContain("secret-key");
  });

  it("distinguishes aborts from network failures and forwards AbortSignal", async () => {
    const abortController = new AbortController();
    const abortingFetch = vi.fn(
      async (_url: string, init?: RequestInit): Promise<Response> => {
        expect(init?.signal).toBe(abortController.signal);
        throw new DOMException("cancelled", "AbortError");
      },
    );
    const api = createTrainingApi({ fetcher: abortingFetch });

    await expect(
      api.compareRewrite(
        {
          provider: mockProviderConfig,
          topic: trainingTopic,
          draftText: "初稿",
          rewriteText: "改写稿",
          diagnosis: diagnosisFixture(),
        },
        abortController.signal,
      ),
    ).rejects.toMatchObject({
      code: "REQUEST_ABORTED",
      retryable: true,
      status: 0,
    });

    const networkApi = createTrainingApi({
      fetcher: vi.fn(async () => {
        throw new TypeError("secret-key connection failed");
      }),
    });
    const networkError = await networkApi
      .compareRewrite({
        provider: mockProviderConfig,
        topic: trainingTopic,
        draftText: "初稿",
        rewriteText: "改写稿",
        diagnosis: diagnosisFixture(),
      })
      .catch((caught: unknown) => caught);
    expect(networkError).toMatchObject({
      code: "NETWORK_ERROR",
      retryable: true,
      status: 0,
    });
    expect(JSON.stringify(networkError)).not.toContain("secret-key");
  });

  it("parses diagnosis and comparison endpoint responses", async () => {
    const responses = [diagnosisFixture(), comparisonFixture()];
    const api = createTrainingApi({
      fetcher: vi.fn(async () => Response.json(responses.shift())),
    });

    await expect(
      api.diagnoseDraft({
        provider: mockProviderConfig,
        topic: trainingTopic,
        draftText: "初稿",
      }),
    ).resolves.toEqual(diagnosisFixture());
    await expect(
      api.compareRewrite({
        provider: mockProviderConfig,
        topic: trainingTopic,
        draftText: "初稿",
        rewriteText: "改写稿",
        diagnosis: diagnosisFixture(),
      }),
    ).resolves.toEqual(comparisonFixture());
  });

  it("tests a provider through the provider endpoint with schema validation and abort support", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      return Response.json({
        ok: true,
        provider: "mock",
        model: "",
      });
    });
    const api = createTrainingApi({ fetcher });

    await expect(
      api.testProvider(mockProviderConfig, controller.signal),
    ).resolves.toEqual({
      ok: true,
      provider: "mock",
      model: "",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/providers/test",
      expect.objectContaining({ method: "POST" }),
    );

    const invalidApi = createTrainingApi({
      fetcher: vi.fn(async () =>
        Response.json({ ok: true, provider: "unknown", model: "" }),
      ),
    });
    await expect(
      invalidApi.testProvider(mockProviderConfig),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
  });

  it("maps an abort during response JSON parsing to REQUEST_ABORTED", async () => {
    const controller = new AbortController();
    let rejectJson!: (error: unknown) => void;
    const response = {
      ok: true,
      status: 200,
      json: () =>
        new Promise<unknown>((_resolve, reject) => {
          rejectJson = reject;
        }),
    } as Response;
    const api = createTrainingApi({
      fetcher: vi.fn(async () => response),
    });

    const request = api.generateTopic(
      {
        provider: mockProviderConfig,
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
        recentTopicTags: [],
      },
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();
    rejectJson(new DOMException("cancelled", "AbortError"));

    await expect(request).rejects.toMatchObject({
      code: "REQUEST_ABORTED",
      retryable: true,
      status: 0,
    });
  });
});
