"""Store Agent reasoning outside the main run JSON ledger."""

from __future__ import annotations

import gzip
import hashlib
import shutil
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from app.config import load_config
from app.services import project_store

REASONING_DIR_NAME = "reasoning"
PREVIEW_MAX_CHARS = 2_000
PREVIEW_HEAD_CHARS = PREVIEW_MAX_CHARS // 2
PREVIEW_TAIL_CHARS = PREVIEW_MAX_CHARS - PREVIEW_HEAD_CHARS
PREVIEW_OMISSION = "…（中间内容已省略）…"

DEFAULT_STEP_MAX_CHARS = 64_000
DEFAULT_RUN_MAX_CHARS = 256_000
DEFAULT_PROJECT_QUOTA_BYTES = 128 * 1024 * 1024
DEFAULT_RETENTION_RUNS = 200


@dataclass(frozen=True)
class ReasoningPolicy:
    """Uncompressed persistence limits for one project."""

    step_max_chars: int = DEFAULT_STEP_MAX_CHARS
    run_max_chars: int = DEFAULT_RUN_MAX_CHARS
    project_quota_bytes: int = DEFAULT_PROJECT_QUOTA_BYTES
    retention_runs: int = DEFAULT_RETENTION_RUNS

    @classmethod
    def from_config(cls, config: Optional[dict[str, Any]] = None) -> "ReasoningPolicy":
        cfg = config if config is not None else load_config()
        return cls(
            step_max_chars=_positive_int(
                cfg.get("reasoning_step_max_chars"),
                DEFAULT_STEP_MAX_CHARS,
            ),
            run_max_chars=_positive_int(
                cfg.get("reasoning_run_max_chars"),
                DEFAULT_RUN_MAX_CHARS,
            ),
            project_quota_bytes=_positive_int(
                cfg.get("reasoning_project_quota_bytes"),
                DEFAULT_PROJECT_QUOTA_BYTES,
            ),
            retention_runs=_positive_int(
                cfg.get("reasoning_retention_runs"),
                DEFAULT_RETENTION_RUNS,
            ),
        )


def _positive_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _reasoning_root(project_id: str) -> Path:
    return project_store.get_project_dir(project_id) / "agent" / REASONING_DIR_NAME


