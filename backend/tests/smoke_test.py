"""
AI 小说创作 Agent — 端到端冒烟测试（联调用）。

覆盖 MVP 主流程与异常处理，可反复执行：

    python backend/tests/smoke_test.py               # 全部用例
    python backend/tests/smoke_test.py --skip-model  # 跳过真实模型调用（离线）
    python backend/tests/smoke_test.py --keep        # 保留测试项目，不清理

模型相关用例依赖 data/config.json 中已配置且可用的 API；
未配置时自动跳过并在报告中标记为 SKIP。

退出码：0 全部通过；1 存在失败用例。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from typing import Any, Optional

import httpx

BASE_URL = "http://127.0.0.1:8001"
HTTP_TIMEOUT = 30.0
SSE_TIMEOUT = 180.0

# 测试用自定义技能名，避免与内置技能冲突
CUSTOM_SKILL_NAME = "冒烟测试技能"

# --- 轻量断言与结果收集 ---------------------------------------------------

PASS = "PASS"
FAIL = "FAIL"
SKIP = "SKIP"


class Report:
    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str]] = []
        self.started = time.time()

    def record(self, name: str, status: str, detail: str = "") -> None:
        self.rows.append((name, status, detail))
        icon = {PASS: "[ OK ]", FAIL: "[FAIL]", SKIP: "[SKIP]"}[status]
        line = f"{icon} {name}"
        if detail:
            line += f" — {detail}"
        print(line, flush=True)

    def ok(self, name: str, detail: str = "") -> None:
        self.record(name, PASS, detail)

    def skip(self, name: str, detail: str = "") -> None:
        self.record(name, SKIP, detail)

    def fail(self, name: str, detail: str = "") -> None:
        self.record(name, FAIL, detail)

    def check(self, name: str, cond: bool, detail: str = "") -> bool:
        if cond:
            self.ok(name, detail)
        else:
            self.fail(name, detail)
        return cond

    def summary(self) -> int:
        passed = sum(1 for _, s, _ in self.rows if s == PASS)
        failed = sum(1 for _, s, _ in self.rows if s == FAIL)
        skipped = sum(1 for _, s, _ in self.rows if s == SKIP)
        dur = time.time() - self.started
        print()
        print("=" * 62)
        print(f"总计 {len(self.rows)} 项：通过 {passed} / 失败 {failed} / 跳过 {skipped}"
              f"（耗时 {dur:.1f}s）")
        print("=" * 62)
        if failed:
            print("\n失败明细：")
            for name, status, detail in self.rows:
                if status == FAIL:
                    print(f"  - {name}：{detail}")
        return 1 if failed else 0


class ApiError(Exception):
    """Unexpected HTTP status from the app under test."""

    def __init__(self, status: int, detail: Any):
        super().__init__(f"HTTP {status}: {detail}")
        self.status = status
        self.detail = detail


class Client:
    """Thin HTTP client that also exposes expected-error helpers."""

    def __init__(self, base_url: str) -> None:
        # trust_env=False: 本地联调须绕过系统代理，否则 127.0.0.1 会被代理拦截
        self.http = httpx.Client(
            base_url=base_url, timeout=HTTP_TIMEOUT, trust_env=False
        )

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        expect: Optional[int] = None,
        timeout: Optional[float] = None,
    ) -> httpx.Response:
        resp = self.http.request(
            method, path, json=json_body, timeout=timeout or HTTP_TIMEOUT
        )
        if expect is not None and resp.status_code != expect:
            raise ApiError(resp.status_code, _safe_detail(resp))
        return resp

    def get(self, path: str, expect: int = 200, **kw: Any) -> httpx.Response:
        return self.request("GET", path, expect=expect, **kw)

    def post(self, path: str, body: Any = None, expect: int = 200, **kw: Any):
        return self.request("POST", path, json_body=body, expect=expect, **kw)

    def put(self, path: str, body: Any = None, expect: int = 200, **kw: Any):
        return self.request("PUT", path, json_body=body, expect=expect, **kw)

    def delete(self, path: str, expect: int = 200, **kw: Any):
        return self.request("DELETE", path, expect=expect, **kw)

    def close(self) -> None:
        self.http.close()


def _safe_detail(resp: httpx.Response) -> Any:
    try:
        return resp.json().get("detail", resp.text)
    except Exception:
        return resp.text[:300]


def error_detail(resp: httpx.Response) -> str:
    """Read the `detail` field of an error response as a string."""
    try:
        detail = resp.json().get("detail")
    except Exception:
        return resp.text[:200]
    if isinstance(detail, list):  # pydantic ValidationError 列表
        return json.dumps(detail, ensure_ascii=False)[:300]
    return str(detail)


def expect_error(
    report: Report,
    name: str,
    status: int,
    cond: bool,
    hint: str = "",
) -> None:
    """Assert an error response has the expected status and a readable message."""
    detail = hint
    if not cond:
        report.fail(name, f"期望 {status}，实际不符。{hint}")
        return
    report.ok(name, f"HTTP {status} · {detail[:80]}")


def parse_sse(raw: str) -> list[dict[str, Any]]:
    """Parse an SSE body into the JSON payloads it carried."""
    events: list[dict[str, Any]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data or data == "[DONE]":
            continue
        try:
            events.append(json.loads(data))
        except json.JSONDecodeError:
            continue
    return events


def sse_text(events: list[dict[str, Any]]) -> str:
    return "".join(e.get("content", "") for e in events if e.get("type") == "content")


def sse_errors(events: list[dict[str, Any]]) -> list[str]:
    return [str(e.get("error", "")) for e in events if e.get("type") == "error"]


# --- 用例分组 -------------------------------------------------------------

SECTION_WIDTH = 62


def section(title: str) -> None:
    print(f"\n--- {title} " + "-" * max(0, SECTION_WIDTH - len(title) - 5))


def test_health(c: Client, r: Report) -> None:
    section("0. 服务健康检查")
    try:
        resp = c.get("/api/health", expect=200)
    except (ApiError, httpx.RequestError) as exc:
        r.fail("健康检查", f"无法连接 {BASE_URL} — {exc}")
        raise SystemExit(
            "后端未启动。请先在 backend/ 目录执行 `python run.py` 后重试。"
        )
    body = resp.json()
    r.check("健康检查", body.get("status") == "ok", body.get("message", ""))


def test_config(c: Client, r: Report, skip_model: bool) -> bool:
    """返回模型 API 是否可用（决定后续用例是否跳过）。"""
    section("1. 全局设置 · API 配置")
    resp = c.get("/api/config", expect=200)
    cfg = resp.json()
    r.ok("读取配置", f"model={cfg.get('model')!r}")

    has_key = bool(cfg.get("api_key_configured"))
    r.check("API Key 已配置标记", isinstance(has_key, bool), f"configured={has_key}")

    # 密钥脱敏：读接口不得回显明文
    masked = str(cfg.get("api_key") or "")
    if has_key:
        r.check(
            "密钥脱敏",
            "****" in masked,
            f"api_key={masked}",
        )
    else:
        r.ok("密钥脱敏", "未配置密钥，跳过")

    # 参数越界应被 422 拦截
    resp = c.http.post("/api/config", json={"temperature": 99})
    expect_error(
        r,
        "参数校验：temperature 越界",
        422,
        resp.status_code == 422,
        error_detail(resp),
    )

    if skip_model or not has_key:
        r.skip("连接测试", "--skip-model 或未配置 API Key")
        return False

    resp = c.http.post("/api/config/test", json={})
    if resp.status_code == 200:
        body = resp.json()
        r.ok("连接测试", body.get("message", "")[:60])
        return True
    r.fail("连接测试", f"HTTP {resp.status_code} · {error_detail(resp)[:120]}")
    return False


def test_config_error_paths(c: Client, r: Report) -> None:
    """配置错误提示：错误地址 / 错误密钥 应给出可读信息而非 500。"""
    section("1b. 配置异常提示")
    resp = c.http.post(
        "/api/config/test",
        json={"api_base": "http://127.0.0.1:59999/v1", "api_key": "sk-bad"},
        timeout=30,
    )
    if resp.status_code == 200:
        r.fail("无效地址连接测试", "无效地址却返回了成功")
    else:
        msg = error_detail(resp)
        r.check(
            "无效地址连接测试",
            resp.status_code in (400, 401, 502),
            f"HTTP {resp.status_code} · {msg[:90]}",
        )


def test_skills(c: Client, r: Report) -> None:
    section("2. 技能库管理")
    resp = c.get("/api/skills", expect=200)
    body = resp.json()
    names = {s["name"] for s in body["skills"]}
    r.ok("技能列表", f"共 {body['count']} 个：{', '.join(sorted(names))}")

    for preset in ("续写", "润色", "扩写", "生成设定"):
        r.check(f"内置技能 {preset}", preset in names)

    r.check(
        "技能加载无错误",
        not body.get("load_errors"),
        "; ".join(body.get("load_errors") or [])[:80],
    )

    # kind 过滤
    qa = c.get("/api/skills?kind=quick_action", expect=200).json()
    r.check(
        "按 kind 过滤",
        all(s["kind"] == "quick_action" for s in qa["skills"]),
        f"{qa['count']} 个 quick_action",
    )

    # 非法 kind
    resp = c.http.get("/api/skills?kind=nope")
    expect_error(r, "非法 kind 参数", 400, resp.status_code == 400, error_detail(resp))

    # 详情
    resp = c.get("/api/skills/续写", expect=200)
    detail = resp.json()
    r.check(
        "技能详情含 system 与正文",
        bool(detail.get("system")) and bool(detail.get("user_template")),
        f"source={detail.get('source')}",
    )

    # 不存在的技能
    resp = c.http.get("/api/skills/不存在的技能")
    expect_error(r, "技能不存在", 404, resp.status_code == 404, error_detail(resp))

    # --- 自定义技能 增删改 ---
    payload = {
        "name": CUSTOM_SKILL_NAME,
        "description": "冒烟测试用，可安全删除",
        "kind": "skill",
        "disable_model_invocation": True,
        "user_template": "测试模板：$user_input",
    }
    resp = c.http.put(f"/api/skills/{CUSTOM_SKILL_NAME}", json=payload)
    if not r.check(
        "新建自定义技能",
        resp.status_code == 200,
        error_detail(resp) if resp.status_code != 200 else "",
    ):
        return
    r.check(
        "自定义技能 source=custom",
        resp.json().get("source") == "custom",
        resp.json().get("path", ""),
    )

    # 重名冲突
    resp = c.http.put(f"/api/skills/{CUSTOM_SKILL_NAME}", json=payload)
    r.check(
        "同名技能可覆盖更新",
        resp.status_code == 200,
        error_detail(resp) if resp.status_code != 200 else "",
    )

    # 校验：kind 非法
    resp = c.http.put(
        f"/api/skills/{CUSTOM_SKILL_NAME}",
        json={**payload, "kind": "unknown_kind"},
    )
    expect_error(r, "自定义技能 kind 非法", 400, resp.status_code == 400, error_detail(resp))

    # 校验：正文为空
    resp = c.http.put(
        f"/api/skills/{CUSTOM_SKILL_NAME}", json={**payload, "user_template": "  "}
    )
    expect_error(r, "自定义技能正文为空", 422, resp.status_code == 422, error_detail(resp))

    # 内置技能不可覆盖
    resp = c.http.put("/api/skills/续写", json=payload)
    expect_error(r, "内置技能禁止覆盖", 400, resp.status_code == 400, error_detail(resp))

    # 删除自定义
    resp = c.http.delete(f"/api/skills/{CUSTOM_SKILL_NAME}")
    r.check(
        "删除自定义技能",
        resp.status_code in (200, 404),
        error_detail(resp) if resp.status_code not in (200, 404) else "",
    )

    # 内置技能不可删除
    resp = c.http.delete("/api/skills/续写")
    expect_error(r, "内置技能禁止删除", 400, resp.status_code == 400, error_detail(resp))

    # 清理可能遗留的文件
    c.http.delete(f"/api/skills/{CUSTOM_SKILL_NAME}")


def test_projects(c: Client, r: Report) -> str:
    section("3. 项目 CRUD")
    name = f"[冒烟] {uuid.uuid4().hex[:8]}"
    resp = c.post(
        "/api/projects",
        {
            "name": name,
            "genre": "都市奇幻",
            "description": "联调测试项目",
            "global_rules": "禁止出现现代科技产物。",
            "style_preference": "冷峻克制",
            "synopsis": "一名守夜人在旧城区的第七个冬天。",
            "first_chapter_title": "第一章 雪落",
        },
        expect=200,
    )
    body = resp.json()
    pid = body["meta"]["id"]
    r.ok("创建项目", f"id={pid}")

    r.check(
        "项目详情含 settings/outline",
        body["settings"]["global_rules"].startswith("禁止")
        and body["outline"]["synopsis"].startswith("一名"),
    )

    # 首章自动创建
    chapters = c.get(f"/api/projects/{pid}/chapters", expect=200).json()
    r.check(
        "创建时生成首章",
        len(chapters) == 1 and chapters[0]["title"] == "第一章 雪落",
        f"{len(chapters)} 章",
    )

    # 更新
    resp = c.put("/api/projects/" + pid, {"name": name + "-改"}, expect=200)
    r.check("更新项目名", resp.json()["meta"]["name"].endswith("-改"))

    # 空请求体
    resp = c.http.put(f"/api/projects/{pid}", json={})
    expect_error(r, "空请求体被拒", 400, resp.status_code == 400, error_detail(resp))

    # 空名称
    resp = c.http.post("/api/projects", json={"name": "   "})
    expect_error(r, "空项目名被拒", 422, resp.status_code == 422, error_detail(resp))

    # 不存在的项目
    resp = c.http.get("/api/projects/not-exist-xxx")
    expect_error(r, "项目不存在返回 404", 404, resp.status_code == 404, error_detail(resp))

    # 列表包含新项目
    projects = c.get("/api/projects", expect=200).json()
    r.check("项目列表包含新项目", any(p["id"] == pid for p in projects))
    return pid


def test_chapters(c: Client, r: Report, pid: str) -> str:
    section("4. 章节读写与保存")
    cid = c.get(f"/api/projects/{pid}/chapters", expect=200).json()[0]["id"]

    content = "雪落在旧城区的屋脊上。守夜人提着灯，走过第七个冬天。"
    resp = c.put(
        f"/api/projects/{pid}/chapters/{cid}",
        {"title": "第一章 雪落", "content": content},
        expect=200,
    )
    body = resp.json()
    r.check("保存章节正文", body["content"] == content, f"{body.get('word_count')} 字")

    # 重新读取，验证持久化
    again = c.get(f"/api/projects/{pid}/chapters/{cid}", expect=200).json()
    r.check("重新读取内容一致", again["content"] == content)

    # 新建第二章
    resp = c.post(
        f"/api/projects/{pid}/chapters",
        {"title": "第二章 灯下", "content": ""},
        expect=200,
    )
    cid2 = resp.json()["id"]
    r.check("新建第二章", bool(cid2), f"order={resp.json()['order']}")

    chapters = c.get(f"/api/projects/{pid}/chapters", expect=200).json()
    r.check("章节列表含两章", len(chapters) == 2)

    # 空标题
    resp = c.http.post(f"/api/projects/{pid}/chapters", json={"title": "", "content": "x"})
    expect_error(r, "空章节标题被拒", 422, resp.status_code == 422, error_detail(resp))

    # 不存在的章节
    resp = c.http.get(f"/api/projects/{pid}/chapters/nope-xxx")
    expect_error(r, "章节不存在返回 404", 404, resp.status_code == 404, error_detail(resp))

    # 删除第二章
    c.http.delete(f"/api/projects/{pid}/chapters/{cid2}")
    return cid


def test_memory(c: Client, r: Report, pid: str) -> None:
    section("5. 设定库 CRUD")
    base = f"/api/projects/{pid}/memory"

    # 世界观
    resp = c.post(
        base + "/worldview",
        {"name": "旧城区", "content": "常年落雪，夜里只有守夜人的灯。", "tags": ["地点"]},
        expect=200,
    )
    wv_id = resp.json()["id"]
    r.check("新增世界观条目", bool(wv_id), resp.json()["name"])

    # 故事内核
    resp = c.post(
        base + "/story_core",
        {"name": "核心冲突", "content": "守夜人与漫长冬夜的对峙。"},
        expect=200,
    )
    sc_id = resp.json()["id"]
    r.check("新增故事内核条目", bool(sc_id))

    # 人物（含内嵌关系）
    resp = c.post(
        base + "/characters",
        {
            "name": "沈砚",
            "profile": "守夜人，沉默寡言，提一盏旧灯。",
            "relationship": [{"type": "师徒", "target": "老周"}],
            "tags": ["主角"],
        },
        expect=200,
    )
    ch_body = resp.json()
    ch_id = ch_body["id"]
    rel_ok = any(
        x.get("type") == "师徒" and x.get("target") == "老周"
        for x in ch_body.get("relationship", [])
    )
    r.check("新增人物并内嵌关系", rel_ok, json.dumps(ch_body.get("relationship"), ensure_ascii=False))

    # legacy content -> profile 兼容
    resp = c.post(
        base + "/characters",
        {"name": "老周", "content": "上一任守夜人。", "relationship": []},
        expect=200,
    )
    r.check(
        "人物 content 兼容为 profile",
        resp.json().get("profile") == "上一任守夜人。",
        f"profile={resp.json().get('profile')!r}",
    )

    # 更新
    resp = c.put(
        f"{base}/characters/{ch_id}",
        {"profile": "守夜人，沉默寡言；左手指节有旧伤。"},
        expect=200,
    )
    r.check("更新人物 profile", "旧伤" in resp.json().get("profile", ""))

    # 空请求体
    resp = c.http.put(f"{base}/characters/{ch_id}", json={})
    expect_error(r, "更新空请求体被拒", 400, resp.status_code == 400, error_detail(resp))

    # 非法分类
    resp = c.http.post(base + "/items", json={"name": "x", "content": "y"})
    expect_error(r, "已弃用分类 items 被拒", 400, resp.status_code == 400, error_detail(resp))

    resp = c.http.post(base + "/nope", json={"name": "x", "content": "y"})
    expect_error(r, "非法分类被拒", 400, resp.status_code == 400, error_detail(resp))

    # 空名称
    resp = c.http.post(base + "/worldview", json={"name": "  "})
    expect_error(r, "空条目名被拒", 422, resp.status_code == 422, error_detail(resp))

    # 删除不存在的条目
    resp = c.http.delete(f"{base}/worldview/nope-xxx")
    expect_error(r, "删除不存在条目返回 404", 404, resp.status_code == 404, error_detail(resp))

    # 整体读取校验
    mem = c.get(base, expect=200).json()
    r.check(
        "设定库整体读取",
        len(mem["worldview"]) == 1
        and len(mem["characters"]) == 2
        and len(mem["story_core"]) == 1,
        f"wv={len(mem['worldview'])} ch={len(mem['characters'])} sc={len(mem['story_core'])}",
    )

    # 删除
    resp = c.http.delete(f"{base}/worldview/{wv_id}")
    r.check("删除世界观条目", resp.status_code == 200)
    mem = c.get(base, expect=200).json()
    r.check("删除后条目消失", len(mem["worldview"]) == 0)


def test_sessions(c: Client, r: Report, pid: str) -> str:
    section("6. Agent 会话")
    resp = c.post(
        f"/api/projects/{pid}/agent/sessions", {"title": "联调会话"}, expect=200
    )
    sid = resp.json()["id"]
    r.check("新建会话", bool(sid), resp.json().get("title", ""))

    resp = c.get(f"/api/projects/{pid}/agent/sessions", expect=200)
    r.check("会话列表", resp.json()["count"] >= 1)

    resp = c.get(f"/api/projects/{pid}/agent/sessions/{sid}", expect=200)
    r.check("会话详情", resp.json()["id"] == sid)

    resp = c.http.get(f"/api/projects/{pid}/agent/sessions/nope-xxx")
    expect_error(r, "会话不存在返回 404", 404, resp.status_code == 404, error_detail(resp))

    resp = c.http.get("/api/projects/not-exist-xxx/agent/sessions")
    expect_error(r, "项目不存在时会话列表 404", 404, resp.status_code == 404, error_detail(resp))

    return sid


def test_generate_errors(c: Client, r: Report, pid: str, sid: str) -> None:
    """生成接口的前置校验（不发真实请求）。"""
    section("7. 生成接口前置校验")
    path = f"/api/projects/{pid}/generate"

    resp = c.http.post(path, json={"session_id": sid, "skill_name": "不存在的技能"})
    expect_error(r, "未知 skill 返回 404", 404, resp.status_code == 404, error_detail(resp))

    resp = c.http.post(path, json={"session_id": "nope-xxx"})
    expect_error(r, "未知会话返回 404", 404, resp.status_code == 404, error_detail(resp))

    resp = c.http.post(path, json={})
    expect_error(r, "缺少 session_id 返回 422", 422, resp.status_code == 422, error_detail(resp))

    resp = c.http.post("/api/projects/not-exist-xxx/generate", json={"session_id": sid})
    expect_error(r, "项目不存在返回 404", 404, resp.status_code == 404, error_detail(resp))


def _stream_generate(
    c: Client,
    pid: str,
    sid: str,
    *,
    skill_name: Optional[str] = None,
    user_input: str = "",
    chapter_id: Optional[str] = None,
    current_content: str = "",
    selected_text: str = "",
) -> tuple[list[dict[str, Any]], int]:
    body: dict[str, Any] = {
        "session_id": sid,
        "chapter_id": chapter_id,
        "current_content": current_content,
        "selected_text": selected_text,
        "user_input": user_input,
    }
    if skill_name:
        body["skill_name"] = skill_name
    with c.http.stream(
        "POST",
        f"/api/projects/{pid}/generate",
        json=body,
        timeout=SSE_TIMEOUT,
    ) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return parse_sse(raw), resp.status_code


def test_generate_continue(
    c: Client, r: Report, pid: str, sid: str, chapter_id: str
) -> None:
    """核心链路：续写 → 流式 → 落盘会话。"""
    section("8. 核心链路：续写（真实模型流式）")
    seed = "雪落在旧城区的屋脊上。守夜人提着灯，走过第七个冬天。"
    try:
        events, status = _stream_generate(
            c,
            pid,
            sid,
            skill_name="续写",
            chapter_id=chapter_id,
            current_content=seed,
            user_input="请续写下一段，约 150 字。",
        )
    except httpx.RequestError as exc:
        r.fail("续写流式生成", f"请求失败：{exc}")
        return

    if status != 200:
        r.fail("续写流式生成", f"HTTP {status}")
        return

    errs = sse_errors(events)
    if errs:
        r.fail("续写流式生成", f"流中返回错误：{errs[0][:150]}")
        return

    metas = [e for e in events if e.get("type") == "meta"]
    if not r.check("收到 meta 帧", bool(metas)):
        return
    r.ok(
        "meta 帧内容",
        f"skill={metas[-1].get('skill_name')!r} draft={metas[-1].get('draft')}",
    )
    r.check(
        "续写被判定为正文草稿",
        metas[-1].get("draft") is True,
        "draft 应为 True 以便前端展示「采纳」卡片",
    )

    text = sse_text(events)
    if not r.check("流式返回正文", len(text) > 20, f"{len(text)} 字：{text[:40]}…"):
        return
    r.ok("续写正文预览", text[:70].replace("\n", " ") + "…")

    tools = [t for e in events if e.get("type") == "tool_progress" for t in e.get("tools", [])]
    r.ok("工具调用情况", f"{len(tools)} 次" if tools else "未调用工具（可接受）")

    # 会话落盘
    detail = c.get(f"/api/projects/{pid}/agent/sessions/{sid}", expect=200).json()
    msgs = detail["messages"]
    r.check("会话已落盘两条消息", len(msgs) >= 2, f"{len(msgs)} 条")

    assistant = [m for m in msgs if m.get("role") == "assistant"]
    if r.check("存在 assistant 消息", bool(assistant)):
        last = assistant[-1]
        draft_flag = bool(metas[-1].get("draft"))
        r.check(
            "assistant 消息已写入正文",
            last.get("content", "").startswith(text[:10]),
            f"{len(last.get('content', ''))} 字",
        )
        # draft=True 时消息保持 pending，等待用户「采纳/丢弃」，属预期行为
        r.check(
            "pending 状态与 draft 一致",
            bool(last.get("pending")) == draft_flag,
            f"pending={last.get('pending')} draft={draft_flag}",
        )
        r.check("assistant 标记 skill=续写", last.get("skill") == "续写")


def test_generate_polish(c: Client, r: Report, pid: str, sid: str, chapter_id: str) -> None:
    section("9. 快捷指令：润色（真实模型）")
    selected = "他走得很快，雪很大，他很冷。"
    try:
        events, status = _stream_generate(
            c,
            pid,
            sid,
            skill_name="润色",
            chapter_id=chapter_id,
            selected_text=selected,
            user_input="请润色这段文字。",
        )
    except httpx.RequestError as exc:
        r.fail("润色生成", f"请求失败：{exc}")
        return

    errs = sse_errors(events)
    if errs:
        r.fail("润色生成", errs[0][:150])
        return
    text = sse_text(events)
    r.check("润色返回内容", len(text) > 10, text[:60].replace("\n", " ") + "…")


def test_generate_freetext(c: Client, r: Report, pid: str, sid: str) -> None:
    section("10. 自由输入（Router/闲聊路径）")
    try:
        events, status = _stream_generate(
            c,
            pid,
            sid,
            user_input="用一句话说明：这本书的主角是谁？",
        )
    except httpx.RequestError as exc:
        r.fail("自由输入生成", f"请求失败：{exc}")
        return
    errs = sse_errors(events)
    if errs:
        r.fail("自由输入生成", errs[0][:150])
        return
    text = sse_text(events)
    metas = [e for e in events if e.get("type") == "meta"]
    picked = (metas[-1].get("skill_name") or "") if metas else ""
    preview = text[:50].replace("\n", " ")
    r.check(
        "自由输入返回内容",
        len(text) > 5,
        f"路由结果 skill={picked or '(闲聊)'} · {preview}…",
    )


def test_onboarding(c: Client, r: Report) -> None:
    section("11. 引导页 AI 一键生成设定（真实模型）")
    payload = {
        "topic": "旧城区守夜人与漫长冬夜",
        "genre": "都市奇幻",
        "section": "worldview",
    }
    try:
        resp = c.http.post(
            "/api/onboarding/generate", json=payload, timeout=SSE_TIMEOUT
        )
    except httpx.RequestError as exc:
        r.fail("引导生成", f"请求失败：{exc}")
        return
    if resp.status_code != 200:
        r.fail("引导生成", f"HTTP {resp.status_code} · {error_detail(resp)[:150]}")
        return
    body = resp.json()
    r.check(
        "单区生成世界观",
        bool(body.get("worldview")),
        (body.get("worldview") or "")[:60].replace("\n", " ") + "…",
    )


def test_agent_viewer(c: Client, r: Report, pid: str) -> None:
    section("12. Agent Viewer 观测接口")
    resp = c.get(f"/api/dev/projects/{pid}/agent/runs", expect=200)
    runs = resp.json()["runs"]
    r.check("run 列表非空", len(runs) >= 1, f"{len(runs)} 条")

    if runs:
        rid = runs[0]["run_id"]
        resp = c.get(f"/api/dev/projects/{pid}/agent/runs/{rid}", expect=200)
        body = resp.json()
        r.check("run 详情可读", "run_id" in body or "steps" in body, rid)

    resp = c.http.get(f"/api/dev/projects/{pid}/agent/runs/nope-xxx")
    expect_error(r, "run 不存在返回 404", 404, resp.status_code == 404, error_detail(resp))


def cleanup(c: Client, r: Report, pid: str) -> None:
    section("13. 清理测试项目")
    resp = c.http.delete(f"/api/projects/{pid}")
    r.check("删除测试项目", resp.status_code == 200)
    resp = c.http.get(f"/api/projects/{pid}")
    r.check("删除后不可访问", resp.status_code == 404)


# --- 入口 -----------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="AINovel 端到端冒烟测试")
    parser.add_argument("--base-url", default=BASE_URL, help="后端地址")
    parser.add_argument(
        "--skip-model", action="store_true", help="跳过所有真实模型调用"
    )
    parser.add_argument("--keep", action="store_true", help="保留测试项目不删除")
    args = parser.parse_args()

    print(f"目标服务：{args.base_url}")
    print(f"时间：{time.strftime('%Y-%m-%d %H:%M:%S')}")

    r = Report()
    c = Client(args.base_url)
    try:
        test_health(c, r)

        model_ok = test_config(c, r, args.skip_model)
        if model_ok:
            test_config_error_paths(c, r)
        else:
            r.skip("配置异常提示", "模型不可用，跳过")

        test_skills(c, r)

        pid = test_projects(c, r)
        try:
            cid = test_chapters(c, r, pid)
            test_memory(c, r, pid)
            sid = test_sessions(c, r, pid)
            test_generate_errors(c, r, pid, sid)

            if model_ok:
                test_generate_continue(c, r, pid, sid, cid)
                test_generate_polish(c, r, pid, sid, cid)
                test_generate_freetext(c, r, pid, sid)
                test_onboarding(c, r)
                test_agent_viewer(c, r, pid)
            else:
                for name in (
                    "续写流式生成",
                    "润色生成",
                    "自由输入生成",
                    "引导生成",
                    "Agent Viewer",
                ):
                    r.skip(name, "模型不可用，跳过")

            if not args.keep:
                cleanup(c, r, pid)
            else:
                r.skip("清理测试项目", f"--keep，项目 {pid} 已保留")
        except ApiError as exc:
            r.fail("流程中断", str(exc))
            if not args.keep:
                print(f"（尝试清理测试项目 {pid}）")
                c.http.delete(f"/api/projects/{pid}")
    finally:
        c.close()

    return r.summary()


if __name__ == "__main__":
    sys.exit(main())
