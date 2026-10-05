# Workflow design implementation specification

Implementation specification, updated 5 October 2026. The implementation status below separates delivered design behavior from remaining validation and future work. Workflow execution remains outside this milestone.

Slices 1 through 4 have local implementations. The Knowledge Atlas includes general patterns and lifecycle guidance. Project schema 3.0 adds versioned process records, explicit input relationships, outcome routes, bounded corrections, migrations and three fictional fixtures. A visual designer provides labelled controls, a map, a step list and reviewed application of changes. Exporter 3.1.0 carries custom assignments into skills and supported profiles and derives planned evaluation cases. Structural and regression checks support these boundaries. Independent human walkthroughs and consumer-host usefulness remain to be established. See [Atlas preservation](atlas-preservation.md) and the implemented [workflow model](workflow-model.md).

Atlas should help someone explain a process, connect its steps and download the instructions needed to carry it out. A reader should understand who does the work, what passes between steps, how a result is checked and what happens when it is unacceptable.

This milestone makes those connections explicit. The diagram, readable guide and generated files use the same applied project decisions. Authoring starts from a small set of configurable patterns and preserves manual editing, session memory, explicit download and reopening.

## What exists today

| Area | Current behavior | Gap addressed here |
| --- | --- | --- |
| Development workflow | Three editable recipes plus custom processes with labelled route and correction controls | Independent-user comprehension and broader workflow coverage remain unproven |
| Runtime design | Optional decisions and a fixed illustrative backend diagram, alongside explicitly authored application processes | No runtime adapter or execution engine is provided |
| Correction | Editable target, candidate, feedback, maximum corrections, return check and exhausted destination | A future implementation must enforce the recorded stopping rules |
| Files | Skills, supported profiles and evaluation plans reflect custom assignments and routes, with process and step associations | Host behavior and real outcome quality need separate exercises |
| JEV | Suggests a supported development recipe and assesses defined information gaps | It does not currently select these proposed patterns or support general writing workflows |

These boundaries are documented in the [factory guide](factory-guide.md), [product vision](product-vision.md) and [extension contract](extension-contract.md). The existing knowledge topics already explain controller responsibilities, usable output evaluation, service contracts and stopping rules.

## Milestone scope

Deliver a design tool and a consistent export. Include sequential work, a review gate and a bounded correction pattern. People, agents and existing systems can perform steps. Ordinary code can perform a check without introducing another agent.

Keep the first pattern library small. Add or change a check, assign its owner, name the inputs and outputs, choose supported outcomes and connect a correction path through explicit controls. Every permitted edit must have defined meaning and an equivalent keyboard action.

Execution engines, automatic model calls from workflow steps, arbitrary condition scripts, parallel joins, scheduling, tool installation, application credentials, persistent accounts and deployment adapters remain outside this milestone. Pattern configuration does not activate any of them. The existing optional JEV suggestion journey retains its current scope.

The backend example is one fixture. Its API, database, technology and approval choices must not become defaults for unrelated projects.

## Two processes in one project

Use these labels in the editor and exported guide:

| Label | Purpose | Example |
| --- | --- | --- |
| How we build it | The team's development work | Implement a generator, test its behavior and prepare a release |
| How it works when used | The behavior of the resulting application | Receive a request, generate a candidate, check it and return a result |

A project can have either process or both. Creating an application process is an explicit choice. A general manual process, such as document review, uses the same building blocks without requiring a software development recipe.

Cross references explain the relationship between processes. For example, a development evaluation step can test the application's correction path. That link is not an instruction to start the application whenever the development step is viewed.

## Workflow model

Extend the authoritative configuration in `project.json` through an explicit schema revision. Keep one authoring definition. Diagrams, Markdown and host profiles are derived views, not independent editable copies.

The following are the required logical records. Their implemented field names and serialization are documented in the [workflow model](workflow-model.md).

