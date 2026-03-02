import os
import time
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv


load_dotenv()


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name, "").strip()
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name, "").strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on"}


class ReplyRequest(BaseModel):
    message: str = Field(default="", description="买家最新消息")
    scene: str = Field(default="general", description="识别场景")
    tone: str = Field(default="professional", description="语气")
    localReply: str = Field(default="", description="插件本地模板回复")
    instruction: str = Field(default="", description="额外指令")


class ReplyMeta(BaseModel):
    source: str = Field(default="rule")
    reason: str = Field(default="")
    model: str = Field(default="")
    latencyMs: int = Field(default=0)


class ReplyResponse(BaseModel):
    reply: str
    source: str = Field(default="rule")
    meta: ReplyMeta = Field(default_factory=ReplyMeta)


app = FastAPI(title="ali-platform-agent-server", version="0.1.0")

# 插件端通过 service worker 访问该服务，放开 CORS 便于本地联调和部署。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_system_prompt() -> str:
    return (
        "你是电商客服助手。"
        "请输出一段可直接发送给买家的中文回复。"
        "不要包含解释，不要分点，不要输出多段。"
    )


def _build_user_prompt(data: ReplyRequest) -> str:
    return (
        f"买家消息：{data.message}\n"
        f"场景：{data.scene}\n"
        f"语气：{data.tone}\n"
        f"本地模板参考：{data.localReply}\n"
        "请生成最终回复："
    )


def _extract_text(payload: dict[str, Any]) -> str:
    choice = ((payload.get("choices") or [{}])[0] or {})
    message = choice.get("message") or {}
    text = message.get("content") or choice.get("text") or ""
    return str(text or "").strip()


def _get_runtime_config() -> tuple[str, str, str, int]:
    base_url = os.getenv("LLM_BASE_URL", "").strip().rstrip("/")
    api_key = os.getenv("LLM_API_KEY", "").strip()
    env_model = os.getenv("LLM_MODEL", "").strip()
    timeout_ms = max(800, min(15000, _env_int("LLM_TIMEOUT_MS", 3500)))
    model = env_model.strip()
    return base_url, api_key, model, timeout_ms


def _get_access_config() -> tuple[bool, str]:
    require_token = _env_bool("SERVICE_REQUIRE_TOKEN", True)
    access_token = os.getenv("SERVICE_ACCESS_TOKEN", "").strip()
    return require_token, access_token


def _extract_access_token(authorization: str | None, x_assistant_token: str | None) -> str:
    if x_assistant_token and x_assistant_token.strip():
        return x_assistant_token.strip()
    auth = (authorization or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _ensure_authorized(authorization: str | None, x_assistant_token: str | None) -> None:
    require_token, access_token = _get_access_config()
    if not require_token:
        return
    if not access_token:
        raise HTTPException(status_code=503, detail="service_token_not_configured")
    incoming = _extract_access_token(authorization, x_assistant_token)
    if incoming != access_token:
        raise HTTPException(status_code=401, detail="unauthorized")


def _rule_fallback(reply: str, reason: str, model: str = "", latency_ms: int = 0) -> ReplyResponse:
    final_reply = (reply or "").strip() or "您好，消息已收到，我这边正在为您核实处理。"
    return ReplyResponse(
        reply=final_reply,
        source="rule",
        meta=ReplyMeta(source="rule", reason=reason, model=model, latencyMs=latency_ms),
    )


@app.get("/health")
def health() -> dict[str, Any]:
    base_url, _api_key, model, timeout_ms = _get_runtime_config()
    require_token, access_token = _get_access_config()
    return {
        "ok": True,
        "service": "ali-platform-agent-server",
        "baseUrlConfigured": bool(base_url),
        "modelConfigured": bool(model),
        "tokenRequired": require_token,
        "tokenConfigured": bool(access_token),
        "timeoutMs": timeout_ms,
    }


@app.post("/reply", response_model=ReplyResponse)
async def reply(
    data: ReplyRequest,
    authorization: str | None = Header(default=None),
    x_assistant_token: str | None = Header(default=None),
) -> ReplyResponse:
    _ensure_authorized(authorization, x_assistant_token)

    local_reply = (data.localReply or "").strip()
    base_url, api_key, model, timeout_ms = _get_runtime_config()
    if not base_url:
        return _rule_fallback(local_reply, reason="base_url_missing")
    if not model:
        return _rule_fallback(local_reply, reason="model_missing")

    url = f"{base_url}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": _build_system_prompt()},
            {"role": "user", "content": _build_user_prompt(data)},
        ],
        "temperature": 0.4,
        "max_tokens": 320,
        "stream": False,
    }

    started = time.perf_counter()
    try:
        timeout = httpx.Timeout(timeout_ms / 1000.0, connect=min(8.0, timeout_ms / 1000.0))
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, headers=headers, json=body)
        latency_ms = int((time.perf_counter() - started) * 1000)
        if resp.status_code >= 400:
            return _rule_fallback(
                local_reply,
                reason=f"http_{resp.status_code}",
                model=model,
                latency_ms=latency_ms,
            )
        payload = resp.json()
        generated = _extract_text(payload)
        if not generated:
            return _rule_fallback(local_reply, reason="empty_output", model=model, latency_ms=latency_ms)

        return ReplyResponse(
            reply=generated,
            source="model",
            meta=ReplyMeta(source="model", reason="", model=model, latencyMs=latency_ms),
        )
    except Exception as exc:  # noqa: BLE001
        latency_ms = int((time.perf_counter() - started) * 1000)
        detail = str(exc).strip()
        reason = "network_error" if detail else "unknown_error"
        if "timed out" in detail.lower():
            reason = "timeout"
        return _rule_fallback(local_reply, reason=reason, model=model, latency_ms=latency_ms)


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("SERVER_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = _env_int("SERVER_PORT", 8787)
    uvicorn.run("app:app", host=host, port=port, reload=False)
