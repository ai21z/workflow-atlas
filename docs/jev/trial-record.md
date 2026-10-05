# Identical Atlas and JEV trial record

Copy this template into the local trial folder before entering results. It is blank, not evidence of a completed session. Use one copy for sim-01, one for sim-02 and one for person-03. Read the [test guide](repeatable-trial.md) for the exact actions and expectations.

## Session identity

| Field | Supplied value |
| --- | --- |
| Protocol | atlas-guided-trial-5 |
| Execution ID | |
| Actor type | Simulated scripted session or real human session |
| Perspective | |
| Date and start time | |
| Facilitator | |
| Frozen manifest location and fixture SHA256 | |
| Browser and viewport | |
| Catalog version, model and prompt version | |
| Local API output folder | |
| End time | |

## Result definitions

- **Pass.** The recorded application or pilot checks match their expected outcomes for this step.
- **Fail.** The step was performed but an expected outcome was not met.
- **Blocked.** A prerequisite or technical failure prevented a valid attempt.
- **Not run.** The step was not attempted. State why.
- **With help.** This is separate from the result. Record the assistance even when the step passed.

The guide supplies instructions and expected results. A pass establishes a guided application or pilot result. Record human understanding separately as understood, unclear or not assessed, with the person's actual words. For simulations write Not measurable, simulated actor. A passing application check does not establish human understanding, satisfaction or hesitation.

## Step record

Add a row for every numbered step in each test case. Use exact guide IDs. Keep observed wording and evidence links, including failures. A single overall tick does not replace the step record.

| Test and step | Expected outcome checked | Actual application observation | Application or pilot result | Human explanation and understanding | Help given | Evidence location |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## JEV card review

Copy API measurements from the original results, not from a guessed elapsed time. The authored target comparison is separate from the person's interpretation. For simulations, mark the person's interpretation unavailable.

| Card | Authored comparison | Original intent | Original next question | Original practice result | Participant agrees, disagrees or unsure | Correction and reason | Request time, attempts, tokens and estimate | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | | | | | | | | |
| F02 | | | | | | | | |
| F03 | | | | | | | | |
| B01 | | | | | | | | |
| S01 | | | | | | | | |
| U01 | | | | | | | | |
| C01 | | | | | | | | |

## Comprehension observations

The real participant answers in their own words. Do not correct the answer before recording it. In simulated sessions write Not measurable, simulated actor.

1. What does Knowledge Atlas provide?
2. What does the downloaded blueprint provide?
3. Has Atlas or JEV implemented or run the requested status filter?
4. What happens to work when this tab closes before a download?
5. Which fact was missing in F01, and why should F02 not ask for it again?
6. Did JEV choose which practice to assess, or was it designated by the card?
7. Does a source link prove a claim, or identify where it came from?
8. What should happen when reviewers disagree as in C01?

## Files and preservation

| Item | Actual filename and location | Opened or verified outcome |
| --- | --- | --- |
| Initial workflow blueprint ZIP | | |
| Initial readable Project Atlas | | |
| Updated workflow blueprint ZIP | | |
| Reopened project name, purpose, answers, owner and notes | | |
| No wiki practice selected | | |
| No agent profile or skill directory in blueprint output | | |
| Original JEV proposals retained | | |

## Defect record

Use a separate row for each defect. A failed expectation is evidence to investigate, not an invitation to change the target during this round.

| ID | Layer, UI, catalog, model, code policy or environment | Steps to reproduce | Expected | Actual | Severity and effect | Evidence | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

## Completion and interpretation

- Scripted steps completed:
- Failed steps:
- Blocked and unrun steps:
- Assistance given:
- Participant feedback, or unavailable for simulation:
- Human task time, or not measured:
- API request times and cost estimates, separate from human task time:
- Were any fixes or input changes made during the session:
- Did this case become development evidence:
- Overall result and supporting reason:
- Next action:

Report the two simulations separately from person-03. Do not combine their counts into three-human usability results. Do not calculate a population success rate or claim p95 performance from these seven cards.