| Record | Required meaning |
| --- | --- |
| Process | Stable identifier, purpose, kind, selected pattern and its version, entry step and terminal outcomes |
| Step | Stable identifier, action, responsible actor, required capabilities, input references, produced result references and instruction references |
| Result | Stable identifier, description, producer or supplied source, expected structure, consumers and how a version will be identified |
| Check | The candidate being checked, acceptance criteria, checker, expected evidence and possible outcomes |
| Transition | Source step, one declared outcome and destination step or terminal outcome |
| Correction policy | Check or review decision, correction target, findings or requested changes, maximum corrections and exhausted destination |
| Approval requirement | Named decision authority, candidate and evidence to review, and accepted, changes requested and declined destinations |

Keep planned actors separate from decision authority. Assigning someone to a step does not grant permission to approve or publish. Reuse existing human, agent and external assignments where possible. An external implementation can be a validator or an existing pipeline. A reference to a command or endpoint does not establish that it exists or works.

A supplied-context review assignment remains review only. It cannot perform generation, repair or commands merely because it appears on a correction path. Capability findings must explain which assignment needs changing or which outputs another actor must supply.

### Instructions and results

An instruction artifact tells an actor how to work. A result is produced when that work happens. Keep their identities separate.

For example, a generation skill belongs to the Generate candidate step. The candidate configuration is that step's output. A validation report is the Check candidate output. The repair step consumes the candidate and findings, then produces a revised candidate.

A result can be a file, structured response or supplied record. Do not require every result to have a repository path. Unknown schemas, locations, commands and versions stay unresolved. Creating a result definition must not create a fake execution record.

### Dependencies and outcome routes

Show two distinct relationships:

- An input relationship says a step needs a particular result.
- An outcome route says where the process goes after a declared result of a step.

Existing prerequisite arrows do not establish success conditions. Imported prerequisites must retain that limited meaning.

The first version uses named outcomes and supported pattern choices. It does not evaluate user supplied code or free text as routing logic. Structural conflicts produce validation findings. Criteria can be written in ordinary language, but their clarity requires human review or an explicitly recorded concern. Atlas does not automatically detect ambiguity in arbitrary prose. An unknown outcome has an explicit unresolved destination rather than falling through to success.

## Checks and correction behavior

Use this as the reusable correction pattern. An initial candidate can be generated or supplied.

```text
Candidate -> Check
  Pass -> Approval if required -> Deliver result
  Repairable -> Budget available -> Correct -> Check again
  Missing information -> Ask for clarification
  Blocked or exhausted -> Stop with findings
```

The project chooses suitable checks. A parser can check structure, a test can check behavior on examples, a person can review meaning, and a model can provide an assessed judgment. Passing one check does not establish every other property.

Every correction policy must specify these rules:

1. Identify the check or review decision, candidate version and findings or requested changes returned to the correction step.
2. Define the maximum number of corrections after the initial candidate. Missing limits remain unresolved. Do not silently choose a default.
3. Count entry into a correction attempt once, including an unsuccessful attempt. Resetting the count requires a new run, not revisiting a step.
4. Record any additional time or spending expectations as context. Structured time and spending budgets are deferred. The current model represents the maximum correction count only, and a future runtime must enforce it.
5. Recheck the revised candidate. Earlier evidence remains historical and cannot silently qualify the new version.
6. Route unavailable checks, missing evidence and nonrepairable failures to an explicit outcome. None counts as a pass.
7. Keep cancellation and exhausted work visible, with the last candidate and unresolved findings where available.

Approval refers to the checked candidate. A material revision requires the affected checks and any required approval again. Declined approval must not silently enter an automatic correction loop. Changes requested may enter the configured correction path.

A transport retry is different from a correction. A timeout after a possible database write requires confirmation or reconciliation under the application's rules. It must not automatically rerun generation or repeat the write. Keep write recovery as a separately described requirement in this milestone.

