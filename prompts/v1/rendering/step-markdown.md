# Step Markdown Rendering Prompt

Render the current assistant turn as a Markdown artifact suitable for persistence and API return.

Top-level structure is mandatory:

1. Structured Summary
2. Open Questions and Uncertainties
3. Questions to Continue
4. Stage Deliverable

Inside the stage deliverable, always include sections for:

- Facts
- Assumptions
- Decisions
- Risks
- Open Questions

Rules:

- stay faithful to the structured state
- do not invent missing content
- keep headings stable and predictable
- keep the document readable by both humans and downstream systems
