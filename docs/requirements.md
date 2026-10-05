# Requirements

Agreed scope for the connected project workspace, 2 October 2026. Start screen, consolidated authoring and the first three usability priorities updated on 3 October 2026. Feasibility guidance, decision brief and download reopening updated on 4 October 2026.

This document describes intended behavior and acceptance checks. The [factory guide](factory-guide.md) identifies the implemented authoring path. [Extension contract](extension-contract.md) describes the actual schema and modules.

## Confirmed scope

The product preserves the original Knowledge Atlas and connects it to a visual workflow editor, readable Project Atlas and file generation. GitHub Copilot, portable Agent Skills and a workflow blueprint are the initial targets. The generator remains deterministic and runs locally in a browser without an account or model API.

The fresh session has no active project. Investigate an idea, Build a feature and Fix a bug start blank recipes. Open pack and explicitly fictional examples remain separate choices. The active workspace uses Workflow and Files as its primary views, with one editing location for each decision.

The initial recipes are feasibility investigation, bug investigation and repair, and feature delivery. The backend agent example is a generic configuration-generation feasibility case. Execution remains a later phase.

The first usability priorities connect a short outcome brief, an explained and overrideable output recommendation, reviewed Knowledge practices with preview before applying, and use instructions matched to the selected output. Workflow blueprint, one focused skill and full pack exports retain the same authoritative project decisions. The selected output is a session choice, not a new project schema or an instruction to change workflow assignments.

