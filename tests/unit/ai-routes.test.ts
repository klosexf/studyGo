import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as compareRewrite } from "@/app/api/ai/comparison/route";
import { POST as diagnoseDraft } from "@/app/api/ai/diagnosis/route";
import { POST as generateTopic } from "@/app/api/ai/topic/route";
import { POST as testProvider } from "@/app/api/providers/test/route";
import {
  diagnosisFixture,
  mockProviderConfig,
  trainingTopic,
} from "@/../tests/fixtures/training";

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI routes", () => {
  it("generates a topic with the Mock provider", async () => {
    const response = await generateTopic(
      jsonRequest("http://localhost/api/ai/topic", {
        provider: mockProviderConfig,
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
        recentTopicTags: [],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scenarioType: "life",
      difficulty: "medium",
    });
  });

  it("diagnoses a draft with the Mock provider", async () => {
    const response = await diagnoseDraft(
      jsonRequest("http://localhost/api/ai/diagnosis", {
        provider: mockProviderConfig,
        topic: trainingTopic,
        draftText: "我认为成长更重要，因为它能扩大未来选择。",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      coverageCount: 8,
      source: "mock",
    });
  });

  it("compares a rewrite with the Mock provider", async () => {
    const response = await compareRewrite(
      jsonRequest("http://localhost/api/ai/comparison", {
        provider: mockProviderConfig,
        topic: trainingTopic,
        draftText: "成长更好。",
        rewriteText:
          "我认为成长更重要，因为长期能力会扩大选择。例如，新项目能积累经验。",
        diagnosis: diagnosisFixture(),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "mock",
      rewriteScores: expect.any(Array),
    });
  });

  it("tests a Mock provider without network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await testProvider(
      jsonRequest("http://localhost/api/providers/test", mockProviderConfig),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      provider: "mock",
      model: "mock",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [generateTopic, "/api/ai/topic"],
    [diagnoseDraft, "/api/ai/diagnosis"],
    [compareRewrite, "/api/ai/comparison"],
    [testProvider, "/api/providers/test"],
  ] as const)("returns 400 for an invalid request", async (handler, path) => {
    const response = await handler(
      jsonRequest(`http://localhost${path}`, { provider: "bad" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        retryable: false,
      },
    });
  });

  it("maps provider errors to the public error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: { message: "secret upstream details" },
          }),
          { status: 429 },
        ),
      ),
    );
    const response = await generateTopic(
      jsonRequest("http://localhost/api/ai/topic", {
        provider: {
          provider: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "route-secret-key",
          model: "test-model",
        },
        scenarioType: "life",
        difficulty: "medium",
        trainingGoal: "argumentSufficiency",
        recentTopicTags: [],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({
      error: {
        code: "AI_RATE_LIMITED",
        message: expect.any(String),
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain("route-secret-key");
    expect(JSON.stringify(body)).not.toContain("secret upstream details");
  });

  it("sanitizes a non-JSON provider response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("upstream leaked key route-secret-key", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );
    const response = await testProvider(
      jsonRequest("http://localhost/api/providers/test", {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "route-secret-key",
        model: "test-model",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("AI_RESPONSE_INVALID");
    expect(JSON.stringify(body)).not.toContain("route-secret-key");
    expect(JSON.stringify(body)).not.toContain("upstream leaked");
  });

  it("sanitizes a failed repair response and user text", async () => {
    const userText =
      "这是不应出现在错误中的完整用户文本，包含敏感内容和特殊标记。";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "{bad json" } }],
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: `still bad ${userText} route-secret-key`,
                  },
                },
              ],
            }),
            { status: 200 },
          ),
        ),
    );
    const response = await diagnoseDraft(
      jsonRequest("http://localhost/api/ai/diagnosis", {
        provider: {
          provider: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "route-secret-key",
          model: "test-model",
        },
        topic: trainingTopic,
        draftText: userText,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("AI_RESPONSE_INVALID");
    expect(JSON.stringify(body)).not.toContain("route-secret-key");
    expect(JSON.stringify(body)).not.toContain(userText);
  });
});
