# 260828 · 抽取后端硬编码提示词到 prompts/ 目录

> 范围：后端。把散落在 4 个 services .py 里的 8 处 system/user 提示词抽成独立 .md 文件，集中在 `backend/app/prompts/`，改提示词时直接改 md 无需动 Python。
> 代码：`backend/app/prompts/*.md`、`backend/app/services/prompt_loader.py`；消费方 `prompt_builder.py`、`generation_service.py`、`onboarding_service.py`、`model_client.py`。
> 前端无需改动。

---

## 1. 背景与动机

此前除 `backend/app/skills/*.md`（SKILL 体系，frontmatter + 正文）外，还有一批提示词**硬编码在 .py 文件**里（CHAT_SYSTEM、AGENT_SYSTEM、SUMMARY_SYSTEM、onboarding SYSTEM_PROMPT 等）。这些提示词与业务逻辑混在一起，改文案要翻 Python 代码、易碰逻辑、也不便于对比调优。

本次把它们统一抽到 `backend/app/prompts/` 目录，复用 skills 体系「启动扫描 + 内存缓存」的成熟模式，但更简单——纯正文、无 frontmatter、无字段校验。

---

## 2. 新增

### 2.1 `backend/app/prompts/` 目录

11 个纯正文 .md 文件（整份文件即提示词原文，不套 frontmatter）：

| 文件 | 来源 | 用途 |
| --- | --- | --- |
| `chat_system.md` | `prompt_builder.CHAT_SYSTEM` | 闲聊路径 system |
| `router_system.md` | `prompt_builder.ROUTER_SYSTEM` | 路由决策 system |
| `agent_system.md` | `generation_service.AGENT_SYSTEM` | Agent 主链路 system |
| `summary_system.md` | `generation_service.SUMMARY_SYSTEM` | 会话摘要 system |
| `summary_user.md` | `generation_service` 摘要 user 模板 | 含 `$prev_summary_header` `$folded` 占位 |
| `tool_loop_fallback.md` | `generation_service` L322-324 | 工具循环兜底 user |
| `onboarding_system.md` | `onboarding_service.SYSTEM_PROMPT` | 引导页一键生成设定 system |
| `onboarding_user_full.md` | `onboarding_service._build_user_prompt` 全量分支 | 固定任务说明片段 |
| `onboarding_user_section.md` | `onboarding_service._build_user_prompt` 单区分支 | 含 `$section_label` 占位 |
| `onboarding_user_json_spec.md` | `onboarding_service._build_user_prompt` | 固定 JSON 字段约定片段 |
| `connection_test.md` | `model_client._test_via_chat` | 连接测试 system（英文） |

### 2.2 `backend/app/services/prompt_loader.py`

仿 `skill_loader.py` 但更轻：

```python
BUILTIN_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

@lru_cache(maxsize=None)
def _load_all() -> dict[str, str]: ...   # 启动扫描 *.md，{文件名: 正文}

def get(name: str) -> str: ...           # 按 stem 取；KeyError 若缺失
def reload() -> None: ...                # 清缓存，留作以后做热重载接口
```

- 纯正文 .md，无 frontmatter、无字段校验
- 文件名（不含 .md）即提示词唯一 key
- `lru_cache` 启动加载；改 md 后需重启服务或调 `reload()`（与 skills 一致）

---

## 3. 消费方改造

各 .py 把硬编码常量替换为 loader 调用：

```python
# 原：
CHAT_SYSTEM = ("你是本地小说创作助手...")
# 改：
from app.services import prompt_loader
CHAT_SYSTEM = prompt_loader.get("chat_system")
```

含动态片段的模板用 `string.Template.safe_substitute` 渲染——与现有 SKILL.md body 渲染机制一致：

```python
# summary_user.md 正文：
#   ${prev_summary_header}待压缩的旧对话：
#   $folded
#   请输出更新后的摘要：

user_prompt = Template(prompt_loader.get("summary_user")).safe_substitute(
    prev_summary_header=prev_summary_header, folded=folded
)
```

`onboarding_service._build_user_prompt` 拆走三段固定大段文本后，剩余的动态拼装逻辑（topic/genre/已有内容回显）保留在 py 里，只替换那几段大字符串。

---

## 4. 设计决策

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 目录位置 | `backend/app/prompts/`（与 `skills/` 同级） | 随仓库分发、内置只读；用户想改就直接改 md |
| 文件格式 | 纯正文 .md（无 frontmatter） | system prompt 本身就是一段文本，套壳多余；所见即所得 |
| 动态占位 | `$var` + `string.Template` | 与 SKILL.md body 渲染机制一致，统一处理动态片段 |
| 加载策略 | 启动加载 + `lru_cache` | 与 skills 一致；改 md 需重启，简单可靠 |
| onboarding 动态模板 | 拆成多个固定片段 md | 条件分支仍留在 py 里拼装，只把固定大段文本抽走 |

---

## 5. 边界与注意

- **改 md 不即时生效**：`lru_cache` 缓存，改 md 后需重启服务或调 `reload()`（与 skills 一致）。
- **onboarding 拼装逻辑未动**：`_build_user_prompt` 抽走固定片段后，py 里剩余的动态拼装（topic/genre/已有内容回显）保持不变，只替换那几段大字符串。
- **model_client 连接测试 system** 是英文，也一并抽走，保持体系完整。
- **prompt_loader 只 import 标准库**（logging/pathlib/functools），无循环导入风险。

---

## 6. 验证

- [x] 项目 venv 下 `from app.services import prompt_loader, prompt_builder, generation_service, onboarding_service, model_client` 全部通过，无 ImportError
- [x] 11 个 key 全部加载：`agent_system / chat_system / connection_test / onboarding_system / onboarding_user_full / onboarding_user_json_spec / onboarding_user_section / router_system / summary_system / summary_user / tool_loop_fallback`
- [x] 各模块常量首 30 字符与原文一致
- [x] `onboarding._build_user_prompt` 全量分支渲染正确（topic/genre/已有内容 + 全量任务 + JSON 约定）
- [x] `onboarding._build_user_prompt` section 分支渲染正确（`$section_label` 替换为中文区块名）
- [ ] 真实 provider 冒烟（聊天、Agent 生成、引导页一键生成、连接测试）——待用户在浏览器侧验证

---

## 7. 相关文档更新

- [`docs/记忆规则与提示词组装.md`](../记忆规则与提示词组装.md) §2 文件位置、§8 设计原则、§9 源码索引
- [`docs/build/06-Agent生成与会话链路.md`](../build/06-Agent生成与会话链路.md) §4 模块职责表
- [`docs/build/10-引导页AI一键生成设定链路.md`](../build/10-引导页AI一键生成设定链路.md) §4.2 prompt 组织
