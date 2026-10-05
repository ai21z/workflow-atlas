# Factory guide

Plan your software work and download the steps and decisions as files. The editor holds your project choices. Editing downloaded Markdown does not automatically update those choices.

For a first visit, follow the [quick start](quick-start.md). This guide covers project details, evidence and keeping edited packs.

## Start a project

The start screen has no active project. Describe the work and select **Suggest my workflow** if the local JEV server is configured. Review the proposal, record answers you want to keep and select **Create this draft**. [JEV setup and answer recording](jev/integration.md).

You can also choose **Investigate an idea**, **Build a feature** or **Fix a bug** yourself. An entered description stays with that manual proposal. Without a description, each opens a blank recipe with its own questions, stages and outputs. Template roles and practices are editable starting choices. Supply actual project facts or leave them unresolved.

The **Start with the result** dialog asks for a name, desired result and optional existing context. Unknowns can stay blank. Entered values stay in the current session as you type. **Open my workflow** or **I will fill this in later** returns to the editor without discarding them. Existing context becomes notes on the first enabled stage. Supplied links are not fetched or verified. The **Next useful step** bar points to a missing name, outcome or recipe answer, then offers the download review. A draft can be downloaded at any point.

**Browse examples** offers fictional worked projects. The configuration-service feasibility example uses synthetic names, paths, commands, sources and decisions. **Open pack** restores a supported download. Replacing unfinished work requires a deliberate choice, with an opportunity to download the current project.

## Find the right view

| Control | Use it to |
| --- | --- |
| Workflow | Select stages and edit owners, skills, inputs, notes and stage checks |
| Files | Inspect generated text, file reasons and affected stages or roles |
| Project details | Edit the brief, components, boundaries, sources and optional runtime design |
| Roles and skills | Inspect roles and procedures, assign them to stages and choose extra exports |
| Preview Atlas | Read a summary of current project decisions |
| Review changes | Compare decisions, add a reason, inspect guidance and review external file edits |
| Download | Review the suggested output, choose files, inspect findings and read use instructions |
| Knowledge map | Learn concepts, examples and their source basis |
| Help | Read task instructions without leaving the session |

Workflow, Files and Preview Atlas use the same project. Preview Atlas is a readable presentation, it is not a separately edited copy.

### Read the decision brief

Preview Atlas and the downloaded HTML begin with four questions. What do we want, what approach and why, who is planned to act, and what is still open. The cards use recorded values. Missing information stays visible. Approach notes come from architecture in a feature, diagnosis and repair in a bug, or options and recommendation in a study. Expand **Read all approach notes** to read every supplied note in full. Existing context is not inferred to be an approach.

The first two enabled recipe stages identify planned owners. They are not progress or completed work. The brief identifies empty intent and approach fields. A filled field does not resolve questions inside its notes, and the brief does not interpret every unresolved question in free text. Expand recorded context and technical details or the richer project views for specialist information. All views use the same configuration.

### Review decisions and guidance

**Review changes** compares the current settings with the project at the start of this session, the opened project, or a supplied comparison baseline. This is a comparison of two states, not an edit history. Expand a decision for its before and after values, related stages and associated generated file changes. File associations explain document scope, they do not prove that one decision alone caused every listed change.

**Compare with another Atlas file** accepts supported JSON, ZIP or project HTML. It keeps the current project and changes the baseline only. The optional reason remains supplied text. It is never inferred from the file changes. Decision comparison is separate from the three-way external file comparison below.

ZIP and readable HTML exports include `DECISION-REVIEW.md` and `decision-review.json` when decisions changed or a reason was recorded. The JSON review preserves exact baseline and current settings. On reopening, current settings must match the project. Atlas rebuilds derived summaries. Unsupported or malformed records remain in the opened files with a warning instead of being applied. A safe older record can restore its baseline and reason while reporting definition differences. Project JSON alone keeps settings and does not mark unsaved review notes as downloaded.

**Guidance and its limits** shows versions, recorded source review dates, references, intended environment and applicability for the selected definitions. The manifest records their actual local contents. Comparison can detect definition changes even when the overall catalog version is unchanged. A selection change is different from a definition update. An older date alone does not invalidate a practice. Older exports without a snapshot cannot establish exact historical contents.

**Review current guidance for download** shows supplied previous records, current definitions and the opened files that differ from fresh generation. Cancel leaves the project and opened files unchanged. When a comparable definition update exists, generating a replacement requires deliberately selecting current guidance. The selection is recorded in the new manifest. Original files can still be downloaded unchanged. Atlas does not fetch the linked sources, authenticate supplied metadata or claim a fresh source review during this process.

