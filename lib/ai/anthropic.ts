import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiError, type LLMProvider, type StructuredRequest } from "./provider";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  constructor(public model: string) {}

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    // API 키는 서버 환경변수에서만 읽는다. 로그에 남기지 않는다.
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: req.timeoutMs ?? 120_000,
      maxRetries: 1,
    });
    const useFallback = process.env.LLM_REFUSAL_FALLBACK !== "off";
    let res;
    try {
      res = await client.beta.messages.parse({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        output_config: { effort: "medium", format: zodOutputFormat(req.schema) },
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      });
    } catch (e) {
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new AiError("timeout", "AI 응답 시간이 초과되었습니다.");
      if (e instanceof Anthropic.AuthenticationError) throw new AiError("config", "API 키 인증에 실패했습니다. 서버 환경변수를 확인하세요.");
      if (e instanceof Anthropic.RateLimitError) throw new AiError("rate_limit", "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.");
      if (e instanceof Anthropic.BadRequestError) throw new AiError("api", `요청 형식 오류(400): ${e.message}`);
      if (e instanceof Anthropic.APIConnectionError) throw new AiError("api", "AI 서버에 연결하지 못했습니다.");
      if (e instanceof Anthropic.APIError) throw new AiError("api", `AI API 오류(${e.status ?? "?"})`);
      throw new AiError("format", "AI 응답을 해석하지 못했습니다(잘못된 형식).");
    }
    if (res.stop_reason === "refusal") throw new AiError("refusal", "AI가 이 요청에 대한 응답을 거절했습니다.");
    if (res.stop_reason === "max_tokens") throw new AiError("format", "AI 응답이 길이 제한으로 잘렸습니다.");
    if (res.parsed_output == null) throw new AiError("empty", "AI 응답이 비어 있거나 형식에 맞지 않습니다.");
    return res.parsed_output as T;
  }
}
