# Structured Coaching Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single rewrite stage with a structured coaching flow where AI plans 1-3 targeted coaching rounds, users answer in a chat-style UI, then write their own final rewrite before result review.

**Architecture:** Keep the existing `React UI → training-api → Route Handler → Provider Adapter` chain. Add coaching schemas and provider methods beside the existing diagnosis/comparison contracts, then extend the Zustand state machine and IndexedDB record validation to preserve coaching rounds and final rewrite data. UI must reuse the current AppShell, Card, Button, training progress, insights rail, color tokens, spacing, and typography; only add narrow chat-flow CSS for message bubbles and the fixed composer.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zustand, Dexie/IndexedDB, Zod, Vitest, Playwright.

---

## Scope And Boundaries

**Risk level:** L3. This changes public AI contracts, prompts, training state, persisted records, and key training UI.

**Non-goals:**
- No free-form chat mode.
- No complete model-written final answer.
- No Provider URL or API Key behavior changes.
- No new design system or new visual theme.
- No Dexie store/index version change unless a failing repository test proves one is required. JSON payload shape changes are validated by Zod in `training-repository.ts`.

**Primary verification:**
- Run focused Vitest files after each task.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Run `pnpm test:e2e` after the UI flow is complete.
- Launch the app and manually verify desktop plus affected mobile viewport because this is a UI flow change.

## File Map

**Create:**
- `src/features/training/schemas/coaching.ts`: coaching round plan, answer feedback, and coaching summary schemas.
- `src/lib/ai/prompts/coaching.ts`: prompt builders for planning/feedback and format descriptions.
- `src/app/api/ai/coaching/route.ts`: route for next coaching feedback.
- `src/features/training/components/coaching-view.tsx`: chat-style coaching stage.
- `src/features/training/components/final-rewrite-view.tsx`: final rewrite stage.

**Modify:**
- `src/features/training/types.ts`: add `coaching`, `finalRewrite` stages and coaching types.
- `src/features/training/state-machine.ts`: legal transitions.
- `src/features/training/schemas/diagnosis.ts`: add planned coaching rounds to diagnosis output.
- `src/features/training/schemas/comparison.ts`: rename semantic use from rewrite to final rewrite without breaking deterministic aggregate logic.
- `src/features/training/schemas/requests.ts`: add coaching request and use `finalRewriteText` for comparison request.
- `src/features/training/services/training-api.ts`: add `requestCoachingFeedback` and post to `/api/ai/coaching`.
- `src/lib/ai/types.ts`: add provider method and input types.
- `src/lib/ai/providers/mock-provider.ts`: deterministic 1-3 coaching plan and feedback.
- `src/lib/ai/providers/openai-compatible.ts`: call coaching prompt, validate Zod, keep one JSON repair retry.
- `src/app/api/ai/diagnosis/route.ts`: unchanged route path, but returns richer diagnosis schema.
- `src/app/api/ai/comparison/route.ts`: compare draft with final rewrite.
- `src/lib/storage/training-repository.ts`: validate new session/record shapes.
- `src/features/training/store/training-store.ts`: add coaching/final rewrite actions, loading operations, cancellation and stale response protection.
- `src/features/training/components/training-workspace.tsx`: render new stages and convert result records.
- `src/features/training/components/stage-tabs.tsx`: 7-step semantic progress list.
- `src/features/training/components/result-view.tsx`: show final rewrite and coaching history.
- `src/app/globals.css`: add chat-flow classes using existing tokens.
- `tests/fixtures/training.ts`: coaching fixtures.
- Unit tests under `tests/unit/`.
- E2E tests under `tests/e2e/` if existing coverage needs extension.

## Task 1: Coaching Schemas And Types

**Files:**
- Create: `src/features/training/schemas/coaching.ts`
- Modify: `src/features/training/schemas/diagnosis.ts`
- Modify: `src/features/training/schemas/requests.ts`
- Modify: `src/features/training/types.ts`
- Test: `tests/unit/training-schemas.test.ts`

- [ ] **Step 1: Write failing schema tests**

Add tests that assert:

