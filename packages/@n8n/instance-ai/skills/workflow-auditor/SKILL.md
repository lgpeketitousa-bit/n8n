---
name: workflow-auditor
description: Use when reviewing n8n workflow exports for correctness, maintainability, credential safety, and likely runtime failures.
recommended_tools:
  - read_file
  - write_file
  - bash
platforms:
  - daytona
---

# Workflow Auditor

Review n8n workflow exports and produce a concise production-readiness audit.

## Procedure

1. Read the workflow JSON from the path the user provides.
2. Use `references/audit-rubric.md` when you need the review criteria.
3. Run the deterministic analysis helper for JSON workflow exports:

```bash
node ${N8N_SKILL_DIR}/scripts/audit-workflow.mjs <workflow-json-path>
```

4. Read `/home/daytona/workspace/workflow-audit-helper.json`.
5. Write the final human-readable audit to
   `/home/daytona/workspace/workflow-audit.md`.
6. Report the top risks, recommended fixes, and whether the workflow is safe to
   activate.

## Output

Keep the final response short and operational:

- activation verdict: safe, risky, or unsafe
- top production risks
- concrete remediation steps
- any assumptions or missing context
