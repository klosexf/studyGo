import { providerTestRequestSchema } from "@/features/training/schemas/requests";
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
    const config = providerTestRequestSchema.parse(body);
    const provider = createProvider(config);
    return Response.json(await provider.testConnection());
  } catch (error) {
    return errorResponse(error);
  }
}