## Core acceptance requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| LIB-01 | Preserve the Atlas | All 105 topic identifiers, 10 clusters, 55 source records, guided paths, reading and map views remain available |
| LIB-02 | Keep reference reading explicit | Opening a topic never adds instructions without a configuration choice |
| LIB-03 | Preserve offline reading | The standalone export loads reading and map resources locally, with reading available without WebGL |
| LIB-04 | Keep knowledge in context | Knowledge map is a primary entry from start and editor. Returning retains the start screen or active project, selection, unsaved edits, focus and scroll context |
| LIB-05 | Organize practices by purpose | Generic verification guidance uses Verification and evidence. Named repository examples retain their source attribution and historical review limits |
| LIB-06 | Apply reviewed guidance deliberately | Applicable curated topics offer a review of specific changes and affected generated files. Reading and canceled reviews leave decisions unchanged. Explicit application is undoable |
| PRJ-01 | Capture real project context | Components retain editable technologies, versions, paths and actual commands. No missing command is guessed |
| PRJ-02 | Keep technology guidance bounded | Reviewed Spring Boot, React and graph-data profiles add relevant questions and evidence. Other technologies use generic guidance |
| PRJ-03 | Import supplied facts reviewably | Selected supported files or reports produce candidates with source and status. The browser does not claim to inspect the whole repository |
| PRJ-04 | Trace claims to sources | Facts keep source references, revision or date where available, reviewer and unresolved questions |
| WFL-01 | Use intent-specific recipes | Feasibility, bug repair and feature delivery have distinct activities and outputs |
| WFL-02 | Represent complete stages | Each stage has purpose, inputs, actor, applicable skills, capabilities, outputs, checks, handoffs and failure guidance |
| WFL-03 | Accept existing prerequisites | A supplied existing artifact can satisfy a required input without enabling every earlier stage |
| WFL-04 | Support people and external systems | A human or external system can own work. No agent is required merely to represent a workflow |
| WFL-05 | Match agent work to capabilities | A definite mismatch produces actionable feedback. A context-only agent remains valid where its assigned work permits it |
| WFL-06 | Assign focused skills | Agents receive relevant skills from their responsibilities rather than every selected skill by default |
| WFL-07 | Make overrides visible | Intentional extra artifacts remain possible, with an explanation of relevance or unresolved fit |
| CASE-01 | Distinguish development and runtime | The backend example studies and designs a deployed feature. Its Copilot profiles support engineering work, they are not the deployed backend agent |
| CASE-02 | Capture controls without inventing enforcement | Validation before writes, bounded execution, retries, duplicate writes and failure outcomes are recorded as requirements and linked evidence |
| CASE-03 | Define meaningful success | Business success depends on confirmed results and acceptance checks rather than an HTTP code or completion statement |
| CASE-04 | Enable runtime design deliberately | Runtime design is an optional Project details capability. Selecting feasibility does not automatically enable it |
| EVD-01 | Keep facts and observations distinct | Detected, inferred, confirmed and unresolved facts remain identifiable. Supplied observations are not labeled factory-observed |
| EVD-02 | Require evidence for stronger claims | Recording a requirement does not imply implementation or successful tests |
| EVD-03 | Export practical templates | Requirements, decisions, verification and evaluation templates retain expected results, observed results and unrun checks |
| EVD-04 | Support a fair comparison | Evaluation scaffolding compares relevant project options with the current approach and records criteria, observations and limits. Existing setup, verified facts, focused skill and full pack conditions are optional for studies of AI instructions |
| EVD-05 | Record costs honestly | Model, versions, budgets and observed expenditure can be recorded. No universal model ranking or unmeasured savings are promised |
| EVD-06 | Keep evidence at the right scope | Stage-associated evidence is accessible from stage details. Consolidated evidence and unscoped facts, provenance, models and budgets stay accessible in Project details without invented stage links |
| OUT-01 | Export a coherent pack | The blueprint, relevant artifacts, configuration, manifest and reports agree with the selected workflow |
| OUT-02 | Explain each artifact | The preview identifies its purpose, stage or role, contributing facts and practices, unresolved values and dependencies |
| OUT-03 | Export a complete standalone skill | A skill export includes every required resource or explicitly declared dependency |
| OUT-04 | Keep the configuration authoritative | Supported settings survive export and import. External Markdown edits do not silently become configuration changes |
| OUT-05 | Generate consistently | The same configuration and definition versions produce the same content. Decision-review Markdown uses a consistent object key order so an untouched new download does not acquire a conflict from key order on reopening |
| OUT-06 | Compare regeneration safely | Existing edits and generated changes are visible. Conflicts require explicit choice. No destination file is silently overwritten |
| OUT-07 | Keep paths inside the export | Absolute paths, parent traversal, duplicate destinations and malformed file bundles are rejected |
| OUT-08 | Export a readable project Atlas | A self-contained HTML presents the project's decisions and includes the supported configuration needed to reopen it |
| OUT-09 | Reopen supported project files | JSON, Atlas ZIP, project HTML and selected Atlas folders restore their configuration. External file differences remain visible for review |
| OUT-10 | Start with a proportionate handoff | New workflows suggest a blueprint for human review. Users explicitly choose one included skill or the full pack when needed, without changing stage assignments. Every selected ZIP retains project.json and accurately lists its actual files |
| OUT-11 | Explain how to use the chosen download | UI guidance and INSTALL.md agree with the selected output and intended host. They cover placement or human handoff, a bounded exercise, failures, observations and reopening where applicable |
| VAL-01 | Reject malformed imports safely | An unsupported or malformed file leaves the current draft intact |
| VAL-02 | Preserve editable semantic issues | A supported draft with missing inputs or rule findings can still be inspected and corrected |
| VAL-03 | Keep validation claims separate | Configuration complete, format checked, host discovery, observed behavior and demonstrated improvement never imply one another |
| VAL-04 | Keep use instructions separate from results | A use guide describes an expected adoption procedure. Exercise records start unrun or unresolved. They never imply that Atlas discovered artifacts, ran tasks or demonstrated improvement |
| UX-01 | Start with the task | A fresh session shows three blank starting points, Open pack and Browse examples. It shows no fictional project, metrics, file inventory or phantom download |
| UX-02 | Support keyboard and mobile use | Essential controls have labels, visible focus and usable responsive layouts |
| UX-03 | Preserve work during navigation | Returning from guidance or preview retains the current draft |
| UX-04 | Make findings actionable | A finding identifies the relevant field and useful correction |
| UX-05 | Keep one project model | Workflow, Files, Project details and Preview Atlas derive from the active configuration rather than separately edited copies |
| UX-06 | Make assignment visual and explicit | Drag or click controls assign a selected actor or skill to a stage, with an inspector for its details |
| UX-07 | Support undo and redo | Project editing can be reversed and reapplied during the session. Native text editing remains usable |
| UX-08 | Keep graph limits visible | The current editor uses fixed recipe stages and prerequisite relationships. It does not imply arbitrary graph authoring or execution |
| UX-09 | Explain common tasks in context | Help offers a short introduction and task instructions with the actual control labels. Following guidance retains the project |
| UX-10 | Keep display choices explicit | A labeled Dark mode switch exposes its on or off state and switches the workspace and reference Atlas together during the session, without saving the preference |
| UX-11 | Consolidate authoring | Workflow and Files are the two primary editor views. Project details, Roles and skills, Preview Atlas and Download retain the other capabilities without a second settings navigation |
| UX-12 | Edit a stage directly | Selecting a stage opens one contextual panel. No Edit workflow mode or duplicate stage detail form is required |
| UX-13 | Disclose detail when relevant | Brief, Components, Boundaries, Sources and evidence and optional Runtime design provide project detail without a compulsory setup wizard. Unknowns remain visible where they affect decisions |
| UX-14 | Keep defaults distinguishable | A blank recipe does not include fictional paths, commands or evidence. Template roles, practices and host choices remain editable defaults rather than detected facts |
| UX-15 | Review at download | Download presents short actionable findings and retains detailed file comparison and export choices. Incomplete drafts remain downloadable with unknowns intact |
| UX-16 | Keep examples opt-in | Browse examples explicitly loads fictional project information. Supported imports open directly into the editor. Empty-session project links return gracefully to start |
| UX-17 | Start with a small outcome brief | A blank recipe asks for a name, intended result and optional existing context. Unknowns stay blank and later authoring remains available. Context is recorded as notes, with no link retrieval or fact confirmation |
| UX-18 | Preserve choices across guidance and download | Practice reviews explain exact edits and keep an accessible cancel path. Output choice explains contents and reopening. Independent standalone skill export does not mark the whole editable project as downloaded |
| UX-19 | Explain one project to different readers | Live and downloaded Atlas share a concise decision brief with supplied outcome, approach notes, planned owners and explicit gaps. Read all approach notes exposes complete supplied notes. Filled fields do not establish that questions within them are resolved. Technical information expands without creating a second project |
| UX-20 | Review decisions as well as files | Compare exact recorded settings with a session or supplied baseline. Retain an optional user reason, before and after values, related stages and associated actual generated changes. Baseline selection does not replace current decisions |
| OUT-12 | Preserve decision review for reopening | Changed settings or a supplied reason add readable Markdown and bounded JSON to ZIP and HTML. Matching project settings restore exact baseline and reason. Unsafe or mismatched records stay unapplied with visible warnings |
| LIB-07 | Compare guidance without implying freshness | Record selected local definition contents, versions, source links, review dates, applicability and limits. Show updates and missing historical metadata. Never treat age, links or user selection as source verification |
| LIB-08 | Choose updated guidance deliberately | Before replacing instructions affected by comparable definition drift, review differences and explicitly select current definitions. Cancel and download of original files stay available. Project selections and definition updates remain distinct |
| SES-01 | Keep projects in session memory | Active project content is not automatically written to browser storage, accounts or a server |
| SES-02 | Make preservation explicit | Incomplete work can be downloaded. The interface identifies the session state and the need to download before leaving |
| SES-03 | Recover legacy drafts deliberately | An existing stored draft can be recovered or downloaded after a user action. It is not silently loaded, rewritten, migrated or deleted |
| EXT-01 | Use shared definitions and adapters | Recipes and guidance remain separate from host-specific output fields |
| EXT-02 | Keep upstream integrations explicit | Spec Kit, AgentRC and APM adapters are not labeled available without verified implementation |

