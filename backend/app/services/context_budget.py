"""Rough context-window budget accounting (char-based token estimate)."""

from __future__ import annotations

from typing import Any, Optional

from app.config import load_config

# chars / estimated tokens (rough; Chinese mixes with Latin)
CHARS_PER_TOKEN = 2.0
BUDGET_RATIO = 0.7


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, int(len(text) / CHARS_PER_TOKEN))


def budget_limit(context_window: Optional[int] = None) -> int:
    if context_window is None:
        cfg = load_config()
        context_window = int(cfg.get("context_window") or 131_072)
    return max(512, int(context_window * BUDGET_RATIO))


def apply_budget(
    *,
    system: str,
    user: str,
    history_text: str = "",
    conversation_note: str = "",
    context_window: Optional[int] = None,
    protect_user_body: bool = True,
) -> tuple[str, str, str, str, dict[str, Any]]:
    """
    Truncate dialogue-side text to fit budget.

    Returns (system, user, history_text, conversation_note, budget_report).
    When protect_user_body=True (skill path), never truncate `user` (skill template);
    only shrink conversation_note then history_text.
    When False (chat/router), shrink history_text first, then user tail if needed.
    """
    limit = budget_limit(context_window)
    cuts: list[str] = []
    sys = system or ""
    usr = user or ""
    hist = history_text or ""
    note = conversation_note or ""

    def used() -> int:
        return (
            estimate_tokens(sys)
            + estimate_tokens(usr)
            + estimate_tokens(hist)
            + estimate_tokens(note)
        )

    def shrink(text: str, label: str) -> str:
        nonlocal cuts
        if not text:
            return text
        over = used() - limit
        if over <= 0:
            return text
        # Convert token overage back to chars to drop
        drop = int(over * CHARS_PER_TOKEN) + 64
        if drop >= len(text):
            cuts.append(label)
            return ""
        cuts.append(label)
        keep = len(text) - drop
        return "…（预算截断）\n" + text[-keep:]

    # Cut order per plan
    if protect_user_body:
        note = shrink(note, "conversation_note")
        hist = shrink(hist, "history")
    else:
        hist = shrink(hist, "history")
        if used() > limit:
            # Truncate user from the front (keep tail: current question)
            over = used() - limit
            drop = int(over * CHARS_PER_TOKEN) + 64
            if drop >= len(usr):
                cuts.append("user")
                usr = usr[-200:] if usr else ""
            else:
                cuts.append("user")
                usr = "…（预算截断）\n" + usr[-(len(usr) - drop) :]

    report: dict[str, Any] = {
        "limit": limit,
        "used_est": used(),
        "truncated": bool(cuts),
        "cuts": cuts,
        "estimate": "chars/2",
        "remaining_pct": round(max(0.0, (limit - used()) / limit * 100), 1)
        if limit
        else 0.0,
    }
    return sys, usr, hist, note, report
