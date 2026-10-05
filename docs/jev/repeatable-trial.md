# Run the same Atlas and JEV trial

**Historical facilitator protocol.** This guide describes the separate seven-card harness, not the new in-app suggestion journey. Use [the integrated trial](integrated-trial.md) for the current interface. Historical records and frozen rounds remain unchanged.

This is a scripted acceptance and understanding test. Two simulated user perspectives and Aris will use the same fictional request, the same actions and the same seven JEV cards, in the same order. Three executions are planned, including one actual human participant. Simulated results must not be described as feedback from two people.

**Protocol:** `atlas-guided-trial-5`. This guide specifies what to do and what should happen. It does not contain observed results. Use the [trial record](trial-record.md) for observations and the [test inputs](trial-cases.json) for the exact request text and expected decisions. Freeze them with the app before the first execution. This round keeps the same seven authored card targets, 48 step IDs and v8 prompt.

Earlier rounds remain historical evidence. The two completed simulated sessions from round 2 do not count as executions of this revised interface. Rounds 3 and 4 had no guided executions. Round 4 had separate model-assisted UI reviews with open goals. Those are not real person sessions or guided Atlas and JEV results. The resulting repairs add generic feasibility and evaluation guidance in catalog 2.0.1, full approach-note reading, explicit limits on interpreting filled notes, and consistent decision-review object key ordering. AI instruction comparisons are optional when relevant to the study. No new API results or completed person session are claimed for this round.

## What we are testing

We are checking whether someone can describe a task, inspect relevant knowledge, deliberately apply a practice, understand the generated files, download their work and reopen it without losing the decisions. Separately, we check whether JEV distinguishes a feature, a bug, a study and an unclear request, asks for missing or conflicting information, and respects an explicit boundary.

The fictional business task is simple. Support staff have a list of requests. We want a filter with **Open** and **All** choices. We are designing the work needed to create that feature. We are not building a request list during this test.

The instructions give exact paths and expected results. Completion therefore shows **scripted acceptance**, not that the person could discover the path without instructions. Human explanations can reveal confusion. These three executions cannot establish representative usability, productivity gains, production reliability or a new p95 latency.

## Read this before starting

Atlas currently has three related views. **Workflow** is the editable plan. **Knowledge map** is the reference library. **Preview Atlas** is a readable presentation of the current project decisions. Reading the reference library does not change a project.

In the interface covered by this historical protocol, JEV was a separate facilitator operated pilot. The facilitator sent a frozen test card to the remote provider and opened a local report. The participant reviewed that report, then made agreed changes manually in Atlas. The current interface has a suggestion screen, so use the [integrated trial](integrated-trial.md) to test it. Replaying these steps requires the matching historical interface.

[[diagram:repeatable-trial]]

Generated instructions describe intended work. They do not implement the filter, execute an agent, install a tool, connect a repository or prove a test passed. Unknown commands and unrun checks must stay unknown or unrun. A successful JEV response does not verify the truth of its input.

| Term | Meaning in this test |
| --- | --- |
| Brief | A short description of what we want and what already exists |
| Recipe or starting workflow | A sequence of stages for a feature, bug or investigation |
| Intent | The kind of immediate work requested, such as building a feature |
| Acceptance examples | Observable examples that explain when the requested result is correct |
| Stage | One part of the planned work, such as requirements or verification |
| Responsible actor | The person, agent profile or external system planned to own a stage |
| Practice | Guidance that we may deliberately include in the project |
| Source | Original material behind guidance. A link alone does not verify a claim |
| Artifact | A generated file, such as a workflow guide or an instruction file |
| Workflow blueprint | A download for human review and handoff, without exported agent profiles or skill folders |
| ZIP | One downloaded file containing several project files |
| Coverage | JEV's judgment that a recipe question is answered, missing or conflicting |
| Frozen card | Exact test input and authored expected values that must not change during the three executions |

## Who does what

| Execution ID | Perspective | What may be recorded |
| --- | --- | --- |
| `sim-01` | Simulated junior technology user, new to agent terminology | Actual inspected interface and report outcomes, plus explicitly labelled simulated interpretation |
| `sim-02` | Simulated product reviewer, focused on scope, acceptance and handoff | Actual inspected interface and report outcomes, plus explicitly labelled simulated interpretation |
| `person-03` | Aris, the real participant | Aris's actual actions, words, requests for help and review of the results |

