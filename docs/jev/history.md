# How the experiment evolved

The question was whether a fast decision model could interpret a brief and select useful initial workflow guidance at low model cost. We tested the existing three recipes and three practices, rather than starting with arbitrary generation or execution.

## Start with a bounded decision

The original 3 October pilot separated intent and clarification across up to two API calls. On its 40-case synthetic holdout, intent matched 37 / 40, clarification matched 24 / 33 and practice classification matched 18 / 25. It did not pass its automatic draft gates.

Those results revealed three usability problems: mixing activity intent with requirement completeness, repeating supplied information and overlooking unresolved context. We kept the failures and revised the question contract.

## Test atomic judgments in one request

The optimization moved independent questions into one request against shared state. JEV assesses the pieces, code combines them. This avoids a second round trip for clarification while preserving raw judgments for inspection.

| Prompt | Evaluation use | Distinct cases | Complete expected outcomes | Primary p95 |
| --- | --- | --- | --- | --- |
| v3 detailed batch | Exposed development | 60 | 60 / 60 | 503 ms |
| v4 compact batch | Same exposed development | 60 | 48 / 60 | 425 ms |
| v3 detailed batch | Fresh initially, later development | 60 | 56 / 60 | 368 ms |
| v5 isolated slots and scope | Exposed development | 120 | 118 / 120 | 486 ms |
| v6 explicit gaps and scope | Same exposed development | 120 | 119 / 120 | 433 ms |
| v6 explicit gaps and scope | Fresh initially, later development | 80 | 71 / 80 | 592 ms |
| v7 positive evidence and boundaries | Exposed development | 200 | 198 / 200 | 541 ms |
| v7 frozen final version | Last fresh stopping set | 100 | 97 / 100 | 693 ms |

Each row has its own sample and request mix. Reused cases overlap, adding the case counts does not give an independent dataset size.

## Why the changes mattered

The compact v4 request saved roughly one third of input tokens on its paired development set, but next-question correctness fell from 38 / 38 to 26 / 38. We rejected it. Lower cost without a useful question was the wrong optimization.

V5 isolated gaps and conflicts to the specific coverage slot. V6 made explicit unknown information take precedence over inferred completeness. V7 separated positive practice need from a rejecting boundary and combined those judgments in code.

We retained the direct practice applicability question for comparison. A policy improvement is not proof that the raw model classification improved by the same amount.

## Keep the evaluation boundary honest

The fresh 60-case and 80-case sets exposed new failures. After inspection and tuning, they became development data. They are not independent validation of v7.

The final 100-case set and stopping rule were frozen before final inference. No further tuning used that set in this optimization session. The repeated answered question gate still failed on two cases. That result is retained rather than replaced by a more flattering development score.

The eight optimization runs made 1,418 API requests and reported 6,000,835 input tokens. At the recorded price, their total estimate is $0.25203507. Earlier pilot calls are outside that total. [Full measurement definitions](metrics.md).

## What we do next and why

The synthetic experiment supports trying an optional decision preview with people. It does not justify making JEV an unquestioned authority. The next round measures understanding, corrections, question burden and pack use, with the existing manual Atlas path as a fallback.

Keep improvements separated into catalog wording, prompt questions, code policy and interface presentation. A new model version, provider route or broader task needs another evaluation. [People trial](trial.md).

## Local interface integration, 5 October 2026

The start screen now connects to a small local Node server. The public decision module freezes the v8 model questions, priorities and definition digest. An owner-checkout parity check compared 66 complete requests, including reversed option order, with the retained private implementation. The public app has no runtime imports from the private harness.

The interface separates model coverage from recorded answer wording. People can confirm or shorten their own text, defer questions and create an editable draft. A later practice disagreement keeps the earlier selection visible with a removal control. Manual choices take priority and late responses cannot overwrite new work.

The local server uses a fixed provider endpoint, runtime response checks, bounded requests, a shared deadline and safe failures. It serves public application assets while denying private folders. Project and prompt content are not automatically saved by the application.

The implementation checks and bounded synthetic live smoke are functional evidence. They do not extend the earlier accuracy denominator, establish a new p95 or count as human feedback. The first live smoke exposed a browser checkbox focus error and a test helper input error. Both were corrected, their original records retained, and the feature download and reopen path was checked again. The model prompt was not tuned during this integration.

The [integrated trial](integrated-trial.md) is a new protocol. Freeze it after the interface is stable, then keep each human or simulated execution separate. Earlier seven-card rounds stay historical.

## Minimum change definition revision, 12 October 2026

Version `pilot-v9-minimum-change-concrete-work` changes only Smallest necessary change. Its separately versioned questions clarify that a concrete software feature, fault investigation, repair, change plan or software construction study establishes need without requiring the user to mention reuse. The criteria classify pure reading, translation or reporting as outside its scope. The policy gives explicit practice refusals priority, but the model can still misinterpret them. Dependency and technology constraints remain compatible with the practice.

