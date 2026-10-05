# Catalogue authoring

The catalogue supplies the Knowledge Atlas and the instruction factory from versioned JSON in `catalogue/`. Edit those sources, validate them and rebuild the two static projections. The browser reads the generated files without a database service.

Catalogue content is version `2.1.0`. Its authoring schema is `1.0`. Project configuration remains schema `3.0`, with workflow model `1.0`. These versions describe different contracts.

## Current coverage

The catalogue contains 117 topics, 72 source records, 10 browsing clusters and six guided paths. All 109 earlier topics remain. Eight new topics illustrate information retrieval, validation, technology choices and a fictional example.

There are 22 technology choices and four question profiles: generic, Spring Boot, React and RDF/SPARQL. A technology choice records a name. A profile adds questions and expected checks. Neither establishes installation, compatibility, available credentials or observed behavior. Other technologies retain generic guidance. The retrieval examples are a starting set, not a complete technology directory.

In the Knowledge Atlas, search titles, aliases and subject areas, or use **Topic type** to narrow the results. **Take a guided path** includes **Retrieve and check information**. Reading or filtering does not create or edit a project.

## Source files

| File | Authored content |
| --- | --- |
| `catalogue/manifest.json` | Catalogue and project schema versions, content version, topic order, source aliases, tool aliases and status vocabularies |
| `catalogue/knowledge/<id>.json` | One reading topic, including sections, references, kind, domains, aliases, revision, applicability, limits and scoped source claims |
| `catalogue/definitions.json` | Typed factory definitions with `type`, `id`, `revision`, `sourceRefs`, optional `reviewedOn` and a type-specific `spec` |
| `catalogue/sources.json` | Source identifiers, titles, URLs, known revisions, recorded review dates, status and contribution |
| `catalogue/relations.json` | Typed links between topics, definitions and their referenced evidence |
| `catalogue/actions.json` | Curated topic actions, their practice or runtime-control target, explanation and eligibility rule |
| `catalogue/navigation.json` | Domains, browsing clusters and ordered guided collections |
| `catalogue/catalogue.schema.json` | JSON Schema for the assembled authoring model |

Topic kinds are `concept`, `capability`, `technology`, `practice`, `example`, `reference` and `procedure`. Factory definition types are `stage`, `skill`, `role`, `practice`, `recipe`, `profile`, `control`, `technology` and `host`. A capability topic explains an intended ability. A stage's capability aliases describe requested host tools. These records have different purposes.

Stable IDs connect the records. A topic file must have the same name as its `id`. A definition's outer `id` must match `spec.id`. Preserve published IDs when changing wording. Removing or renaming a definition can break an existing project's references and needs explicit compatibility work.

## Links have declared meanings

Relationship records contain `from`, `type`, `to` and `sourceRefs`. Endpoints use names such as `topic:information-retrieval`, `technology:postgresql` and `practice:validated-retrieval`. Source references contain bare IDs from `sources.json`.

| Predicate | Direction and meaning |
| --- | --- |
| `browse-under` | Topic to its browsing parent. Every topic except `overview` has one route to that root |
| `related-reading` | Topic to related reading |
| `broader-concept` | Topic to a broader explanatory topic |
| `illustrates` | Topic to the topic it illustrates |
| `explained-by` | Factory definition to its explanatory topic |
| `uses-definition` | Topic to a factory definition it uses |
| `provides-capability` | Technology definition to a capability topic, with supporting source references |

Browsing and related reading do not assign workflow prerequisites. A `provides-capability` link records a sourced catalogue claim. It does not establish that a user's installation supplies that capability. Workflow assignments, target tool mappings and observed results remain separate.

## Add or change content

Install development dependencies once with `npm ci --ignore-scripts`.

