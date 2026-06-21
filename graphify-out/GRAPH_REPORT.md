# Graph Report - FuelFlow  (2026-06-21)

## Corpus Check
- 82 files · ~43,916 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 384 nodes · 861 edges · 19 communities (16 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ae405b39`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]

## God Nodes (most connected - your core abstractions)
1. `handler()` - 36 edges
2. `Card()` - 19 edges
3. `fmtNum()` - 19 edges
4. `compilerOptions` - 18 edges
5. `Badge()` - 16 edges
6. `compilerOptions` - 16 edges
7. `apiGet()` - 15 edges
8. `fmtDate()` - 15 edges
9. `FuelFlow` - 15 edges
10. `fmtMoney()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `FuelFlow README` --references--> `RLS Baseline SQL`  [EXTRACTED]
  README.md → handoff/supabase/01_rls_baseline.sql
- `Index HTML` --calls--> `Main Entry Point`  [EXTRACTED]
  index.html → src/main.tsx
- `FuelFlow Handoff Pack` --references--> `Optional App Role Policies SQL`  [EXTRACTED]
  handoff/README.md → handoff/supabase/02_optional_app_role_policies.sql
- `Debug Session: login-failed-to-fetch` --references--> `Supabase Auth`  [INFERRED]
  debug-login-failed-to-fetch.md → README.md
- `FuelFlow Handoff Pack` --references--> `RLS Baseline SQL`  [EXTRACTED]
  handoff/README.md → handoff/supabase/01_rls_baseline.sql

## Import Cycles
- None detected.

## Communities (19 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (46): BarChart(), DonutChart(), LineChart(), CodeBlock(), ColumnDef, Props, ProductPrice, tables (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (22): CalibrationUpload(), CreditSalesUpload(), DailySalesUpload(), DipReadingsUpload(), InventoryUpload(), PriceHistoryUpload(), TankDataUpload(), TankerUnloadingUpload() (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (33): dependencies, framer-motion, lucide-react, react, react-dom, react-router-dom, @supabase/supabase-js, tailwindcss (+25 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (62): authenticateRequest(), validateChart(), supabase, adjustBufferVolumeByProduct(), adjustTankCurrentVolumeForSalesDelta(), beforeDeleteCheck(), checkCrossReferences(), checkDuplicateFields() (+54 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (17): groups, Layout(), NavGroup, NavItem, ProtectedRoute(), AuthContext, AuthCtx, AuthProvider() (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (20): Backend Notes, Canonical Tables, Current Status, Deployment Notes, Environment And Deployment Validation, Frontend, FuelFlow, Handoff Pack (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (5): Evidence Plan, Expected, Hypotheses (falsifiable), Status, Symptom

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (12): ALLOWED_RESOURCES, applyCorsHeaders(), isAllowedResource(), isOriginAllowed(), parseAllowedOrigins(), resolveCorsOrigin(), buildTankMap(), normalizeStockMovementRows() (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, allowJs, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.40
Nodes (4): Cost Guidance, FuelFlow Graphify Workflow, Recommended Commands, Rules

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (19): Debug Session: login-failed-to-fetch, Vercel Serverless API, Contents, Current Architecture Assumption, Environment Templates, FuelFlow Handoff Pack, 1. Environment Readiness, 2. Supabase Readiness (+11 more)

## Knowledge Gaps
- **134 isolated node(s):** `TXN_TABLES`, `REFERENCE_MAP`, `UNIQUE_FIELDS`, `FIELD_VALIDATIONS`, `CROSS_REFERENCE_TABLES` (+129 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Card()` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `handler()` connect `Community 3` to `Community 8`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `TXN_TABLES`, `REFERENCE_MAP`, `UNIQUE_FIELDS` to the rest of the system?**
  _134 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09437751004016064 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07804878048780488 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.0763000852514919 - nodes in this community are weakly interconnected._