# JEV in Workflow Atlas

JEV helps turn your description into a reviewable starting workflow. Describe the immediate work, review the proposed stages and create an editable draft.

**Current status: local in-app pilot.** The start screen calls JEV through the configured local Node server. The manual editor and artifact compiler work without a key. [Use the integrated journey](integration.md). Human usefulness remains to be measured.

## Start with what you need

| I want to | Read next |
| --- | --- |
| Understand what JEV would do | [Decision flow](architecture.md) |
| Start the local server and get a suggestion | [Integrated usage](integration.md) |
| Run the new in-app test with another person | [Integrated trial](integrated-trial.md) |
| Inspect the historical facilitator harness | [Earlier usage guide](usage.md) |
| Understand the numbers and failures | [Measurements](metrics.md) |
| Check sources and implementation details | [Reference](reference.md) |

## What the published v7 benchmark established

On the final 100 distinct synthetic briefs, 97 produced the complete expected decision outcome. Primary p95 local decision latency was 693 ms. The estimated model input cost for all 311 requests in that run was $0.06153819.

**Not all frozen gates passed.** The repeated answered question gate failed on two primary cases. Another case missed a real gap. No real participant sessions were measured. [See denominators, cost scope and failures](metrics.md).

The [historical facilitator trial](repeatable-trial.md) uses v8 after a practice need disagreement in two simulated v7 executions. Protocol `atlas-guided-trial-5` keeps the same seven authored card targets and 48 step IDs. It must be frozen before its first execution. Protocols 3 and 4 had no guided executions. Round 4 had separate model-assisted UI reviews with open goals. Those reviews prompted changes to feasibility guidance, the decision brief and download reopening. They are not human trial results or current guided Atlas and JEV results. The two completed simulations from protocol 2 remain historical evidence for that interface. Their results are not results for protocol 5. The v7 benchmark numbers above do not describe v8.

## The intended experience

Describe the task. Review a proposed recipe, one useful next question and applicable practices. Change any suggestion. The deterministic compiler creates the files from the accepted project decisions.

JEV can become central to interpretation and guidance. Reviewed definitions, code rules and the user's accepted decisions remain separate parts of the system. Calling it the app's brain describes a product direction, not a measured capability.

## Read this as evidence, not a promise

This guide distinguishes **observed**, **provider documented**, **planned** and **unknown** claims. Results describe a bounded synthetic pilot for three recipes and three practices. They do not establish universal workflow coverage, source truth, production latency or a productivity improvement.

Integration guide updated on 5 October 2026. Historical measurements retain their original dates and versions. [How the experiment evolved](history.md). [Machine readable evidence](evidence.json).