```ts
import {
  coachingFeedbackSchema,
  plannedCoachingRoundSchema,
} from "@/features/training/schemas/coaching";

const validPlannedRound = {
  id: "boundary",
  objective: "立场与边界",
  targetDimension: "hiddenAssumption",
  question: "这个观点在什么条件下成立？",
  successCriteria: "用户说出至少一个判断边界。",
};

it("accepts one to three planned coaching rounds and rejects duplicates", () => {
  expect(plannedCoachingRoundSchema.parse(validPlannedRound).id).toBe("boundary");
  expect(() =>
    draftDiagnosisSchema.parse({
      ...validDiagnosis,
      plannedCoachingRounds: [],
    }),
  ).toThrow();
  expect(() =>
    draftDiagnosisSchema.parse({
      ...validDiagnosis,
      plannedCoachingRounds: [
        validPlannedRound,
        { ...validPlannedRound, question: "换一个问法？" },
      ],
    }),
  ).toThrow();
  expect(() =>
    draftDiagnosisSchema.parse({
      ...validDiagnosis,
      plannedCoachingRounds: [
        validPlannedRound,
        { ...validPlannedRound, id: "evidence", targetDimension: "argumentSufficiency" },
        { ...validPlannedRound, id: "structure", targetDimension: "structureClarity" },
        { ...validPlannedRound, id: "extra", targetDimension: "specificLanguage" },
      ],
    }),
  ).toThrow();
});

it("validates coaching feedback without accepting model-written final answers", () => {
  const parsed = coachingFeedbackSchema.parse({
    roundId: "boundary",
    attempt: 1,
    status: "needs_followup",
    feedback: "你说到了风险，但还没有给出判断标准。",
    capturedUserMaterial: ["裸辞风险比较大"],
    gap: "需要补出一个条件。",
    followUpQuestion: "从储蓄、机会、家庭压力里选一个条件说明。",
  });
  expect(parsed.status).toBe("needs_followup");
  expect(() =>
    coachingFeedbackSchema.parse({
      ...parsed,
      modelAnswer: "我认为年轻人不应该裸辞，除非已经具备充分储蓄。",
    }),
  ).toThrow();
});
```

- [ ] **Step 2: Run red test**

Run: `pnpm test tests/unit/training-schemas.test.ts`

Expected: FAIL because `@/features/training/schemas/coaching` and new diagnosis fields do not exist.

- [ ] **Step 3: Add schemas**

Create `src/features/training/schemas/coaching.ts`:

```ts
import { z } from "zod";

import { trainingDimensionSchema } from "@/features/training/schemas/topic";

const requiredText = z.string().trim().min(1);
const coachingText = requiredText.max(1000);
const shortText = requiredText.max(160);

export const plannedCoachingRoundSchema = z.object({
  id: z.string().trim().min(1).max(40),
  objective: shortText,
  targetDimension: trainingDimensionSchema,
  question: coachingText,
  successCriteria: coachingText,
});

export const plannedCoachingRoundsSchema = z
  .array(plannedCoachingRoundSchema)
  .min(1)
  .max(3)
  .refine(
    (rounds) => new Set(rounds.map((round) => round.id)).size === rounds.length,
    { message: "Planned coaching round ids must be unique" },
  )
  .refine(
    (rounds) =>
      new Set(rounds.map((round) => round.targetDimension)).size ===
      rounds.length,
    { message: "Planned coaching round target dimensions must be unique" },
  );

export const coachingFeedbackSchema = z
  .object({
    roundId: z.string().trim().min(1).max(40),
    attempt: z.number().int().min(1).max(3),
    status: z.enum(["passed", "needs_followup", "recorded_weakness"]),
    feedback: coachingText,
    capturedUserMaterial: z.array(requiredText.max(300)).max(5),
    gap: coachingText,
    followUpQuestion: coachingText.optional(),
  })
  .strict()
  .refine(
    (feedback) =>
      feedback.status === "needs_followup"
        ? Boolean(feedback.followUpQuestion)
        : true,
    {
      message: "Follow-up question is required when a round needs follow-up",
      path: ["followUpQuestion"],
    },
  );
```

Modify `draftDiagnosisSchema` to include `plannedCoachingRounds: plannedCoachingRoundsSchema`.

Modify `types.ts` to export:

```ts
import type {
  coachingFeedbackSchema,
  plannedCoachingRoundSchema,
} from "@/features/training/schemas/coaching";

export type PlannedCoachingRound = z.infer<typeof plannedCoachingRoundSchema>;
export type CoachingFeedback = z.infer<typeof coachingFeedbackSchema>;
```

