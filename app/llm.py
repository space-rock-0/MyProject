import time

from groq import APIConnectionError, APIStatusError, AuthenticationError, Groq, RateLimitError

from . import config


class LLMError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _retry_after(e: RateLimitError):
    try:
        v = e.response.headers.get("retry-after")
        return float(v) if v is not None else None
    except Exception:
        return None


def complete(system: str, user: str, max_tokens: int = 600, temperature: float = 0.6) -> dict:
    """One chat call with model fallback. Free-tier limits are per model, so falling
    through the chain gives extra headroom. Short 429 waits are retried in place."""
    if not config.GROQ_API_KEY:
        raise LLMError("GROQ_API_KEY is missing. Put it in .env and restart.", 400)
    client = Groq(api_key=config.GROQ_API_KEY, max_retries=0)
    errors = []
    for model in config.MODELS:
        for attempt in (1, 2):
            try:
                kw = dict(
                    model=model,
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                if "gpt-oss" in model:
                    # reasoning tokens count against max_tokens, so keep them small and leave room
                    kw["max_tokens"] = max_tokens + 500
                    kw["extra_body"] = {"reasoning_effort": "low"}
                r = client.chat.completions.create(**kw)
                text = (r.choices[0].message.content or "").strip()
                if not text:
                    errors.append(f"{model}: empty reply")
                    break
                u = r.usage
                return {
                    "text": text,
                    "model": model,
                    "prompt_tokens": getattr(u, "prompt_tokens", 0),
                    "completion_tokens": getattr(u, "completion_tokens", 0),
                }
            except RateLimitError as e:
                wait = _retry_after(e)
                if attempt == 1 and wait is not None and wait <= 25:
                    time.sleep(wait + 0.5)
                    continue
                errors.append(f"{model}: rate limited")
                break
            except AuthenticationError:
                raise LLMError("Groq rejected the API key. Check GROQ_API_KEY in .env.", 401)
            except APIStatusError as e:
                errors.append(f"{model}: HTTP {e.status_code}")
                break
            except APIConnectionError:
                errors.append(f"{model}: connection failed")
                break
    raise LLMError("All models failed (" + "; ".join(errors) + "). On the free tier, wait a minute and retry.", 429)
