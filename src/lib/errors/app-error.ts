import { ZodError } from "zod";

export interface PublicAppError {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

interface SafeCause {
  name: string;
  code?: string;
}

function sanitizeCause(cause: unknown): SafeCause | undefined {
  if (!cause || typeof cause !== "object") {
    return undefined;
  }
  const name = Reflect.get(cause, "name");
  const code = Reflect.get(cause, "code");
  if (typeof name !== "string" || !name) {
    return undefined;
  }
  return {
    name,
    ...(typeof code === "string" || typeof code === "number"
      ? { code: String(code) }
      : {}),
  };
}

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  override readonly cause?: SafeCause;

  constructor(options: {
    code: string;
    message: string;
    status: number;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable;
    this.cause = sanitizeCause(options.cause);
  }

  toJSON(): PublicAppError["error"] {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }

  toResponse() {
    return Response.json(
      { error: this.toJSON() } satisfies PublicAppError,
      { status: this.status },
    );
  }
}

export function invalidRequestError(cause?: unknown) {
  return new AppError({
    code: "INVALID_REQUEST",
    message: "请求参数无效，请检查后重试。",
    status: 400,
    retryable: false,
    cause,
  });
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return invalidRequestError(error);
  }
  return new AppError({
    code: "INTERNAL_ERROR",
    message: "服务暂时不可用，请稍后重试。",
    status: 500,
    retryable: true,
    cause: error,
  });
}

export function errorResponse(error: unknown) {
  return toAppError(error).toResponse();
}