Knowledge map opens the reference Atlas at full viewport size. Use **Search topics**, enter a term in **Search all topics**, then choose a result to open its guidance directly. Selecting a graph node explores the map. **Read topic** beside the selected topic opens its reading view. Returning restores the start screen or the same editing context. Reading a topic does not add instructions to the pack. Reading, topic navigation and cards remain alternatives to the 3D map.

For a feature workflow, acceptance examples entered in **Project details**, **Brief** appear verbatim in `WORKFLOW.md` and `templates/REQUIREMENTS.md`. An empty answer leaves the requirements table unresolved. Supplied examples do not establish approval or observed results, and unprovided owners, sources and current behavior remain unresolved. The same answer is retained in the project when downloaded and reopened.

### Use reviewed guidance in the project

Five curated topic mappings connect reference guidance to existing project decisions. They cover relevant context, the smallest necessary change, requirements before implementation, source backed knowledge and validation before writes. A mapping appears only where its conditions fit the active workflow. This is not automatic translation of every topic into instructions.

Choose **Review for my workflow** to inspect the proposed changes and affected generated files. The project remains unchanged until **Apply to my workflow**. Cancel or Escape closes the review without applying it. After applying, the relevant project controls open. Undo reverses the project change.

The ordinary actions select an existing source backed practice. They preserve stage ownership, tools, skills, notes, facts and evidence. The service-contract action can enable the optional runtime draft and add its before-write control as a requirement, with no implementation or evidence link. Existing control progress and validation text remain intact. Missing runtime decisions remain unresolved. This does not implement enforcement or grant permission to write.

The **Dark mode** switch turns the dark theme on or off. The workspace and embedded Knowledge Atlas share the session preference. Theme is not a project decision or a saved browser preference.

## Describe the result and project

Edit the project name and outcome above the workflow. In **Project details**, use **Brief** for recipe questions. For a feature or investigation, the equivalent outcome question shows **Uses your project outcome** rather than asking you to repeat it. **Edit project outcome** changes the shared outcome. Expand **Add a more specific answer, optional** to supply a separate answer when needed. That explicit answer takes priority for the recipe question and stays separate when the overall outcome changes. Clearing it returns to the current project outcome. Atlas keeps the original project fields intact instead of copying text between them.

A bug's **What should happen?** remains separate. A repair goal does not establish expected behavior. Acceptance examples, affected scope, study boundaries and other questions also remain separate. Displayed reuse means text was supplied, not that it contains every detail or has been verified. `WORKFLOW.md` identifies an inherited answer as using the recorded project outcome.

**Components** holds source locations, the intended Copilot environment and source control. Blank workflows leave the host and source control unchosen. A blueprint or portable focused skill can be generated without choosing them. Agent profiles need the actual host and source control choices. Confirm skill discovery and behavior in the intended environment separately. Existing imports and fictional examples keep their supplied choices. A Copilot cloud target needs a repository on GitHub.

Changing recipes keeps project information and recorded answers, notes and bindings. It selects the new recipe's default stages. Returning to an earlier recipe does not automatically restore its earlier enabled-stage subset. Review assignments after switching.

Use **Components** for repository-relative paths, technologies, versions and actual test, lint and build commands. Include the actual execution directory. A blank investigation starts without components. Add them when repository work requires real paths or commands. Remove all components for a process study that has no repository component to describe. Reviewed Spring Boot, React and RDF/SPARQL profiles add relevant questions. Other technology labels use generic guidance. Technology selection does not discover commands or establish passing results.

The supplied-file importer reads selected `package.json`, simple `pom.xml` declarations or a JSON report containing `facts` and `components`. Review candidates before adding them. Optional component candidates do not overwrite existing components.

Package command candidates are exact script bodies. Confirm their package manager, directory and suitability. Maven inheritance, effective configuration and commands are not resolved. A report's claimed confirmation stays in notes rather than becoming independent confirmation.

Use **Boundaries** for allowed work, review requirements, constraints and relevant practices. These describe intended behavior. They do not configure host authorization or install referenced projects.

## Adapt stages, roles and skills

Select a stage in **Workflow**. Its panel is the single place to edit its enabled state, owner, skills, supplied inputs, notes and related evidence. Assign a person, a selected agent role or an external system. Name human and external owners.

**Add a role or skill** in Workflow offers drag assignment and controls for assignment without dragging. Select a palette item, then its stage. The stage panel puts responsibility and instructions first. Expand **Relevant skills** or **Stage inputs, outputs and checks** when needed. **Roles and skills** in Files opens the full library and standalone downloads. Undo and redo apply to project changes in the current session.

An existing artifact can satisfy an omitted prerequisite. Verification can use an existing proposed change without repeating implementation. Its location records an intended input, it does not prove that the file exists or is sufficient.

An agent needs capabilities suited to its work. A context-only agent can use supplied material, with another actor responsible for repository changes or observed execution. Requested tools do not grant credentials or enforce permissions.

