# Where JEV fits

**Local in-app pilot.** Brief can send an explicit request through the local Node server. The app validates JEV choices, shows a proposal and creates a project only after your review. Local practice retrieval also works without JEV. [Use it and understand answer recording](integration.md).

[[diagram:decision-flow]]

## Give each part one responsibility

| Part | Responsibility |
| --- | --- |
| User brief and supplied answers | Express the task, boundaries and known facts |
| Frozen inference definitions | Define supported recipes, questions and practice assessment meaning |
| Local catalogue retrieval | Find related reading and eligible practices, with match reasons and recorded source status |
| JEV | Assess intention, coverage and evidence using declared choices |
| Response validation | Check the model, IDs, values, distributions and usage shape |
| Code policy | Choose the next unresolved question and combine practice judgments |
| User review | Accept, change or reject the proposal |
| Artifact compiler | Generate files from the accepted configuration |

Response validation checks structure. It cannot prove that an interpretation is correct. A source link records provenance, it cannot independently establish the source's truth.

## The tested decision contract

The local app sends one shared state containing `userBrief` and `suppliedProjectAnswers`. Supplied answers use an empty object when none are provided. The server also accepts an optional `suppliedSourcePassage` string and marks it as untrusted content. The browser suggestion flow does not send this field. Neither local catalogue retrieval nor the current shortlist pilot adds source passages to requests.

It asks for intent and nine independent coverage judgments, three for each recipe. When a practice is selected for assessment, it also asks direct applicability, positive need and rejecting boundary questions. That means ten Choice questions without a practice, or thirteen with one. Each request from the current browser flow assesses at most one practice. Separate research comparisons of larger batches do not change this application behavior.

The intent choices are `feasibility`, `bugfix`, `feature-delivery`, `unclear` and `outside-supported-recipes`. Coverage choices are `answered`, `missing` and `conflicting`.

Code uses the selected supported recipe's three coverage answers. It selects the first unresolved question in catalog order. If all three are answered, it returns `none-needed`. If the intent is unclear or unsupported, it has no recipe clarification to select.

## Practice selection is a combined policy

[[diagram:practice-policy]]

The raw three-class applicability answer is retained for comparison. The final inclusion policy uses two other JEV answers:

1. If the user boundary is assessed as rejected, return `not-relevant`.
2. Otherwise, if the specific need is assessed as established, return `relevant`.
3. Otherwise, return `insufficient-context`.

This is **model plus code**, not model-only accuracy. The boundary assessment can still be wrong, code does not independently prove that the user rejected something. Silence about a practice is not an explicit refusal.

The retained v8 guided trial repaired the requirements practice question. It asks whether the immediate request includes building, repairing or planning a concrete software change. Missing acceptance examples do not remove that need. Coverage still records those examples as missing or conflicting, and an explicit refusal still takes precedence.

The current definition version is `pilot-v9-minimum-change-concrete-work`. It changes only the three questions for Smallest necessary change. Shared intent and coverage, the other two practices, request fields and decision ordering retain their v8 definitions. The original v8 module remains available for reproducible comparisons.

For Smallest necessary change, an explicit software feature, fault investigation, repair, change plan or study of possible software construction establishes need. The user does not have to ask for reuse by name. An explicit software reuse inspection also counts. Missing acceptance details or an unknown cause do not remove that need. A refusal of the practice still wins. A task confined to reading, translation, reporting existing material or nonsoftware decisions is outside its scope. Unspecified work needs more context. Constraints such as no new dependencies or keeping the current stack are compatible with the practice and remain constraints.

The profile has its own version, `minimum-change-v9-concrete-software-work`. Its question text is covered by the whole definition digest. These version labels are local metadata, not additional provider state. This revision does not inherit measured accuracy or latency from v7 or v8. Structural and preservation tests check the implementation. Fresh provider results are a separate measurement.

## Keep confidence and correctness separate

