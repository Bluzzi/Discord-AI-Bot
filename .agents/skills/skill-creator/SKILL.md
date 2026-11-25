---
name: skill-creator
description: Create or update a skill directory (.agents/skills/<name>/SKILL.md, agentskills.io standard). MUST be loaded before creating, updating, renaming, moving or deleting any skill, and covers the frontmatter rules, the mandatory file structure and the writing conventions.
---

# Skill creator

A skill is an on-demand instruction file the agent loads when its `description` matches the task at hand. Skills hold procedures (how to create a route, how to verify changes) and rules (how keys work, when links are required), while `AGENTS.md` files hold always-loaded context.

## Layout

- One directory per skill: `.agents/skills/<name>/SKILL.md`, the name is kebab-case and matches the directory name exactly (Agent Skills standard, agentskills.io).
- `SKILL.md` frontmatter with exactly two fields:
  - `name`: the skill name, identical to the directory name.
  - `description`: the load trigger. It MUST use "MUST be loaded before ..." to state when the skill applies and summarize what it covers. Name the relevant systems and actions so the description alone is sufficient to decide when to load the skill.
- Supporting files (scripts, references, templates) live next to `SKILL.md` inside the skill directory.

## Structure (mandatory, in this order)

1. `# Title` naming the subject and its scope.
2. An intro paragraph (1 to 3 sentences): what the system or rule is and how it works at a high level.
3. Topic sections (`## Steps` for a procedure, `## Rules` for a constraint set, `## Patterns` or `## Layout` when it fits): describe the mechanism with its syntax and one canonical code example when the syntax matters.
4. `## Constraints`: the non-negotiable bullet list (MUST / NEVER wording).

## Writing rules

- Rules are absolute and actionable (MUST, NEVER, ALWAYS); explain WHY when the reason is not obvious, with a real failure or a link to the mechanism.
- Cross-reference related skills from within skills to keep each rule in one place.
- One skill = one system or one rule. Do not mix a procedure with an unrelated constraint set.

## Constraints

- Never create a skill for something an `AGENTS.md` already covers as always-loaded context; conversely, a step-by-step procedure never belongs in an `AGENTS.md`.
- Every "Reference implementations" entry MUST be verified against the repository (the file exists and uses the documented pattern).
- When a referenced file moves or is renamed, update every skill referencing it (grep `.agents/`, `.opencode/` and the `AGENTS.md` files for the old path).
- NEVER add a skill link or loading instruction to an `AGENTS.md` file. Every skill MUST define its full loading trigger in its own description.
