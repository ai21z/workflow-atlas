# Workflow Atlas

Plan the work. Connect the steps. Download a guide for your team or AI assistant.

Workflow Atlas turns your recorded decisions into a workflow blueprint, one focused skill or a full artifact pack. Its Knowledge map explains relevant practices and their sources. You can explore it while keeping your project open.

**Beta scope:** the app generates files for review. It does not run the workflow, install tools or connect your accounts. JEV suggestions are optional and currently need a local server with your own TypeSafe key, or a session facilitated on the owner's machine.

Your project stays in the current tab. **Download before closing or reloading.** Use **Open pack** to continue later. No account is needed for manual editing and generation.

## Try it

Open [Workflow Atlas online](https://ai21z.github.io/workflow-atlas/). The hosted beta includes the workspace, Knowledge map, guides, imports and downloads. JEV suggestions require the local setup below.

Project content stays in your tab and is not uploaded by the hosted app. Download to keep it. GitHub Pages records visitor IP addresses for security, as described in [GitHub's hosting documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection).

1. Open the hosted workspace, or run the local server below.
2. Choose **Design a connected process** for a custom process, or choose **Investigate an idea**, **Build a feature** or **Fix a bug**. Configured JEV can suggest one of those three development recipes from your description.
3. Review the suggestion or starting pattern. Keep the decisions you want in the draft.
4. Edit its steps and inspect **Files**. Unknown details stay unresolved.
5. Choose **Download**. Start with a blueprint for a team discussion, or choose a skill or full pack for an AI assistant.

Follow the [quick start](docs/quick-start.md) for the full journey. Read [JEV setup](docs/jev/integration.md) only when you want suggestions.

## Current workspace

The start screen has no active project. JEV can suggest one of three supported development recipes, or you can choose one yourself:

- **Investigate an idea**, understand the current process and recommend go or no-go.
- **Build a feature**, plan, implement and review a scoped change.
- **Fix a bug**, diagnose and repair incorrect behavior.

**Design a connected process** opens a manual pattern chooser without requiring a development recipe, repository or agent. Start with a sequence, review gate or bounded correction. [Connect a process](docs/factory-guide.md#connect-a-process).

Use **Open pack** to continue a supported download or **Browse examples** for explicitly fictional worked projects. Template roles and practices are editable defaults. A blank project leaves the Copilot host and source control unchosen.

**Start with the result** asks for a name, intended outcome and optional existing context. Unknown details can stay blank. The next-step bar helps you return to the brief or review a suggested download, with an explanation and controls to choose a different output.

In **Workflow**, select a stage and edit its owner, skills, inputs, notes and evidence in one panel. Assign people, selected agents or external systems. An existing artifact can satisfy a prerequisite without repeating earlier work. Drag assignments or use the equivalent controls. Undo and redo support project changes.

Custom processes open in the process designer. Select a step in **Map** or **Step list**, name its inputs and outputs, define checks and choose each outcome's destination. **Review changes** shows the effect before **Apply changes** updates the project. Applying is not saving. Download afterward to keep the work.

Use **Files** to inspect outputs, **Project details** for project context and **Preview Atlas** for a readable summary. **Roles and skills** keeps the library available. **Download** brings together the review and export choices, including detailed file comparison when needed.

Preview Atlas starts with a decision brief for the team. Read the intended result, supplied approach notes, planned owners and open decisions. Expand technical context when needed. The editor and downloaded Atlas use the same project values.

**Review changes** compares recorded decisions with the session baseline or another supplied Atlas file. Read before and after values, see associated generated file changes and add an optional reason. ZIP and readable HTML downloads keep `DECISION-REVIEW.md` and `decision-review.json` when decisions changed or a reason was supplied. Reopening them restores the exact baseline and reason. JSON alone keeps project settings.

**Guidance and its limits** shows selected definitions, sources, versions, recorded review dates and scope. New manifests preserve a definition snapshot for later comparison. Older packs expose missing history. A detected definition update can be reviewed before deliberately choosing current guidance for a download. The original opened files remain available. This compares local metadata, it does not check upstream pages again.

Download starts with a blueprint for people to review. Choose one focused skill for a selected procedure or a full pack when that handoff needs agent instructions. Every selected ZIP retains project decisions and a readable Atlas for reopening. **Included files and their purpose** shows its actual contents. **How to use this download** explains the human handoff or selected Copilot host, including placement, discovery, a small task, failures and recording results. The same instructions travel in `INSTALL.md`.

Knowledge map and Help remain available from the start screen and editor. The theme control switches between light and dark. The workspace and embedded reference Atlas share the selected theme in this session.

Five reviewed Knowledge topics connect to applicable project choices through **Review for my workflow**. Inspect proposed changes and affected files before **Apply to my workflow**. Reading alone changes nothing. Applied practices remain requirements or guidance, not runtime enforcement, and Undo can reverse the project edit.

Recipe stages keep their reviewed definitions and prerequisites. Custom processes have explicit input relationships, named outcome routes, checks, approval and bounded correction. Editing does not support arbitrary routing expressions, parallel joins or workflow execution. Runtime agent identities do not automatically become Copilot development profiles.

Components retain their own technologies, versions, paths and actual commands. Small Spring Boot, React and RDF/SPARQL profiles add relevant questions and expected evidence. Other technology labels use generic guidance.

Project facts carry sources and status. Evidence records separate expected checks from supplied observations. Model and budget records retain the user's values without ranking models or promising savings.

Runtime design is explicitly optional in Project details. A generic configuration-service example shows how to investigate a backend agent feature. It distinguishes the team's development workflow from the finished application's runtime, including validation before writes, bounded execution, duplicate requests and confirmed results.

The compiler uses reviewed templates. It needs no model API key, account or build service. The active project stays in memory in the current tab. Download JSON, a readable project HTML or a complete ZIP to keep it. Open those files or an Atlas project folder to continue. Older browser drafts have an explicit recovery path, with no automatic migration or storage writes.

## Run locally

Install [Node.js](https://nodejs.org/) 22 or later. Open a terminal in this repository and start the app:

```text
node tools/serve.mjs
```

Open [the project workspace](http://127.0.0.1:8780/factory/), [the Knowledge Atlas](http://127.0.0.1:8780/atlas/) or [the documentation home](http://127.0.0.1:8780/docs/). The root opens the workspace. No npm installation or build step is needed. This command starts manual mode unless the server process already has a TypeSafe key.

For JEV, follow the [setup guide](docs/jev/integration.md). Set `TYPESAFE_API_KEY` only in your local server environment. Do not put a key in the page, a project field or a download. The setup guide provides hidden input and an optional ignored local file.

The server listens only on `127.0.0.1`. This is a local beta server, with no user accounts or public spending controls. Do not publish or tunnel it with an owner's key. A static deployment can serve the manual workspace, but it cannot run the local Node suggestion API. Public assisted hosting needs a separate access and usage design.

Choose a starting point or deliberately browse a fictional example. Download before closing or reloading, session changes are not automatically saved.

Follow the [quick start](docs/quick-start.md) to choose a starting point, adapt the workflow, inspect files and download.

## Prepare a static beta

Build the documentation, then create a separate public bundle:

```text
node tools/build-docs-guide.mjs
node tools/build-static.mjs
```

The second command prints a new `dist/public-<suffix>/` directory. Publish only that directory's contents. The explicit asset list excludes the local server, credentials, tests and private research. The build checks common credential patterns and exact occurrences of `TYPESAFE_API_KEY` when that value is set in the build process environment. These checks cannot identify every possible secret. Review the files before publishing. It keeps earlier bundles unchanged.

A static host provides manual editing, the Knowledge map and downloads. It has no JEV endpoint. To use suggestions, run the local app with your own key using the [setup guide](docs/jev/integration.md). Sharing the beta does not include an owner's credential or hosted inference service. Building the bundle does not publish it.

## Read the guides

The [documentation home](docs/index.html) brings the workspace guides, project references and JEV pilot together. Help links open the rendered reader, with search, section navigation, light and dark themes, tables and expandable JEV diagrams. The Markdown files remain the authored sources and are explicitly available as downloads.

Open `docs/index.html` directly for offline reading, or use `/docs/` on the local server. The existing `/docs/jev/` guide keeps its original page routes and links back to all guides. Reading documentation does not save or change a workspace project.

After editing documentation Markdown, rebuild both bundled readers:

```text
node tools/build-docs-guide.mjs
```

## JEV decision pilot

Read the [JEV guide](docs/jev/index.html) for its intended role, local API usage, audited measurements, optimization history and a facilitated trial with 2 or 3 people. The guide opens directly as an offline page or at `/docs/jev/` on the local server, with light and dark themes and expandable diagrams.

The start screen now uses JEV through the local Node server. Describe work, select Suggest my workflow, review the proposal and Create this draft. Confirm wording for any answers that need recording. Template roles and skills remain editable defaults. The compiler creates the files from the accepted configuration. Read [integrated usage](docs/jev/integration.md).

The historical v7 local synthetic run matched 97 of 100 complete expected decision outcomes, with primary p95 of 693 ms. The repeated answered question gate failed on two cases. These are not measurements of the new integrated UI or general human reliability. The [measurement definitions](docs/jev/metrics.md) preserve their denominators and failures. The integrated contract freezes v8 and its catalog definitions separately.

The [integrated test guide](docs/index.html#jev-integrated-trial) checks the suggestion journey, confirmed answers, export/reopen and manual recovery. Freeze a new, named round and verify before and after each session. Keep earlier manifests unchanged. A prepared guide contains no completed human results.

The historical [identical test guide](docs/index.html#jev-repeatable-trial) gives non-developers 48 numbered steps across 10 cases. Its separate seven-card procedure and frozen evidence remain retained. Do not count it as execution of the new in-app journey.

The [usage guide](docs/jev/usage.md) distinguishes personal credentials from an owner operated session. The private pilot remains in the ignored `local-knowledge/` directory. The public docs contain a sanitized evidence snapshot, not raw requests or credentials.

In the owner checkout, recompute and check the evidence snapshot without calling an API:

```text
node tools/jev-docs-evidence.mjs --check
```

## Export and maintenance

Workflow blueprint omits Copilot profiles and skill folders. One focused skill includes its complete directory without agent profiles. Both retain the full recorded project configuration and their own review records, installation instructions and readable Project Atlas. The output selection belongs to the current session and its manifest records the downloaded scope. Reopening a reduced output can regenerate fuller artifacts from the retained decisions.

The complete pack includes:

| File or directory | Purpose |
| --- | --- |
| `WORKFLOW.md` | Selected processes and stages, actors, inputs, outcome routes, correction limits and expected evidence |
| `project.json` | Authoritative configuration for importing and editing again |
| `PROJECT-ATLAS.html` | Self-contained readable project views with embedded configuration for reopening |
| `PROJECT-FACTS.md` | Claims, provenance status and component context |
| `EVIDENCE.md` | Expected checks, supplied observations and model record |
| `manifest.json` | Definition versions, target, file inventory and process or step associations |
| `DECISION-REVIEW.md`, `decision-review.json` | Optional readable decision comparison and exact baseline with the supplied reason |
| `INSTALL.md`, `VALIDATION.md`, `SOURCES.md` | Placement, findings, source contributions and limits |
| `templates/` | Relevant requirement, decision, verification, evaluation and optional backend contract templates |
| `RUNTIME-DESIGN.md` | Optional backend design, control requirements and evidence links |
| `.github/skills/` | Complete skill directories with project references |
| `.github/agents/` | Selected Copilot development profiles with relevant skills |

The separate standalone control in Roles and skills exports a complete skill directory with its own manifest and validation report. Required skill references stay inside the directory. This export does not preserve the full editable project, use a selected output or project JSON for that.

Open pack accepts supported JSON, Atlas ZIP, downloaded project HTML and selected folders containing Atlas metadata. It restores recorded decisions from the project configuration. A repository without that metadata can supply facts through the supported file importer. Arbitrary source code and Markdown do not reveal the complete original workflow.

The supplied-file importer reads supported manifests or a JSON project report and shows candidates for review. It does not scan the whole repository, resolve installed versions or run commands.

A separate file snapshot supports comparison between a previous generated baseline, current edited files and the new pack. Independent local edits can be preserved. Conflicting whole-file changes require a choice. Downloading a reconciled pack does not overwrite repository files or establish that external edits pass the compiler's format checks.

## What validation establishes

Configuration complete, format checked and host exercised are separate statuses. Supplied observations and demonstrated outcome improvement are also separate claims.

The Copilot adapters check generated layout and documented fields for JetBrains, VS Code and GitHub cloud. Consumer-host discovery and task behavior have not been exercised by the factory. The use guide provides a procedure and blank exercise record, it does not establish installation or task success. JetBrains custom agents are listed as public preview in [GitHub's configuration reference](https://docs.github.com/en/copilot/reference/custom-agents-configuration).

Generated text does not provide credentials, integrations or runtime enforcement. Source locations and supplied observations are recorded without independent authentication. Exact repository commands and their results remain project facts to verify.

See the [factory guide](docs/factory-guide.md) for the authoring path and [extension contract](docs/extension-contract.md) for schema, migration and module boundaries. The [accessibility review](docs/accessibility.md) records the review baseline, inspected behavior and checks still needed. It does not claim WCAG conformance.

## Checks

For development checks, install the locked test dependency and run the suite:

```text
npm ci --ignore-scripts
npm run check:version
npm run check:docs
npm test
npx playwright install chrome
npm run test:browser
```

GitHub Actions runs version, generated documentation and unit checks on Node.js 22 and 24. Its browser job exercises controlled JEV cases, offline artifacts and the static site under the Pages path. Successful checks on `main` publish only the allowlisted static bundle to GitHub Pages. Branches, pull requests and tags are checked without publishing. The workflow uses no JEV credentials and creates no commits, tags or releases.

App versions appear on the start screen and in generated `manifest.json` files. Read [versions and releases](RELEASING.md) for explicit version updates, tags and release steps. [Changelog](CHANGELOG.md) records what each version contains. Project schema and guidance versions are independent from the app version.

With the local server running, exercise the start, edit, inspect, download and reopen journey in the [factory guide](docs/factory-guide.md). The [backlog](docs/backlog.md) records the usability questions to answer with another engineer.

Build and exercise the standalone Atlas:

```text
node tools/export-atlas.cjs
node tests/offline-atlas.cjs
```

Playwright is a development test dependency. The app itself has no runtime package dependency. The offline browser check uses an available `playwright` installation or `PLAYWRIGHT_MODULE`. Test results and screenshots go to ignored export directories.

These tests establish the behaviors they exercise. They do not execute generated packs inside Copilot or demonstrate productivity gains.

## Preserved Atlas

The Knowledge Atlas preserves its original 105 topics and adds four general topics, for 109 topics in 10 clusters and 56 source references. It includes reading, map and card views, a source library, five guided paths, themes and mobile navigation. Its original research snapshot is 2 October 2026. The 3 October review adds the primary LLM Wiki reference. The 5 October scope update adds patterns and general lifecycle guidance. Verification and evidence is the generic category for the reviewed verification practices, with Talos retained as an attributed example source.

The map uses vendored Three.js and OrbitControls, with the original notice in `atlas/vendor/THREE-LICENSE.txt`. Reading remains available without WebGL.

The full reference export is `exports/Workflow Atlas.html`. It contains offline knowledge reading and exploration. A downloaded project Atlas is a separate readable artifact containing the user's decisions and project configuration. Reopen it in the served workspace to edit.

## Product documents

| Document | Purpose |
| --- | --- |
| [Quick start](docs/quick-start.md) | Plain steps for learning, editing, downloading and reopening |
| [JEV guide](docs/jev/index.html) | Intended decision flow, API usage, measured evidence and people trial |
| [Product vision](docs/product-vision.md) | Purpose, abstraction and intended user value |
| [Requirements](docs/requirements.md) | Accepted scope and explicit acceptance checks |
| [Reference practices](docs/reference-practices.md) | Primary sources, reviewed revisions, contributions and limits |
| [Delivery backlog](docs/backlog.md) | Real-project evaluation and remaining work |
| [Atlas preservation](docs/atlas-preservation.md) | Baseline and public-example review |
| [Accessibility review](docs/accessibility.md) | Primary guidance, inspected behavior and open checks |

Spec Kit, AgentRC and APM integrations are potential future adapters. Referencing them does not provide their functionality.

## Scope and ownership

This local version exports files for review. It does not execute or schedule workflows, connect application accounts, change another repository or enforce runtime permissions.

The preserved Atlas includes an adapted reference-to-configuration feasibility case with internal identifiers omitted. New factory examples use synthetic names and values. These cases demonstrate planning, not a completed workplace implementation. This delivery does not publish a deployment.

I maintain the project. Original contributions use my repository identity. Referenced projects and vendored libraries retain required notices.

The repository license is Apache 2.0. Vendored Three.js retains its MIT notice.
