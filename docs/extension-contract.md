# Extension contract

Project schema: `3.0`. Workflow model: `1.0`. Catalogue content version: `2.1.0`. Catalogue authoring schema: `1.0`. Exporter: `3.1.0`. Contract documentation updated on 5 October 2026. Source review dates remain in their individual records. See the [workflow model](workflow-model.md) for explicit process records and current editing limits.

The date above records this contract revision. The inherited global definition review date remains 2 October 2026. Individual definitions and source claims may record a later review. Migrating content into the catalogue or editing metadata does not establish a new upstream source review.

The workspace separates configuration, reviewed definitions, project views, validation, output formatting and file maintenance. Keep project facts in configuration and host syntax in adapters. The interface reads the same catalog as the compiler.

## Modules

User documentation has a shared reader at `docs/index.html`, with the existing JEV entry at `docs/jev/index.html`. Authored Markdown is bundled by `node tools/build-docs-guide.mjs` for offline reading. Register new documents in that builder and use reader routes for app reading links. Raw Markdown belongs behind an explicit source download. The builder rejects unlisted Markdown documents and local Markdown links without a registered reader page.

| Module | Responsibility |
| --- | --- |
| `catalogue/` | Authored JSON topics, typed definitions, sources, relationships, actions, navigation and schema |
| `tools/build-catalogue.mjs` | Schema and reference checks, deterministic generation and stale projection checks |
| `atlas/data.js` | Generated reading, search, source, map and collection data |
| `factory/catalog.mjs` | Generated recipes, stages, skills, roles, practices, technology profiles, hosts, choices and definition metadata |
| `factory/catalogue-rules.mjs` | Shared applicability predicates for curated actions and generated practice guidance |
| `factory/practice-actions.mjs` | Reviewable project changes from generated action definitions, guarded by supported configuration |
| `factory/core.mjs` | Configuration fixtures, migration, semantic and structural validation, deterministic generation and standalone skill generation |
| `factory/workflow-model.mjs` | Versioned process records, recipe projections, bounded correction semantics and model validation |
| `factory/workflow-model-view.mjs` | Shared reading projection for explicit processes in the app, Markdown and portable HTML |
| `factory/workflow-fixtures.mjs` | Fictional backend, bug repair and manual document process cases |
| `factory/process-editor.mjs` | Pattern drafts, stable record IDs, change impact and atomic validation of process edits |
| `factory/process-designer.mjs` | Session-only draft editor, labelled connection controls, map or list selection, review and apply |
| `factory/process-diagram.mjs` | Diagram projection with distinct outcome and produced-input connections |
| `factory/maintenance.mjs` | Review candidates from supplied files and three-way comparison of text file snapshots |
| `factory/zip.mjs` | Archive path validation, deterministic UTF8 ZIP32 packaging and bounded stored or DEFLATE ZIP reading |
| `factory/portable.mjs` | Project file reopening, readable project HTML and complete portable pack assembly |
| `factory/project-view.mjs` | Project reading views, workflow presentation and stage assignment palette, derived from configuration and pack metadata |
| `factory/decision-brief.mjs` | Shared projection and rendering of the readable decision brief for live and portable views |
| `factory/decision-review.mjs` | Bounded semantic baseline comparison, exact comparison records, readable export and safe restoration |
| `factory/guidance-review.mjs` | Selected local definition snapshots, historical metadata comparison, scope and unknowns |
| `factory/session-output.mjs` | Attaches optional decision records and a deliberate guidance selection to the chosen output before packaging |
| `factory/app.mjs` | Empty or active session state, start screen, authoring views, history, contextual knowledge, import review, comparison choices and downloads |

## Core API

