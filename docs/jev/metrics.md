# What we measured

**Observed local synthetic pilot, 4 October 2026.** Model `jev-1.13.0`, prompt `pilot-v7-positive-evidence-and-boundaries`. The final fresh run contains 100 distinct synthetic briefs. It has no observed real participants.

## Read the headline with its denominator

| Measurement | Result | What it measures |
| --- | --- | --- |
| Intent, model only | 100 / 100 | First normal response for each distinct case |
| Next question, model plus code | 72 / 75, 96.0% | All cases whose target is a supported recipe, including routing failures if present |
| Raw coverage, model only | 217 / 225, 96.4% | Three authored coverage targets for each of 75 supported cases |
| Final practice inclusion, model plus code | 60 / 60 | Fixtures with one designated practice |
| Direct practice applicability, model only | 55 / 60, 91.7% | Separate three-class answer retained for comparison |
| Relevant offers, final policy | 21 correct, 0 false, 0 missed | Binary inclusion precision and recall on this set |
| Complete case outcome | 97 / 100 | Correct intent and every applicable next-question and practice result |
| Primary decision p95 | 692.9549 ms, rounded 693 ms | Complete local decision path on the 100 first normal trials |
| Primary median | Approximately 424 ms | Same primary sample |
| API responses | 311 / 311 valid, 0 retries | All normal repetitions and reversed-option trials |

The 225 coverage judgments are clustered within 75 briefs. They are not 225 independent users. The API returned other speculative coverage answers, but those lacked authored gold labels and are not included in 217 / 225.

## The repeated answered question gate failed

The frozen gate permits zero repeated answered questions. Two primary cases violated it. The separate complete case gate passed at 97 / 100, and p95 was below the two second target. Passing those gates does not erase the repeated question failure.

| Synthetic case | Expected next question | Observed next question | Reported confidence |
| --- | --- | --- | --- |
| v7-s11 | none-needed | desired-outcome | 0.44 |
| v7-s18 | current-work | none-needed | 0.29 |
| v7-f11 | none-needed | acceptance | 0.90 |

Direct applicability at 91.7% is a comparison result. The final frozen practice gate scores the combined policy, not that raw answer. Changing the meaning of a gate after seeing the result would invalidate the comparison.

## p95 means a latency percentile

Sort the 100 primary elapsed times. The nearest-rank p95 is item `ceil(0.95 × 100)`, the 95th value. It is not a 95% accuracy score, a latency ceiling or a production service guarantee.

The timed local path includes request construction, request persistence, HTTP and provider work, retries when present, response parsing, validation, response persistence and decision code. It excludes a deployed proxy, browser interaction, rendering and participant reading time.

The harness used three concurrent workers. Across all 311 stability trials, p95 was 689.1897 ms. This is a different sample from the primary p95, so it is labelled separately. Individual stage timings are not sufficient to attribute the measured latency to the model alone.

## Cost is an estimate from reported tokens

TypeSafe's documented direct input price on the review date is $0.042 per million tokens, with outputs free. [Model pricing](https://docs.typesafe.ai/models).

```text
Estimated model cost = input tokens / 1,000,000 × $0.042
```

| Scope | Input tokens | Estimated USD |
| --- | --- | --- |
| Final 100 primary requests | 470,742 | $0.019771164 |
| Final 311 requests including stability trials | 1,465,195 | $0.06153819 |
| All eight optimization runs | 6,000,835 | $0.25203507 |

The primary request mix extrapolates to about $0.198 per 1,000 requests. This is not a forecast for the complete app. It evaluates ten or thirteen questions with at most one designated practice, and excludes the previous pilot, hosting, other APIs, retrieval, artifact generation and participant effort. The amount is not an invoice or verified account debit.

## Repetitions measure stability

The final run has three normal trials per case and eleven reversed-option trials, 311 API requests in total. They do not increase the independent case count from 100 to 311. No final decision changed across the normal repetitions. One reversed-option trial changed a final decision outcome.

## What remains unknown

Real-user agreement, unnecessary question burden, usefulness of explanations, successful artifact use, deployed p95, broader language coverage, larger knowledge sets and different model versions remain unmeasured. The final authored fixture labels 93 briefs English and seven mixed language. Those labels do not establish a language-specific reliability benchmark. The 97 / 100 result cannot establish 97% reliability for arbitrary people or workflows.

[[details:Audit and reproducibility]]

Primary scoring takes the first normal trial of every unique case. Missing, invalid and abstained applicable decisions remain in their denominators. Expected labels are not sent as request state. The prompt, dataset, catalog dependencies, scorer and unchanged gates were frozen and snapshotted before final inference.

The last fresh set was the stopping set regardless of score. Earlier fresh sets became exposed development data before further tuning. Rerunning any now-exposed fixture provides regression evidence, not a new independent holdout.

An earlier binary precision bug incorrectly excluded some targets whose allowed labels were all negative. Corrected scoring counts them as negatives. The earlier 80-case v6 set had 21 true and 3 false offers, 87.5% precision. Original results remain retained, the correction did not change API responses or targets.

The case-level Wilson interval reported for 97 / 100 is approximately 91.5% to 99.0% under a binomial sampling model. These authored synthetic briefs are not a random sample of production users, so that interval does not establish a population guarantee.

Run `node tools/jev-docs-evidence.mjs --check` in the owner checkout to recompute the published snapshot from the retained files, without calling an API. The ignored source files are required. A clone without them can read the snapshot but cannot independently reproduce those private records. [Evidence snapshot](evidence.json). [Experiment history](history.md).

[[/details]]
