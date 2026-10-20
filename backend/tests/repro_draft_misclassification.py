"""draft 误判 bug 的稳定复现与回归验证。

背景：旧判定用两条启发式推断「本轮是否正文」——
  1. 读过章节（`reads_work`）就当作在写正文；
  2. 未调工具且输出 > 400 字就当作正文。
而「评估章节、指出问题」这类**讨论型指令**恰恰必须读稿、且天然超 400 字，
于是审阅分析被归入草稿卡（编辑区出现「AI 闲聊 · 待处理 + 插入正文」）。

本脚本对同一份合成稿件跑固定指令，打印每轮的：
  - 实际 `draft` 标记（新逻辑）
  - 旧逻辑会判成的结果（用于确认本用例确实落在旧 bug 区间）
  - 工具调用、字数、是否发出 `draft_hint`、正文是否残留哨兵

用法（后端需先启动）：

    cd backend && python run.py                 # 另开一个终端
    python backend/tests/repro_draft_misclassification.py
    python backend/tests/repro_draft_misclassification.py --runs 3
    python backend/tests/repro_draft_misclassification.py --base-url http://127.0.0.1:8001

退出码：0 全部符合预期；1 存在回归。脚本会自建并删除临时项目，
不读取也不修改任何真实项目数据。

不想调真实模型时，判定逻辑本身有**离线**单测（毫秒级、无外部依赖）：

    python -m unittest discover -s backend/tests -p "test_draft_sentinel.py"
"""

from __future__ import annotations

import argparse
import json
import sys

import httpx

BASE_URL = "http://127.0.0.1:8001"
SSE_TIMEOUT = 240.0

# 讨论型指令：必须读稿、且必然产出长文，正是旧 bug 的触发条件。
DISCUSSION_PROMPT = "请评估第一章的完整性，指出问题和修改建议。"

# 正向对照：快捷指令必须仍然产出草稿卡（防止修 bug 时把成稿路径一起改坏）。
DRAFT_PRESET = "续写"
DRAFT_PROMPT = "请续写下一段。"

# 合成稿件（讨论用例）：刻意重复，保证模型必然给出长篇「内容重复/体量不足」分析，
# 从而稳定落入旧 bug 的超长文本区间。不依赖任何用户真实内容。
SEED_CONTENT = (
    "雪落了一夜。清嘉推门进来，抖落肩上的碎雪。\n\n"
    "公主没有抬头，只把信纸推到灯下。\n\n"
) * 8

# 合成稿件（续写对照）：内容正常、有承接空间，避免模型因稿件退化而拒绝续写。
SEED_PROSE = (
    "雪落了一夜。清嘉推门进来，抖落肩上的碎雪，把一封沾了水汽的信放在案角。\n\n"
    "公主没有抬头，只把信纸推到灯下。烛火晃了一下，她的指尖停在半枚鱼符的拓痕上。\n\n"
    "「你从废园回来。」她说的不是问句。\n\n"
    "清嘉没有应声。炭盆里的火将熄未熄，屋外的更鼓正好敲过三下。\n\n"
    "窗纸上映出一个人影，在院里站了很久，才终于抬手叩门。\n"
)

# 旧逻辑的复刻：读过章节 → draft；或未调工具且超 400 字 → draft。
LEGACY_DRAFT_MIN_CHARS = 400
LEGACY_READ_TOOLS = {"read_chapter", "read_recent_work"}


def stream_generate(
    client: httpx.Client, base: str, project_id: str, payload: dict
) -> list[dict]:
    events: list[dict] = []
    with client.stream(
        "POST", f"{base}/api/projects/{project_id}/generate", json=payload
    ) as resp:
        if resp.status_code != 200:
            resp.read()
            raise SystemExit(f"生成请求失败：HTTP {resp.status_code}")
        for line in resp.iter_lines():
            if not line.startswith("data: "):
                continue
            raw = line[6:]
            if raw.strip() == "[DONE]":
                break
            events.append(json.loads(raw))
    return events


def summarize(events: list[dict]) -> dict:
    metas = [e for e in events if e.get("type") == "meta"]
    tools = [
        t["name"]
        for e in events
        if e.get("type") == "tool_progress"
        for t in e.get("tools", [])
    ]
    text = "".join(e.get("content", "") for e in events if e.get("type") == "content")
    final = metas[-1] if metas else {}
    return {
        "draft": final.get("draft"),
        "skill": final.get("skill_name") or "",
        "anchor": final.get("content_anchor"),
        "tools": tools,
        "chars": len(text),
        "draft_hint": any(e.get("type") == "draft_hint" for e in events),
        "leaked_sentinel": ("[[DRAFT" in text) or ("[[ANCHOR" in text),
        "preview": text[:60].replace("\n", " "),
    }


def legacy_would_be_draft(info: dict) -> bool:
    """复刻已删除的旧启发式，用于确认用例落在旧 bug 区间。"""
    reads_work = any(name in LEGACY_READ_TOOLS for name in info["tools"])
    long_free_text = (not info["tools"]) and info["chars"] > LEGACY_DRAFT_MIN_CHARS
    return reads_work or long_free_text


