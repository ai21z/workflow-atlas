# Product vision

Direction agreed on 2 October 2026. Three-view interface direction agreed on 6 October 2026. See [requirements](requirements.md) and the [factory guide](factory-guide.md) for the current implementation and its limits.

## What I am building

Workflow Atlas helps people plan and connect work. Describe the result, shape the workflow and download a guide for a team or AI assistant.

The Knowledge Atlas explains concepts and practices. The Project Atlas makes the user's current workflow and decisions visible. Its editor captures responsibilities, inputs, checks and evidence. Generated files and a readable project Atlas carry those decisions into the selected environment.

Its intended audience includes product managers, engineers and technical leads. A team process can describe work without a repository or agent. Development and application processes have their own relevant controls. The product does not assume that every user needs a full delivery lifecycle or multiple agents.

The structure is extensible across technologies. Useful technology guidance needs reviewed questions and evidence requirements. A selectable technology label is not a claim of expert support.

## Confirmed scope

1. Preserve the existing Atlas topics, sources, guided paths, reading interface, map and offline reading.
2. Generate and export artifact packs before adding execution.
3. Start with GitHub Copilot, portable Agent Skills and a readable workflow blueprint.
4. Keep deterministic, inspectable generation without requiring a model API.
5. Keep original project work under my repository identity.
6. Keep project content in session memory, with explicit download and reopening rather than automatic storage.

The first recipes are feasibility investigation, bug investigation and repair, and feature delivery. Each addresses a different intention and produces appropriate evidence.

## The authoring journey

1. Describe the result in Brief, choose a starting point or open a supported pack. Fictional examples are optional.
2. Shape the steps and assignments in Workflow. Custom processes also record explicit connections.
3. Return to Brief for outcome, acceptance and project context. Leave unknowns explicit.
4. Preview files or the readable Project Atlas to understand the resulting decisions.
5. Review findings and download the pack, readable HTML, JSON or a complete standalone skill.
6. Reopen the project and review deliberately edited files before replacing them.

Knowledge map remains a primary destination throughout the journey. It supplies explanations and sources without changing project decisions.

A stage can use an earlier output or an existing supplied artifact. Verification should not force a completed change through every earlier delivery activity.

Human work and external systems are valid actors. An agent with supplied context and no tools can be valid. Requirements for reading, editing or executing must match the task and assigned capabilities.

## The abstraction

| Layer | Responsibility |
| --- | --- |
| Project configuration | Components, paths, commands, target, boundaries and unresolved project information |
| Project fact | A claim, its source, revision when available and status such as detected, inferred, confirmed or unresolved |
| Recipe | An intent-specific starting process |
| Stage | Purpose, inputs, actor, relevant skills, capabilities, outputs, checks, handoffs and failure behavior |
| Practice | Inspectable guidance with applicability and source limits |
| Technology profile | Relevant questions and expected evidence without guessed repository commands |
| Skill | Focused reusable task instructions with required resources |
| Agent profile | Responsibilities, relevant skills and requested capabilities |
| Export adapter | Supported target paths and fields |
| Evidence record | What was required, what was supplied and what was observed |
| Project view | A readable perspective on the same configuration, including workflow, runtime, evidence and artifacts |
| File comparison | Existing edits, generated changes and explicit conflict choices |

The versioned JSON configuration is the authoring source of truth. Readable Markdown and host profiles are generated from it. An edit to an exported Markdown file does not silently rewrite the configuration.

Recipe stages retain their reviewed topology and prerequisites. Custom processes can record and edit steps, supplied inputs, produced results, named outcome routes, checks, approval and bounded corrections. Those decisions appear in diagrams and exports. Arbitrary routing expressions, parallel joins and workflow execution remain outside this version.

The [workflow design specification](workflow-design-spec.md) describes the design scope. The implemented [workflow model](workflow-model.md) records explicit connections. Selecting a pattern, applying a process change or downloading its files does not execute the workflow.

An Atlas pack retains the configuration needed to reopen its decisions. An arbitrary repository can supply facts for review, but it cannot reliably supply every original decision or relationship. Externally edited generated files remain differences to review.

## Development and runtime workflows

