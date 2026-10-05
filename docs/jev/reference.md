# Reference and claim status

Reference baseline reviewed on 4 October 2026. TypeSafe's API, Choice, model limits, key setup and legal overview were rechecked on 5 October 2026. Other source dates remain as recorded. A review date records what was checked then, it is not continuous upstream verification.

## Provider documented facts

The existing harness calls `POST https://api.typesafe.ai/v1/systemone`, authenticates with a Bearer key and pins `jev-1.13.0`. Request fields are `model`, `state` and named `questions`. Responses contain the returned model, named answers and token usage. [TypeSafe API](https://docs.typesafe.ai/api).

The pilot uses Choice only. TypeSafe also documents Score and Noul, neither was evaluated here. Choice selects a declared option and returns a distribution and confidence. Typed output constrains representation, it does not prove correct interpretation. [Choice](https://docs.typesafe.ai/primitives/choice).

Direct TypeSafe documented 64k combined context and a 32k limit for state plus the longest question on 5 October. The 4 October OpenRouter review recorded 32,000 tokens for its Jev route. These are provider-specific documented limits, not interchangeable tested limits. [TypeSafe models](https://docs.typesafe.ai/models), [OpenRouter Jev guide](https://openrouter.ai/docs/guides/community/jev).

## Data handling

TypeSafe states that customer requests and responses are not used for training. Its legal overview identifies enterprise zero data retention separately. That does not establish standard account zero retention. The 4 October [data processing addendum](https://typesafe.ai/legal/data-processing) review did not establish a fixed standard retention duration. [Provider data handling](https://docs.typesafe.ai/legal).

An API request sends the selected state and questions to the provider. Avoid assuming that local Atlas session behavior also describes provider retention. The trial harness separately writes raw trial inputs and responses into the ignored local run directory.

## Source map

| Source | Contribution | Claim boundary |
| --- | --- | --- |
| [TypeSafe models](https://docs.typesafe.ai/models) | Pinned model, aliases, price and context | Provider documentation, not our measured reliability |
| [TypeSafe API](https://docs.typesafe.ai/api) | Request and response contract | Our validator still needs local checks |
| [Choice](https://docs.typesafe.ai/primitives/choice) | Declared decisions against shared state | No evaluation of every possible Choice task |
| [Confidence](https://docs.typesafe.ai/confidence) | Distribution-derived statistic | No Atlas-specific calibration guarantee |
| [TypeSafe customer agreement](https://typesafe.ai/legal/mca) | Credential handling, section 2.4 | A shared owner credential is not the proposed trial route |
| [TypeSafe DPA](https://typesafe.ai/legal/data-processing) | Provider processing terms | Standard fixed retention period remains unverified |
| [OpenRouter keys](https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key) | Named inference keys, budget and expiry | Alternative trial route, adapter untested |
| [OpenRouter management keys](https://openrouter.ai/docs/guides/overview/auth/management-api-keys) | Administrative key distinction | Owner only, not a tester credential |
| [Evidence snapshot](evidence.json) | Recomputed local measurements and hashes | Synthetic author targets, private raw evidence |

## Status of the larger vision

| Claim | Status |
| --- | --- |
| Atlas generates packs from recorded choices | Implemented in the current app |
| JEV evaluates the frozen pilot questions | Observed in local API runs |
| A person can review a proposed decision | Implemented locally. Human trial results remain unmeasured |
| Atlas calls JEV from its first screen | Implemented through the configured local Node server |
| JEV chooses every tool and technology | Not implemented or evaluated |
| The whole Knowledge Atlas is used at inference | Not implemented or evaluated |
| Suggestions improve real-user productivity | Unknown |
| JEV executes workflows or establishes source truth | Not established by this experiment |

## Maintain these docs

Recompute evidence with `node tools/jev-docs-evidence.mjs --check`. To deliberately update its snapshot from retained raw files, use `--write`. Neither command calls the API. They need the private owner-local evidence directory.

After editing Markdown, run `node tools/build-docs-guide.mjs`. That rebuilds the complete documentation portal and the existing JEV guide. It requires no key and makes no network request. Open `docs/index.html` directly, or visit `/docs/` on the local server. The JEV guide also remains at `/docs/jev/` with its existing page routes.

Check the guide in light and dark themes, on a narrow screen and using the keyboard. Diagrams need readable captions, expansion and an ordinary-text equivalent. The documentation's browser checks do not establish full accessibility conformance.