The first editor supports cycles only through the bounded correction pattern. Arbitrary cycles, concurrent corrections and implicit reset behavior are outside its supported model.

## Editor behavior

The local designer covers labelled editing, Map and Step list views, reviewed changes, reference-aware removal and atomic application to session state. It is opened from Workflow. A custom process is edited as a draft, then applied through **Review changes** and **Apply changes**. Closing pending edits requires keeping or discarding them. These requirements describe the intended user experience, not a completed independent usability study.

Keep the graph prominent and retain the existing Knowledge map. Begin with a task and a pattern, not a compulsory empty canvas. **Design a connected process** starts a project without a development recipe or repository requirements. The designer offers **A team process** for manual work, alongside development and application kinds. **Design a process** in an existing project adds another process.

Selecting a step opens its existing style of inspector. Ask these questions in order:

1. What happens here?
2. Who or what does it?
3. What does it need and produce?
4. How do we know the result is acceptable?
5. What happens if it is not?

Reveal correction limits when a correction path is selected. Reveal approval fields when approval is selected. Essential outcomes and unresolved decisions remain visible without opening advanced settings.

Provide a readable step list alongside the diagram. Both views must support the same decisions. Do not require dragging, hover, color recognition or WebGL to edit or understand the process. Keep light and dark themes, visible focus, meaningful labels, reduced motion and narrow-screen access.

Adding or removing a step previews affected routes, results and instruction files. Referenced records cannot disappear silently. Offer an explicit replacement or cancellation. Apply and Undo must restore the complete change, including related references and focus.

A future walkthrough can let the author choose fictional outcomes to inspect routes. If included, label it Design walkthrough and retain no observed execution claims. It does not run the agent or prove the checks work.

## Knowledge improvements

Preserve existing topic identifiers, sources, useful examples and graph relationships. Fix instructions that assume the original workplace stack. Label examples explicitly and add applicability wording where it affects a decision.

Align broad lifecycle links with their actual destinations. General architecture, work breakdown and release guidance need appropriate content if those broad labels remain. Avoid presenting traceability as work breakdown.

Explain the reusable patterns through concise topics or sections: inputs and outputs, checks and outcome routes, bounded correction, approval after changes and the difference between a retry and a repair. Connect these to existing service-contract and verification guidance.

Knowledge links explain concepts. Workflow links describe process behavior. Reading a topic must not mutate a process. Applying a reviewed pattern requires preview and a deliberate choice. Keep source provenance and confidence separate from applicability.

## Export contract

Generate every view from the same accepted configuration and versioned definitions. A user can download an incomplete design, with unresolved choices visible. Malformed references or unsupported structures must not produce a supposedly valid workflow. Preserve the user's source data for recovery when import fails.

| Output | Required content |
| --- | --- |
| `project.json` | Authoritative process definitions, relationships, recorded decisions and unresolved values |
| `WORKFLOW.md` | Selected processes, steps, input relationships, outcome routes, correction limits, owners and stopping outcomes |
| `PROJECT-ATLAS.html` | The same readable decisions and diagrams, with supported configuration for reopening |
| Skills | Relevant procedures, assigned scope, required inputs, produced results and local resources |
| Agent profiles | Assigned responsibilities and relevant skills, without promoting development profiles into deployed agents |
| Evaluation templates | Planned cases derived from success, correction, missing information, blocked and exhausted paths |
| Manifest and review records | Definition versions, process and step associations, included file scope and accurate validation limits |
| Optional runtime design | The selected application process and remaining implementation requirements. Any illustrative architecture is labelled separately |

Each file explanation identifies its related process and step, why it is included and its required resources. Generated evaluation cases are plans. Expected outcomes are not actual observations.

Respect existing output choices. A blueprint can explain the process without exporting agent profiles. A selected skill output must have all resources needed for its own procedure, without links to omitted root files. Its retained project configuration can preserve the wider design for reopening. The separate standalone skill export must not claim to preserve a complete project.