| Export | Behavior |
| --- | --- |
| `CATALOG`, `TOOL_ALIASES` | Frozen reviewed choices shared by the interface and compiler |
| `createDefault()` | Fresh feature delivery configuration |
| `createRecipe(recipeId)` | Fresh configuration for `feasibility`, `bugfix` or `feature-delivery` |
| `selectRecipe(configuration, recipeId)` | Returns a cloned configuration with the chosen recipe. Existing project data and recorded settings are retained |
| `createExample(recipeId)` | Synthetic editable example for the chosen recipe |
| `getStages(configurationOrRecipe)` | The recipe's stage definitions, or no active recipe stages when the project has no recipe process reference |
| `getEffectiveSkills(configuration)` | Skills bound to enabled recipe stages or custom process steps, plus explicit extra library skills |
| `getTechnologyProfiles(configuration)` | Generic guidance and relevant specific profiles |
| `parseImport(text)` | Structural checks, supported-version migration and rejection of unsupported references |
| `validate(configuration)` | Structural and semantic findings plus separate completeness, format and host statuses |
| `compile(configuration)` | Complete pack with file reasons, validation and size |
| `compileStandaloneSkill(configuration, skillId)` | A complete selected skill directory plus its validation and manifest |

Use the fixtures rather than duplicating schema defaults in another module. The schema is strict. Unknown fields are rejected because this version cannot preserve them reliably.

Decision review is an optional companion record, not a new project schema. It keeps exact baseline, current configuration, reason and output scope. Restoration requires the current configuration to match the opened project and regenerates derived summaries. The selected definition snapshot lives in the manifest. Guidance comparison reads supplied metadata and current local definitions, without source retrieval or an execution claim. Imported artifact contents remain separate from configuration and fresh generation.

Definition snapshots keep each selected definition's own version and review date where supplied, then its catalogue metadata, then the global fallback. Snapshot technology records map to catalogue `profile` definitions, and runtime records map to `control` definitions. Updating the catalogue release does not rewrite the version of unchanged guidance. Supported snapshot version `1.0` retains its existing record types.

## Authoritative configuration

`project.json` stores the versioned configuration. Its main fields are:

- `project`: name, purpose, host, source control and source locations.
- `components`: identifiers, paths, technologies, versions and actual test, lint and build commands.
- `workflow`: recipe, enabled stages, notes, actor and skill bindings, supplied prerequisite artifacts and intent answers.
- `workflowModel`: versioned recipe reference or custom processes, with results, checks, routes, correction policies, approvals and candidate evidence associations.
- `skills`: explicit additional library skills.
- `agents`: selected role profiles and their requested tool aliases.
- `practices` and `constraints`: relevant guidance and project boundaries.
- `facts`: claims, provenance status, source, revision, reviewer and notes.
- `evidence`: stage check, expected result, supplied observation, status, origin, source and reviewer.
- `model`: recorded name, version, budget and notes.
- `runtime`: optional backend design answers and links from requirements to implementation and evidence.

Recipe stage definitions supply purpose, inputs, actions, outputs, checks, prerequisite identifiers, default skills, actor and capabilities. The recipe inspector edits selections, assignments, supplied inputs, answers and notes. The process designer edits custom records under `workflowModel`. It does not rewrite shared catalog definitions or copy the recipe into a competing graph.

Recipe human and external actors use explicit names. Recipe agent actors identify an exported role. A custom development or manual agent assignment reaches a profile only when its actor ID matches a selected supported role. An unknown or unselected role remains a planned identity with an unresolved mapping finding. Application actors remain runtime design choices even when their IDs match development role names. A context-only assignment leaves underlying changes and observed execution with other actors.

A prerequisite can be satisfied by an enabled producer stage or a location in `workflow.suppliedInputs`. A location records an intended input. It does not establish file existence.

## Project views and session state

The session explicitly distinguishes no active project from an active configuration. Empty sessions show starting points and opening controls, without compiling or offering a phantom project. Choose a blank recipe with `createRecipe` or explicitly load a fictional example with `createExample`. Do not duplicate defaults in presentation code.

Workflow and Files are the primary authoring views. Project details groups Brief, Components, Boundaries, Sources and evidence and optional Runtime design. Roles and skills provides the library. Preview Atlas presents the rich readable project summary. View selection, inspection and diagram presentation are interface state, they do not define another workflow document.

Stage selection opens its editing panel directly, without a separate editing mode. Keep one editing location for each decision. Evidence records with `stageId` can appear at the associated stage. Unscoped facts, provenance, model and budget fields remain accessible as project-level records. Do not infer associations absent from configuration.