1. **Source:** add a record to `catalogue/sources.json`. Record the exact contribution, known revision and review status. Use an HTTPS URL without embedded credentials. Leave an unknown revision or review date empty. Do not mark an unreviewed source `reviewed`.
2. **Topic:** add `catalogue/knowledge/<id>.json`, using an existing topic of the same kind as a structural example. Add its ID to `manifest.json` in `topicOrder`. Assign registered domains and source IDs. Add its `browse-under` relationship to `relations.json`, plus any relevant reading links. `catalog.claims` associates an exact statement with a section label and its supporting source IDs.
3. **Definition:** add a record of the required type to `catalogue/definitions.json`. Keep the reading topic separate from its actionable definition. A recipe needs questions and stage IDs. A stage needs its inputs, actions, outputs, checks, prerequisites, default skills, actor, capability aliases and explanatory topic. Add the matching `explained-by` link for a stage's `atlasTopic`. A profile needs technology IDs, questions, expected checks and limits.
4. **Action:** add a record to `catalogue/actions.json` with exactly one `practiceId` or `runtimeControlId`. Add the matching topic-to-definition `uses-definition` link. Existing eligibility values are `always`, `change-stage`, `requirements-and-change` and `runtime-design`. Their behavior is implemented in `factory/catalogue-rules.mjs`. A new eligibility rule needs code and tests as well as a schema update.
5. **Collection:** add an `id`, `title` and ordered, nonempty `nodeIds` list to `catalogue/navigation.json` under `collections`. These are reading paths. They do not define an executable process.

The retrieval slice provides concrete examples in `catalogue/knowledge/retrieve-and-validate.json`, the `validated-retrieval` definition and action, the `input-validation` source and the `retrieval` collection.

After editing, run:

```text
npm run build:catalogue
npm run check:catalogue
npm test
```

`build:catalogue` runs `node tools/build-catalogue.mjs`. It validates the source model and writes `atlas/data.js` and `factory/catalog.mjs`. `check:catalogue` runs the same tool with `--check`, which validates the model and fails if either checked-in projection differs from the generated content. Commit source and generated changes together. Rebuild the documentation separately when its Markdown changes.

Ajv runs in the build and check tool. It is a development dependency, not a browser dependency or a runtime catalogue service. Ordinary manual use can serve the checked-in projections without installing it.

## What the checks establish

The schema rejects unknown fields, unsupported record types and malformed shapes. Reference checks reject duplicate IDs and links, missing source or definition targets, invalid domains, unsafe source URLs, inconsistent stage mappings and unsupported tool aliases. Browsing parents must form one connected hierarchy rooted at `overview`, without cycles or multiple parents. Collections must name existing topics. An action must identify one supported target and have its explicit definition link.

A reviewed source requires a recorded date. A reviewed topic requires a date and scoped claims. Each claim needs a matching section label and source references visible in that topic. These checks establish that the records are connected and shaped as declared. They do not retrieve the source, judge whether it supports the claim, authenticate a review, validate a real integration or run a workflow. Dates are checked for their written shape, not proof that a review happened.

`legacy` means metadata was carried from earlier material without a new claim-level review. `needs-review` records an unresolved review. `reviewed` records the author's scoped source review, not a certification of the whole topic or an installed technology. Changing taxonomy, migrating files or increasing the catalogue version does not refresh factual review dates. Keep recommendations and illustrative steps distinguishable from the statements a source supports.

## Project and inference boundaries

The generated `factory/catalog.mjs` exports the existing `CATALOG` API, including action definitions and per-definition revision metadata. The factory uses it for selection, validation, previews and instruction generation. `atlas/data.js` contains the reading, search, map, source and collection projections. Edit the JSON sources instead of either generated file.

Six topics offer project actions when applicable. **Retrieve and validate** offers **Add retrieval checks** through **Review for my workflow**. Review the proposed files before applying. That action selects `validated-retrieval`; it does not add steps, roles, tools, facts or observations. Downloads include its written guidance and source. Undo can reverse the project edit.

Projects, imported files and snapshots remain in memory. Explicit download and upload keep user-owned work. The public catalogue does not provide project storage. Historical export manifests retain selected definition contents, versions, sources, applicability and limits for comparison with current guidance. A newer catalogue version does not silently establish a new review of older definitions.

JEV's v8 definitions and digest remain frozen separately. Its supported recipe, question and practice sets come from that inference contract. New catalogue recipes and questions remain manually usable. Additional question answers are excluded from inference requests until the profile deliberately supports them. Changing inference meaning requires a versioned contract change and evaluation, not just a catalogue edit.

See the [extension contract](extension-contract.md) for project and export compatibility, [reference practices](reference-practices.md) for source contributions, and [Atlas preservation](atlas-preservation.md) for the retained baseline.