External edits remain available for comparison. Editing Markdown does not rewrite project decisions or acquire a new format or behavior verification claim. Identical configuration and definition versions must produce identical generated content.

## Migration and reopening

The current schema is strict. Do not add new fields under the existing version and expect older readers to accept them.

Before implementing the editor, define the new schema and a deterministic migration from supported older projects. Keep stable stage identifiers where possible and add process identity where needed. Preserve bindings, supplied inputs, intent answers, notes, facts, evidence, definition snapshots and file comparison records.

Use a single canonical authoring model after migration. Legacy recipe fields must not become a second graph that can drift from the new process. Existing prerequisites remain dependencies until an explicit author choice establishes outcome routes. Do not infer approvals, branches, correction limits or successful checks from free text.

Old runtime notes remain notes. Their illustrative diagram must not be reclassified as a user designed application workflow. Adding that process is deliberate.

Migrate references in evidence and decision review together with the project. A planned step reference is not evidence of an executed candidate. Keep historical observations and mark applicability to a changed candidate unresolved when it cannot be established.

Only recorded or deliberately imported revisions can inform that comparison. Atlas cannot detect changes to external files it has not inspected. This milestone records evidence requirements and supplied candidate references, not a runtime execution ledger.

Supported JSON, ZIP, project HTML and folder imports must retain all new semantics. Unsupported versions, dangling references and excessive input sizes must fail without replacing the active project. Preserve existing archive and path protections. Reduced outputs must reopen the retained full decisions without pretending omitted files were included.

## Three representative cases

These are implemented fictional model fixtures, not completed user trials. The same model represents all three without case-specific generator logic. Their scenario expectations below describe the intended eventual workflow. Automated checks validate the model and its reopening, not real execution. The sample limit of two corrections is only a fixture value, not a product default.

### Backend configuration generation

Set up an application process with request input, generation, validation, correction and delivery. Add approval only when the fixture explicitly calls for it. Link a separate development evaluation step to the application's expected branches.

| Action in the test | Expected result |
| --- | --- |
| Supply a valid candidate and a passing check | Route to the configured approval or delivery step |
| Supply repairable findings for candidate version 1 | Correction receives that candidate and those findings |
| Produce version 2 | Relevant validation runs again in the designed process. Version 1 evidence does not approve version 2 |
| Fail both configured corrections | Route to Stop with findings rather than a third correction |
| Remove a required input or make the check unavailable | Route to clarification or a blocker, with no success claim |
| Model a timeout after a possible write | Require reconciliation or assistance, not an automatic write retry |

### Bug investigation and repair

Start from the existing bug recipe. Connect repair to regression verification and route repairable findings back to the correction step. Retain the reproduction case, expected behavior, actual commands and review handoff.

| Action in the test | Expected result |
| --- | --- |
| Supply failed regression findings | The next repair receives the relevant findings and candidate identity |
| Change the implementation | Earlier results remain historical. Required checks for the new revision remain open |
| Remove the configured test command | The check is unresolved, not fabricated or passed |
| Assign supplied-context review only | Another actor must supply repair and check outputs. The review profile gains no execution permission |
| Complete the configured checks and review | Produce the normal release handoff without claiming deployment |

### Document drafting and review

Choose the new manual Process pattern. Name the brief, draft, review criteria, correction step and final handoff. Use people or agents as explicitly assigned. Do not require a repository, build command, API or database.

| Action in the test | Expected result |
| --- | --- |
| Request changes against the supplied brief | Return the draft and review findings to its assigned author |
| Revise the draft | Review applies to the new version, with no inherited approval |
| Leave acceptance criteria unknown | The design displays what the reviewer still needs to decide |
| Accept the final draft | Route to the named handoff without publishing anywhere |
| Ask current JEV to classify general writing | Preserve its existing unsupported result and offer manual authoring |