Actor and skill drag operations change explicit assignments. Click controls provide the same capability. Diagram placement does not change prerequisites or imply runtime execution. Undo and redo retain project revisions in memory during the session.

The process designer has a separate draft while open. Editing it does not mutate the active project. Review computes changed records, relationships and generated files. Apply validates the whole proposed project and changes it as one project revision, with Undo available afterward. A changed underlying project invalidates the pending review. The draft remains visible rather than overwriting newer work. Closing a changed draft asks whether to keep editing or discard it.

Custom routes use named outcomes and selected destinations. Labels, selectors and the step list provide editing without dragging. Removing a referenced record requires explicit reference handling. Invalid references and unsupported structures block Apply. Missing criteria, unnamed actors and unresolved limits can remain draft findings. Instruction generation still reports its own actor, tool and output findings.

Keep assignments, Project details, Roles and skills, undo, redo and downloads usable at narrow widths. Where a contextual panel becomes modal, preserve named-dialog and focus behavior. Help uses the actual control labels. Download integrates short actionable review while retaining detailed file comparison.

Do not write project content, imported files or snapshots to localStorage, sessionStorage, IndexedDB or a remote account. An explicit download creates a user-owned file. Reopening replaces the active configuration after structural checks and a deliberate replacement action where needed.

Legacy storage may be read to offer recovery or an original download. Do not automatically open, migrate, rewrite or remove that data. A recovered supported draft migrates in memory and retains the original source.

Knowledge map opens the full reference Atlas in a dedicated full-viewport view from the start screen and editor. Returning restores the same empty-session screen or retained editing context. Knowledge reading must not create a project, mutate instructions or discard an active configuration.

Keep route aliases for useful existing links. A project route in an empty session must reach start safely. View routes must not collide with detail-panel selection. Preserve Back behavior around Knowledge navigation and guard compilation, history, dirty checks and downloads by active-project state.

Light and dark theme changes synchronize between the workspace and embedded Atlas through same-origin messages. Theme is session interface state, not canonical project configuration or a browser-stored preference. Keep this separate from reopening project decisions.

## Portable project API

| Export | Behavior |
| --- | --- |
| `buildProjectAtlas(configuration, pack)` | Self-contained read-only HTML with project views, artifact reading and a versioned embedded configuration and file snapshot |
| `packageProject(configuration, pack)` | Adds `PROJECT-ATLAS.html` and updates the manifest file inventory without changing the input pack |
| `packageReviewedFiles(files, comparisonRecord)` | Returns resolved files, supported configuration or null, and warnings. Rebuilds inventory and a viewer when `project.json` remains, otherwise returns a file set without a viewer |
| `readProjectFiles(files)` | Reads supported JSON, Atlas ZIP, HTML or a selected folder and returns configuration, supplied files and warnings |
| `PORTABLE_LIMITS` | Bounded input limits for archive size, entries, individual text files and total selected content |
| `renderProjectView(configuration, pack, options)` | Presents a selected project perspective without creating an independent project model |

The readable HTML embeds snapshot version `1.0` and configuration schema `3.0`. Import reads its project payload as text, it does not execute the selected HTML or instructions. Supported older configurations migrate before comparison.

ZIP input supports ordinary ZIP32 archives with stored or DEFLATE entries. The current limits are 32 MiB per archive, 4096 entries, 8 MiB per selected text artifact and 32 MiB total selected text. Encryption, split archives, symbolic links and ZIP64 are unsupported. The embedded configuration must also satisfy the core JSON bound.

Reopening a pack finds its `project.json`, or its supported project HTML snapshot when no configuration file exists. Multiple candidate projects require choosing one pack. The importer skips unrelated files and does not reverse-engineer repository behavior.

The importer keeps known pack, `.github` and template locations, plus supported text files explicitly listed in `manifest.json.files`. Custom notes and helpers can therefore round-trip through ZIP, folder and HTML snapshots without becoming inferred project instructions.

