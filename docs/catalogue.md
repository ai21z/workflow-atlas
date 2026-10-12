# Catalogue authoring

The catalogue supplies the Knowledge Atlas and the instruction factory from versioned JSON in `catalogue/`. Edit those sources, validate them and rebuild the two static projections. The browser reads the generated files without a database service.

Catalogue content is version `2.2.0`. Its authoring schema is `1.1`. Project configuration remains schema `3.0`, with workflow model `1.0`. These versions describe different contracts.

## Current coverage

The catalogue contains 131 topics, 149 source records, 10 browsing clusters, nine subjects and seven guided paths. All 109 earlier topics remain. Existing retrieval and specialist examples stay available alongside the new feature path.

Node.js, Python, GitHub Actions, Docker and Repository instructions for agents now have dated, scoped claim reviews from 12 October 2026. Corrections include version dependent Node.js and npm behavior, Python environment commands, Docker build checks, GitHub token exceptions and host specific instruction loading. Review does not establish that example commands ran or fit a particular project. Older topics retain their recorded status, 109 are legacy and four still need review. The 18 reviewed topics include procedures with proposed examples. Their badges refer to the listed factual claims, not to approval of every recommendation or a verified implementation.

Six new guides complete the first reference path: Deliver a user-facing feature, JavaScript and TypeScript, React, npm, Vitest and Playwright. They explain project facts to find, a procedure, useful outputs, expected examples and limits. The language guide distinguishes JavaScript runtime behavior from TypeScript checks. Technology guides match their recorded technologies, rather than treating any development stage as a reason to choose that stack.

There are 27 technology choices and 13 question profiles, including generic guidance. Fourteen technologies trigger a specialist profile. A choice records a name. A profile adds questions and expected checks to project references in generated skills and to SOURCES.md. Neither establishes installation, compatibility, available credentials or observed behavior. Spring Boot has questions but no dedicated guide yet. pytest guidance is inside Python, with no separate selectable pytest definition. These gaps stay visible.

The general procedures for pipeline diagnosis, data and query verification, and source and evidence verification remain proposed guidance awaiting review. Jenkins and country-source pages are visibly scoped examples. RDF/SPARQL verification keeps its data-family guidance, with Neptune execution plans relevant only to Neptune. Broader catalogue review and technology coverage remain unfinished.

In the Knowledge Atlas, search titles, aliases and subject areas, or use **Topic type** to narrow the results. **Browse a subject** groups existing articles across their original clusters. **Take a guided path** includes **Retrieve and check information**. Reading or filtering does not create or edit a project.

### Browse a subject

The home page offers nine subject cards. Choose one to open its topics, or select **Browse a subject** in the topic navigation. On a phone, this opens the Topics dialog. Search and **Topic type** narrow the selected subject further. Choose **All subjects** to remove the subject filter, or clear the filters to return to every topic.

| Subject | What it groups | Coverage limit |
| --- | --- | --- |
| CI and pipelines | Pipeline diagnosis, checks and the recorded CI tools | Existing articles do not cover every CI service |
| Containers | The Docker article | Docker only, not Kubernetes or a complete deployment guide |
| Access and action controls | Tool boundaries, credentials, validation and approval guidance | Not a full security review |
| Workflow measurements | Existing cost, evaluation and workflow evidence guidance | Not a full observability guide |
| Clarify the work | Outcomes, acceptance examples and traceability | Requirements are not approved by reading |
| Design and delivery | Architecture, breakdown and scoped implementation | Real ownership and commands remain project facts |
| Verification and evidence | Relevant checks, findings and observed results | No checks run while reading |
| Release and recovery | Candidate identity, operating ownership and recovery | No deployment or incident tool is configured |
| Change a user facing feature | The fictional status filter and its optional reference stack | One example, with no implemented result or required stack |

Each subject records its own limits, which appear beside the filtered topics. The displayed count is the number of member articles. It is not a completeness score, a source review or proof of a working integration. Subjects can overlap. They are reading groups, not ordered paths, new map clusters or workflow prerequisites.

Subject membership does not change topic parents, cluster identities, graph positions, published topic links or breadcrumbs. Opening an article keeps the subject filter available for continued reading. It does not change project choices, generated instructions or inference requests. The separate eight-slot maintainer coverage report remains unchanged by grouping articles.

