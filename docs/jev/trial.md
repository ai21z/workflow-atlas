# A trial with 2 or 3 people

**Historical facilitator protocol.** The protocol below describes the earlier separate-harness approach and needs its matching frozen build. The [integrated trial](integrated-trial.md) also preserves an earlier interface protocol. Neither is a ready-to-run test of the current three-view workspace. Use the [quick start](../quick-start.md) and [JEV integration guide](integration.md) for current usage. A current human trial needs an updated protocol and a new frozen round.

**Proposed protocol, no participant results yet.** Use the trial to discover whether people understand and benefit from the suggestions. Two or three people can expose usability failures, they cannot establish population accuracy or productivity gains.

The earlier fixed round follows [Run the same Atlas and JEV trial](repeatable-trial.md). It uses identical inputs and step order in two simulated executions and one human session. Its fixed order replaced the varied tasks and rotation suggested below for that round. Simulations remain separate from human usability observations.

## Choose different perspectives

Invite a person with limited agent tooling experience, a developer and, if available, a product or architecture perspective. These are useful perspectives, not a representative sample. Ask each person to bring a small real task whose context they may share, or use a fictional equivalent.

[[diagram:trial-flow]]

## Prepare before the session

1. Record the app state, catalog version, model and prompt version. Keep the selected version frozen during a round. The current identical trial names its version in [the frozen inputs](trial-cases.json), while earlier v7 benchmark evidence remains historical.
2. Choose the key route in [Usage](usage.md). The owner can facilitate with the existing local harness without distributing a credential.
3. Show exactly which brief, answers and selected practice will be sent. Agree on local retention of the trial notes and raw request records.
4. Prepare a manual task and a separate comparable suggestion task. Rotate their order between people. Record their differences rather than assuming equal difficulty.
5. Keep [the session record](session-record.md) ready. Use participant IDs rather than names in shared results.

## Task A, understand and use Atlas

Ask the person to choose a starting workflow, describe the intended result and decide what download they need. Let them find the Knowledge map and inspect a practice. Ask them to download their pack and reopen it.

Observe without explaining every control. Record where they pause, ask for help, choose the wrong output or cannot find the graph. If assistance is required, record it. Do not count a facilitator-completed step as unaided success.

With the matching historical build, this task evaluates that Atlas interface. It does not measure the current three-view workspace or the integrated JEV interface.

## Task B, review a separate JEV proposal

Before inference, ask the person which immediate activity they mean and which core information is answered, missing or disputed. Keep these notes separate from the API request.

Run the agreed brief through the frozen local pilot. Show the proposed recipe, next question and one assessed practice in ordinary wording. Explain the code rule, without presenting an invented model rationale.

Ask whether the proposal matches their intention. Can they explain why the next question helps? Did it ask something they already supplied? Is a suggested practice useful? Can they correct it and continue manually in Atlas?

Do not quietly fix a model mistake before showing it. Preserve the original response and the correction. For ambiguous expectations, record both interpretations and the adjudication reason rather than forcing a false gold label.

## Record only measurements with a clear meaning

| Measurement | How to record it | What it tells us |
| --- | --- | --- |
| Task completion | Completed unaided, completed with help, or not completed | Whether the current path is usable |
| Time to first useful pack | Start and finish events, elapsed time, assistance | Friction on this specific task |
| Intent agreement | Participant target, model proposal, acceptance or correction | Whether the proposal matches this person's request |
| Question burden | Helpful, redundant, missed gap, or unclear | Whether clarification improves the experience |
| Practice usefulness | Useful, unnecessary, unknown, or explicitly rejected | Whether inclusion supports the task |
| Corrections | Original value, corrected value and reason | What the model or policy missed |
| Pack comprehension | Person explains the output, placement and next action | Whether the artifact is usable to a human |
| Download and reopen | Actual outcome with assistance recorded | Whether the explicit preservation path works |
| Request metrics | HTTP outcome, attempts, returned model, input tokens, elapsed time | Operational evidence for that request |

The existing harness measures API usage and local decision timing. Human completion, usefulness and corrections are manually recorded. Future app telemetry is not implemented. Do not pool assisted manual sessions with synthetic benchmark accuracy.

## Decide what to change

Immediately fix any credential exposure, silent overwrite or inability to recover a downloaded project. Pause expansion when people cannot understand a proposal or reliably correct it. Investigate every repeated question and missed conflict, including high-confidence ones.

After all sessions, report counts with examples, such as two of three people needed help finding the map. Do not translate them into a global success rate. A matched task comparison is exploratory because task difficulty, order and learning can differ.

Separate UI issues, question definitions, prompt judgments and code policy issues. Change one layer at a time. Keep the original records. If a participant case guides tuning, it becomes development evidence and cannot later be claimed as untouched validation.

The decision after this round is whether the proposal is understandable and worth integrating as an optional preview. Automatic application of suggestions requires separate evidence.
