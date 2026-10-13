# Domain docs

This file tells the engineering skills how to use the domain documentation of this repo. The domain documentation is the glossary and the architecture decision records (ADRs).

## Files to read before you explore the code

- `CONTEXT.md` at the repo root. This file is the glossary of domain terms.
- `docs/adr/`. Read the ADRs that apply to the area of your work.

If one of these files does not exist, continue without a report. Do not tell the user that the file is missing. Do not suggest that the user create the file. The `/domain-modeling` skill creates these files when the user decides a term or a decision.

## File structure

This repo uses a single-context layout:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-example-decision.md
└── src/
```

## Glossary terms

When your output names a domain concept, use the term from `CONTEXT.md`. This rule applies to issue titles, refactor proposals, hypotheses, and test names. Do not use a synonym that the glossary does not permit.

If the glossary does not have the concept, one of these conditions is true:

- You use a term that the project does not use. Think again about the term.
- The glossary has a gap. Record the gap for `/domain-modeling`.

## ADR conflicts

If your output contradicts an ADR, tell the user. Do not override the ADR silently. Use this format:

> _Contradicts ADR-0007 (event-sourced orders), but we must examine it again because…_