### Explore the 2D map

**Explore the map** opens the new **2D map** by default. **Topic cards** and the preserved **3D map** remain available in both the workspace and standalone Atlas. The 2D map draws 131 reading topics, seven practice definitions and 27 technology definitions. Circles are topics, rounded squares are practices and hexagons are technology names. A topic and its corresponding definition remain separate records.

Use **Find on map** to search all 165 displayed records, independently of the subject and topic filters used for reading. Results distinguish **Guide**, **Practice** and **Technology**. Choose **Show on map** to stay in Explore, bring the node into view and reveal its name above the canvas. Article search remains a separate way to open reading directly. **Browse all map nodes as a list** also includes every displayed record.

Select **Details and connections** beside the selected name to reach its summary, recorded review information, source links and **Connected topics and tools** below the map. The number on that button counts connected items in the enabled connection groups. **Back to map** returns to the selected name. Choosing a connected item selects it and brings its node into view. Choosing an article from the sidebar while exploring also brings that node into view.

Connection summaries describe the relationship in plain words. Expand **Why connected?** for the original direction and relationship name, recorded status, notes and linked sources. A pending relationship is visibly marked **Connection needs review**. The panel states when a relationship has no recorded review status or sources.

**Read topic** opens a guide. A definition with a recorded explanatory article offers **Read explanation**. A recorded link from a guide that uses the definition can offer **Read related guide** instead. A definition without either route says **No guide recorded**. When connections are hidden, **Show all connection groups** reveals them. An isolated name says that no connections are recorded. Atlas does not invent guidance or relationships for it.

Only the selected node's immediate connections are drawn. **Structure** and **Applies** start enabled, and **Reading** starts disabled. Structure contains browsing and part relationships. Applies contains applicability and requirement relationships. Reading contains the remaining relationships between displayed records. Arrows follow the recorded directional relationships, including both directions when applicable. Symmetric `related-reading` and `works-with` relationships have no arrows. These controls filter connections, not the catalogue itself. Source and claim records and other definition types remain in the underlying graph without becoming map shapes.

**Highlight a subject** uses the same subject selection as Topics. It highlights that subject's articles while keeping all nodes available. The subject's coverage limits remain visible. A highlighted article is not a recommendation for the current project.

The generated `catalog.layout2d` record has its own layout `version: 1`, canvas dimensions, node positions, radii and `labelRank`, cluster labels and article counts, and deduplicated connection groups. Each group retains the original directed relationships. `tools/atlas-layout.mjs` computes positions during catalogue compilation, with stable ordering, a radial pull and local separation. Lower label ranks appear earlier as the map is enlarged. Degree, record kind and estimated label overlap set that order. Review status does not.

The ten existing clusters retain their identities, colours and original 3D positions. A linked practice or technology sits with its explanatory article. Unlinked definitions sit in **Factory definitions**. Cluster article counts exclude the cluster's own hub and all definition shapes. They measure recorded articles, not completeness. Layout distance is geometry, not semantic similarity, a source rating or a dependency declaration. Subject selection does not recompute positions.

The browser reads the generated layout and changes the viewport when panning or zooming. Cluster headings wrap at word boundaries and shift into nearby clear space above their groups to separate their measured text blocks from other headings and node shapes. Small guide lines connect shifted headings to their groups. Visible node labels shift vertically to avoid headings. Text keeps its screen size. The numbered phone overview uses a Map key with each cluster name and recorded count, and zooming reveals full headings. These label adjustments do not move nodes or change cluster membership.

The map adds no layout library or inference request. A missing or unsupported layout falls back to Topic cards. Neither map browsing nor the layout projection changes factory definitions, project decisions or generated instructions.

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
| `catalogue/coverage.json` | Maintainer slots, indirect reading and explicit task, output and example sections, kept separate from review and export support |
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

## Read the coverage report

Run npm run check:catalogue to check the projections and print the maintainer report. catalogue/coverage.json is not served and never enters an inference request. Its 51 requested slot entries are a selected backlog, not a complete technology directory or 51 unique products.

