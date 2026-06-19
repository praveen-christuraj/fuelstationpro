# Graph Report - .  (2026-06-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 330 nodes · 802 edges · 22 communities (17 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d3cf7b82`
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
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]

## God Nodes (most connected - your core abstractions)
1. `handler()` - 36 edges
2. `fmtNum()` - 19 edges
3. `Card()` - 18 edges
4. `compilerOptions` - 18 edges
5. `Badge()` - 16 edges
6. `compilerOptions` - 16 edges
7. `fmtDate()` - 15 edges
8. `apiGet()` - 14 edges
9. `requireText()` - 13 edges
10. `updateDailySalesEntry()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `FuelFlow README` --references--> `RLS Baseline SQL`  [EXTRACTED]
  README.md → handoff/supabase/01_rls_baseline.sql
- `Index HTML` --calls--> `Main Entry Point`  [EXTRACTED]
  index.html → src/main.tsx
- `FuelFlow README` --references--> `FuelFlow Release Checklist`  [EXTRACTED]
  README.md → handoff/release-checklist.md
- `Debug Session: login-failed-to-fetch` --references--> `Supabase Auth`  [INFERRED]
  debug-login-failed-to-fetch.md → README.md
- `FuelFlow README` --references--> `FuelFlow Handoff Pack`  [EXTRACTED]
  README.md → handoff/README.md

## Import Cycles
- None detected.

## Communities (22 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.17
Nodes (30): ColumnDef, Props, apiDelete(), apiGet(), apiPost(), apiPut(), fmtDate(), fmtNum() (+22 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (18): CalibrationUpload(), CreditSalesUpload(), DailySalesUpload(), DipReadingsUpload(), InventoryUpload(), TankDataUpload(), TankerUnloadingUpload(), phases (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (33): dependencies, framer-motion, lucide-react, react, react-dom, react-router-dom, @supabase/supabase-js, tailwindcss (+25 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (25): authenticateRequest(), supabase, beforeDeleteCheck(), checkCrossReferences(), checkDuplicateFields(), CROSS_REFERENCE_TABLES, FIELD_VALIDATIONS, getFilters() (+17 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (17): groups, Layout(), NavGroup, NavItem, ProtectedRoute(), AuthContext, AuthCtx, AuthProvider() (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (15): FieldSpec, Props, BarChart(), DonutChart(), LineChart(), Finance(), fmtMoney(), downloadCSV() (+7 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.23
Nodes (19): createDailySalesEntry(), createDipReading(), handleBufferTransfer(), handleCalibrationImport(), handleDailySalesImport(), handleDipReadingCreate(), handleDipReadingUpdate(), handleTankerUnloadingCreateV2() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (8): validateChart(), handleCalibration(), handleSalesCreate(), handleSalesUpdate(), normalizeSalesRows(), resolveTable(), TABLE_ALIASES, buildLossGainRows()

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, allowJs, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.23
Nodes (13): adjustBufferVolumeByProduct(), adjustTankCurrentVolumeForSalesDelta(), deleteDailySalesEntry(), ensureDailySalesEntryMutable(), handleDailySalesDelete(), handleStockMovementDelete(), handleTankerUnloadingDeleteV2(), hasClosingDipOnOrAfter() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.36
Nodes (7): ALLOWED_RESOURCES, applyCorsHeaders(), getRequiredServerEnv(), isAllowedResource(), isOriginAllowed(), parseAllowedOrigins(), resolveCorsOrigin()

### Community 12 - "Community 12"
Cohesion: 0.36
Nodes (3): CodeBlock(), tables, CardHeader()

### Community 13 - "Community 13"
Cohesion: 0.32
Nodes (8): Debug Session: login-failed-to-fetch, Vercel Serverless API, FuelFlow Handoff Pack, FuelFlow Release Checklist, FuelFlow README, RLS Baseline SQL, Optional App Role Policies SQL, Supabase Auth

## Knowledge Gaps
- **98 isolated node(s):** `TXN_TABLES`, `REFERENCE_MAP`, `UNIQUE_FIELDS`, `FIELD_VALIDATIONS`, `CROSS_REFERENCE_TABLES` (+93 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Card()` connect `Community 0` to `Community 1`, `Community 12`, `Community 5`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `handler()` connect `Community 3` to `Community 8`, `Community 10`, `Community 11`, `Community 7`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `TXN_TABLES`, `REFERENCE_MAP`, `UNIQUE_FIELDS` to the rest of the system?**
  _98 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0858974358974359 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.12561576354679804 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._