def _safe_component(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if (
        not text
        or text in {".", ".."}
        or "/" in text
        or "\\" in text
        or "\x00" in text
    ):
        raise FileNotFoundError(f"{label} 不存在: {value}")
    return text


def _run_root(project_id: str, run_id: str) -> Path:
    rid = _safe_component(run_id, "运行记录")
    return _reasoning_root(project_id) / rid


def _step_path(project_id: str, run_id: str, step_index: int) -> Path:
    try:
        index = int(step_index)
    except (TypeError, ValueError) as exc:
        raise FileNotFoundError(f"步骤不存在: {step_index}") from exc
    if index < 0:
        raise FileNotFoundError(f"步骤不存在: {step_index}")
    return _run_root(project_id, run_id) / f"step_{index}.txt.gz"


def _relative_path(project_id: str, path: Path) -> str:
    return path.relative_to(project_store.get_project_dir(project_id)).as_posix()


def make_preview(
    text: str,
    *,
    max_chars: int = PREVIEW_MAX_CHARS,
) -> tuple[str, bool]:
    value = str(text or "")
    if len(value) <= max_chars:
        return value, False
    head = max_chars // 2
    tail = max_chars - head - len(PREVIEW_OMISSION)
    if tail <= 0:
        return value[:max_chars], True
    return value[:head] + PREVIEW_OMISSION + value[-tail:], True


@dataclass
class _StepState:
    step_index: int
    final_path: Path
    temp_path: Path
    stream: Any
    digest: Any = field(default_factory=hashlib.sha256)
    chars: int = 0
    bytes: int = 0
    truncated: bool = False
    head: str = ""
    tail: str = ""

    def append(self, text: str) -> None:
        if not text:
            return
        self.stream.write(text)
        encoded = text.encode("utf-8")
        self.digest.update(encoded)
        self.chars += len(text)
        self.bytes += len(encoded)
        if len(self.head) < PREVIEW_HEAD_CHARS:
            self.head = (self.head + text)[:PREVIEW_HEAD_CHARS]
        self.tail = (self.tail + text)[-PREVIEW_TAIL_CHARS:]

    def preview(self) -> tuple[str, bool]:
        if not self.truncated and self.chars <= PREVIEW_MAX_CHARS:
            if self.chars <= len(self.head):
                return self.head, False
            return self.head + self.tail[-(self.chars - len(self.head)) :], False
        text = self.head + PREVIEW_OMISSION + self.tail
        return text, True


class ReasoningWriter:
    """Incrementally persist reasoning for one run.

    The writer enforces uncompressed character limits while writing compressed
    sidecars. It intentionally does not know about tool rounds; callers choose
    the stable step index for each source.
    """

    def __init__(
        self,
        project_id: str,
        run_id: str,
        *,
        policy: Optional[ReasoningPolicy] = None,
    ) -> None:
        self.project_id = project_id
        self.run_id = _safe_component(run_id, "运行记录")
        self.policy = policy or ReasoningPolicy.from_config()
        self._run_chars = 0
        self._states: dict[int, _StepState] = {}

    def append(self, step_index: int, value: Any) -> None:
        text = str(value or "")
        if not text:
            return
        index = int(step_index)
        state = self._states.get(index)
        if state is None:
            final_path = _step_path(self.project_id, self.run_id, index)
            final_path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = final_path.with_name(
                f".{final_path.name}.{uuid.uuid4().hex[:8]}.part"
            )
            stream = gzip.open(temp_path, "wt", encoding="utf-8")
            state = _StepState(index, final_path, temp_path, stream)
            self._states[index] = state

        remaining = min(
            self.policy.step_max_chars - state.chars,
            self.policy.run_max_chars - self._run_chars,
        )
        if remaining <= 0:
            state.truncated = True
            return

        accepted = text[:remaining]
        state.append(accepted)
        self._run_chars += len(accepted)
        if len(accepted) < len(text):
            state.truncated = True

    def finalize(self, step_index: int) -> Optional[dict[str, Any]]:
        state = self._states.pop(int(step_index), None)
        if state is None:
            return None
        state.stream.close()
        if state.chars <= 0:
            state.temp_path.unlink(missing_ok=True)
            return None
        state.temp_path.replace(state.final_path)
        preview, preview_truncated = state.preview()
        return {
            "path": _relative_path(self.project_id, state.final_path),
            "chars": state.chars,
            "bytes": state.bytes,
            "sha256": state.digest.hexdigest(),
            "truncated": state.truncated,
            "preview": preview,
            "preview_truncated": preview_truncated,
            "status": "partial" if state.truncated else "complete",
        }

    def finalize_all(self) -> dict[int, dict[str, Any]]:
        refs: dict[int, dict[str, Any]] = {}
        for index in list(self._states):
            ref = self.finalize(index)
            if ref:
                refs[index] = ref
        return refs

    def abort(self) -> None:
        for state in list(self._states.values()):
            try:
                state.stream.close()
            finally:
                state.temp_path.unlink(missing_ok=True)
        self._states.clear()


def persist_text(
    project_id: str,
    run_id: str,
    step_index: int,
    text: Any,
    *,
    policy: Optional[ReasoningPolicy] = None,
) -> Optional[dict[str, Any]]:
    writer = ReasoningWriter(project_id, run_id, policy=policy)
    writer.append(step_index, text)
    return writer.finalize(step_index)


def read_reasoning(
    project_id: str,
    run_id: str,
    step_index: int,
    *,
    reference: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    path = _step_path(project_id, run_id, step_index)
    if reference and reference.get("path"):
        candidate = project_store.get_project_dir(project_id) / str(reference["path"])
        root = _reasoning_root(project_id).resolve()
        resolved = candidate.resolve()
        if root not in resolved.parents:
            raise FileNotFoundError(f"思考记录不存在: {step_index}")
        path = resolved
    if not path.is_file():
        raise FileNotFoundError(f"思考记录不存在: {step_index}")
    try:
        with gzip.open(path, "rt", encoding="utf-8") as stream:
            text = stream.read()
    except (OSError, EOFError, UnicodeDecodeError) as exc:
        raise FileNotFoundError(f"思考记录读取失败: {step_index}") from exc
    return {
        "run_id": run_id,
        "step_index": int(step_index),
        "text": text,
        "chars": len(text),
        "reference": reference or {},
    }


def delete_run(project_id: str, run_id: str) -> None:
    root = _run_root(project_id, run_id)
    if root.exists():
        shutil.rmtree(root, ignore_errors=False)
    parent = root.parent
    if parent.exists() and not any(parent.iterdir()):
        parent.rmdir()


def project_usage_bytes(project_id: str) -> int:
    root = _reasoning_root(project_id)
    if not root.exists():
        return 0
    return sum(path.stat().st_size for path in root.rglob("*.txt.gz") if path.is_file())


def cleanup_project(
    project_id: str,
    *,
    policy: Optional[ReasoningPolicy] = None,
) -> list[str]:
    """Evict oldest run sidecars until quota and retention are satisfied."""
    current_policy = policy or ReasoningPolicy.from_config()
    root = _reasoning_root(project_id)
    if not root.exists():
        return []

    run_dirs = [path for path in root.iterdir() if path.is_dir()]
    run_dirs.sort(key=lambda path: path.stat().st_mtime)
    evicted: list[str] = []
    usage = project_usage_bytes(project_id)
    while run_dirs and (
        usage > current_policy.project_quota_bytes
        or len(run_dirs) > current_policy.retention_runs
    ):
        candidate = run_dirs.pop(0)
        size = sum(
            path.stat().st_size for path in candidate.rglob("*.txt.gz") if path.is_file()
        )
        shutil.rmtree(candidate, ignore_errors=True)
        usage = max(0, usage - size)
        evicted.append(candidate.name)
    return evicted


def remove_stale_parts(project_id: str) -> int:
    root = _reasoning_root(project_id)
    if not root.exists():
        return 0
    removed = 0
    for path in root.rglob("*.part"):
        try:
            path.unlink()
            removed += 1
        except OSError:
            continue
    return removed