The two simulated perspectives do not create real people or accounts. Do not invent hesitation, satisfaction, quotes, completion times or human preferences for them. When an automated action supplies a click or input, record that method. When a step cannot be exercised, record **Blocked** or **Not run** instead of guessing its result.

The **participant** follows the numbered steps and explains what they understand. The **facilitator** prepares the page and pilot, runs the remote requests, records observations and protects the key. A participant does not need to write code or use a terminal. Aris may operate both roles, but the record must say so.

## Readiness check for the facilitator

Do this before any of the three executions. If an entry condition fails, record it and do not describe the dependent tests as passed.

1. Start the existing local Atlas server and open [the workspace](../../factory/). Check that the start page, Knowledge map and [documentation home](../) load as pages. A directory listing, raw Markdown reading page or blank workspace is a defect, not an acceptable substitute.
2. Use a separate fresh browser context for each execution. If that is unavailable, download any current work first, then use **New pack** and deliberately replace the old session. Record which method was used. A fresh context avoids accidentally using an old browser draft or another person's project.
3. Prepare one record from the [trial record](trial-record.md) for each execution ID. Keep private records under `local-knowledge/jev-pilot/person-trials/`. Record the app and catalog identifiers, protocol ID, guide version, browser, viewport, execution method and date.
4. Confirm that the local Node pilot, frozen prompt, request helper and owner operated provider access are available. Never enter an API key in Atlas, the guide, a test card, a project download, a report screenshot or a chat. Read the [usage guide](usage.md) for the owner operated route.
5. Prepare the frozen round once before running its first execution. The helper records hashes for the inputs and relevant implementation. Verify the preparation before each execution. Do not change the app, guide, cards, catalog, prompt or decision code between executions, including while waiting for Aris's session. A necessary repair starts a new frozen version and a new round. Keep the original failed records.
6. Explain that the fictional JEV card will be sent to a remote inference provider. The local report is local, but inference requires a network connection. Run the seven cards once each per execution. Do not add repetitions to obtain a preferred answer.
7. Make sure downloads can be found and reopened. Prepare a folder for that execution's downloaded ZIP, readable HTML, screenshots and record. Keep its first draft and final draft separate.