## Implementation sequence

| Slice | Deliverable | Current status and completion condition |
| --- | --- | --- |
| 1 | Knowledge scope corrections and pattern explanations | Locally implemented. General instructions and labelled examples agree, with existing topics, sources and navigation retained |
| 2 | Versioned model, migrations and three fixtures | Locally implemented. Inputs, routes and bounded corrections have explicit semantics, with migration checks for existing projects |
| 3 | Editor and readable process views | Locally implemented. Labelled controls and the map or step list support editing. Independent comprehension remains to be checked |
| 4 | Consistent exports and reopening | Locally implemented. Custom assignments and planned cases reach the selected outputs, preserving reduced packs and file comparison boundaries |
| 5 | Structural checks and human walkthroughs | Structural checks are implemented. Independent readers still need to demonstrate that they can explain and adapt the process from the app and its download |

Keep the implemented versioned model authoritative when extending the editor or compiler. Do not copy a competing data shape into view code. Change schema, migration behavior and fixtures together if the recorded semantics change.

## Acceptance and evidence

Automated checks should target consequences: missing producers, undeclared outcomes, dangling routes, unreachable required steps, ambiguous destinations, unbounded correction paths, incompatible assignments, approval bypass, stale evidence and broken selected-output references. Pattern constraints should make unsupported cycles impossible to author and reject them on import.

Structural validation cannot establish that a natural-language criterion is correct, a supplied observation is true or an integration works. Keep configuration completeness, output format checks, actual behavior and demonstrated usefulness distinct.

Exercise every declared outcome in each fixture. Check export and reopening in supported formats, including edits and cancellation. Confirm that offline reading explains the same process. Exercise keyboard controls, narrow screens and both themes, with assistive-technology observations recorded separately when available.

For human walkthroughs, ask an unfamiliar reader to identify the intended result, next actor, evidence needed to continue, correction destination and stopping condition without opening Help. Include a junior technical participant and a PM when available. Record actual confusion and corrections. Simulated personas cannot substitute for those observations.

The milestone is useful when the three cases can be explained and adapted through shared patterns, and their exports preserve those decisions. It does not establish universal workflow coverage or runtime reliability.

## JEV follow up

Keep manual authoring complete. The current JEV questions and policy cover the existing three development recipes. General writing is explicitly outside that contract.

A later integration can propose supported pattern identifiers and identify missing choices such as acceptance criteria or stopping behavior. Atlas validates the response and assembles known definitions. The user confirms the design. JEV must not silently invent graph nodes, commands, tool access, approval authority or policy.

Version and evaluate that changed decision contract before enabling it. Include ambiguous intent, unsuitable patterns, missing limits, conflicting checks, manual overrides and stale responses. Existing recipe pilot results do not establish the new behavior's quality.

## Source basis

Current behavior was checked against the repository on 5 October 2026. The model, UI and export choices above are local Atlas design decisions. Their implementation does not establish universal suitability.

- [Core configuration and exports](../factory/core.mjs) define current strict fields, prerequisites, workflow generation, runtime notes and output selection.
- [Catalog](../factory/catalog.mjs) defines current stages, recipes and runtime controls.
- [Project views](../factory/project-view.mjs) and [workspace editor](../factory/app.mjs) present the recorded decisions.
- [JEV definitions](../factory/jev-definitions.mjs) define supported intent and the writing exclusion.
- [Knowledge content](../atlas/data.js) contains the existing backend study, evaluation, controller and retry guidance.
- [Anthropic on building effective agents](https://www.anthropic.com/engineering/building-effective-agents) describes programmatic gates and evaluator-optimizer loops. Its pattern discussion informs the design. It does not validate this specification or require model-based checking.

The implemented schema, migration rules and pattern choices are recorded in the workflow model guide. Execution adapters and broader JEV support require separate work. No productivity measurements or completed independent-user trial results are supplied by this specification.
