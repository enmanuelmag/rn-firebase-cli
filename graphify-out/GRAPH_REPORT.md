# Graph Report - .  (2026-06-12)

## Corpus Check
- Corpus is ~5,777 words - fits in a single context window. You may not need a graph.

## Summary
- 135 nodes · 277 edges · 20 communities (16 shown, 4 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.82)
- Token cost: 3,500 input · 800 output

## Community Hubs (Navigation)
- [[_COMMUNITY_InitUpdate CLI Commands & Config|Init/Update CLI Commands & Config]]
- [[_COMMUNITY_Materializer & Firebase Project Detection|Materializer & Firebase Project Detection]]
- [[_COMMUNITY_Firebase Config Generation & Bundle Detection|Firebase Config Generation & Bundle Detection]]
- [[_COMMUNITY_CLI Command Implementation Layer|CLI Command Implementation Layer]]
- [[_COMMUNITY_Status Command & Config Loader|Status Command & Config Loader]]
- [[_COMMUNITY_Materializer Architecture & Interfaces|Materializer Architecture & Interfaces]]
- [[_COMMUNITY_BareRN Materializer Core|BareRN Materializer Core]]
- [[_COMMUNITY_ESLint Shared Config|ESLint Shared Config]]
- [[_COMMUNITY_CLI Entry & Shared Types|CLI Entry & Shared Types]]
- [[_COMMUNITY_Agent Instructions & Workflow|Agent Instructions & Workflow]]
- [[_COMMUNITY_Public API (srcindex.ts)|Public API (src/index.ts)]]

## God Nodes (most connected - your core abstractions)
1. `runInit()` - 18 edges
2. `runUpdate()` - 13 edges
3. `runInit Command` - 11 edges
4. `BareRNMaterializer` - 9 edges
5. `ExpoMaterializer` - 9 edges
6. `runUpdate Command` - 9 edges
7. `getMaterializer()` - 6 edges
8. `extractWebClientId()` - 6 edges
9. `detectProjectType()` - 6 edges
10. `FirebaseEnv` - 5 edges

## Surprising Connections (you probably didn't know these)
- `CLAUDE.md (Agent Instructions)` --semantically_similar_to--> `AGENTS.md (Agent Instructions)`  [INFERRED] [semantically similar]
  CLAUDE.md → AGENTS.md
- `runInit()` --calls--> `detectConfigExtension()`  [INFERRED]
  src/commands/init.ts → src/core/detector/config-ext.ts
- `runUpdate()` --calls--> `detectConfigExtension()`  [INFERRED]
  src/commands/update.ts → src/core/detector/config-ext.ts
- `bin/rfc.js` --calls--> `CLI Program (Commander)`  [EXTRACTED]
  bin/rfc.js → src/cli.ts
- `Config Loader` --semantically_similar_to--> `Config Templates`  [INFERRED] [semantically similar]
  src/core/config/load.ts → src/core/config/templates.ts

## Hyperedges (group relationships)
- **Materializer Strategy Pattern** — materializer_factory, expo_materializer, bare_rn_materializer, RNMaterializer_interface [INFERRED 0.95]
- **Config Management Subsystem** — config_loader, config_defaults, config_templates [INFERRED 0.85]
- **CLI Pipeline Architecture** — cli_program, types_definitions, config_loader, materializer_factory [INFERRED 0.70]
- **Firebase CLI Interaction Layer** — firebase_projects_listProjects, firebase_apps_listApps, firebase_config_download_downloadConfigs, firebase_auth_checkAuth [EXTRACTED 1.00]
- **Project Detection Subsystem** — detector_index_detectProjectType, detector_bundle_ids_detectBundleIds, detector_config_ext_detectConfigExtension [EXTRACTED 1.00]
- **Firebase Config Download Pipeline** — firebase_auth_checkAuth, firebase_projects_listProjects, firebase_apps_listApps, firebase_config_download_downloadConfigs, firebase_web_client_extractWebClientId [INFERRED 0.85]

## Communities (20 total, 4 thin omitted)

### Community 0 - "Init/Update CLI Commands & Config"
Cohesion: 0.15
Nodes (26): InitOptions, runInit(), runUpdate(), UpdateOptions, applyConfigDefaults(), configFileName(), configCjs(), configMjs() (+18 more)

### Community 1 - "Materializer & Firebase Project Detection"
Cohesion: 0.13
Nodes (17): detectConfigExtension(), FirebaseProjectsJsonResult, RNMaterializer, ConfigExt, FirebaseApp, FirebaseEnv, FirebaseProject, MaterializeParams (+9 more)

### Community 2 - "Firebase Config Generation & Bundle Detection"
Cohesion: 0.21
Nodes (8): firebaseConfigCjs(), firebaseConfigMjs(), firebaseConfigTs(), detectBundleId(), detectBundleIdFromAppJson(), detectPackageName(), detectPackageNameFromAppJson(), ExpoMaterializer

### Community 3 - "CLI Command Implementation Layer"
Cohesion: 0.22
Nodes (18): runInit Command, runStatus Command, runUpdate Command, applyConfigDefaults, loadConfig / configFileName, configCjs / configMjs / configTs, Bundle ID Detection, detectConfigExtension (+10 more)

### Community 4 - "Status Command & Config Loader"
Cohesion: 0.31
Nodes (6): runStatus(), StatusOptions, loadConfig(), __dirname, pkg, program

### Community 5 - "Materializer Architecture & Interfaces"
Cohesion: 0.43
Nodes (7): RNMaterializer Interface, BareRNMaterializer, Config Defaults, Config Loader, Config Templates, ExpoMaterializer, Materializer Factory

### Community 8 - "CLI Entry & Shared Types"
Cohesion: 0.67
Nodes (3): CLI Program (Commander), bin/rfc.js, src/types.ts (Shared Types)

## Knowledge Gaps
- **29 isolated node(s):** `sharedRules`, `globalIgnores`, `__dirname`, `pkg`, `program` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BareRNMaterializer` connect `BareRN Materializer Core` to `Materializer & Firebase Project Detection`, `Firebase Config Generation & Bundle Detection`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `ExpoMaterializer` connect `Firebase Config Generation & Bundle Detection` to `Materializer & Firebase Project Detection`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `runInit()` connect `Init/Update CLI Commands & Config` to `Materializer & Firebase Project Detection`, `Status Command & Config Loader`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `sharedRules`, `globalIgnores`, `__dirname` to the rest of the system?**
  _29 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Materializer & Firebase Project Detection` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._