The pilot preparation and request commands are explained below in [Facilitator commands](#facilitator-commands). If Atlas is usable but provider access is unavailable, complete the Atlas cases and mark the JEV cases **Blocked**. If the app cannot preserve a downloaded project, stop the affected Atlas path and record the defect before attempting a workaround.

## How to record each step

| Status | Use it when |
| --- | --- |
| Pass | The step's application or pilot checks were performed and their expected results were observed |
| Fail | The step was performed and at least one expected result was contradicted |
| Blocked | A prerequisite or external problem prevented a meaningful attempt |
| Not run | The step has not been attempted, including later steps stopped because of a defect |

For every numbered step, record its ID, status, what actually happened and an evidence reference. A screenshot can show the page. A downloaded ZIP can show preservation. A local JEV report can show a response. An expectation copied from this guide is not an observation.

Record human understanding in a separate column. Use the person's actual words, then mark understood, unclear or not assessed. For either simulated execution use **Not measurable, simulated actor**. A passing application check does not establish that a person understood it. When a step asks for both an interface check and an explanation, keep both results visible rather than turning the missing human observation into an application failure.

Record start and finish times for the manual path and for the final update. Record each extra hint, takeover or recovery. Following a supplied step is normal scripted guidance. Extra help beyond the step must be identified. Do not silently replace a wrong answer, manually repair a damaged download or perform an action for someone and call it their success.

For a failed JEV judgment, preserve the original report and write the intended correction. Continue to the next independent card without changing the prompt. For a broken export or lost project, preserve the available evidence and stop dependent reopening or final export steps. Never close an undownloaded session merely to demonstrate that its data disappears.

## Common data, copy exactly

Use this same text in all three executions. Do not choose an example project or substitute a real workplace task.

| Field | Exact text |
| --- | --- |
| Project name | Support request status filter |
| Project outcome | Let support staff show only Open requests or all requests in the existing request list. |
| Initial context | Scope is the existing request list screen only. Reuse the existing screen. Do not create or maintain a project wiki. No repository commands or implementation results have been supplied. |
| User need | Let support staff show only Open requests or all requests in the existing request list. |
| Affected components | Only the existing request list screen changes. |
| Responsible person or team | Product reviewer |
| Full Requirements notes | Scope is the existing request list screen only. Reuse the existing screen. Do not create or maintain a project wiki. No repository commands or implementation results have been supplied. Agree the filter examples before implementation. No checks have been run. |
| Acceptance, entered only at step T09.2 | Open shows only requests marked Open. All shows every request. If there are no Open requests, show an empty list and a clear message. The filter does not change request data. |

Initially leave the acceptance field blank. Later, entering agreed acceptance examples must replace that absence. Do not also add a sentence saying acceptance is still missing. Keep both states in separate downloaded drafts.

Leave repository paths, technologies, commands, model settings and runtime design as they are. Leave the Copilot environment and source control unchosen. They are outside this trial. Actor choices are template assignments, not facts detected from a real repository. Missing project details remain expected in this deliberately incomplete blueprint. The blueprint does not require a Copilot host.

## T01, enter a clean session

**Purpose:** establish that we are testing the start page rather than an old project. **Prerequisite:** the readiness check is complete. **Expected end state:** no active project and a record for this execution.

**T01.1, open the workspace.** Open the prepared fresh workspace tab. Expect **Plan your software work.**, followed by **Choose the steps. Add your decisions. Download a guide for your team or AI assistant.**, with **Investigate an idea**, **Build a feature** and **Fix a bug**. If a different project is already visible, stop and ask the facilitator to correct the starting state. Record the actual page and a screenshot.

**T01.2, locate the help and reference entry.** Without selecting a recipe, identify **Help** and **Knowledge map** in the header. Do not open the map yet. Expect both to be visibly available from this page. Record whether you can locate them using the written instruction, and any additional help.

**T01.3, explain preservation.** Read the message **Work stays in this tab. Download to keep it.** Say in your own words what you would do before closing an edited project. Expect an explanation that you must deliberately download, then use **Open pack** to continue later. Record the participant's actual explanation. Do not mark comprehension from the facilitator's explanation alone.

## T02, describe the feature

**Purpose:** enter a clear task without inventing technical details. **Prerequisite:** T01 passed. **Expected end state:** a feature workflow containing the common name, outcome and context.

**T02.1, choose the recipe.** Select **Build a feature**. Expect the **Start with the result** dialog with three fields. This is a manual choice. JEV has not selected it. Record the dialog.

**T02.2, enter the name.** In **Give this work a name**, enter the common project name. Expect the exact text to remain visible. Record the text, not an invented save confirmation.

**T02.3, enter the result.** In **What should we achieve?**, enter the common project outcome. Expect the exact text to remain visible. Do not add acceptance examples at this point.

**T02.4, enter existing context.** In **What do you already have?**, enter the common initial context. Expect the no-wiki boundary and the absence of commands or implementation results to remain in the field. A pasted sentence does not create or verify a repository connection.

**T02.5, open the workflow.** Select **Open my workflow**. Expect the name and outcome above a **Feature delivery** workflow. The initial context belongs in the first stage's notes. Open **Requirements and evidence** to verify it, then leave that panel ready for the next case. Record the exact name, outcome and note content.

## T03, record what is known and missing

**Purpose:** separate the intended behavior from its still missing acceptance examples. **Prerequisite:** T02 passed. **Expected end state:** user need and affected screen are supplied, acceptance remains blank.

**T03.1, open the brief.** Close the stage panel if needed, select **Project details**, then **Brief**. Expect **Starting workflow** to show **Feature delivery**. The feature outcome uses the sentence you already entered, under **Uses your project outcome**. You do not need to repeat it for ordinary use. Expand **Add a more specific answer, optional** to reveal **What outcome does the user need?** for the next scripted step. Acceptance and affected scope remain separate questions. Record the selected recipe, displayed outcome and labels.

**T03.2, enter the user need.** In the revealed **What outcome does the user need?** field, enter the common user need. We deliberately supply an explicit answer here to exercise preservation and keep this round's project checkpoint comparable with the earlier rounds. This is not required repetition in normal use. Expect the exact sentence under **Your more specific answer**, with the overall project outcome still visible separately. Do not substitute a technical implementation or a completed result.

**T03.3, keep acceptance unresolved.** Inspect **How will you know it works?** Leave it blank. Expect an empty answer, rather than fabricated examples or a passed check. Record that acceptance is intentionally absent at this checkpoint. The JEV report and generated records may call this same acceptance question **How will the outcome be accepted?** The wording differs, but the answer and test target are the same.

**T03.4, enter affected scope.** In **Which components or contracts change?**, enter the common affected components sentence. Close the details panel, reopen **Project details**, then **Brief**, and check all three answers. Expect both supplied answers to remain exact and acceptance to remain blank. Record any loss or unexpected replacement.

## T04, name the reviewer and keep the boundary

**Purpose:** make responsibility explicit without implying that planned work has happened. **Prerequisite:** T03 passed. **Expected end state:** the requirements stage has the intended person and full note.

**T04.1, select requirements.** Close Project details and select **Requirements and evidence** in **Workflow**. Expect the stage editor with **Responsible actor** and **Instructions and handoff for this stage**. Select the stage title, not its separate **Guidance** button.

**T04.2, choose a person.** Set **Responsible actor** to **Person**. In **Person or team**, enter **Product reviewer**. Expect those exact values. The interface says Person, not Human. Other stages retain their template assignments for this trial.

**T04.3, enter the full note.** Replace **Instructions and handoff for this stage** with the full Requirements notes in the common data table. This field is the same first-stage note that held the initial context. Replacing it with only the final two sentences would lose the no-wiki boundary. Expect the full combined note, including **No checks have been run.**

**T04.4, inspect the distinction.** Close and reopen this stage. Expect the person and full note to remain. Say whether naming a reviewer or writing the note has actually run a test or implemented a filter. Expect the answer to be no. Record the actual explanation and the stage values.

## T05, connect a reference topic to a deliberate decision

**Purpose:** find relevant knowledge and review a practice before applying it. **Prerequisite:** T04 passed. **Expected end state:** a reviewed proposal, with no project change after cancellation.

**T05.1, open the reference library.** Select **Knowledge map** in the header. Expect the Knowledge Atlas and **Back to workspace**. The reference occupies the knowledge view. This is not Preview Atlas and does not replace the active project.

**T05.2, find the topic.** Select **Search topics** in the map toolbar. In **Search all topics**, enter **Requirements investigation**. Select the matching result, which also says **Read topic**. Expect the dialog to close and the reading view to open directly, with focus on the **Requirements investigation** heading. The sequence and **Proposed design** basis are in this reading view. The topic ID is `requirements-workflow`. The practice applied from it has a different display name. Selecting a node on the graph still explores the map, and its visible **Read topic** action opens the same guidance.

**T05.3, read the topic's meaning.** Read the guidance and explain what must be connected before implementation. Expect an explanation of desired behavior, scope, acceptance, sources and ownership. This topic currently has no direct source evidence list. Do not invent one or report that every topic is independently proven. The practice review supplies the source for the proposed selectable practice.

**T05.4, inspect the proposal and its source.** Select **Review for my workflow**. Expect a **Review this practice** dialog headed **Connect requirements to implementation**. It proposes selecting **Requirements before implementation**, shows **Affected generated files**, and explains that no tool execution or verified result is created. Open **Read the source behind this practice**. Expect the original Spec Kit material at the recorded GitHub revision. Record the link and whether it actually loaded. An unavailable external source is Blocked for source inspection, not proof that the practice was verified.

**T05.5, cancel and verify preservation.** Return to the Atlas tab. Select **Keep my workflow unchanged**, then **Back to workspace**. Open **Project details**, **Boundaries**, then **Source backed practices**. Expect **Requirements before implementation** to remain unchecked. Verify the name, outcome, brief answers, reviewer and full note are still present. Record the unchanged practice and values. Reading or cancelling must not apply a project decision.

## T06, apply, undo and restore the same practice

**Purpose:** prove that a reviewed practice changes only an explicit selection and can be reversed. **Prerequisite:** T05 completed, with the practice not selected. **Expected end state:** Requirements before implementation is selected, and supplied project values are retained.

**T06.1, apply deliberately.** Reopen **Knowledge map**, find **Requirements investigation**, select **Review for my workflow**, inspect the same proposal, then select **Apply to my workflow**. Expect the app to return to the editor with **Requirements before implementation** selected in **Boundaries**, **Source backed practices**. Do not expect Spec Kit to be installed or executed.

**T06.2, undo.** Use **Undo last change**, the curved arrow in the workspace toolbar. Expect the practice checkbox to become unchecked. Reopen **Boundaries** if needed. The original project name, outcome, brief answers, reviewer and full note must remain. Record the actual checkbox and any unrelated change.

**T06.3, redo.** Use **Redo last change**, the other curved arrow. Expect **Requirements before implementation** to become selected again. Supplied project values must remain exact. Record both the restored practice and the no-wiki boundary in the note.

**T06.4, review the boundary.** In the same practice list, inspect **Source backed project wiki**. Expect it to be unchecked. Explain why the requirements practice can apply while a maintained project wiki is excluded from this particular task. This is a recorded selection, not a runtime enforcement mechanism. Record the actual explanation.

## T07, understand what the files represent

**Purpose:** check generated text and its explanation before downloading. **Prerequisite:** T06 passed. **Expected end state:** the participant understands that the files describe a plan with unresolved details.

**T07.1, inspect the workflow file.** Close details and select **Files**. Select `WORKFLOW.md` in the file list. Use **Find a file** if needed. Expect the file preview to contain the project name, outcome, requirements owner and supplied notes. File text must not claim the fictional filter has been implemented or checked.

**T07.2, inspect the reason for the file.** Expand **Why this file?** Expect an explanation connecting the workflow file to selected stages and their handoffs. Say what this file is for in one sentence. Record the actual explanation and the displayed reason.

**T07.3, inspect the requirements scaffold.** Select `templates/REQUIREMENTS.md`. Expect the requested outcome and an unresolved acceptance table because the acceptance answer is still blank. This is an editable scaffold. When acceptance is supplied later, its exact text must appear here as well as in `WORKFLOW.md` and project decisions. Other missing fields remain unresolved. Explain why an empty acceptance answer must stay visible instead of being invented. Recording examples does not establish approval or a completed check.

**T07.4, inspect the readable view.** Select **Preview Atlas**. Expect the same project name, desired outcome and planned owners in the readable project view. Missing approach details should remain visibly unresolved. Supplied approach notes can be read in full through **Read all approach notes**. A filled field does not resolve questions inside its notes. Explain the difference between this project view and **Knowledge map**. Record the participant's words and any contradictory completion claim.

## T08, download a blueprint and reopen the real file

**Purpose:** check explicit preservation and a useful output choice. **Prerequisite:** T07 passed. **Expected end state:** the initial draft exists as actual downloaded ZIP and HTML files and the ZIP restores the project.

**T08.1, choose the intended output.** Select **Download** in the header, or **Review my download** if shown. In **Choose a useful download**, expect **Workflow blueprint** to be the suggested and selected starting output under **What would help you now?** Deliberately select or confirm that option. Template agent assignments must not make the full pack the default. Expect the blueprint choice without changes to workflow stages, owners or brief answers. The deliberately incomplete blueprint can say **Draft blueprint ready to share.** Its findings remain under **Review N open details and notes**, which you may expand to inspect. This means a draft is available for review, not that the missing acceptance or repository details have been completed. Record the suggestion, selected output and draft wording.

**T08.2, inspect the download inventory.** Expand **Included files and their purpose** and **How to use this download**. Expect `project.json`, `PROJECT-ATLAS.html`, `WORKFLOW.md` and `INSTALL.md`, plus relevant records and templates. Expect no `.github/agents/` or `.github/skills/` folders in this selected blueprint. The Files workspace and Download inventory must describe the same selected blueprint. Record the actual listed paths and the instructions' first action.

**T08.3, download both formats.** Select **Download workflow blueprint**. Confirm the ZIP actually appears in the browser's downloads or chosen folder. Then expand **Other download formats** and select **Readable Project Atlas**. Confirm an actual HTML file is present and opens as a readable project page. Record both filenames and locations. A click or success message without a retrievable file is not enough. Keep these as the initial draft.

**T08.4, open the downloaded ZIP in a fresh session.** After the files are safely retained, use a new fresh workspace context. Select **Open pack**, then **Choose a project file**, and choose the ZIP just downloaded. Do not construct replacement JSON or open a file generated by a different execution. Expect the project to restore. If a replacement dialog appears, record why this was not a fresh context, then choose **Replace project** only after preserving that session.

For an automated execution, record how the real downloaded file was supplied. Browser file chooser automation with the actual local file is a valid import check. It does not measure whether a person understands the operating system's dialog. If the automation tool cannot supply the file, record that environment block. Do not run F01 early while waiting for restoration. Recover this checkpoint first, or mark the dependent guided sequence Blocked. Independent diagnostic requests belong in a separate record.

**T08.5, verify exact preservation.** Check the restored name, outcome, user need, affected scope, blank acceptance, **Product reviewer**, full Requirements note, selected requirements practice and unselected wiki practice. Expect all to match the initial draft. Check that Files still shows **Workflow blueprint**, with no added agent profiles or skill folders. This untouched download from the same frozen generator should not produce a supplied-file conflict from object key order. Older packs from another generator version can differ and must retain their originals. Explain that reopening is reading a chosen local file, not fetching an automatically saved project. Record exact mismatches. Stop the dependent final export path if decisions were lost or silently overwritten.

## T09, review seven separate JEV cards

**Purpose:** check intent, missing information and selected practice judgments against the same authored targets. **Prerequisite:** frozen provider setup is ready. Atlas steps can be completed without it, but this case cannot pass without actual responses. **Expected end state:** seven preserved reports, an accepted feature answer manually entered in Atlas, and a result for each card.

The facilitator runs **one card at a time**. Before each request, show the participant the exact brief, existing answers and selected practice from [trial-cases.json](trial-cases.json). Only those request inputs and the selected catalog definitions go to JEV. The Atlas session is not automatically read. The expectation fields are authored test targets, not information to insert into the inference request.

For each card, preserve the returned model judgments and the code's final decision. Check the recipe, next question, coverage and practice judgment. Record what the participant agrees or disagrees with and why. Do not present an invented explanation as something the model said. If a report supplies no explanatory rationale, discuss the authored expectation separately and label it as such.

| Report value | Plain meaning |
| --- | --- |
| `feature-delivery` | Build a feature |
| `bugfix` | Investigate and repair an existing bug |
| `feasibility` | Investigate whether or how to proceed |
| `unclear` | No immediate kind of work has been chosen |
| `acceptance` | Ask how the feature will be accepted |
| `desired-outcome` | Ask what improvement would count as success |
| `none-needed` | No further question from this recipe's current small core question set is needed |
| No question, shown from a null value | The unclear path has no recipe-specific next question. It does not generate a general clarification sentence |
| `relevant` | The selected practice applies to this request under the pilot policy |
| `not-relevant` | The selected practice should not apply to this request under the pilot policy |

**T09.1, run F01, acceptance missing.** Review the exact F01 request and ask the facilitator to run it. Open the updated local report. Expect **feature-delivery**, next question **acceptance**, and **specification-first relevant**. Coverage should say user need answered, acceptance missing and affected scope answered. This matches the initial Atlas checkpoint. Record each comparison, the original response and the participant's explanation of why the acceptance question is useful.

**T09.2, supply acceptance manually in Atlas.** Return to the restored Atlas project. Open **Project details**, **Brief**, and enter the exact common acceptance sentence in **How will you know it works?** Keep the user need, affected scope and no-wiki note unchanged. Close and reopen Brief to verify the answer. Expect the exact accepted examples to remain. This is your manual edit. The JEV report did not apply it. Record the entered answer.

**T09.3, run F02, acceptance now supplied.** Review F02, which uses the same brief plus the exact acceptance answer. The facilitator runs F02 separately. Expect **feature-delivery**, **none-needed**, and **specification-first relevant**. All three feature questions should be answered. Asking acceptance again is a failure even if intent is correct. Explain that **none-needed** covers these three core questions, not all engineering requirements or readiness for production. Record the response and interpretation.

**T09.4, run F03, no wiki.** Review F03 exactly as frozen. It deliberately starts again from the card's earlier missing-acceptance input. It does not read the updated Atlas acceptance field. Expect **feature-delivery**, **acceptance**, and **evidence-wiki not-relevant**. Coverage should show the feature need and screen scope answered, acceptance missing. The explicit no-wiki boundary must defeat a generic suggestion to maintain a wiki. Record any disagreement without selecting that practice in Atlas.

**T09.5, run B01, reported bug.** Review and run the exact fictional bug card. Expect **bugfix**, **none-needed**, and **minimum-change relevant**. Expected behavior, observed behavior and affected users are answered. A root cause is still unknown, which is compatible with starting bug investigation. The described reproduction is fictional test input, not an observed failure of Atlas. Record the original decisions and whether the participant understands that distinction.

**T09.6, run S01, study first.** Review and run the exact study card. Expect **feasibility**, **desired-outcome**, and **minimum-change relevant**. Current work and decision boundary are answered, while the improvement that counts as success is missing. A study about possible software is still a study. It must not silently become a build task. Record all judgments and the participant's explanation of the missing success condition.

**T09.7, run U01, unclear priority.** Review and run the exact unclear card. Expect **unclear**, no recipe-specific next question, no selected practice judgment and no recipe coverage judgments. The pilot should not force a feature, bug or study when the card explicitly says none has priority. Do not expect an invented clarification sentence from this current code path. Record the actual response.

**T09.8, run C01, acceptance conflict.** Review and run the exact conflicting acceptance card. Expect **feature-delivery**, **acceptance**, and **specification-first relevant**. Coverage must identify acceptance as **conflicting**, while user need and affected scope are answered. JEV must not choose either reviewer or treat contradictory acceptance as complete. Record the original result and proposed human correction if it fails. Do not replace the accepted Atlas answer with this independent stress card.

**T09.9, review the seven outcomes.** Record seven card statuses, not one vague overall impression. Check that all responses and failures remain available. List any repeated answered question, missed conflict, forced intent or boundary violation. Record actual local request timings and returned usage from the reports. Do not turn seven requests into a reliable p95 claim or pool them with earlier synthetic benchmark metrics. A failed card remains failed after a human explains the correction.

## T10, keep the final artifact and explain its next use

**Purpose:** verify the manual acceptance update survives download and reopening. **Prerequisite:** T08 preservation passed and T09.2 was performed. A failed independent JEV card does not prevent this manual preservation check. **Expected end state:** a final draft with accepted examples, clearly separate from the earlier missing-acceptance draft.

**T10.1, inspect the updated decisions.** In **Brief**, check the user need, accepted examples and affected screen. In the requirements stage, check **Product reviewer** and the full Requirements note. In **Boundaries**, check Requirements before implementation is selected and Source backed project wiki remains unchecked. Expect all common values to remain. Other repository setup stays unresolved.

**T10.2, inspect the updated workflow and requirements.** In **Files**, select `WORKFLOW.md`. Expect the supplied acceptance examples in its recorded recipe answers. Then select `templates/REQUIREMENTS.md`. Under **Acceptance examples**, expect the exact common acceptance sentence, labelled as supplied in Brief and preserved as entered. The empty acceptance table must be replaced by that supplied text. The acceptance owner, evidence source and current behavior remain unresolved because we have not supplied them. Neither file may claim the examples were approved, the filter was built or checks ran. Record the exact text, the remaining unknowns and the person's explanation separately.

**T10.3, download the final blueprint.** Select **Download**, explicitly choose **Workflow blueprint**, inspect the inventory, then download the ZIP and readable HTML again. Keep these in a final draft folder or rename them after download so the initial files are not overwritten. Expect actual retrievable files with the accepted examples. Record their filenames. Draft findings about unknown repository details remain legitimate.

A neutral **Your edits update N files** notice should explain the acceptance edit. Expand it to inspect the affected paths. Expect an explanation that these updates come from decisions made in this session and the original download remains available. We keep the blueprint output selected in this test. We have not edited any files outside Atlas, and we opened a download from this same frozen version. Do not expect a supplied-file review warning for this ordinary edit. If **supplied files need review** appears, preserve the evidence and record the unexpected difference rather than dismissing it. That separate warning is for files that already differed when opened or whose origin cannot be established. Record the wording and whether the participant understands the distinction. Keep the initial download and download the current generated blueprint.

**T10.4, reopen the final ZIP.** Open a fresh workspace context and use **Open pack**, **Choose a project file**, selecting this final ZIP. Verify the acceptance examples, name, outcome, scope, note, reviewer and practice selections again. Expect the final decision state to be restored from the actual file. Record the observed result and any mismatch.

**T10.5, explain the handoff.** Read `INSTALL.md` from the selected blueprint or **How to use this download**. Explain what a reviewer should do next, what has not been performed and where to continue editing. Expect a description of reviewing the workflow and unresolved decisions, agreeing the next work, and reopening the pack when edits are needed. Do not expect Copilot installation instructions for this blueprint or a working automation. Record the participant's actual explanation and the most confusing part of the test.

## Facilitator commands

The participant does not need to run these commands. Use the repository root and the same frozen prompt and provider route for all three executions. The session environment holds the owner's TypeSafe key, as explained in [Usage](usage.md). Never put its value in a command, report or project file.

Prepare the round once, after this guide, app changes, rendered documentation and test inputs are complete, before any execution starts. Preparation records its manifest under `local-knowledge/jev-pilot/person-trials/atlas-guided-trial-5/manifest.json`. The snapshot includes the recursive Factory, Atlas and documentation files, including vendor assets and generated guide bundles, as well as the selected prompt and its local dependencies. The round 2 automation script belongs to that historical version. It is not a round 5 execution script. Do not use its old selectors, reports or results as evidence that these revised steps passed.

```text
node tools/jev-person-trial.mjs prepare
```

Before each execution, verify that the frozen source still matches. This is a local check, not an inference request.

```text
node tools/jev-person-trial.mjs verify
```

Choose the execution's actual ID, `sim-01`, `sim-02` or `person-03`. The following request examples are for the real participant. At T09.1, run only F01.

```text
node tools/jev-person-trial.mjs run person-03 --case=F01
```

After the participant completes T09.2, run F02. Continue the remaining cards one at a time at their numbered step, in this exact order.

```text
node tools/jev-person-trial.mjs run person-03 --case=F02
node tools/jev-person-trial.mjs run person-03 --case=F03
node tools/jev-person-trial.mjs run person-03 --case=B01
node tools/jev-person-trial.mjs run person-03 --case=S01
node tools/jev-person-trial.mjs run person-03 --case=U01
node tools/jev-person-trial.mjs run person-03 --case=C01
```

Each run command makes remote inference requests and retains local records. Running a case filter does not run the other six cards. Substitute `sim-01` or `sim-02` for those executions. Do not run the whole set at once and then claim that the acceptance edit occurred between F01 and F02.

Open the execution's local `results.html` report after each request. For `person-03`, its location is:

```text
local-knowledge/jev-pilot/person-trials/atlas-guided-trial-5/person-03/results.html
```

The corresponding `results.json` keeps structured records. These are private local artifacts, not pages to publish through the documentation site. Report presence is not enough to mark a card passed. Compare the actual returned judgments with the frozen target and retain every error or mismatch.

The transport permits up to three attempts, with a 15 second timeout for each attempt and bounded waits. Total time can exceed 15 seconds. The helper preserves an existing card result rather than making a replacement inference call. There is no retry command for changing a failed judgment in this round.

If preparation or a request is rejected because frozen files changed, stop that execution. Do not bypass the check or relabel old results as current. If the key, network or provider fails, keep the actual failure and mark the affected card Blocked. The helper stops that failed command. A model judgment that contradicts a target is Fail, not Blocked. Record any transport retry shown by the helper, but do not deliberately rerun a model mismatch during this frozen round.

## Review the round

Keep separate result summaries for the two simulated executions and the real participant. For each, report completed and uncompleted step IDs, card results, preservation outcomes, recorded assistance and actual observations. Any optional confidence or usefulness rating must come from the real participant, not a simulated user.

Treat lost data, unsafe key handling, silent project replacement or a wrong claim of completed work as reasons to stop the affected path. Treat a repeated answered question, missed acceptance conflict or ignored no-wiki boundary as a decision defect to investigate before integration. A correct suggestion in one run does not cancel a failure in another.

The round supports a decision about the next improvement and whether a small optional JEV proposal interface is worth trying. It does not approve automatic application, project execution, a production release or a claim that three real people tested Atlas. If any card guides a prompt or policy change, it becomes development evidence. Test the change later with new untouched cases as well as checking the recorded defect.
