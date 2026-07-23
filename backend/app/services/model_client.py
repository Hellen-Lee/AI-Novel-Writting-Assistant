"""OpenAI-compatible model client."""

from __future__ import annotations

from typing import Any, Optional

import httpx

from app.config import is_masked_api_key, load_config, mask_api_key


class ModelClientError(Exception):
    """Raised when the upstream model API call fails."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _extract_error_message(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict) and err.get("message"):
                return f"API 错误 ({response.status_code}): {err['message']}"
            if isinstance(err, str):
                return f"API 错误 ({response.status_code}): {err}"
            if data.get("message"):
                return f"API 错误 ({response.status_code}): {data['message']}"
    except Exception:
        pass

    text = (response.text or "").strip()
    if text:
        return f"API 错误 ({response.status_code}): {text[:300]}"
    return f"API 错误 ({response.status_code})"


def resolve_runtime_config(overrides: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Merge saved config with optional overrides (e.g. test before save)."""
    config = load_config()
    if not overrides:
        return config

    merged = dict(config)
    for key in ("api_base", "api_key", "model", "temperature", "top_p", "max_tokens"):
        if key not in overrides or overrides[key] is None:
            continue
        value = overrides[key]
        if key == "api_key":
            key_str = str(value)
            if is_masked_api_key(key_str) or key_str == mask_api_key(config.get("api_key", "")):
                continue
        if key == "api_base":
            value = str(value).strip().rstrip("/")
        merged[key] = value
    return merged


class ModelClient:
    def __init__(self, config: Optional[dict[str, Any]] = None):
        self.config = config or load_config()

    @property
    def base_url(self) -> str:
        return str(self.config["api_base"]).rstrip("/")

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        api_key = self.config.get("api_key") or ""
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        timeout: float = 60.0,
        **kwargs: Any,
    ) -> Any:
        url = f"{self.base_url}{path}"
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.request(
                    method,
                    url,
                    headers=self._headers(),
                    **kwargs,
                )
        except httpx.TimeoutException as exc:
            raise ModelClientError("请求超时，请检查 API 地址或网络连接") from exc
        except httpx.RequestError as exc:
            raise ModelClientError(f"无法连接 API：{exc}") from exc

        if response.status_code >= 400:
            raise ModelClientError(
                _extract_error_message(response),
                status_code=response.status_code,
            )

        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise ModelClientError("API 响应不是合法 JSON") from exc

    def list_models(self) -> list[dict[str, Any]]:
        """Fetch available models from OpenAI-compatible GET /models."""
        if not self.config.get("api_base"):
            raise ModelClientError("API 地址未配置")
        if not self.config.get("api_key"):
            raise ModelClientError("API Key 未配置")

        data = self._request("GET", "/models", timeout=30.0)
        items = data.get("data") if isinstance(data, dict) else data
        if not isinstance(items, list):
            raise ModelClientError("模型列表响应格式无效")

        models: list[dict[str, Any]] = []
        for item in items:
            if isinstance(item, dict) and item.get("id"):
                models.append(
                    {
                        "id": str(item["id"]),
                        "owned_by": str(item.get("owned_by") or ""),
                        "created": item.get("created"),
                    }
                )
            elif isinstance(item, str) and item.strip():
                models.append({"id": item.strip(), "owned_by": "", "created": None})

        models.sort(key=lambda item: item["id"])
        return models

    def test_connection(self) -> dict[str, Any]:
        """
        Probe API connectivity.

        Prefer GET /models; if the endpoint is unavailable, fall back to a
        minimal chat completion so OpenAI-compatible providers still work.
        """
        if not self.config.get("api_base"):
            raise ModelClientError("API 地址未配置")
        if not self.config.get("api_key"):
            raise ModelClientError("API Key 未配置")

        current_model = str(self.config.get("model") or "")

        try:
            models = self.list_models()
        except ModelClientError as list_err:
            if list_err.status_code in (401, 403):
                raise
            if list_err.status_code in (404, 405):
                return self._test_via_chat()
            try:
                return self._test_via_chat()
            except ModelClientError:
                raise list_err from None

        model_ids = {item["id"] for item in models}
        hint = ""
        if current_model and models and current_model not in model_ids:
            hint = f"；当前默认模型「{current_model}」不在可用列表中，请手动选择"

        if models:
            message = f"连接测试通过，共发现 {len(models)} 个可用模型{hint}"
        else:
            message = "连接测试通过"

        return {
            "ok": True,
            "message": message,
            "models_count": len(models),
            "model": current_model,
            "models": [item["id"] for item in models],
        }

    def _test_via_chat(self) -> dict[str, Any]:
        content = self.generate(
            system="You are a connection test assistant. Reply with ok only.",
            messages=[{"role": "user", "content": "ping"}],
            params={"max_tokens": 8, "temperature": 0},
        )
        return {
            "ok": True,
            "message": "连接测试通过（通过聊天接口验证）",
            "models_count": None,
            "model": self.config.get("model") or "",
            "models": [],
            "preview": (content or "")[:80],
        }

    def generate(
        self,
        system: str = "",
        messages: Optional[list[dict[str, str]]] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> str:
        """
        Call OpenAI-compatible chat completions.

        Args:
            system: Optional system prompt, prepended as a system message.
            messages: Chat messages as [{role, content}, ...].
            params: Optional overrides for model / temperature / top_p / max_tokens.
        """
        params = params or {}
        if not self.config.get("api_key"):
            raise ModelClientError("API Key 未配置，请先在模型配置页填写")

        chat_messages: list[dict[str, str]] = []
        if system:
            chat_messages.append({"role": "system", "content": system})
        if messages:
            chat_messages.extend(messages)
        if not chat_messages:
            raise ModelClientError("messages 不能为空")

        payload = {
            "model": params.get("model") or self.config["model"],
            "messages": chat_messages,
            "temperature": params.get(
                "temperature", self.config.get("temperature", 0.7)
            ),
            "top_p": params.get("top_p", self.config.get("top_p", 0.9)),
            "max_tokens": params.get(
                "max_tokens", self.config.get("max_tokens", 2048)
            ),
        }

        data = self._request(
            "POST",
            "/chat/completions",
            json=payload,
            timeout=120.0,
        )
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ModelClientError("模型响应格式无效，未找到生成内容") from exc


def build_client(overrides: Optional[dict[str, Any]] = None) -> ModelClient:
    """Create a ModelClient from saved config plus optional request overrides."""
    return ModelClient(resolve_runtime_config(overrides))
