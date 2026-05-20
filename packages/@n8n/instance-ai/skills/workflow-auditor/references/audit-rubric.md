# Workflow Audit Rubric

Use this rubric to review n8n workflow exports for production readiness.

## Correctness

- The workflow has a trigger and connected downstream actions.
- Connections do not leave intended nodes unreachable.
- Disabled nodes are intentional and not part of the expected happy path.
- Expressions reference fields that are likely to exist at runtime.

## Credential Safety

- Credential-backed nodes have credential bindings.
- Secret-like values do not appear in node parameters, expressions, notes, or
  static data.
- The workflow does not ask users to paste tokens into plain parameters.

## Operational Risk

- Triggers are scoped narrowly enough for production.
- High-frequency schedule triggers are justified.
- Error handling exists for external calls, notifications, or writes.
- Node names explain business intent rather than generic implementation steps.

## Verdict Guidance

- `safe`: no material activation blockers.
- `risky`: likely to run, but needs fixes before serious production use.
- `unsafe`: likely to fail, leak data, spam systems, or run the wrong workflow.
