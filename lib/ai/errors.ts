export type AiErrorCode = "config" | "timeout" | "api" | "rate_limit" | "empty" | "format" | "refusal" | "validation";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
    public details: string[] = [],
  ) {
    super(message);
  }
}
