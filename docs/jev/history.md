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

## Review of the answer journey, 5 October 2026

A subsequent user walkthrough found that optional answer typing could enter exported requirements even after Continue without this. It also found that covered information became a blank question after creating the draft, unsupported requests used a misleading status, and a disappearing question could lose keyboard focus.

The corrections separate pending edits from recorded answers, carry the wording review into the editor, give unsupported and unclear requests distinct explanations, and move focus to the next useful control after an answer action. A previous recorded answer survives a discarded replacement. Model assessments stay session only and are cleared when the project outcome or workflow changes.

The revised trial retains the same six fictional inputs and uses a new frozen round. The browser regressions exercise exported bytes, wording reuse and keyboard actions with controlled responses. Those checks assess application behavior. They do not add model accuracy results or human participants to the retained evidence.
