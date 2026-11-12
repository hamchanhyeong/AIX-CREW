import "server-only";
import type { z } from "zod";

import { AiError } from "./errors";
export { AiError } from "./errors";

export interface StructuredRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  timeoutMs?: number;
}

/** 제공자 교체용 인터페이스. 새 제공자는 이 인터페이스만 구현하면 된다. */
export interface LLMProvider {
  name: string;
  model: string;
  generateStructured<T>(req: StructuredRequest<T>): Promise<T>;
}

export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string;
  reason?: string;
}

export function aiStatus(): AiStatus {
  const provider = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  const model = process.env.LLM_MODEL || "claude-opus-5-5";
  if (provider !== "anthropic") {
    return { configured: false, provider, model, reason: `지원하지 않는 제공자입니다: ${provider} (현재 anthropic만 구현)` };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { configured: false, provider, model, reason: "서버 환경변수 ANTHROPIC_API_KEY가 설정되지 않았습니다." };
  }
  return { configured: true, provider, model };
}

export async function getProvider(): Promise<LLMProvider> {
  const st = aiStatus();
  if (!st.configured) throw new AiError("config", st.reason ?? "AI 설정이 없습니다.");
  const { AnthropicProvider } = await import("./anthropic");
  return new AnthropicProvider(st.model);
}
