# Quick start

Workflow Atlas helps you plan and connect work. Choose the steps, add your decisions and download a guide for your team or AI assistant. Your work stays in this tab. Download before closing or reloading.

For a first try, use a small fictional task. No key is needed to choose a workflow yourself. The [local setup guide](jev/integration.md#owner-setup) explains how to start the app and optionally connect JEV.

## 1. Choose a starting point

Describe the work on the start screen and select **Suggest my workflow** when the local JEV server is configured. Review the proposed stages, answer or defer the optional question and select **Create this draft**. [Suggestion details and owner setup](jev/integration.md).

You can also choose **Investigate an idea**, **Build a feature** or **Fix a bug** yourself. An entered description stays with the manual proposal. With no description, each starts a blank workflow with relevant stages and questions. Template roles and practices are editable defaults, they are not findings about your project.

For your own process, choose **Design a connected process**. Name it and choose a sequence, review or bounded correction pattern, then **Open designer**. **A team process** supports work such as document review without requiring a repository or agent. This manual route does not call JEV. [Full process walkthrough](factory-guide.md#connect-a-process).

**Start with the result** asks for a name, the result you want and optional notes about what you already have. Leave unknowns blank or choose **I will fill this in later**. The notes belong to the first active workflow stage. A supplied link is not retrieved or verified.

An investigation starts without repository components. Compare relevant options against the current approach and agree what evidence would support a decision. AI instruction comparisons are optional and apply only when that is the study's subject. Add actual paths and commands when the work needs them.

Use **Open pack** to continue a supported download. **Browse examples** opens fictional worked examples only when you choose one.

## 2. Adapt the workflow

Give the project a name and describe the outcome. For a recipe, select a stage in **Workflow** to edit its owner, skills, inputs and notes in one panel.

For a custom process, use **Map** or **Step list** in the designer. Select a step to name its action and actor, choose inputs and results, and set checks. Under **What happens next?**, choose the destination for each outcome. Correction limits and approval are under **Inputs, checks and other records**. Unknown details can remain unresolved.

Choose **Review changes**, inspect the changed connections and files, then **Apply changes**. The project stays unchanged until you apply. Closing pending edits offers keeping or discarding them. Project Undo can reverse an applied change. Neither applying nor Undo saves the project, so download when ready.

For a feature or investigation, **Project details**, **Brief** reuses that outcome. You do not need to type it twice. **Add a more specific answer, optional** lets you record a separate refinement. Editing the overall outcome keeps that separate answer. Clear the refinement to use the current project outcome again. A bug still needs its own expected behavior, because a goal such as "fix checkout" does not describe what checkout should do.

An owner is the person, agent or system responsible for a stage. A skill is a reusable procedure. An agent profile describes a role and requested tools, it does not provide credentials or an integration.

For recipe assignments, use **Add a role or skill** in Workflow. Select the role or skill, then its stage. Dragging is optional. The stage panel also provides responsibility and skill controls. For a custom step, expand **Instructions and requested capabilities** in its designer panel. Selected development profiles receive their matching assignments, while application agents remain runtime design choices. No assignment grants tools or permissions.

Open **Project details** when you need to describe components, real commands, boundaries or sources. Leave unknown information unresolved. A technology label does not establish the repository's command or a passing result.

Blank workflows leave the Copilot environment and source control unchosen. A blueprint or portable focused skill can be generated without choosing them. Agent profiles need the actual host and source control choices. Confirm a skill's discovery and behavior in the environment where you intend to use it.

**Runtime design** is optional. Enable it when you are designing the behavior of an application. It is separate from how the team develops that application.

## 3. Learn and apply deliberately

**Knowledge map** opens the reference Atlas at full viewport size. Select a topic, read its guidance and inspect its sources. Return to the same project. Reading alone changes nothing.

Some reviewed topics offer **Review for my workflow** when the practice applies to the active project. Atlas shows the proposed decisions and affected files before you choose **Apply to my workflow**. Cancel to keep your decisions unchanged. Undo reverses an applied change.

Most actions select an existing reference practice. The service-contract action can add a runtime design draft and a validation-before-writes requirement. It creates no implementation, permission or passing evidence. Missing design decisions remain unresolved.

Use reading, topic navigation or cards if the 3D map is unavailable or difficult to use.

## 4. Choose and inspect the output

Open **Files** and select an output. Read its content and **Why this file?** to see which choices contributed to it. **Roles and skills** opens the library and standalone skill downloads.

Use **Preview Atlas** for a readable summary of the project's decisions. It reflects the same configuration as the editor.

Its **Decision brief** shows the intended outcome, supplied approach notes, planned owners and open decisions. Expand **Read all approach notes** to read the supplied notes in full. A filled field does not resolve questions written inside it. Use the edit links to record an approach or review an assignment. Expand **Recorded context and technical details** for commands and sources. Planned order does not show completed work.

With custom processes and no active recipe, the brief instead shows process purposes, their planned entry owners and model findings. Each process has its own starting point. The download preserves the recorded connections and planned evaluation cases. Those cases start as **NOT RUN**.

Use **Review changes** to compare the current decisions with the starting or opened project. Expand changes for before and after values and associated files. Add a reason when it helps the reviewer. **Compare with another Atlas file** changes the comparison baseline without replacing your project.

Expand **Guidance and its limits** for the selected sources, versions and applicability. If an opened pack records different definitions, review the differences before choosing current guidance for a new download. Older packs may not have enough metadata for an exact comparison. Original opened files stay available.

Record checks in the relevant stage. Keep the expected result separate from a supplied observation. **Sources and evidence** in Project details gathers the records for review. Atlas does not run checks or authenticate supplied sources.

Choose **Download** or **Review my download**. Every new workflow starts with a **Workflow blueprint** for people to review. Template agent assignments do not turn that into a full pack. Choose a skill or full pack when that is what the handoff needs. Changing the output does not change workflow stages or assignments.

| Output | Choose it when |
| --- | --- |
| Workflow blueprint | You need a plan and decision records for people to review. Includes relevant templates, with no Copilot profiles or skill folders |
| One focused skill | You need one procedure, such as investigating a bug, with its project references. No agent profiles |
| Full artifact pack | You need the selected skills, agent profiles and workflow records together for a larger handoff |

A focused skill covers its named procedure. Bug diagnosis helps investigate a cause, it is not the complete repair workflow. Your other workflow decisions stay in the project so you can choose a different output later.

Every selected ZIP also includes project decisions, installation guidance, validation and a readable Project Atlas. **Files** and the Download inventory show the same selected output. **Change output** opens the chooser when you need something different. Open **Included files and their purpose** to inspect the actual inventory. Reopening a supported pack restores its recorded output choice along with the project, so a blueprint stays a blueprint.

Review unresolved items and follow their links when you want to correct them. An incomplete draft can still be downloaded with its unknowns retained.

**Draft blueprint ready to share.** means the blueprint can be shared for review while details remain open. Expand **Review N open details and notes** to inspect them. This does not mean the project is technically complete or its instructions have been exercised.

Before using the files, check these five things:

| Check | What to look for |
| --- | --- |
| My intention | The outcome, scope and acceptance describe the task you actually want. In a JEV draft, only answers you recorded belong in their answer fields |
| My choices | Owners, skills, tools and practices are choices you want to keep. Template assignments are starting points |
| Missing details | Unknown commands, paths and decisions stay visibly unresolved. Fill them from your project rather than guessing |
| Real connections | An agent profile can request tools. It does not install an MCP server, supply credentials or connect an account |
| Real results | Expected checks are a plan. A supplied observation is your record. Atlas has not run the checks or independently verified their results |

## 5. Use, download and reopen

Open **Read only what you need** to preview the files for your next task. A PM can start with the plan and decision record. For one procedure, start with `SKILL.md` and read its project reference when needed. For a full pack, choose the profile and linked skills relevant to your task.

Open **How to use this download** for the adoption steps. A blueprint explains the human handoff. Skills and packs explain file placement, host discovery, a small task, troubleshooting and recording the exercise. The reading routes and adoption steps travel in `INSTALL.md`.

Atlas has not exercised the files inside Copilot. Format checks do not establish discovery, successful task behavior or better outcomes. Check those in the actual environment and record what happened.

| Download | Use it for |
| --- | --- |
| Selected output ZIP | Keep the chosen blueprint, skill or pack, together with project data for reopening |
| Readable Project Atlas | Read or share a self-contained HTML containing decisions and the selected output files |
| Editable project JSON | Keep recorded decisions in a small file |
| Standalone skill from Roles and skills | Take one complete skill directory and its required resources. This separate export does not keep the full editable project |
| Download opened files | Keep the original supplied contents of an opened pack, including external edits |

Changed decisions or a supplied reason add `DECISION-REVIEW.md` and `decision-review.json` to ZIP and readable Atlas downloads. These keep the exact comparison baseline and reason for reopening. Project JSON keeps settings only. **Download review Markdown** is a readable review, it cannot restore an editable project on its own.

Use **Open pack** to select project JSON, an Atlas ZIP, downloaded project HTML or a folder containing Atlas metadata. JSON restores settings. A supported pack or folder also keeps supplied file contents for review.

A repository without Atlas metadata cannot restore decisions that were never recorded. Use supported selected files as fact candidates instead.

If files were edited outside Atlas, review their differences before generating replacements. Editing exported Markdown does not update project configuration automatically. The [factory guide](factory-guide.md#keep-edited-files) explains file comparison.

After reopening a pack, ordinary project edits can show **Your edits update N files**. These are files that already matched the generator when opened and now change with your decisions. Files that already differed when opened, or whose origin cannot be established, have a separate review notice. Neither notice overwrites the original opened files.

New downloads keep decision-review object keys in a consistent order, so reopening an untouched download from the same generator does not create a conflict from key order alone. Older packs can still differ after generator or guidance changes. Review those differences and keep the original files.

## Learn without losing your place

**Help** explains common tasks without replacing your project. The **Dark mode** switch turns the dark theme on or off. The workspace and embedded reference Atlas share the change in this session.

An older browser draft is recovered only after choosing **Recover draft**. Its original stored content remains unchanged.

For more detail, read the [factory guide](factory-guide.md). The [accessibility review](accessibility.md) records inspected behavior and checks still needed.
