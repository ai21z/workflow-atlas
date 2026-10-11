# Catalogue authoring

The catalogue supplies the Knowledge Atlas and the instruction factory from versioned JSON in `catalogue/`. Edit those sources, validate them and rebuild the two static projections. The browser reads the generated files without a database service.

Catalogue content is version `2.1.0`. Its authoring schema is `1.1`. Project configuration remains schema `3.0`, with workflow model `1.0`. These versions describe different contracts.

## Current coverage

The catalogue contains 125 topics, 137 source records, 10 browsing clusters and six guided paths. All 109 earlier topics remain. Eight retrieval topics illustrate validation, technology choices and a fictional example. Three general procedures introduce pipeline diagnosis, data and query verification, and source and evidence verification.

Five topics added on 11 October 2026 start the balanced coverage: Node.js, Python, GitHub Actions, Docker and a practice for repository instructions to agents. Each technology topic uses the same section labels, where config lives, conventional commands, how CI is declared, where review conventions live and gotchas, and carries its statements as claims with official documentation sources. All five topics are `needs-review`. They were drafted from pages read on that date and await a dated topic review. Linked sources retain their individual recorded review status. Search aliases are recorded on 124 of the 125 topics. Where existing text supports them, topics also have a specific applicability sentence and an `applies` block. Forty topics tied to one workplace are labeled as examples with their context.

The Skills and agent roles cluster leads with those general procedures. Its Jenkins and country-source pages are visibly scoped examples. RDF/SPARQL verification keeps its own data-family guidance, with Neptune execution plans relevant only to Neptune. These new entry procedures are proposed guidance marked for review. Their addition is not a new source review or an exportable skill mapping. Broader catalogue-wide abstraction and factual review remain unfinished.

There are 24 technology choices and eight question profiles: generic, Spring Boot, React, RDF/SPARQL, Node.js, Python, GitHub Actions and containerised services. A technology choice records a name. A profile adds questions and expected checks. Neither establishes installation, compatibility, available credentials or observed behavior. Other technologies retain generic guidance. The retrieval examples are a starting set, not a complete technology directory.

In the Knowledge Atlas, search titles, aliases and subject areas, or use **Topic type** to narrow the results. **Browse a subject** groups existing articles across their original clusters. **Take a guided path** includes **Retrieve and check information**. Reading or filtering does not create or edit a project.

### Browse a subject

The home page offers four subject cards. Choose one to open its topics, or select **Browse a subject** in the topic navigation. On a phone, this opens the Topics dialog. Search and **Topic type** narrow the selected subject further. Choose **All subjects** to remove the subject filter, or clear the filters to return to every topic.

| Subject | What it groups | Coverage limit |
| --- | --- | --- |
| CI and pipelines | Pipeline diagnosis, checks and the recorded CI tools | Existing articles do not cover every CI service |
| Containers | The Docker article | Docker only, not Kubernetes or a complete deployment guide |
| Access and action controls | Tool boundaries, credentials, validation and approval guidance | Not a full security review |
| Workflow measurements | Existing cost, evaluation and workflow evidence guidance | Not a full observability guide |

Each subject records its own limits, which appear beside the filtered topics. The displayed count is the number of member articles. It is not a completeness score, a source review or proof of a working integration. Subjects can overlap. They are reading groups, not ordered paths, new map clusters or workflow prerequisites.

Subject membership does not change topic parents, cluster identities, graph positions, published topic links or breadcrumbs. Opening an article keeps the subject filter available for continued reading. It does not change project choices, generated instructions or inference requests. The separate eight-slot maintainer coverage report remains unchanged by grouping articles.

### Explore the 2D map

**Explore the map** opens the new **2D map** by default. **Topic cards** and the preserved **3D map** remain available in both the workspace and standalone Atlas. The 2D map draws 125 reading topics, seven practice definitions and 24 technology definitions. Circles are topics, rounded squares are practices and hexagons are technology names. A topic and its corresponding definition remain separate records.

Select a node to inspect its summary, recorded review information and linked source count. **Read topic** opens an article. A definition with an explanatory article offers **Read explanation**. A definition without one remains a recorded choice, not a missing article filled in by the app. **Neighbours** lists the named records connected to the selection and their relationship types. **Browse all map nodes as a list** includes every displayed record, including definitions without explanatory articles. Both lists bring the selected node into view.

Only the selected node's immediate connections are drawn. **Structure** and **Applies** start enabled, and **Reading** starts disabled. Structure contains browsing and part relationships. Applies contains applicability and requirement relationships. Reading contains the remaining relationships between displayed records. These controls filter connections, not the catalogue itself. Source and claim records and other definition types remain in the underlying graph without becoming map shapes.

**Highlight a subject** uses the same subject selection as Topics. It highlights that subject's articles while keeping all nodes available. The subject's coverage limits remain visible. A highlighted article is not a recommendation for the current project.

