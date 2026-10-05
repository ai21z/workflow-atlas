# Where JEV fits

**Local in-app pilot.** The start screen sends an explicit request through the local Node server. The app validates JEV choices, shows a proposal and creates a project only after your review. [Use it and understand answer recording](integration.md).

[[diagram:decision-flow]]

## Give each part one responsibility

| Part | Responsibility |
| --- | --- |
| User brief and supplied answers | Express the task, boundaries and known facts |
| Reviewed catalog | Define recipes, question priorities, practice meaning and source references |
| JEV | Assess intention, coverage and evidence using declared choices |
| Response validation | Check the model, IDs, values, distributions and usage shape |
| Code policy | Choose the next unresolved question and combine practice judgments |
| User review | Accept, change or reject the proposal |
| Artifact compiler | Generate files from the accepted configuration |

Response validation checks structure. It cannot prove that an interpretation is correct. A source link records provenance, it cannot independently establish the source's truth.

## The tested decision contract

The published v7 benchmark and current v8 guided trial use one shared state containing `userBrief`, `suppliedProjectAnswers` and any separately marked source passage. Supplied answers use an empty object when none are provided. The marked source passage is optional.

It asks for intent and nine independent coverage judgments, three for each recipe. When a fixture specifies a practice, it also asks direct applicability, positive need and rejecting boundary questions. That means ten Choice questions without a practice, or thirteen with one. Each fixture evaluates at most one designated practice.

The intent choices are `feasibility`, `bugfix`, `feature-delivery`, `unclear` and `outside-supported-recipes`. Coverage choices are `answered`, `missing` and `conflicting`.

Code uses the selected supported recipe's three coverage answers. It selects the first unresolved question in catalog order. If all three are answered, it returns `none-needed`. If the intent is unclear or unsupported, it has no recipe clarification to select.

## Practice selection is a combined policy

[[diagram:practice-policy]]

The raw three-class applicability answer is retained for comparison. The final inclusion policy uses two other JEV answers:

1. If the user boundary is assessed as rejected, return `not-relevant`.
2. Otherwise, if the specific need is assessed as established, return `relevant`.
3. Otherwise, return `insufficient-context`.

This is **model plus code**, not model-only accuracy. The boundary assessment can still be wrong, code does not independently prove that the user rejected something. Silence about a practice is not an explicit refusal.

The current guided trial uses v8 for a narrower repair. Its requirements practice question asks whether the immediate request includes building, repairing or planning a concrete software change. Missing acceptance examples do not remove that need. Coverage still records those examples as missing or conflicting, and an explicit refusal still takes precedence. Other practice questions, intent, coverage and decision ordering are inherited unchanged. This revision does not inherit the measured accuracy or latency of the earlier v7 benchmark.

## Keep confidence and correctness separate

TypeSafe defines Choice confidence as a statistic of the returned probability distribution. [Confidence reference](https://docs.typesafe.ai/confidence).

The pilot derives next-question confidence from the selected coverage slot, or the minimum of the recipe's slots for `none-needed`. Combined practice confidence uses the boundary judgment for rejection, otherwise the minimum of need and boundary confidence. These derived values are not empirically calibrated probabilities that the complete proposal is correct.

In the final pilot, an already answered acceptance question was requested again with reported confidence 0.90. A confidence of 0.90 did not prevent this error. No correctness threshold was calibrated for Atlas, and no confidence threshold removes cases from the current accuracy denominator.

Any future automatic action needs its own evaluation and control boundary. The initial product proposal remains reviewable, even when model confidence is high.

## Make knowledge useful without sending everything

Keep reviewed definitions versioned. Send the user context and the definitions required by the tested question contract. Record catalog and prompt versions with results. TypeSafe's [Choice guidance](https://docs.typesafe.ai/primitives/choice) supports independent questions evaluated against shared state.

The pilot did not retrieve the entire Knowledge Atlas, browse sources, recommend a technology stack or assess every catalog practice. Expanding the catalog is a new evaluation problem. A larger context is not automatically a better decision.

## Preserve user control

The integration preserves explicit choices and lets you continue manually when inference fails. Explanations use reviewed catalog guidance, not invented model reasoning. Coverage assessments remain separate from the wording you explicitly record in an answer field.

Project saving remains explicit download and upload. The application returns safe timing and usage metadata without saving raw requests or responses. Accounts, tool execution and cloud storage remain outside the local pilot.
