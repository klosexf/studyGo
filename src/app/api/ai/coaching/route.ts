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
