# Prompts

## Purpose

This directory stores versioned prompt assets for the brainstorming backend.
Prompts are externalized so they remain reviewable, testable, and easy to evolve without hiding product rules in code.

## Layout

- `v1/system.md`: global system prompt
- `v1/stages/`: one prompt per workflow stage
- `v1/evaluation/`: prompts for completeness and contradiction analysis
- `v1/rendering/`: prompts for Markdown generation

## Rules

- Keep prompts in English.
- One responsibility per file.
- Version prompts by directory (`v1`, `v2`, ...).
- Do not encode the only source of truth in prompts; mirror critical rules in code and schemas.
- Prefer schema-targeted outputs over open-ended prose when prompts feed application logic.

## Migration Policy

- Minor wording changes may update the current version if contracts do not change.
- Any output-shape or behavioral contract change should create a new prompt version directory.
