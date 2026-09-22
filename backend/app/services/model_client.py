"""OpenAI-compatible model client with streaming support."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any, Optional

import httpx

from app.config import is_masked_api_key, load_config, mask_api_key
from app.services import prompt_loader

TOOL_CALL_DONE = {"type": "done", "finish_reason": ""}


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


def _extract_error_from_bytes(content: bytes, status_code: int) -> str:
    text = content.decode("utf-8", errors="replace").strip()
    if not text:
        return f"API 错误 ({status_code})"
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict) and err.get("message"):
                return f"API 错误 ({status_code}): {err['message']}"
            if isinstance(err, str):
                return f"API 错误 ({status_code}): {err}"
            if data.get("message"):
                return f"API 错误 ({status_code}): {data['message']}"
    except json.JSONDecodeError:
        pass
    return f"API 错误 ({status_code}): {text[:300]}"


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

    def _build_messages(
        self,
        system: str = "",
        messages: Optional[list[dict[str, Any]]] = None,
    ) -> list[dict[str, Any]]:
        chat_messages: list[dict[str, Any]] = []
        if system:
            chat_messages.append({"role": "system", "content": system})
        if messages:
            chat_messages.extend(messages)
        if not chat_messages:
            raise ModelClientError("messages 不能为空")
        return chat_messages

    def _build_chat_payload(
        self,
        system: str = "",
        messages: Optional[list[dict[str, Any]]] = None,
        params: Optional[dict[str, Any]] = None,
        *,
        stream: bool = False,
        tools: Optional[list[dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
    ) -> dict[str, Any]:
        params = params or {}
        if not self.config.get("api_key"):
            raise ModelClientError("API Key 未配置，请先在模型配置页填写")

        payload: dict[str, Any] = {
            "model": params.get("model") or self.config["model"],
            "messages": self._build_messages(system, messages),
            "temperature": params.get(
                "temperature", self.config.get("temperature", 0.7)
            ),
            "top_p": params.get("top_p", self.config.get("top_p", 0.9)),
            "max_tokens": params.get(
                "max_tokens", self.config.get("max_tokens", 2048)
            ),
            "stream": stream,
        }
        if tools:
            payload["tools"] = tools
        if tool_choice is not None:
            payload["tool_choice"] = tool_choice
        return payload

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
            system=prompt_loader.get("connection_test"),
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
        messages: Optional[list[dict[str, Any]]] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> str:
        """
        Non-streaming chat completion. Prefer generate_stream for UI generation.
        """
        return self.generate_detailed(system, messages, params)["content"]

    def generate_detailed(
        self,
        system: str = "",
        messages: Optional[list[dict[str, Any]]] = None,
        params: Optional[dict[str, Any]] = None,
        timeout: float = 120.0,
    ) -> dict[str, Any]:
        """Non-streaming completion，额外返回 finish_reason / usage。

        推理类模型（DeepSeek-R1 系、o1 系等）的思考 token 也计入 max_tokens，
        预算不足时会出现 finish_reason="length" 且 content 为空。调用方需要
        finish_reason 才能区分「生成失败」与「预算被推理耗尽」，故单独暴露。

        Returns: {"content": str, "finish_reason": str, "usage": dict}
        """
        payload = self._build_chat_payload(system, messages, params, stream=False)
        data = self._request(
            "POST",
            "/chat/completions",
            json=payload,
            timeout=timeout,
        )
        try:
            choice = data["choices"][0]
            message = choice["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ModelClientError("模型响应格式无效，未找到生成内容") from exc
        if not isinstance(message, dict):
            raise ModelClientError("模型响应格式无效，未找到生成内容")
        return {
            "content": message.get("content") or "",
            "finish_reason": choice.get("finish_reason") or "",
            "usage": data.get("usage") or {},
        }

    def chat(
        self,
        system: str = "",
        messages: Optional[list[dict[str, Any]]] = None,
        tools: Optional[list[dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """
        Non-streaming completion with optional native function-calling.

        Returns the full assistant message dict:
          {"content": str|None, "tool_calls": [{"id","type","function":{"name","arguments"}}]|None}
        When no tools are given (or none invoked), returns
          {"content": <str>, "tool_calls": []} for call-site convenience.
        """
        payload = self._build_chat_payload(
            system, messages, params, stream=False, tools=tools, tool_choice=tool_choice
        )
        data = self._request(
            "POST",
            "/chat/completions",
            json=payload,
            timeout=120.0,
        )
        try:
            message = data["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ModelClientError("模型响应格式无效，未找到生成内容") from exc
        if not isinstance(message, dict):
            raise ModelClientError("模型响应格式无效，未找到生成内容")
        tool_calls = message.get("tool_calls") or []
        if not tool_calls:
            return {
                "content": message.get("content") or "",
                "tool_calls": [],
            }
        return {
            "content": message.get("content") or "",
            "tool_calls": list(tool_calls),
        }

    def chat_stream(
        self,
        system: str = "",
        messages: Optional[list[dict[str, Any]]] = None,
        tools: Optional[list[dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> Iterator[dict[str, Any]]:
        """
        Streaming completion supporting both content and tool_call deltas.

        Yields per-chunk dicts:
          {"type":"reasoning","text":"..."}   # 推理模型思考增量（reasoning_content
                                              # 优先、reasoning 兜底；无则不产出）
          {"type":"content","text":"..."}
          {"type":"tool_call","index":0,"id":"call_..","name":"fn","arguments":"..."}
        and a final {"type":"done","finish_reason":"stop"|"tool_calls"}.
        """
        payload = self._build_chat_payload(
            system, messages, params, stream=True, tools=tools, tool_choice=tool_choice
        )
        url = f"{self.base_url}/chat/completions"
        timeout = httpx.Timeout(120.0, connect=30.0)

        try:
            with httpx.Client(timeout=timeout) as client:
                with client.stream(
                    "POST",
                    url,
                    headers=self._headers(),
                    json=payload,
                ) as response:
                    if response.status_code >= 400:
                        body = response.read()
                        raise ModelClientError(
                            _extract_error_from_bytes(body, response.status_code),
                            status_code=response.status_code,
                        )
                    yield from self._iter_chat_deltas(response)
        except ModelClientError:
            raise
        except httpx.TimeoutException as exc:
            raise ModelClientError("请求超时，请检查 API 地址或网络连接") from exc
        except httpx.RequestError as exc:
            raise ModelClientError(f"无法连接 API：{exc}") from exc

    @staticmethod
    def _iter_chat_deltas(response: httpx.Response) -> Iterator[dict[str, Any]]:
        for line in response.iter_lines():
            if not line:
                continue
            text = line.strip()
            if not text.startswith("data:"):
                continue
            data = text[5:].strip()
            if not data or data == "[DONE]":
                yield TOOL_CALL_DONE
                return
            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                continue
            if not isinstance(chunk, dict):
                continue

            err = chunk.get("error")
            if err:
                if isinstance(err, dict):
                    message = str(err.get("message") or err)
                else:
                    message = str(err)
                raise ModelClientError(f"API 错误: {message}")

            choices = chunk.get("choices") or []
            if not choices:
                continue
            choice = choices[0] if isinstance(choices[0], dict) else {}
            delta = choice.get("delta") or {}
            if not isinstance(delta, dict):
                continue

            # 推理模型（DeepSeek/Kimi/Qwen/GLM 等约定）的思考增量恒在 content
            # 之前；两字段名即厂商兼容策略，不按厂商分支。无字段时零产出，
            # 非推理模型行为与改造前完全一致。
            reasoning = delta.get("reasoning_content") or delta.get("reasoning")
            if reasoning:
                yield {"type": "reasoning", "text": str(reasoning)}

            content = delta.get("content")
            if content:
                yield {"type": "content", "text": str(content)}

            for tc in delta.get("tool_calls") or []:
                if not isinstance(tc, dict):
                    continue
                fn = tc.get("function") or {}
                if not isinstance(fn, dict):
                    fn = {}
                yield {
                    "type": "tool_call",
                    "index": tc.get("index"),
                    "id": tc.get("id"),
                    "name": fn.get("name"),
                    "arguments": fn.get("arguments") or "",
                }

            finish_reason = choice.get("finish_reason")
            if finish_reason:
                yield {"type": "done", "finish_reason": finish_reason}

    def generate_stream(
        self,
        system: str = "",
        messages: Optional[list[dict[str, Any]]] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> Iterator[str]:
        """
        Streaming chat completion. Yields plain text content deltas.

        Uses OpenAI-compatible SSE: data: {choices:[{delta:{content}}]} / [DONE]
        """
        payload = self._build_chat_payload(system, messages, params, stream=True)
        url = f"{self.base_url}/chat/completions"
        timeout = httpx.Timeout(120.0, connect=30.0)

        try:
            with httpx.Client(timeout=timeout) as client:
                with client.stream(
                    "POST",
                    url,
                    headers=self._headers(),
                    json=payload,
                ) as response:
                    if response.status_code >= 400:
                        body = response.read()
                        raise ModelClientError(
                            _extract_error_from_bytes(body, response.status_code),
                            status_code=response.status_code,
                        )

                    yield from self._iter_content_deltas(response)
        except ModelClientError:
            raise
        except httpx.TimeoutException as exc:
            raise ModelClientError("请求超时，请检查 API 地址或网络连接") from exc
        except httpx.RequestError as exc:
            raise ModelClientError(f"无法连接 API：{exc}") from exc

    def iter_sse(
        self,
        system: str = "",
        messages: Optional[list[dict[str, Any]]] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> Iterator[str]:
        """
        Yield SSE frames for FastAPI StreamingResponse.

        Protocol:
          data: {"content":"..."}\n\n
          data: {"error":"..."}\n\n   (on mid-stream failure)
          data: [DONE]\n\n
        """
        try:
            for chunk in self.generate_stream(system, messages, params):
                yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except ModelClientError as exc:
            yield f"data: {json.dumps({'error': exc.message}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

    @staticmethod
    def _iter_content_deltas(response: httpx.Response) -> Iterator[str]:
        for line in response.iter_lines():
            if not line:
                continue
            text = line.strip()
            if not text.startswith("data:"):
                continue
            data = text[5:].strip()
            if not data or data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                continue
            if not isinstance(chunk, dict):
                continue

            err = chunk.get("error")
            if err:
                if isinstance(err, dict):
                    message = str(err.get("message") or err)
                else:
                    message = str(err)
                raise ModelClientError(f"API 错误: {message}")

            choices = chunk.get("choices") or []
            if not choices:
                continue
            choice = choices[0] if isinstance(choices[0], dict) else {}
            delta = choice.get("delta") or {}
            content = delta.get("content")
            if content:
                yield str(content)


def build_client(overrides: Optional[dict[str, Any]] = None) -> ModelClient:
    """Create a ModelClient from saved config plus optional request overrides."""
    return ModelClient(resolve_runtime_config(overrides))


def aggregate_tool_calls(deltas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Coalesce chunked streaming tool_call deltas (by index) into full calls.

    Concatenates the split `arguments` fragments and JSON-parses them
    (tolerating failures → empty dict). Returns
    [{"id","name","arguments": dict}].
    """
    buckets: dict[Any, dict[str, Any]] = {}
    order: list[Any] = []
    for d in deltas:
        if d.get("type") != "tool_call":
            continue
        index = d.get("index")
        if index is None:
            index = len(order)
        bucket = buckets.get(index)
        if bucket is None:
            bucket = {"id": "", "name": "", "arguments": ""}
            buckets[index] = bucket
            order.append(index)
        if d.get("id"):
            bucket["id"] = d["id"]
        if d.get("name"):
            bucket["name"] = d["name"]
        bucket["arguments"] += d.get("arguments") or ""

    calls: list[dict[str, Any]] = []
    for index in order:
        bucket = buckets[index]
        args_text = (bucket["arguments"] or "").strip()
        try:
            args = json.loads(args_text) if args_text else {}
        except json.JSONDecodeError:
            args = {}
        if not isinstance(args, dict):
            args = {}
        calls.append(
            {
                "id": bucket["id"],
                "name": bucket["name"],
                "arguments": args,
            }
        )
    return calls


def message_has_tool_calls(message: Optional[dict[str, Any]]) -> bool:
    return bool(message and (message.get("tool_calls") or []))
