# FuelFlow Graphify Workflow

This project uses `graphify` to reduce repeated raw-file reads and lower token usage for codebase exploration.

## Rules

- Prefer `graphify` outputs before reading many source files for architecture or flow questions.
- Read `graphify-out/GRAPH_REPORT.md` first for god nodes, communities, and suggested questions.
- If `graphify-out/wiki/index.md` exists, navigate the wiki before falling back to raw source files.
- After modifying code in this repo, run `graphify update .` to keep the graph current with AST-only refreshes and no extra API cost.

## Recommended Commands

- First semantic build after setting a provider key:
  - `graphify . --wiki`
- Refresh after code changes:
  - `graphify update .`
- Ask codebase questions from the graph:
  - `graphify query "How does authentication flow through FuelFlow?"`
  - `graphify query "What files are involved in sales validation?" --budget 1200`
- Trace relationships:
  - `graphify path "AuthContext" "ProtectedRoute"`
  - `graphify explain "BulkUploadWizard"`

## Cost Guidance

- Use `Gemini` for semantic extraction when possible to keep costs lower.
- Run a full semantic build only when the corpus changes materially.
- Use `graphify update .` for day-to-day edits because it reuses the existing graph and avoids a full rebuild.