Shared intent and coverage questions, Requirements before implementation, Source backed project wiki and decision ordering retain their v8 definitions. The original v8 module and historical response fixtures remain intact. Tests compare unchanged request text and criterion order and verify the new complete definition digest. These checks do not establish v9 model accuracy. New measurements need fresh cases frozen before inference, with the version recorded.

## Review of the answer journey, 5 October 2026

A subsequent user walkthrough found that optional answer typing could enter exported requirements even after Continue without this. It also found that covered information became a blank question after creating the draft, unsupported requests used a misleading status, and a disappearing question could lose keyboard focus.

The corrections separate pending edits from recorded answers, carry the wording review into the editor, give unsupported and unclear requests distinct explanations, and move focus to the next useful control after an answer action. A previous recorded answer survives a discarded replacement. Model assessments stay session only and are cleared when the project outcome or workflow changes.

The revised trial retains the same six fictional inputs and uses a new frozen round. The browser regressions exercise exported bytes, wording reuse and keyboard actions with controlled responses. Those checks assess application behavior. They do not add model accuracy results or human participants to the retained evidence.


## Local clarification review, 12 October 2026

A separate local retrieval change added whole sentence confirmations for supported conditional requirements, dated history and explicit knowledge-only scope. It did not change JEV questions or send those clarifications to the provider.

On the previously exposed cases, seven targeted missed recommendations were recovered after scripted user answers. The count rose from 21 to 28 of 32 eligible relevant practices. The four remaining recommendations were still withheld for explicit inference restrictions or unclear storage scope. This is development regression evidence.

A new 24-case synthetic set was authored before the implementation was frozen. One ambiguity case was reported separately. In the 23 main cases, surfaced relevant practices rose from 3 to 10 of 39 after scripted clarification. Automatic retrieval found none on this deliberately condition-heavy set. No labeled irrelevant or insufficient-context practices were offered. Unfamiliar history and scope wording, until/unless conditions and maintained-reference requests still exposed substantial coverage gaps. These results are not human comprehension or JEV accuracy measurements.

The same fresh run found an inappropriate generic clarification for a universal retention restriction. A subsequent guard-only correction blocks retention wording from that shortcut. The original frozen result remains the fresh measurement. Checks after that correction are regression checks, not a new holdout.

Browser journeys separately checked actual downloads, legacy clarification records, source edits and reopening. A live functional assessment confirmed the unchanged original-input transport. Neither establishes a latency percentile or general reliability. The next improvement needs broader task understanding without relaxing genuine restrictions, followed by another fresh evaluation and human use.

## Structured clarification and knowledge needs, 13 October 2026

Brief now offers an optional Refine matching section. It separates the kind of work from the need for an ongoing source backed reference. Software work can need both. A one-time output or an undecided knowledge need withholds the wiki suggestion. Supported unless and until requirements, and selected past-version statements, can be confirmed as complete original statements. Old confirmations keep their interpretation policy until explicitly reviewed.

A new 24-case fictional set was sealed before the implementation was frozen and labels were reviewed before outcomes. It includes 12 ordinary and 12 stress cases. One current-instruction conflict remains sensitivity only. The 23 main cases contain 35 relevant, stage-eligible practice labels across the three supported practices. This is an authored sample, not a population accuracy estimate.

| Condition | Before | First frozen change | After restriction correction |
| --- | --- | --- | --- |
| Automatic suggestions | 4 / 35 | 5 / 35 | 3 / 35 |
| After visible scripted questions | 10 / 35 | 14 / 35 | 12 / 35 |
| After optional scripted refinements | 10 / 35 | 18 / 35 | 15 / 35 |
| Assessment offered despite an explicit inference prohibition | 1 / 2 cases | 1 / 2 cases | 0 / 2 cases |

The first frozen run exposed a preexisting miss for a negative subject, such as “Nothing in this description may be sent to an external model service.” The practice panel still offered an assessment. No provider request ran. A subsequent restriction correction preserves the whole statement and prevents generic clarification from dismissing it. The original results remain retained. The final column is a regression on the now exposed cases, not another fresh result. Useful suggestions withheld by restrictions remain in the denominator.

No labeled irrelevant, insufficient-context or stage-ineligible practice was offered in these runs. That does not establish general safety. That tested version still missed 20 of 35 useful eligible suggestions after scripted answers. Thirteen main cases stopped for wording that the application could not clarify through its offered controls. Optional refinements require additional user input, and their discoverability has not been established with people.

All 144 per-phase project JSON round trips in each run preserved original intent and the existing request drafts. Separate browser journeys checked actual downloads, file chooser reopening, legacy records, keyboard behavior and narrow layouts. These are functional checks, not human comprehension or live model measurements. The JEV contract, questions and provider payload remain unchanged. Local guards in the practice panel are not a general transport permission system. The next design question is how to represent ambiguous task and requirement scope more clearly without treating a restriction as harmless background.