The generated `catalog.layout2d` record has its own layout `version: 1`, canvas dimensions, node positions, radii and `labelRank`, cluster labels and article counts, and deduplicated connection groups. Each group retains the original directed relationships. `tools/atlas-layout.mjs` computes positions during catalogue compilation, with stable ordering, a radial pull and local separation. Lower label ranks appear earlier as the map is enlarged. Degree, record kind and estimated label overlap set that order. Review status does not.

The ten existing clusters retain their identities, colours and original 3D positions. A linked practice or technology sits with its explanatory article. Unlinked definitions sit in **Factory definitions**. Cluster article counts exclude the cluster's own hub and all definition shapes. They measure recorded articles, not completeness. Layout distance is geometry, not semantic similarity, a source rating or a dependency declaration. Subject selection does not recompute positions.

The browser reads the generated layout and changes only the viewport when panning or zooming. It adds no layout library or inference request. A missing or unsupported layout falls back to Topic cards. Neither map browsing nor the layout projection changes factory definitions, project decisions or generated instructions.

## Source files

| File | Authored content |
| --- | --- |
| `catalogue/manifest.json` | Catalogue and project schema versions, content version, topic order, source aliases, tool aliases and status vocabularies |
| `catalogue/knowledge/<id>.json` | One reading topic, including sections, references, kind, domains, aliases, revision, applicability, limits and scoped source claims |
| `catalogue/definitions.json` | Typed factory definitions with `type`, `id`, `revision`, `sourceRefs`, optional `reviewedOn` and a type-specific `spec` |
| `catalogue/sources.json` | Source identifiers, titles, URLs, known revisions, recorded review dates, status and contribution |
| `catalogue/relations.json` | Typed links between topics, definitions and their referenced evidence |
| `catalogue/actions.json` | Curated topic actions, their practice or runtime-control target, explanation and eligibility rule |
| `catalogue/navigation.json` | Domains, browsing clusters, optional subject groups and ordered guided collections |
| `catalogue/coverage.json` | Maintainer list of eight stack slots and wanted IDs, used only for structural coverage reporting |
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
| `requires` | A topic or definition cannot be used without the target. Sources are not valid endpoints. Cycles are rejected |
| `evidenced-by` | A topic or definition to a source that supports it |
| `example-of` | A topic labeled as an example to the general topic it illustrates |
| `works-with` | Two technology names that form a stack, with a supporting source. Symmetric |

Browsing and related reading do not assign workflow prerequisites. A `provides-capability` link records a sourced catalogue claim. It does not establish that a user's installation supplies that capability. Workflow assignments, target tool mappings and observed results remain separate.

A relationship can carry an optional `note`, a `status` from the same vocabulary as sources and a `reviewedOn` date. A reviewed relationship needs a date.

## Schema 1.1, the graph fields

Schema `1.1` adds optional fields and generated edges. No record, id or relation type was renamed or removed. Every addition is optional, so a `1.0` file validates unchanged apart from the version constant.

| Record | Optional field | Meaning |
| --- | --- | --- |
| Topic `catalog` | `evidence` | `basisKinds` from `documented`, `proposed`, `inspected`, `recommended`, `research`, `illustrative`, `supplied`, and `confidenceLevel` from `established`, `proposed`, `speculative`. The free text `basis` and `confidence` stay |
| Topic `catalog` | `applies` | Lists of `stages`, `recipes`, `technologies` and `hosts` the topic is relevant to. Ids must exist. The build derives `applies-to` edges from this block |
| Topic `catalog` | `scope` | `generality` as `general` or `example`, and an optional `context` naming the workplace or study an example comes from. Only an `example` topic can be the source of an `example-of` link |
| Definition | `basis`, `confidenceLevel` | Record level, outside `spec`. They reach `definitionMetadata` and the reader projection, never an exported pack |
| Technology definition | `category` | One of `language`, `framework`, `build-test`, `hosting-ci`, `tracking-docs`, `data-store`, `deployment`, `agent-host`, `other` |
| Source | `license`, `retrievedOn`, `kind`, `publisher` | An absent `license` means not found. `kind` is the format of the source, not a quality rating |
| Action | `conditions` | `technology.in`, a list of technology ids. The four `eligibility` values stay as presets. A condition narrows a preset, it never widens one. With no recorded technology the condition does not match |

The build generates edges that cannot be authored by hand. `depends-on`, `default-skill` and `performed-by` come from stage specs, `part-of` from recipe stage lists, `applies-to` from the `applies` block, and `evidenced-by` from each topic claim to its sources. Each claim gets an id of the form `claim:<topic>-<n>`. Every edge then gets its inverse, for example `explained-by` and `explains`, or `example-of` and `has-example`. Generated edges and inverses carry `derived: true`. `related-reading` and `works-with` are symmetric.

