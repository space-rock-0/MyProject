// Groq client for the Personal Drafter — separate key from the career-ops app.
import { PD_KEY, MODELS } from "./pd-config.mjs";

export class LLMError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function complete(system, user, maxTokens = 600, temperature = 0.6) {
  if (!PD_KEY) throw new LLMError("PD_GROQ_API_KEY is missing. Put it in .env and restart.", 400);
  const errors = [];
  for (const model of MODELS) {
    for (const attempt of [1, 2]) {
      try {
        const body = {
          model,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          temperature,
          max_tokens: /gpt-oss/.test(model) ? maxTokens + 500 : maxTokens,
        };
        if (/gpt-oss/.test(model)) body.reasoning_effort = "low";
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${PD_KEY}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });
        if (res.status === 429 && attempt === 1) {
          const ra = parseFloat(res.headers.get("retry-after"));
          if (Number.isFinite(ra) && ra >= 0 && ra <= 3) {
            await new Promise((r) => setTimeout(r, (ra + 0.5) * 1000));
            continue;
          }
        }
        if (res.status === 401) throw new LLMError("Groq rejected PD_GROQ_API_KEY. Check .env.", 401);
        if (!res.ok) {
          errors.push(`${model}: HTTP ${res.status}`);
          break;
        }
        const data = await res.json();
        const text = (data?.choices?.[0]?.message?.content || "").trim();
        if (!text) {
          errors.push(`${model}: empty reply`);
          break;
        }
        const u = data?.usage || {};
        return {
          text,
          model,
          prompt_tokens: u.prompt_tokens || 0,
          completion_tokens: u.completion_tokens || 0,
        };
      } catch (e) {
        if (e instanceof LLMError) throw e;
        errors.push(`${model}: connection failed`);
        break;
      }
    }
  }
  throw new LLMError(`All models failed (${errors.join("; ")}). Please retry shortly.`, errors.some(e => e.includes("429")) ? 429 : 502);
}