- [ ] **Step 4: Run green test**

Run: `pnpm test tests/unit/training-schemas.test.ts`

Expected: PASS for schema tests after updating local `validDiagnosis` with a `plannedCoachingRounds` array.

- [ ] **Step 5: Commit**

```bash
git add src/features/training/schemas/coaching.ts src/features/training/schemas/diagnosis.ts src/features/training/schemas/requests.ts src/features/training/types.ts tests/unit/training-schemas.test.ts
git commit -m "feat: add coaching schemas"
```

## Task 2: AI Contracts, Prompts, Routes, And Mock Provider

**Files:**
- Create: `src/lib/ai/prompts/coaching.ts`
- Create: `src/app/api/ai/coaching/route.ts`
- Modify: `src/lib/ai/types.ts`
- Modify: `src/lib/ai/providers/mock-provider.ts`
- Modify: `src/lib/ai/providers/openai-compatible.ts`
- Modify: `src/features/training/services/training-api.ts`
- Test: `tests/unit/mock-provider.test.ts`
- Test: `tests/unit/provider-adapters.test.ts`
- Test: `tests/unit/ai-routes.test.ts`
- Test: `tests/unit/training-api.test.ts`

- [ ] **Step 1: Write failing provider and route tests**

Add tests that assert:

```ts
it("plans one to three coaching rounds from the draft diagnosis", async () => {
  const diagnosis = await mockProvider.diagnoseDraft({
    topic: trainingTopic,
    draftText: "我认为成长更重要，因为能带来机会。例如参加新项目能积累经验。",
  });

  expect(diagnosis.plannedCoachingRounds.length).toBeGreaterThanOrEqual(1);
  expect(diagnosis.plannedCoachingRounds.length).toBeLessThanOrEqual(3);
  expect(new Set(diagnosis.plannedCoachingRounds.map((round) => round.id)).size)
    .toBe(diagnosis.plannedCoachingRounds.length);
});

it("returns coaching feedback without ghostwriting a final answer", async () => {
  const diagnosis = diagnosisFixture();
  const feedback = await mockProvider.coachRound({
    topic: trainingTopic,
    draftText: "我认为成长更重要，因为机会更多。",
    diagnosis,
    plannedRound: diagnosis.plannedCoachingRounds[0],
    previousRounds: [],
    userAnswer: "风险比较大，所以要谨慎。",
    attempt: 1,
  });

  expect(coachingFeedbackSchema.parse(feedback)).toEqual(feedback);
  expect(JSON.stringify(feedback)).not.toContain("完整范文");
});
```

Add API route test:

```ts
const response = await coachRound(
  jsonRequest("http://localhost/api/ai/coaching", {
    provider: mockProviderConfig,
    topic: trainingTopic,
    draftText: "我认为成长更重要，因为机会更多。",
    diagnosis: diagnosisFixture(),
    plannedRound: diagnosisFixture().plannedCoachingRounds[0],
    previousRounds: [],
    userAnswer: "至少要有基本生活保障。",
    attempt: 1,
  }),
);
expect(response.status).toBe(200);
expect(coachingFeedbackSchema.parse(await response.json()).roundId).toBeTruthy();
```

- [ ] **Step 2: Run red tests**

Run:

```bash
pnpm test tests/unit/mock-provider.test.ts tests/unit/ai-routes.test.ts tests/unit/training-api.test.ts
```

Expected: FAIL because `coachRound`, `/api/ai/coaching`, and client API methods do not exist.

- [ ] **Step 3: Add AI types and requests**

Add `CoachingRequest` to `requests.ts`:

```ts
export const coachingRequestSchema = z.object({
  provider: providerConfigSchema,
  topic: trainingTopicSchema,
  draftText: requiredText.max(400),
  diagnosis: draftDiagnosisSchema,
  plannedRound: plannedCoachingRoundSchema,
  previousRounds: z.array(coachingFeedbackSchema).max(3).default([]),
  userAnswer: requiredText.max(1000),
  attempt: z.number().int().min(1).max(3),
});

export type CoachingRequest = z.infer<typeof coachingRequestSchema>;
```

Add to `src/lib/ai/types.ts`:

