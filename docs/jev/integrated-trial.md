# Test the integrated suggestion journey

**Protocol: atlas-integrated-trial-1.** This is a new guide for the in-app JEV integration. It does not replace the historical seven-card facilitator trial. No completed human session is claimed by this guide.

An owner, two simulated perspectives and one actual participant can follow the same actions. Record each execution separately. A simulation is not feedback from another person. This is scripted acceptance and understanding, not a representative usability study.

## Before the session

The facilitator starts the Node server with a working environment key. Open the workspace at its displayed address. Use a fresh browser tab for each execution. Do not use a real workplace request for this scripted trial.

After the implementation is stable, the facilitator freezes the code and inputs in a new round. The beta refinement uses round-3:

```text
node tools/jev-integration-trial.mjs freeze --round round-3
node tools/jev-integration-trial.mjs verify --round round-3
```

Both commands work without inference or a key. Freeze records file hashes, this guide and the fixed inputs in an ignored owner-local folder. Verify must pass before a session and after it. A changed file requires a deliberately new round, not editing the old manifest.

This guide includes answer confirmation and keyboard recovery checks. Keep round-1 and round-2 intact. A later change needs another unused round name in both commands. A prepared or frozen round is not a completed test.

Use the exact same six shared strings below. The round manifest distinguishes the revised interface and steps without changing the protocol identifier.

Record the participant ID, whether human or simulated, date, actual entry URL and frozen manifest. Explain that suggestions send the displayed fictional description to TypeSafe. The key stays with the server owner. Do not photograph or record credentials.

For each step record Pass, Fail, Blocked or Not run, the actual observation, corrections and a screenshot or downloaded file when useful. Keep intended results separate from observations. Do not retry a wrong interpretation until it matches the expectation and then report only the last answer.

## Shared text

Use these exact strings when instructed. They are fictional.

**Feature description:** Add an Open and All filter to the support request list. Scope is the list view and its existing API query. We have not agreed acceptance examples yet.

**Accepted example:** Given Open is selected, the list shows only open requests. Given All is selected, it shows open and closed requests. When there are no matches, it shows an empty state without an error.

**Covered description:** Add an Open and All filter to the support request list. Scope is the list view and its existing API query. Given Open is selected, only open requests appear. Given All is selected, open and closed requests appear. No matches shows an empty state without an error.

**Investigation:** Investigate whether our engineer-run reference-to-configuration process should become a backend API. Today an engineer runs local instructions and reviews the configuration manually. Compare feasibility, effort and operating cost before choosing implementation. We need a go or no-go recommendation.

**Repair:** Repair the support request list. It currently loses the selected Open filter after reload. Approved expected behavior is that the selected filter survives reload. Scope is the list view and the existing filter query.

**Unsupported:** Plan a birthday picnic and choose a cake.

## A. From an incomplete feature to a kept project

| Step | Do this | Expect this |
| --- | --- | --- |
| A01 | Open a fresh workspace tab. Read the first two lines. Explain what you expect to receive after Download | A workflow and starting files. No claim that the software is already built. Record the person's actual words |
| A02 | Paste Feature description in What do you want to achieve?. Open What gets sent? | The exact description is visible. Files and credentials are excluded. No suggestion has been requested by typing |
| A03 | Select Suggest my workflow once | A loading message and Cancel suggestion appear. No duplicate submission. The description remains visible |
| A04 | Read the result | A Build a feature draft with known template stages. Acceptance is an optional question. Record any wrong intent or unnecessary question as a defect |
| A05 | Enter Accepted example in the optional answer field. Select Record this answer | The wording is recorded. The same unchanged acceptance question stops repeating. No claim of verified correctness |
| A06 | Open Name and recorded answers. Enter Support filter plan as the project name | The name and accepted wording are visible. Other missing facts remain open |
| A07 | Open Check one practice, optional. Choose Requirements before implementation, then Check this practice | A new explicit request checks that practice. Expected composed result is suggested for this concrete software change. Preserve an actual disagreement as a failure |
| A08 | Select the checkbox to add the suggested practice | Guidance is included only after the checkbox. Nothing is installed or executed |
| A09 | Select Create this draft | Workflow opens with the description, name and accepted wording. Changes not downloaded is visible |
| A10 | Select New pack before downloading, then Keep this session | A replacement warning protects the draft. Choosing Keep preserves it |
| A11 | Open Knowledge map. Use Topics, then Search all topics to find requirements. Select a result and its reading action if the topic has not opened for reading. Return to the editor | The reference library is readable. Returning preserves the project. Reading changes no choices |
| A12 | Open Files. Find WORKFLOW.md and templates/REQUIREMENTS.md | Both include the recorded acceptance where appropriate. Unknown commands remain unknown. No test is reported as passed |
| A13 | Select Download. Keep Workflow blueprint and inspect Included files and their purpose | Actual blueprint files are listed. No Copilot profiles or skill directories are promised for this output |
| A14 | Download the ZIP. Keep the actual file. Open it with Open pack and the file chooser | Project name, accepted wording, practice and workflow remain. Output stays blueprint. Reopening triggers no inference |
| A15 | Explain how to continue tomorrow and what still needs tuning | Open the downloaded pack, edit decisions and adapt actual technology, commands and host. Record actual words and omissions, not a guessed comprehension score |

If the native file chooser is blocked by the test environment, record Blocked and the exact recovery. A programmatic upload or importer check can establish byte import behavior but does not establish that the native chooser was exercised.