`atlas/data.js` keeps `nodes`, `sources` and the authored `catalog.relations`, and adds `catalog.edges` with the full graph, `catalog.claims`, `catalog.definitions` as compact records with their explanatory topic, `catalog.clusterDigests` and the generated `catalog.layout2d` geometry. `factory/catalog.mjs` does not carry the map layout.

Freshness is a report, not a field. The build and the check print the reviewed records whose date is older than 180 days. The reader shows the same note on a topic card. Nothing about the current date is written into a projection, so `npm run check:catalogue` stays deterministic.

## Add or change content

Install development dependencies once with `npm ci --ignore-scripts`.

1. **Source:** add a record to `catalogue/sources.json`. Record the exact contribution, known revision and review status. Use an HTTPS URL without embedded credentials. Leave an unknown revision or review date empty. Do not mark an unreviewed source `reviewed`.
2. **Topic:** add `catalogue/knowledge/<id>.json`, using an existing topic of the same kind as a structural example. Add its ID to `manifest.json` in `topicOrder`. Assign registered domains and source IDs. Add its `browse-under` relationship to `relations.json`, plus any relevant reading links. `catalog.claims` associates an exact statement with a section label and its supporting source IDs.
3. **Definition:** add a record of the required type to `catalogue/definitions.json`. Keep the reading topic separate from its actionable definition. A recipe needs questions and stage IDs. A stage needs its inputs, actions, outputs, checks, prerequisites, default skills, actor, capability aliases and explanatory topic. Add the matching `explained-by` link for a stage's `atlasTopic`. A profile needs technology IDs, questions, expected checks and limits.
4. **Action:** add a record to `catalogue/actions.json` with exactly one `practiceId` or `runtimeControlId`. Add the matching topic-to-definition `uses-definition` link. Existing eligibility values are `always`, `change-stage`, `requirements-and-change` and `runtime-design`. Their behavior is implemented in `factory/catalogue-rules.mjs`. A new eligibility rule needs code and tests as well as a schema update.
5. **Collection:** add an `id`, `title` and ordered, nonempty `nodeIds` list to `catalogue/navigation.json` under `collections`. These are reading paths. They do not define an executable process.
6. **Subject:** optionally add a record under `navigation.subjects`, with `id`, `title`, `summary`, `limits` and a nonempty `nodeIds` list. Use existing topic IDs and describe the actual scope. A topic can belong to more than one subject. Do not add a `browse-under` relationship or change a cluster to make it appear in a subject. The reader projection carries these records under `catalog.subjects`, separate from hierarchy and action matching.

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

The schema rejects unknown fields, unsupported record types and malformed shapes. Reference checks reject duplicate IDs and links, missing source or definition targets, invalid domains, unsafe source URLs, inconsistent stage mappings and unsupported tool aliases. Browsing parents must form one connected hierarchy rooted at `overview`, without cycles or multiple parents. Collections and subjects must name existing topics. Subject IDs and membership lists must not contain duplicates. An action must identify one supported target and have its explicit definition link.

A reviewed source requires a recorded date. A reviewed topic requires a date and scoped claims. Each claim needs a matching section label and source references visible in that topic. These checks establish that the records are connected and shaped as declared. They do not retrieve the source, judge whether it supports the claim, authenticate a review, validate a real integration or run a workflow. Dates are checked for their written shape, not proof that a review happened.

`legacy` means metadata was carried from earlier material without a new claim-level review. `needs-review` records an unresolved review. `reviewed` records the author's scoped source review, not a certification of the whole topic or an installed technology. Changing taxonomy, migrating files or increasing the catalogue version does not refresh factual review dates. Keep recommendations and illustrative steps distinguishable from the statements a source supports.

## Query the graph

`factory/knowledge-query.mjs` reads the reader projection and answers four questions without a dependency, a service or a model: search by words, get one record with its sections, claims, sources and typed neighbours, list the neighbours of any reference, and propose topics for a brief and the facts a project records. The index is built at load time from fields already in the projection. It is not a second generated index file.

Search matches titles, aliases, applicability, summaries and section text without stemming, so an identifier such as `pytest` matches as typed. Ordinary words use prefix matching and ignore function words. Recognized short identifiers `CI`, `CD`, `Go`, `R`, `C#`, `C++` and `.NET` keep their spelling and match exact tokens. Recognizing an identifier does not create a catalogue entry that is absent.

A proposal combines lexical matches with the project's recorded technologies, stages, recipe and host. It follows definition-to-topic `explained-by` links as well as the existing application and use links. A recipe reaches its stages through `has-part`, then their related topics. Unique project seeds and bounded contributions prevent repeated facts from increasing a score. A `works-with` relation supplies a weaker related-stack signal, not proof that the user chose that technology.

