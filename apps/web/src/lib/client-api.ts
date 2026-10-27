import type { Resource } from "./types";

const fallbackMessages: Record<number, string> = {
  501: "This feature isn’t connected yet. Your workspace hasn’t changed.",
  503: "Your workspace service is unavailable. Try again when it’s connected.",
  504: "The workspace service took too long to answer. Nothing was assumed to have changed.",
};

/** Same-origin adapter call. Server messages and request IDs are preserved, never replaced. */
export async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 20000, ...init } = options;
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      error instanceof DOMException && error.name === "TimeoutError"
        ? "No answer arrived in time. Nothing was assumed to have changed."
        : "Your workspace couldn’t be reached. Check your connection.",
      "CONNECTION_FAILED",
      undefined,
      0,
      true,
    );
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ??
        fallbackMessages[response.status] ??
        "This request couldn’t be completed. Please try again.",
      body?.error?.code ?? "REQUEST_FAILED",
      body?.request_id ?? response.headers.get("x-request-id") ?? undefined,
      response.status,
      Boolean(body?.error?.retryable),
      body?.error?.fields ?? [],
    );
  }
  return body as T;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public requestId?: string,
    public status = 0,
    public retryable = false,
    public fields: string[] = [],
  ) {
    super(message);
  }
}
export function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
export function resourceError(
  error: unknown,
): Resource<never> & { state: "error" } {
  return {
    state: "error",
    message: errorMessage(error, "The request couldn’t be completed."),
    code: error instanceof ApiError ? error.code : "CONNECTION_FAILED",
    requestId: error instanceof ApiError ? error.requestId : undefined,
  };
}
export function mutationOptions(
  body: unknown,
  key: string,
  method = "POST",
): RequestInit {
  return {
    method,
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  };
}