def main() -> int:
    parser = argparse.ArgumentParser(description="draft 误判 bug 复现与回归验证")
    parser.add_argument("--base-url", default=BASE_URL, help="后端地址")
    parser.add_argument("--runs", type=int, default=1, help="重复次数（验证稳定性）")
    parser.add_argument("--keep", action="store_true", help="保留临时项目")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    client = httpx.Client(timeout=SSE_TIMEOUT)
    failures: list[str] = []
    project_id = ""

    try:
        try:
            client.get(f"{base}/api/health", timeout=10)
        except httpx.RequestError as exc:
            print(f"无法连接 {base}：{exc}")
            print("请先在 backend/ 目录执行 `python run.py`。")
            return 1

        created = client.post(
            f"{base}/api/projects", json={"name": "draft误判复现", "genre": "测试"}
        ).json()
        project_id = created["meta"]["id"]
        chapter = created["outline"]["chapters"][0]
        client.put(
            f"{base}/api/projects/{project_id}/chapters/{chapter['id']}",
            json={"title": "第一章", "content": SEED_CONTENT},
        )
        session_id = client.post(
            f"{base}/api/projects/{project_id}/agent/sessions",
            json={"title": "repro"},
        ).json()["id"]

        print(f"目标服务：{base}")
        print(f"临时项目：{project_id}（脚本结束自动删除）")
        print(f"复现指令：{DISCUSSION_PROMPT}")
        print(f"重复次数：{args.runs}\n")

        for index in range(1, args.runs + 1):
            events = stream_generate(
                client,
                base,
                project_id,
                {
                    "session_id": session_id,
                    "chapter_id": chapter["id"],
                    "current_content": SEED_CONTENT,
                    "user_input": DISCUSSION_PROMPT,
                },
            )
            info = summarize(events)
            legacy = legacy_would_be_draft(info)

            print(f"第 {index} 轮")
            print(f"  工具调用      = {info['tools'] or '无'}")
            print(f"  输出字数      = {info['chars']}")
            print(f"  实际 draft    = {info['draft']}")
            print(f"  旧逻辑会判    = {legacy} （应为 True，才说明落在此前的 bug 区间）")
            print(f"  draft_hint    = {info['draft_hint']}")
            print(f"  正文残留哨兵  = {info['leaked_sentinel']}")
            print(f"  预览          = {info['preview']}")

            if info["draft"] is not False:
                failures.append(f"第 {index} 轮：审阅分析被判为 draft（应为 False）")
            if info["anchor"] is not None:
                failures.append(f"第 {index} 轮：非成稿不应回传 content_anchor")
            if info["draft_hint"]:
                failures.append(f"第 {index} 轮：未声明成稿却发出 draft_hint")
            if info["leaked_sentinel"]:
                failures.append(f"第 {index} 轮：正文残留哨兵")
            if not legacy:
                failures.append(
                    f"第 {index} 轮：该轮未落在旧 bug 区间（旧逻辑也判 False），"
                    "复现不成立，请换一条更长的讨论型指令"
                )
            print()

        if failures:
            print("结论：存在回归 [FAIL]")
            for item in failures:
                print(f"  - {item}")
        else:
            print("结论：讨论型输入全部符合预期 [OK]")
            print("  审阅分析稳定判为非 draft；旧逻辑在同样输入下会误判为 draft。")

        # --- 正向对照：快捷指令不得被本次修复改坏 ---
        print(f"\n[正向对照] /{DRAFT_PRESET} 仍应产出草稿卡")
        client.put(
            f"{base}/api/projects/{project_id}/chapters/{chapter['id']}",
            json={"title": "第一章", "content": SEED_PROSE},
        )
        draft_events = stream_generate(
            client,
            base,
            project_id,
            {
                "session_id": session_id,
                "skill_name": DRAFT_PRESET,
                "chapter_id": chapter["id"],
                "current_content": SEED_PROSE,
                "user_input": DRAFT_PROMPT,
            },
        )
        draft_info = summarize(draft_events)
        print(f"  实际 draft    = {draft_info['draft']}")
        print(f"  draft_hint    = {draft_info['draft_hint']}")
        print(f"  content_anchor = {draft_info['anchor']}")
        print(f"  正文残留哨兵  = {draft_info['leaked_sentinel']}")
        print(f"  字数          = {draft_info['chars']}")
        print(f"  预览          = {draft_info['preview']}")

        if draft_info["draft"] is not True:
            failures.append(f"/{DRAFT_PRESET} 未判为 draft（快捷指令被改坏）")
        if draft_info["leaked_sentinel"]:
            failures.append(f"/{DRAFT_PRESET} 正文残留哨兵")
        if draft_info["chars"] < 100:
            failures.append(
                f"/{DRAFT_PRESET} 只输出 {draft_info['chars']} 字，疑似模型未真正续写"
            )

        if failures:
            print("\n最终结论：存在回归 [FAIL]")
            for item in failures:
                print(f"  - {item}")
        else:
            print("\n最终结论：全部符合预期 [OK]")
        return 0 if not failures else 1
    finally:
        if project_id and not args.keep:
            try:
                client.delete(f"{base}/api/projects/{project_id}")
            except httpx.HTTPError:
                pass
        client.close()


if __name__ == "__main__":
    sys.exit(main())