Proposal matching recognizes a limited set of explicit named exclusions. It removes those clauses from positive matching and suppresses the identified topics. Unmatched or unsupported negation suppresses selectable action topics conservatively. Ordinary search still lets readers find a topic they ruled out. This pattern policy is not general understanding of natural language, exceptions or conflicts.

Workplace examples need named context or a linked recorded technology or host. A generic stage or a word such as pipeline does not establish the example's environment. Every result carries the matched words or project facts that led to it, and a source line repeating the recorded review status. The module sends nothing and changes no review status.

Text reasons quote the supplied words, including a typed prefix when it matched a longer topic word. Graph reasons stay separate, so changing a displayed sentence does not change which project facts justify an idea. A legacy topic with no references says "No sources recorded. No claim review recorded." It does not claim that references were retained.

The same module runs from the command line:

```text
node tools/atlas-query.mjs search pull request checks
node tools/atlas-query.mjs get docker
node tools/atlas-query.mjs neighbors stage:implementation
node tools/atlas-query.mjs propose --brief "Add a status filter" --technology nodejs --stage implementation
```

Output is JSON. A result is catalogue text and a deterministic trace. It is not a review of any source and it does not establish that a topic fits a project.

Brief uses `factory/brief-suggestions.mjs` to turn those topic candidates into up to three eligible, unselected practice actions. It checks the actual project's action rules before showing them. A practice needs its own specific title or alias match, or an explicit stage reason for a stage-scoped action after the brief passes the overall match check. Generic article words alone do not justify an action. A recipe alone does not establish a need for repository instructions, a wiki or retrieval checks. This conservative policy can miss valid paraphrases. Related articles stay separate.

### Check the surfaced suggestions

`docs/jev/retrieval-cases.json` records 15 fictional labeled cases for the final surfaced actions. Run them with:

```text
node --test tests/brief-suggestions.test.mjs
```

The runner prints two numbers. Expected practice hit at three counts cases where at least one expected practice appears among the final suggestions, divided by cases with a nonempty expected set. It does not require every expected practice to appear. Excluded practice suggested counts cases where any excluded practice appears, divided by cases with an excluded set. The two empty-expected cases test abstention separately.

These measurements follow project eligibility, current selections and the final match policy. They are engineering checks on authored cases, not a general accuracy, usability, source-correctness or JEV claim. A later catalogue or matching change can alter the results. Use `npm test` for the complete unit suite.

Coverage of the eight stack slots is a maintainer report. `catalogue/coverage.json` names the slots and the ids the catalogue wants, and `npm run check:catalogue` prints each id as covered, thin, named only, topic only or missing. Covered means a name and related topic are present, plus a question profile for technologies. Hosts do not need a technology profile. Thin means a technology name and topic without a profile. Named only and topic only identify a record without its other side. Missing means neither is present. These states measure catalogue structure. They do not establish reviewed content, compatibility, a working integration or suitability for a team. The file is not served.

## Project and inference boundaries

The generated `factory/catalog.mjs` exports the existing `CATALOG` API, including action definitions and per-definition revision metadata. The factory uses it for selection, validation, previews and instruction generation. `atlas/data.js` contains the reading, search, map, source and collection projections. Edit the JSON sources instead of either generated file.

Seven topics offer project actions when applicable. **Repository instructions for agents** offers **Keep repository instructions for agents**, which records the practice that the full pack's `AGENTS.md` already follows. **Retrieve and validate** offers **Add retrieval checks** through **Review for my workflow**. Review the proposed files before applying. That action selects `validated-retrieval`. It does not add steps, roles, tools, facts or observations. Downloads include its written guidance and source. Undo can reverse the project edit.

Projects, imported files and snapshots remain in memory. Explicit download and upload keep user-owned work. The public catalogue does not provide project storage. Historical export manifests retain selected definition contents, versions, sources, applicability and limits for comparison with current guidance. A newer catalogue version does not silently establish a new review of older definitions.

JEV's v8 definitions and digest remain frozen separately. Its supported recipe, question and practice sets come from that inference contract. New catalogue recipes and questions remain manually usable. Additional question answers are excluded from inference requests until the profile deliberately supports them. Changing inference meaning requires a versioned contract change and evaluation, not just a catalogue edit.

Catalogue retrieval runs in the browser. Atlas does not automatically add catalogue summaries, node digests, topic bodies or the search index to an inference request. User context remains user supplied, including any text the user chooses to paste. An explicit JEV assessment uses only the existing supported practice question path and user context. Its result concerns practice fit, not source correctness. Selecting a related article does not assess or apply a practice.

See the [extension contract](extension-contract.md) for project and export compatibility, [reference practices](reference-practices.md) for source contributions, and [Atlas preservation](atlas-preservation.md) for the retained baseline.