```ts
export interface CoachingInput {
  topic: TrainingTopic;
  draftText: string;
  diagnosis: DraftDiagnosis;
  plannedRound: PlannedCoachingRound;
  previousRounds: CoachingFeedback[];
  userAnswer: string;
  attempt: number;
}

export interface AIProvider {
  generateTopic(input: TopicGenerationInput): Promise<TrainingTopic>;
  diagnoseDraft(input: DraftDiagnosisInput): Promise<DraftDiagnosis>;
  coachRound(input: CoachingInput): Promise<CoachingFeedback>;
  compareRewrite(input: RewriteComparisonInput): Promise<RewriteComparison>;
  testConnection(): Promise<ConnectionTestResult>;
}
```

- [ ] **Step 4: Add prompts and provider implementation**

Create `src/lib/ai/prompts/coaching.ts` with rules:

```ts
import type { CoachingInput } from "@/lib/ai/types";

export function buildCoachingPrompt(input: CoachingInput) {
  return [
    "你是逻辑表达教练，只追问、反馈和降阶引导，不替用户写完整答案。",
    "只围绕 plannedRound 的目标判断用户回答是否推进。",
    "如果不达标，给一个更小的问题或可选方向；不要输出完整范文。",
    "如果 attempt 为 3 且仍不达标，status 必须为 recorded_weakness。",
    "字段：roundId, attempt, status, feedback, capturedUserMaterial, gap, followUpQuestion。",
    "<user_input>",
    JSON.stringify(input),
    "</user_input>",
  ].join("\n");
}

export const COACHING_FORMAT_DESCRIPTION =
  "CoachingFeedback JSON；status 为 passed、needs_followup 或 recorded_weakness；不要输出完整最终复述或 modelAnswer 字段。";
```

In `mock-provider.ts`, add deterministic `plannedCoachingRounds` to diagnosis based on lowest dimensions and implement `coachRound` by checking whether `userAnswer` contains boundary/evidence/structure signals.

In `openai-compatible.ts`, add a `coachRound` method using `buildCoachingPrompt`, `coachingFeedbackSchema`, and the existing one-repair JSON parse pattern.

- [ ] **Step 5: Add route and client API**

Create `src/app/api/ai/coaching/route.ts`:

```ts
import { coachingRequestSchema } from "@/features/training/schemas/requests";
import { createProvider } from "@/lib/ai/provider-factory";
import { errorResponse, invalidRequestError } from "@/lib/errors/app-error";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (cause) {
      throw invalidRequestError(cause);
    }
    const parsed = coachingRequestSchema.parse(body);
    const provider = createProvider(parsed.provider);
    const result = await provider.coachRound(parsed);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
```

Extend `TrainingApi` with `coachRound(request, signal)` posting to `/api/ai/coaching` and parsing `coachingFeedbackSchema`.

- [ ] **Step 6: Run green tests**

Run:

```bash
pnpm test tests/unit/mock-provider.test.ts tests/unit/provider-adapters.test.ts tests/unit/ai-routes.test.ts tests/unit/training-api.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai/prompts/coaching.ts src/app/api/ai/coaching/route.ts src/lib/ai/types.ts src/lib/ai/providers/mock-provider.ts src/lib/ai/providers/openai-compatible.ts src/features/training/schemas/requests.ts src/features/training/services/training-api.ts tests/unit/mock-provider.test.ts tests/unit/provider-adapters.test.ts tests/unit/ai-routes.test.ts tests/unit/training-api.test.ts
git commit -m "feat: add coaching ai contract"
```

## Task 3: State Machine, Store, And Repository

**Files:**
- Modify: `src/features/training/types.ts`
- Modify: `src/features/training/state-machine.ts`
- Modify: `src/features/training/store/training-store.ts`
- Modify: `src/lib/storage/training-repository.ts`
- Modify: `src/features/training/components/training-workspace.tsx`
- Test: `tests/unit/training-state-machine.test.ts`
- Test: `tests/unit/training-store.test.ts`
- Test: `tests/unit/training-repository.test.ts`

- [ ] **Step 1: Write failing state and store tests**

Update state-machine test expected stages:

```ts
const stages: TrainingStage[] = [
  "setup",
  "topic",
  "draft",
  "diagnosis",
  "coaching",
  "finalRewrite",
  "result",
];

const allowedTransitions = new Set([
  "setup:topic",
  "topic:setup",
  "topic:draft",
  "draft:topic",
  "draft:diagnosis",
  "diagnosis:coaching",
  "coaching:finalRewrite",
  "finalRewrite:result",
  "result:setup",
]);
```