| Dimension | What the report establishes | What it does not establish |
| --- | --- | --- |
| Structure | Covered, thin, named only, topic only or missing under the original record rules | Quality, completeness or project fit |
| Reading | Linked topics, explicitly recorded indirect guidance or no guide | Independent support for a name mentioned inside another guide |
| Task guidance | Recorded task, existing procedure and output sections, scope and any worked example sections | That the proposed procedure succeeds for a real user |
| Review | Each related topic's status, review date and number of scoped claims | Whole article certification or verified compatibility |
| Factory effect | Relevant question profile IDs or an available host export target | Installed tools, working connections, execution or successful host use |

Covered still means a name and related topic plus a technology profile, or a supported host record. Thin means a technology name and related topic without a profile. Named only and topic only identify a record without its other side. Missing means neither is directly present. Indirect reading does not silently promote a missing technology to covered. pytest therefore reports missing structurally while showing Python as indirect reading. Spring Boot reports named only while showing its existing question profile. A shared host article does not become three complete host adoption guides.

Task metadata explicitly names the section labels. The report rejects nonexistent sections, unknown topics, duplicate entries and unsupported fields. It cannot judge the quality of the prose or whether an external source supports a claim. Recommendations and fictional expected results stay distinct from the factual claims and actual observations. There is no combined completeness score.

### Try the feature reference path

1. In Knowledge map, choose Change a user facing feature under Browse a subject, or under Take a guided path for ordered reading. Start with Deliver a user-facing feature. Reading does not select its stack.
2. In Brief, open Browse examples and choose Build a feature. Atlas opens the editable Request list status filter example in Workflow. Return to Brief to inspect its outcome and acceptance examples.
3. In Project details, replace the example stack as needed. Supply real component paths, versions, scripts and sources from the target repository. Missing values deliberately keep the export a draft.
4. Read the questions for the selected stack. They distinguish static checks, rule fixtures, simulated rendering, actual browser interaction and delivery gates. Record decisions and keep unresolved questions visible.
5. In Workflow, review the stage notes and planned checks. Expected examples are proposals, not approved requirements or test results.
6. Preview files, then Download. The blueprint includes the proposed workflow and templates. A full pack also includes selected skills, agent profiles and their project references. Inspect WORKFLOW.md, templates/REQUIREMENTS.md and the verification files. Keep evidence empty until someone performs and records a check.
7. Open the downloaded pack to continue. Reading the map must leave the recorded project unchanged.

The optional reference stack is React, TypeScript, Node.js, npm, Vitest, Playwright and GitHub Actions. It is an example path, not a technology recommendation for every team. The app does not implement the status filter or run its tests.

## Project and inference boundaries

The generated `factory/catalog.mjs` exports the existing `CATALOG` API, including action definitions and per-definition revision metadata. The factory uses it for selection, validation, previews and instruction generation. `atlas/data.js` contains the reading, search, map, source and collection projections. Edit the JSON sources instead of either generated file.

Seven topics offer project actions when applicable. **Repository instructions for agents** offers **Keep repository instructions for agents**, which records the practice that the full pack's `AGENTS.md` already follows. **Retrieve and validate** offers **Add retrieval checks** through **Review for my workflow**. Review the proposed files before applying. That action selects `validated-retrieval`. It does not add steps, roles, tools, facts or observations. Downloads include its written guidance and source. Undo can reverse the project edit.

Projects, imported files and snapshots remain in memory. Explicit download and upload keep user-owned work. The public catalogue does not provide project storage. Historical export manifests retain selected definition contents, versions, sources, applicability and limits for comparison with current guidance. A newer catalogue version does not silently establish a new review of older definitions.

JEV's v8 definitions and digest remain frozen separately. Its supported recipe, question and practice sets come from that inference contract. New catalogue recipes and questions remain manually usable. Additional question answers are excluded from inference requests until the profile deliberately supports them. Changing inference meaning requires a versioned contract change and evaluation, not just a catalogue edit.

Catalogue retrieval runs in the browser. Atlas does not automatically add catalogue summaries, node digests, topic bodies or the search index to an inference request. User context remains user supplied, including any text the user chooses to paste. An explicit JEV assessment uses only the existing supported practice question path and user context. Its result concerns practice fit, not source correctness. Selecting a related article does not assess or apply a practice.

See the [extension contract](extension-contract.md) for project and export compatibility, [reference practices](reference-practices.md) for source contributions, and [Atlas preservation](atlas-preservation.md) for the retained baseline.