Supported custom text extensions are `md`, `txt`, `json`, `jsonl`, `yaml`, `yml`, `toml`, `xml`, `csv`, `tsv`, `htm`, `html`, `js`, `mjs`, `cjs`, `ts`, `tsx`, `jsx`, `py`, `sh`, `ps1`, `sql`, `sparql`, `ttl` and `rq`. These files are read and previewed as text, not executed. Unsupported extensions and manifest-listed binary or non-UTF8 auxiliary files are skipped with warnings.

Manifest paths must be safe, relative and unambiguous. Unsafe paths and case or Unicode alias duplicates reject the import. `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `coverage` and `.next` directories remain ignored. An inventory entry does not verify its contents or behavior.

Configuration remains authoritative. Supplied generated files are retained separately, with differences reported for review. Plain JSON restores settings only. A complete pack or folder is needed to retain external artifact edits. The original opened file set stays separately downloadable in Files and Download after dismissing the import notice.

## Migration and import

Version `1.0` and `2.0` drafts migrate to `3.0` after their original shape passes checks. Existing project values, components, selected skills, agents, tools, practices, constraints, enabled stages and notes are retained. Version 2 facts, evidence, model and runtime notes also remain unchanged. Migration adds a recipe process reference and does not infer routes, approvals or correction limits.

Legacy selected skills remain explicit library selections. New stage bindings use appropriate recipe defaults where possible. An absent role becomes a named human assignment requiring review. Migration does not create source confirmation, observed execution or evaluation results.

Malformed JSON, unsupported schema fields and unsupported identifiers leave the current draft intact. A supported configuration with missing required values or semantic findings remains editable. Project JSON input and canonical export share an 8 MiB UTF8 bound. Serialization rejects oversized settings without truncating text. A full pack or readable HTML can reach its separate artifact limits sooner because it includes additional generated content.

## Compiler output

The compiler returns files with `path`, `content`, `why`, `stages`, `roles`, `sources` and `assumptions`. Process-aware files also expose `processes` and `steps`. Process IDs use their recorded values. Step references use `processId/stepId` to avoid collisions with recipe stage IDs or another process. Consumers must tolerate absent process associations on older files and optional companion outputs. The compiler also returns validation findings and text size statistics.

The metadata explains an artifact's contribution. It does not authenticate a source or imply that the described task was executed.

The complete pack contains configuration, workflow, project facts, evidence, installation, sources, validation and manifest records. Relevant stages add requirement, decision, verification and evaluation templates. Custom steps also produce an evaluation template with planned outcome cases, exhaustion cases and checks or approval after candidate changes. Every derived case starts as `NOT RUN`. The optional backend design adds `RUNTIME-DESIGN.md` and `templates/CONTRACTS.md`. Its fixed architecture remains illustrative.

Agents link only skills bound to their assigned recipe stages or matching custom development and manual steps. Extra library skills are exported without automatically binding them to every role. Existing selected tool lists remain unchanged. Unknown capabilities or missing requested tools remain findings. Generating a profile does not grant those tools or configure a service.

Skills contain `SKILL.md` and `references/project.md`. Custom assignments include the relevant result definitions, connected checks and routes, correction limits, approval requirements and supplied evidence with its recorded revision. Scope is retained for people, systems and supplied-context reviewers. Application skills describe planned runtime work without assigning it to a development profile. The references do not depend on root pack records. Standalone output places the directory under the skill identifier, with a separate manifest and validation report.

The complete project download also includes `PROJECT-ATLAS.html`. It presents the recorded decisions and carries the supported project configuration needed to reopen them. Keep this project artifact distinct from the standalone full Knowledge Atlas export.

Keep output reproducible for the same configuration and definitions. Dates, random identifiers and observed results must not be introduced implicitly. Byte size is exported text size, not model tokens or a runtime cost estimate.

## Supplied file import

`extractProjectFacts(name, text)` reads one supplied file and returns facts, component candidates and warnings.

Supported inputs are `package.json`, simple declarations in `pom.xml`, and a JSON report containing `facts` and `components`.

Declared version ranges are not installed versions. Package command candidates are exact script bodies and need review of package manager and directory context. Maven inheritance, profiles, effective configuration and commands are not resolved.

Report assertions become inferred candidates. Any supplied original status and reviewer are retained as notes rather than silently adopted as independent confirmation.

This module does not scan a filesystem, retrieve sources or execute code.

## Regeneration comparison

`parseFileBundle(text)` accepts a text file snapshot with a `files` array of `path` and `content`, or that array directly.

`compareFiles(baseline, existing, generated)` compares whole-file text. The baseline is a previously generated pack, existing is the currently edited pack, and generated is the current compiler output.

Independent local edits are retained. Generated changes can be adopted when existing content matches the baseline. A conflict has no automatic resolution. `resolveComparison(rows, choices)` requires a choice of existing, generated or removal for every unresolved conflict.

This is a whole-file comparison, not an automatic line-level merge. The browser produces a reviewed download and does not overwrite repository files. The interface excludes derived `manifest.json` and `PROJECT-ATLAS.html` from comparison choices.

`packageReviewedFiles` packages the resolved contents and comparison record. It rebuilds the inventory and, where a supported `project.json` remains, the viewer from that resolved configuration and exact file set. It does not compile a viewer from an unrelated active draft. An invalid retained project must be corrected or removed. Removing it produces a file set without a viewer or reopenable project.

The rebuilt manifest has kind `reviewed-file-set`. It records `configurationComplete`, `formatChecked`, `hostExercised`, `behaviorObserved` and `improvementEstablished` as false. Parsing supported project metadata and constructing an accurate inventory do not verify edited artifact content. Claims carried in README, INSTALL and VALIDATION files remain supplied text.

File snapshots are bounded to 4096 entries, 8 MiB per text file and 32 MiB aggregate UTF8 content. Their JSON envelope is bounded to 64 MiB to allow escaped text. Fact extraction retains its 2,000,000 UTF8 byte input bound. Archive validation rejects unsafe paths, duplicate destinations, case collisions and normalized Unicode collisions.

## Adding definitions

Edit `catalogue/definitions.json` and its source, relation, topic or action records. Run `npm run build:catalogue` and `npm run check:catalogue`. `factory/catalog.mjs` and `atlas/data.js` are generated projections. The [catalogue guide](catalogue.md) lists the exact files, schema, predicates and authoring steps. Ajv validates at build time and is not loaded by the browser.

A new recipe needs a distinct purpose, questions, stages, required inputs, expected outputs, actor defaults and acceptance checks. Give new identifiers stable meaning.

A technology profile needs actual questions, expected evidence, primary sources and limits. Preserve unknown versions and commands rather than guessing them.

A skill needs a focused trigger, procedure, result and checks. Include every required reference. Follow the [Agent Skills specification](https://agentskills.io/specification).

A practice needs its exact contribution, applicability and source limits. A source link is not permission to install or execute upstream content. Preserve required notices when files are actually reused.

A target adapter needs documented paths, fields, tools and installation behavior. Preserve unsupported settings as findings. Check the [Copilot configuration reference](https://docs.github.com/en/copilot/reference/custom-agents-configuration) before changing its adapter. A model recorded in evidence is separate from host model configuration.

Catalogue availability does not imply JEV support. The frozen v8 inference definitions, supported IDs and digest remain independent of live catalogue additions. New questions can be recorded manually but are excluded from inference requests until a reviewed profile supports them. Response coverage is validated against that frozen profile, not every live catalogue recipe.

## Validation boundaries

Use stable issue codes and configuration paths so findings can lead to the relevant field. Validate definite mismatches and preserve human judgment where the rule cannot establish correctness.

Configuration complete, format checked, host discovery, observed behavior and demonstrated improvement are different claims. The factory does not exercise a consumer host or independently verify supplied evidence.

Changes need appropriate compiler, import, archive and browser checks. Preserve Atlas identifiers, navigation and offline behavior. See the README for the actual test commands.

See [quick start](quick-start.md) for task terminology and [accessibility review](accessibility.md) for the primary guidance and open interaction checks. Do not infer WCAG conformance from source markup or a single automated scan.