Add store test:

```ts
it("runs coaching rounds before final rewrite comparison", async () => {
  const api = createApi();
  vi.mocked(api.coachRound).mockResolvedValue(coachingFeedbackFixture({
    status: "passed",
  }));
  const store = createStore({ api });
  advanceToDraft(store);
  await store.getState().requestDiagnosis();

  expect(store.getState().session?.stage).toBe("diagnosis");
  store.getState().startCoaching();
  expect(store.getState().session?.stage).toBe("coaching");

  store.getState().updateCoachingAnswer("至少需要 6 个月生活费。");
  await store.getState().requestCoachingFeedback();
  expect(api.coachRound).toHaveBeenCalledTimes(1);
  expect(store.getState().session).toMatchObject({
    stage: "coaching",
    currentRoundIndex: 1,
  });

  store.getState().startFinalRewrite();
  store.getState().updateFinalRewrite(text(200));
  await store.getState().requestComparison();
  expect(store.getState().session?.stage).toBe("result");
});
```

Add stale response test for coaching:

```ts
it("does not write stale coaching feedback after answer changes", async () => {
  const deferredFeedback = deferred<CoachingFeedback>();
  const api = createApi();
  vi.mocked(api.coachRound).mockReturnValueOnce(deferredFeedback.promise);
  const store = createStore({ api });
  advanceToDraft(store);
  store.getState().setDiagnosis(diagnosisFixture());
  store.getState().startCoaching();
  store.getState().updateCoachingAnswer("第一版回答");
  const request = store.getState().requestCoachingFeedback().catch(() => undefined);
  store.getState().updateCoachingAnswer("第二版回答");
  deferredFeedback.resolve(coachingFeedbackFixture());
  await request;
  expect(store.getState().session).toMatchObject({
    stage: "coaching",
    currentAnswer: "第二版回答",
    completedRounds: [],
  });
});
```

- [ ] **Step 2: Run red tests**

Run:

```bash
pnpm test tests/unit/training-state-machine.test.ts tests/unit/training-store.test.ts tests/unit/training-repository.test.ts
```

Expected: FAIL because stages and actions do not exist.

- [ ] **Step 3: Extend types and transitions**

Set:

```ts
export const TRAINING_STAGES = [
  "setup",
  "topic",
  "draft",
  "diagnosis",
  "coaching",
  "finalRewrite",
  "result",
] as const;
```

Add session fields:

```ts
export interface CoachingRoundState {
  planned: PlannedCoachingRound;
  attempts: CoachingFeedback[];
  userAnswers: string[];
  status: "pending" | "passed" | "recorded_weakness";
}
```

Use `finalRewriteText` as the new semantic text field. Keep `rewriteText` only as a backward-compatible alias in records if dashboard code still depends on it; otherwise update all consumers in the same task.

- [ ] **Step 4: Extend store actions**

Add `AiOperation = "topic" | "diagnosis" | "coaching" | "comparison"`.

Add actions:

```ts
startCoaching(): void;
updateCoachingAnswer(text: string): void;
requestCoachingFeedback(): Promise<void>;
startFinalRewrite(): void;
updateFinalRewrite(text: string): void;
```

Rules:
- `diagnosis → coaching` initializes `coachingRounds` from `diagnosis.plannedCoachingRounds`.
- `requestCoachingFeedback` saves before request, sends current round and attempt, ignores stale responses using `requestFingerprint`.
- `passed` advances to the next round or enables `finalRewrite`.
- `needs_followup` stays on the same round with incremented attempt.
- `recorded_weakness` marks the round complete and advances.
- `startFinalRewrite` is allowed only after all planned rounds have terminal status.
- `requestComparison` is allowed only from `finalRewrite`.

- [ ] **Step 5: Update repository validation and record conversion**

Extend `trainingSessionSchema` and `trainingRecordSchema` with `coaching` and `finalRewrite` variants. Update `resultSessionToRecord` and `recordToResultSession` in `training-workspace.tsx` to store and recover:

```ts
plannedCoachingRounds: session.diagnosis.plannedCoachingRounds,
coachingRounds: session.coachingRounds,
finalRewriteText: session.finalRewriteText,
rewriteText: session.finalRewriteText,
```

This keeps existing dashboard history text working while the product language moves to final rewrite.