## Verification scope

Compiler and archive tests establish the rules they exercise. Browser tests establish the interactions and export cases actually observed.

The [accessibility review](accessibility.md) records the WCAG 2.2 Level AA baseline, source inspection and planned keyboard, reflow, contrast and assistive-technology checks. Requirements and implementation do not establish conformance by themselves.

A consumer-host exercise must name its host and version, project fixture, discovered artifacts, available tools, checks and observed results. Host formatting alone does not establish discovery or successful task behavior.

A product usefulness claim needs a suitable real-task comparison including result quality, human corrections, human effort and maintenance. Generated file counts and repository popularity do not establish usefulness.

## Remaining product decisions

| Decision | Current direction |
| --- | --- |
| Shared team authoring | Consider after individual authoring and maintenance prove useful, without changing session-only behavior by default |
| Arbitrary workflow graphs | Future work, current recipes provide fixed topology with editable selections and assignments |
| Further technology profiles | Add in response to a real case with reviewable sources and tests |
| Technical debt recipe | Extend the shared structure after the three current intentions |
| Optional upstream adapters | Integrate a demonstrated consumer need rather than duplicating package managers |
| Runtime execution | Evaluate separately after useful exported packs and observed host behavior |
| Knowledge maintenance | Keep source and claim tracking lightweight before adding automated curation or graph storage |

## Outside this phase

Running workflows, paid model evaluations inside the app, scheduling, account connectors, automated repository writes, automatic project persistence, arbitrary graph execution, enterprise administration, a marketplace and runtime permission enforcement remain outside this delivery.

Original workplace material is preserved locally in the Atlas baseline. New default examples use synthetic names and values. Public release still requires review of the retained workplace-specific content.
