"""Assemble prompts from SKILL.md templates and project context."""

from string import Template

from app.services import memory_store, skill_loader


def build(skill_name: str, context: dict) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) for a skill."""
    skill = skill_loader.get_skill(skill_name)
    if skill is None:
        raise ValueError(f"Skill not found: {skill_name}")

    system = skill.get("system", "")
    user_template = Template(skill.get("user_template", ""))
    user = user_template.safe_substitute(context)
    return system, user