- [ ] **Step 6: Run green tests**

Run:

```bash
pnpm test tests/unit/training-state-machine.test.ts tests/unit/training-store.test.ts tests/unit/training-repository.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/training/types.ts src/features/training/state-machine.ts src/features/training/store/training-store.ts src/lib/storage/training-repository.ts src/features/training/components/training-workspace.tsx tests/unit/training-state-machine.test.ts tests/unit/training-store.test.ts tests/unit/training-repository.test.ts
git commit -m "feat: add coaching training state"
```

## Task 4: Coaching And Final Rewrite UI

**Files:**
- Create: `src/features/training/components/coaching-view.tsx`
- Create: `src/features/training/components/final-rewrite-view.tsx`
- Modify: `src/features/training/components/diagnosis-view.tsx`
- Modify: `src/features/training/components/result-view.tsx`
- Modify: `src/features/training/components/stage-tabs.tsx`
- Modify: `src/features/training/components/training-workspace.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/unit/training-workspace.test.tsx`
- Test: `tests/unit/design-system-contract.test.ts`

- [ ] **Step 1: Write failing UI tests**

Update workspace test from five-stage to seven-stage:

```ts
it("completes the structured coaching flow and records final rewrite", async () => {
  const repository = createRepository();
  const api = createApi();
  vi.mocked(api.coachRound).mockResolvedValue(coachingFeedbackFixture({
    status: "passed",
  }));
  await renderWorkspace({ repository, api });

  const draft = await reachDraft();
  fireEvent.change(draft, { target: { value: text(200) } });
  await userEvent.click(screen.getByRole("button", { name: "提交初稿诊断" }));

  await screen.findByRole("heading", { name: "AI 初诊断" });
  await userEvent.click(screen.getByRole("button", { name: "进入追问训练" }));

  await screen.findByRole("heading", { name: "追问训练" });
  expect(screen.getByText(/轮次摘要：1 \\/ 2/)).toBeInTheDocument();
  const answer = screen.getByRole("textbox", { name: "本轮回答" });
  fireEvent.change(answer, { target: { value: "至少需要 6 个月生活费。" } });
  await userEvent.click(screen.getByRole("button", { name: "提交回答" }));

  await screen.findByRole("heading", { name: "最终复述" });
  const finalRewrite = screen.getByRole("textbox", { name: "最终复述" });
  fireEvent.change(finalRewrite, { target: { value: text(200) } });
  await userEvent.click(screen.getByRole("button", { name: "提交最终复述并查看复盘" }));

  await screen.findByRole("heading", { name: "结果复盘" });
  await waitFor(() => expect(repository.completeSession).toHaveBeenCalledTimes(1));
  expect(vi.mocked(repository.completeSession).mock.calls[0][0]).toMatchObject({
    finalRewriteText: text(200),
    rewriteText: text(200),
    coachingRounds: expect.any(Array),
  });
});
```

Add design-system test assertions:

```ts
expect(css).toContain(".coach-chat");
expect(css).toContain("var(--surface-soft)");
expect(css).toContain("var(--sage)");
expect(css).not.toContain("linear-gradient(135deg, #6");
```

- [ ] **Step 2: Run red tests**

Run:

```bash
pnpm test tests/unit/training-workspace.test.tsx tests/unit/design-system-contract.test.ts
```

Expected: FAIL because new UI components and classes do not exist.

- [ ] **Step 3: Update progress and diagnosis UI**

Set labels:

```ts
const LABELS: Record<TrainingStage, string> = {
  setup: "设置训练",
  topic: "确认命题",
  draft: "写初稿",
  diagnosis: "AI 初诊断",
  coaching: "追问训练",
  finalRewrite: "最终复述",
  result: "结果复盘",
};
```

`DiagnosisView` becomes read-only diagnosis summary with a primary button `进入追问训练`. It should keep `Card`, `feedback-stack`, `score-card`, and `topic-summary` styling.

- [ ] **Step 4: Add coaching chat UI**

Create `CoachingView` with:
- `<section className="training-stage coach-stage" aria-labelledby="coaching-title">`
- header title `追问训练`
- top metadata card with `轮次摘要：{index + 1} / {total}`
- `.coach-chat` message list with AI left bubbles and user right bubbles.
- `.coach-composer` fixed-at-bottom-within-card input area using existing `Button`.
- one textarea labelled `本轮回答`.
- `记录为短板并继续` visible only when current attempt count is `>= 2` and latest feedback is not passed.