TypeSafe defines Choice confidence as a statistic of the returned probability distribution. [Confidence reference](https://docs.typesafe.ai/confidence).

The pilot derives next-question confidence from the selected coverage slot, or the minimum of the recipe's slots for `none-needed`. Combined practice confidence uses the boundary judgment for rejection, otherwise the minimum of need and boundary confidence. These derived values are not empirically calibrated probabilities that the complete proposal is correct.

In the final pilot, an already answered acceptance question was requested again with reported confidence 0.90. A confidence of 0.90 did not prevent this error. No correctness threshold was calibrated for Atlas, and no confidence threshold removes cases from the current accuracy denominator.

Any future automatic action needs its own evaluation and control boundary. The initial product proposal remains reviewable, even when model confidence is high.

## Retrieve locally, assess one supported practice

Catalogue retrieval runs deterministically in the browser. It uses the brief and recorded project choices to find candidates. Catalogue summaries, node digests, topic bodies, source excerpts and the search index never enter an inference request through this feature. Reading and retrieval make no provider request.

Short user clarifications can identify the task, record a separate ongoing knowledge need or distinguish a requirement, background and a practice exclusion. They are versioned local project data. They do not change the original description or answers and do not enter the request. Supported conditions and historical statements are confirmed as complete sentences. Task scope remains a local eligibility restriction. Earlier clarification records need explicit reconfirmation for newly supported meanings. These meanings and their policy versions stay outside inference. The sentence organizer records source-bound task, product rule, background and scoped restriction choices in intent review version 5. Existing source parts retain their old interpretation policy until explicitly reconfirmed. Short question buttons, the project-input handling scope and the undecided-deliverable question stay local, with no extra model request. Source part policy 3 can compose supported compatible restrictions. Part policy 4 adds bounded historical omissions and shared product outcomes after confirmation, while earlier parts keep their previous policy. Unsupported input handling exceptions pause local practice ideas and assessment before role classification. Relabeling cannot authorize the exception. This guard does not evaluate conditional permission or recognize every paraphrase. Choosing a task resolves only supported local uncertainty. The original undecided wording still reaches JEV if the user later requests an eligible assessment. A supported sending restriction can permit local retrieval while independently pausing the optional practice assessment. Recognized original handling limits survive role changes. This bounded wording analysis can miss compound or unfamiliar handling instructions, so an available check does not establish permission to send text. This is a guard for this practice check, not a runtime permission system. A JEV assessment can therefore still find the original wording insufficient. This change does not revise the v9 inference definitions or their digest.

Restriction analysis in Brief pauses that panel's practice suggestions and optional practice check. It is not universal enforcement of natural-language permissions across every application entry point or an exported workflow runtime. Review the disclosed original text before any explicit inference request.

An explicit JEV request can assess one candidate supported by the frozen practice contract: Requirements before implementation, Smallest necessary change or Source backed project wiki. It sends the user context and the definitions required by the existing tested question path. It does not widen JEV's supported practice set. Record contract and prompt versions with results. TypeSafe's [Choice guidance](https://docs.typesafe.ai/primitives/choice) supports independent questions evaluated against shared state.

An assessment may suggest that the practice fits, reject it or need more context. It is not source verification or a confirmation of every suggestion. A changed brief or relevant project choice makes an earlier assessment out of date. The user reviews an eligible practice before applying it. Retrieval and assessment alone do not modify the project or generated files.

Catalogue additions can change local retrieval results without changing the inference definitions. Retrieval quality needs its own labeled evaluation. The historical pilot did not evaluate catalogue retrieval, technology selection or every catalogue practice. Its reported accuracy and latency do not transfer to this feature.

## Preserve user control

The integration preserves explicit choices and lets you continue manually when inference fails. Explanations use reviewed catalog guidance, not invented model reasoning. Coverage assessments remain separate from the wording you explicitly record in an answer field.

Project saving remains explicit download and upload. The application returns safe timing and usage metadata without saving raw requests or responses. Accounts, tool execution and cloud storage remain outside the local pilot.