A development workflow describes how a team investigates, designs, implements and verifies a feature. A runtime workflow describes the behavior of the resulting application.

The backend agent example concerns a configuration-generation service. Its development recipe studies the current process, compares architecture options, specifies contracts, estimates cost and defines evaluation cases. Its runtime design describes a request passing through an API, an agent, typed tools, existing services and persistence.

The example makes validation before writes, bounded execution, uncertain write outcomes and confirmed versus inferred results visible as design questions. Recording a control does not implement it.

A Copilot profile helps an engineer carry out the development work. It does not become the deployed backend agent simply by being exported.

## Evidence and evaluation

Keep these claims separate:

1. The configuration is complete under known rules.
2. The artifact structure has been checked.
3. A named host discovered the artifacts.
4. Actual task behavior was observed.
5. An outcome improved relative to a suitable comparison.

Facts imported from selected files remain reviewable candidates. A confirmation needs its reviewer and supporting source. A user-supplied observation is not an observation made by the factory.

Useful evaluation compares the existing setup, minimal verified facts, one relevant skill and the proposed pack. Record expected outcomes, actual results, human corrections, context, latency and model expenditure. Do not infer success from an HTTP response or the agent's own completion statement.

## Interface principles

Keep three primary destinations visible: **Brief**, **Workflow** and **Knowledge map**. They are coordinated views, not mandatory wizard steps. A fresh session begins in Brief without a fictional project. Opening a supported pack leads to its Workflow. A safe explicit deep link takes precedence.

Brief asks what the user wants to achieve. After a project exists, it remains the place for the outcome, acceptance examples, assumptions, boundaries, components, sources and optional runtime design. Reveal detailed records when they are useful. Each decision has one editing location.

Workflow gives the diagram and selected-step inspector the available space. A keyboard-accessible step list offers equivalent editing commands for custom processes. Recipe stages retain their actual editing limits. Roles and skills provides the assignment library. Dragging is optional.

Preview files is a secondary Workflow view reachable from both Brief and Workflow. It shows exact generated content, file reasons, output scope and retained opened files. The readable Project Atlas is another view of the same accepted decisions. Neither is an independently edited project. Download integrates review and export.

Process edits remain a pending draft until reviewed and applied. Switching views retains pending work. When accepted decisions change elsewhere, the process comparison must be reviewed again. Applying must preserve unrelated newer work and make conflicts explicit. Downloads must identify pending edits and export the accepted project only, unless those edits are deliberately applied first.

Stage evidence appears with the relevant stage. Consolidated records remain reachable from Brief. Expected checks, observations, interpretation and approval remain distinct. Optional runtime design requires an explicit choice, not a recipe-based assumption.

Knowledge map supports independent learning and exploration from a project. It preserves the full reference Atlas, reading, cards, filters, search, sources and guided paths. Explicit mappings can open relevant guidance from a step. Reading or switching views never silently adds instructions. A supported practice shows its proposed project and file changes before Apply. The reference Atlas remains available independently and offline. Essential authoring does not depend on dragging, hover or WebGL.

Help follows the user's tasks, with short steps and links to relevant work. Light and dark themes share the current session preference. The [accessibility review](accessibility.md) uses WCAG 2.2 Level AA as a baseline and keeps inspected implementation separate from demonstrated conformance.

The workspace does not write active project content to localStorage, sessionStorage, IndexedDB or a server. Downloading is explicit. Closing or reloading the session loses changes that were not downloaded. Existing stored drafts may be deliberately recovered or exported without changing the originals.

## What remains later

Execution, scheduling, account connectors, automatic repository writes, shared administration and runtime policy enforcement belong to a separate phase.

Spec Kit and APM adapters are potential integrations. Do not duplicate their packaging and dependency systems without a demonstrated need. A large catalog, marketplace or graph database is not required for the first useful case.

Knowledge wiki practices, model choices, technical debt and specialized decision support remain in the Atlas and can motivate future recipes. They are not mandatory dependencies for every pack.

The next proof of value is a real team completing one class of work with a clearer, more reviewable result and less avoidable rework. Generated file counts and passing compiler tests do not establish that outcome.