## B. Covered information is not silently extracted

Start a fresh tab so the preceding project is not replaced.

| Step | Do this | Expect this |
| --- | --- | --- |
| B01 | Paste Covered description and request a suggestion | Feature workflow. If acceptance is judged answered, Review answer exposes that assessment. If JEV instead asks acceptance, retain the discrepancy |
| B02 | Create the draft without confirming acceptance wording. Inspect templates/REQUIREMENTS.md | Acceptance remains unresolved. A model label did not silently populate the field |
| B03 | Find the next useful step in the editor. Select Review wording for acceptance | Project details opens with the original Covered description in an editable field. Reuse does not require typing the description again |
| B04 | Replace the review text with Accepted example. Visit Files, then return using Review wording | Your pending edit is retained in the review. The requirements still show acceptance as unresolved |
| B05 | Select Use this answer. Inspect templates/REQUIREMENTS.md and download the blueprint | The confirmed Accepted example is recorded and appears in the file. Confirmation did not make another model request |
| B06 | In another fresh tab, repeat Covered description. Before creating the draft, open Review answer for acceptance and confirm Accepted example | The same explicit confirmation works before creation. Both routes produce the same recorded answer |

## C. Manual correction, deferral and preservation

| Step | Do this | Expect this |
| --- | --- | --- |
| C01 | In a fresh tab request a suggestion for Feature description. Type Accepted example in the acceptance field, but do not select Record this answer. Use Tab to focus Continue without this, then press Enter | The pending text is discarded. The field stays unresolved and stops interrupting the current context. Focus moves to the next question, the next wording review or Create this draft. It does not fall back to the page body |
| C02 | Create this draft. Inspect templates/REQUIREMENTS.md and download the blueprint | The editor does not immediately repeat the deferred acceptance question. The downloaded requirement stays unresolved and does not contain Accepted example. The field remains available in Project details |
| C03 | In a fresh tab enter Feature description and choose Investigate an idea yourself | A manual investigation proposal preserves the description. It is clearly Your choice |
| C04 | Open Knowledge map before creating the project, then return | The pre-project description and manual choice survive |
| C05 | Open pack, choose a supported file, then Keep this session at the warning | Undownloaded description is protected. The pending imported project does not silently replace it |
| C06 | In a fresh tab request a suggestion for Feature description. Type Accepted example, then select Create this draft without Record this answer. Inspect templates/REQUIREMENTS.md | Creating the draft did not approve pending optional answer text. Acceptance remains unresolved |
| C07 | In a fresh tab request a suggestion for Feature description. Record Accepted example, then select Review my description again. If the model asks about the same acceptance, type a replacement without recording it, then select Keep my answer | The original Accepted example survives. Pending replacement text is discarded. If the model does not ask the question again, record Not run and use the controlled functional regression for this conditional branch |
| C08 | In a fresh tab request a suggestion for Covered description and create the draft. Open Review wording for acceptance, change the text without confirming it, then select Leave unanswered | Pending text stays out of the requirements. The editor moves past the deferred question. Other available questions remain editable |
| C09 | In a fresh tab request a suggestion for Covered description and create the draft. Change the overall project outcome, then open Project details | The old model assessment and its wording review are cleared. Ordinary answer fields remain available. Changing direction does not silently confirm old wording |

## D. Other intents and request cancellation

Use a fresh tab for each row. Every Suggest action is a deliberate remote request.

| Step | Do this | Expect this |
| --- | --- | --- |
| D01 | Request a suggestion for Investigation. Create the draft. If current work is assessed as covered but unrecorded, select Review wording | Investigate an idea. The existing process can be reviewed from the exact supplied description and confirmed. A missing or incorrect coverage assessment stays recorded as a model failure |
| D02 | Request a suggestion for Repair | Fix a bug. Expected behavior is assessed separately from the project goal. Confirm exact wording if needed before exporting |
| D03 | Request a suggestion for Unsupported | A message explains that the request does not match the available workflows. It does not say you chose one. The text stays available and manual choices work |
| D04 | Request a suggestion, then immediately Cancel suggestion | Cancellation status and preserved text. A later result does not apply a project |
| D05 | Request a suggestion, then edit the description before it returns | The old result cannot overwrite the edited description. Very fast responses may make this step impractical. Record Not run and use a controlled slow-response functional test separately |

## E. Unavailable assistance and display controls

The facilitator can run a second server without a key. It must be a separate controlled process, not a change to a participant's active session.

| Step | Do this | Expect this |
| --- | --- | --- |
| E01 | Open the unconfigured server. Enter Feature description and ask for a suggestion | A concise unavailable message. The text remains, and choosing a workflow manually creates a usable draft |
| E02 | Repeat the main controls with Tab, Enter and Space. Use Escape to close dialogs. Try both themes and a narrow viewport | Controls have names, visible focus and reachable actions. Text fits the viewport. Record actual problems |

This script alone is not a full screen reader or WCAG conformance audit. Record whether a screen reader was actually used and which one.

## Interpretation

Report completion, corrections, repeated questions, time spent and actual explanations separately. Preserve wrong decisions and blocked steps. Server/provider time, browser response time and human task time measure different things. Small live smoke batches do not establish a new p95.

The downloadable files describe work to do. A successful export does not establish useful Copilot behavior, a working integration or production success. Exercise the artifacts in the intended environment as a separate evaluation.