The editor uses reviewed recipe stages and prerequisites. Their purpose, actions, outputs and check definitions come from the recipe. Assignments and project details are editable. Arbitrary nodes, edge drawing and executable graphs remain outside this version.

Assigned stages determine a profile's relevant skills. A stage-bound skill is included in the pack. Explicit extra library skills are exported without automatically attaching them to every agent.

Use **Download standalone skill** for an included skill. Keep its complete directory, including `SKILL.md` and required references. The separate export also includes its manifest and validation record. Place the skill in a discovery location supported by the intended host.

The reviewed Copilot formatting uses explicit tool lists. The [configuration reference](https://docs.github.com/en/copilot/reference/custom-agents-configuration) explains omitted and empty lists. Review the intended host's support before adoption. Selected practices do not install Ponytail, Spec Kit, Superpowers or a wiki service.

## Record sources and results

Use stage details for evidence tied to that stage. **Sources and evidence** in Project details gathers the records, project facts, provenance, model details and budget notes. Choose **Project level check** for evidence that applies to the whole project without assigning it to a stage.

Facts retain their claim, status, source, revision or date, reviewer and unresolved notes. A confirmed fact needs a source and reviewer under factory rules. Atlas does not authenticate that confirmation.

Checks separate expected results from supplied observations. Include the result or log source when available. Passed or failed assessments need a reviewer. Unrun and not-applicable checks remain explicit. A supplied tool result does not mean Atlas ran the tool.

The feasibility and evaluation guidance in catalog 2.0.1 compares relevant project options against the current approach. Record the decision, success criteria, constraints, procedure, observations and limits. A study of an ordinary software change does not require an AI instruction comparison.

Model name, version, budget and expenditure are optional project values. They do not provide a universal model ranking or demonstrated savings. When the study concerns AI instructions, optional conditions can compare the existing setup, minimal verified facts, one focused skill and the complete pack. Choose conditions that answer the actual question.

## Add an optional runtime design

In **Project details**, choose **Runtime design** and explicitly enable it when relevant. A feasibility recipe does not require a backend agent.

The development workflow describes how the team investigates and builds. Runtime design describes the finished application's behavior. Review outcome, inputs, judgment, tools, validation before writes, execution limits, duplicate requests, failures and confirmed results.

| Control status | Meaning |
| --- | --- |
| Requirement recorded | The intended control has been captured |
| Implementation linked | An implementation source location was supplied |
| Evidence recorded | A supplied observation is linked. It may report a failure |

Recording a control does not implement it. A completion statement does not confirm a write. A timeout can leave its outcome uncertain. Copilot development profiles are not the deployed backend agent.

## Inspect and download

In **Files**, read an output and **Why this file?** for its purpose, relevant stages or roles, sources and assumptions. **Preview Atlas** gives a readable summary of the project.

Choose **Download** for the short review. Findings link to relevant controls. An incomplete draft can be downloaded with unresolved information retained. Resolve definite contradictions before adopting its instructions.

A blueprint whose generated format passes the factory checks can show **Draft blueprint ready to share.** while findings remain. **Review N open details and notes** keeps those findings available for inspection without blocking a human review handoff. The validation record still reports the unresolved details. Sharing a draft does not establish technical completeness or successful execution. Errors affecting agent output remain prominent.

### Choose the useful output

The **Suggested start** is a workflow blueprint for every new recipe. It is the smallest output that keeps the plan and decision records for human review. Template agent assignments alone do not establish that someone needs exported agent profiles. This is a product default, not a model judgment or proof that the output is best for every task.

Use the output controls to override it without changing workflow stages or assignments. **One focused skill** requires an included skill, then **Choose the procedure** selects which one. The selected output kind stays in this session. Its manifest records the downloaded scope, while `project.json` keeps all project decisions.

| Output | Contents |
| --- | --- |
| Workflow blueprint | Workflow, sources, facts, evidence and relevant planning templates. No `.github` agent or skill files |
| One focused skill | One complete `.github/skills/<id>/` directory. No agent profiles |
| Full artifact pack | All selected skills, profiles and shared workflow records |

Each selected ZIP includes `project.json`, `INSTALL.md`, `VALIDATION.md`, `manifest.json` and `PROJECT-ATLAS.html`. Expand **Included files and their purpose** to inspect the actual inventory. The Files workspace, Download inventory and use guide all match the chosen output. **Change output** in Files opens the same chooser. Opening a supported pack restores its recorded output kind from the manifest, so a blueprint stays a blueprint. The whole recorded configuration is retained, allowing other outputs to be generated when deliberately selected. Reopening alone does not add agent profiles or skill folders to a blueprint.

| Status | Meaning |
| --- | --- |
| Configuration complete | Known required values and rules pass |
| Format checked | Generated files pass factory structural rules |
| Host and behavior | The factory has not established discovery, task behavior or improved outcomes |

The full ZIP contains configuration, readable Project Atlas, workflow, facts, evidence, selected skills and profiles, reports and templates. Blueprint and full outputs include `RUNTIME-DESIGN.md` and `templates/CONTRACTS.md` when optional runtime design is enabled.

Readable HTML is for offline reading and sharing. It carries the chosen output files and configuration for reopening. Editing continues in the workspace. JSON keeps settings alone. The separate **Download standalone skill** control in Roles and skills keeps one complete procedure and its resources, without the full editable project. Download a selected output or JSON to keep those project decisions.

Project edits, imported files and snapshots are not automatically written to localStorage, sessionStorage, IndexedDB or a server. Download before closing or reloading.

## Open a pack again

Use **Open pack** for supported JSON, Atlas ZIP, downloaded project HTML or a folder containing Atlas metadata. Configuration restores recorded decisions. Arbitrary repository code or Markdown cannot restore relationships never recorded.

JSON restores settings only. A complete pack or folder retains supplied file contents. External file edits stay separate from configuration until reviewed. **Download opened files** preserves the original supplied contents and remains available in Files and Download after dismissing the import notice.

Ordinary edits after reopening can show **Your edits update N files**. This identifies files that matched generation when opened and now change with decisions made in this session. The comparison uses the opened output kind. If you select a different output, its inventory determines which files the next download includes. Expand the notice to see the affected paths. The original opened files remain available.

**N supplied files need review** is different. These files already differed when opened, or their origin is unknown. Compare them before replacing content. A difference alone does not prove that someone edited the file elsewhere. Generation changes and unknown provenance can also create differences. Keep the original download while reviewing them.

New decision-review Markdown uses a consistent object key order. Reopening a newly generated untouched download with the same generator therefore does not create a conflict from key order alone. Packs produced before this change or with different guidance can still differ. Their original files remain available for review and download.

Safe relative custom paths listed in `manifest.json.files` can travel with a pack. Supported text remains available for reading and comparison. Unsupported extensions and auxiliary binary files are skipped with warnings. Imported HTML and instructions are data, not executed content.

Older drafts offer **Recover draft** and **Download original**. Recovery leaves stored originals unchanged. Supported version 1 configurations migrate in memory after structural checks. Review resulting assignments and findings. Malformed imports leave the session intact. Supported configurations with semantic issues remain editable.

## Keep edited files

Open detailed file comparison from **Download** to combine current generation with external edits.

Before editing a pack, **Save generated snapshot** retains a baseline in this session and downloads its separate JSON. It is a file-set record, not project configuration or automatically stored data.

Load **Baseline snapshot JSON** or **Baseline folder**, then **Edited pack folder** or **Edited files JSON**. Only selected files are read. Without a baseline, differences need a choice.

Comparison uses whole files. Independent edits can be retained. When existing and generated content both changed, choose existing, generated or removal explicitly. Derived `manifest.json` and `PROJECT-ATLAS.html` are rebuilt rather than selected as conflict versions.

The reviewed download includes a comparison record and accurate inventory. With `project.json` retained, its viewer uses the resolved configuration and exact resolved files. It does not use unrelated live settings.

Edited content is not revalidated. The reviewed manifest records configuration, format, host, behavior and improvement verification as false. Removing `project.json` produces a file set without a viewer or reopenable project. The browser does not overwrite repository files. Reconciled Markdown does not automatically update settings.

## Install and exercise

In Download, open **How to use this download**. The guide matches the selected output and appears in its generated `INSTALL.md`. A blueprint explains review, a named owner's next action, observed results and reopening. A skill or full pack explains review, exact placement, host discovery, a small representative task, troubleshooting and an exercise record.

Read `VALIDATION.md`, inspect the selected files and merge deliberately with existing repository instructions. Keep complete skill directories. Full-pack agent profiles reference the shared root records, so those records must remain available. A focused skill's project reference stays inside its directory.

JetBrains, VS Code and GitHub cloud have format adapters. Formatting does not establish consumer-host discovery or successful behavior. Review the [official reference](https://docs.github.com/en/copilot/reference/custom-agents-configuration) for current support. Exercise a representative case and record host, plugin, repository revision, tools, expected checks and observed results.

The generated exercise record starts with unrecorded or unrun fields. Record missing discovery and failed behavior rather than turning a format check into an installation claim. A skill may load when relevant. Its use needs observable evidence where the host makes that available, an agent's own claim is not independent proof. Compare an equivalent task with the existing approach before claiming improvement.

See [reference practices](reference-practices.md) for contributions, [extension contract](extension-contract.md) for schema and module boundaries, and [accessibility review](accessibility.md) for inspected behavior and open checks.