- [ ] **Step 5: Add final rewrite UI**

Create `FinalRewriteView` with existing `DraftView` validation helpers:
- textarea label `最终复述`
- count via `countCharacters`
- submit disabled unless 200-400 grapheme clusters.
- left side cards: `已有材料`, `仍需补清`.
- primary button `提交最终复述并查看复盘`.

- [ ] **Step 6: Update result UI**

Change result copy:
- `改写全文` → `最终复述`
- include a `追问记录` card list with each round objective, terminal status, and attempt count.
- keep metric cards and score list unchanged.

- [ ] **Step 7: Add CSS using existing tokens**

Add CSS only with current tokens:

```css
.coach-stage {
  min-height: 680px;
}

.coach-chat-shell {
  display: grid;
  gap: 16px;
}

.coach-chat {
  max-height: min(58vh, 620px);
  padding: 18px;
  display: grid;
  gap: 14px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}

.coach-message {
  width: min(78%, 620px);
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background: var(--ivory);
  box-shadow: var(--shadow-low);
}

.coach-message[data-role="user"] {
  justify-self: end;
  background: var(--sage);
}

.coach-message[data-role="coach"] {
  justify-self: start;
  background: var(--ivory);
}

.coach-message small {
  display: block;
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
}

.coach-composer {
  position: sticky;
  bottom: 0;
  padding-top: 12px;
  background: linear-gradient(180deg, transparent, var(--surface) 24%);
}
```

- [ ] **Step 8: Run green UI tests**

Run:

```bash
pnpm test tests/unit/training-workspace.test.tsx tests/unit/design-system-contract.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/training/components/coaching-view.tsx src/features/training/components/final-rewrite-view.tsx src/features/training/components/diagnosis-view.tsx src/features/training/components/result-view.tsx src/features/training/components/stage-tabs.tsx src/features/training/components/training-workspace.tsx src/app/globals.css tests/unit/training-workspace.test.tsx tests/unit/design-system-contract.test.ts
git commit -m "feat: add coaching training ui"
```

## Task 5: Full Verification And Manual UI Check

**Files:**
- Modify tests only if verification exposes a real regression.

- [ ] **Step 1: Run full static and unit verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all exit 0.

- [ ] **Step 2: Run E2E**

Run:

```bash
pnpm test:e2e
```

Expected: all exit 0. If Chromium or service startup is unavailable, record the exact WHAT / WHY / HOW blocker.

- [ ] **Step 3: Manual desktop UI verification**

Run:

```bash
pnpm dev
```

Open the local URL and verify:
- setup → topic → draft → AI 初诊断 → 追问训练 → 最终复述 → 结果复盘 works with Mock.
- coaching stage looks like the existing product: same shell, same card radius, same typography, same subdued token palette.
- chat bubbles preserve AI/user causality.
- bottom composer remains usable after scrolling.
- no AI or user content uses HTML rendering.
- result save guard still blocks leaving until saved.

- [ ] **Step 4: Manual mobile viewport verification**

Use browser devtools or Playwright at a mobile width around 390px. Verify:
- progress list does not overlap content.
- chat bubbles fit without horizontal scrolling.
- bottom composer does not cover the latest message.
- final rewrite textarea and buttons are reachable.

- [ ] **Step 5: Commit verification-only fixes**

If fixes were needed:

```bash
git add <changed-files>
git commit -m "fix: stabilize coaching training flow"
```

If no fixes were needed, do not create an empty commit.

## Plan Self-Review

**Spec coverage:** Covered dynamic 1-3 rounds, chat bubble UI, fixed composer, no ghostwriting, Zod validation, route/provider boundaries, request cancellation, persistence, result recovery, deterministic aggregates, and UI style consistency.

**Known implementation pressure points:**
- `rewriteText` currently appears in many dashboard/history paths. The plan keeps it as a backward-compatible alias while adding `finalRewriteText`.
- `TrainingRecord` shape changes will require fixture updates across tests.
- Existing StageTabs tests expect five steps; they must be updated with the semantic progress-list requirement intact.
- The localStorage result marker remains allowed because it stores only the current result id, not training text or credentials.

**Concrete execution details:** This plan intentionally uses concrete file paths, commands, state names, route names, and UI labels.
