# Catalogue authoring

The catalogue supplies the Knowledge Atlas and the instruction factory from versioned JSON in `catalogue/`. Edit those sources, validate them and rebuild the two static projections. The browser reads the generated files without a database service.

Catalogue content is version `2.5.0`. Its authoring schema is `1.2`. Project configuration remains schema `3.0`, with workflow model `1.0`. These versions describe different contracts.

## Current coverage

The catalogue contains 150 topics, 220 source records, 10 browsing clusters, 13 subjects and 12 guided paths. All 135 earlier topics remain. Existing retrieval and specialist examples stay available alongside the feature and API paths.

Fifteen reading topics add repository references and procedures for customer research, business analysis, decisions, repository tasks, context handoffs, document ingestion, evaluation, maintained knowledge, software investigation, public-source access, bounded experiments, typed decisions, scoped development and OpenSpec change specifications. Each procedure declares applicable workflow stages, useful outputs, checks and explicitly illustrative examples. The repository reference page groups 27 repositories or patterns by their contribution. Names are optional sources, not installed integrations or required dependencies.

Workflow step panels offer **Reference workflows for this step**, derived from each procedure's declared stage applicability. Opening a link reads the guide without changing project decisions. Existing stage definitions, skills, technology choices and export behavior remain. These reading procedures are not new selectable practices or automatically exported skills.

The repository reference table links each project name to its upstream repository or idea file. **Reviewed source** opens the exact inspected documentation. The workflow column opens the corresponding Atlas guide and keeps qualifications such as optional, conditional or experimental visible. Search matches names, useful steps and checks. The workflow filter intersects with search, and the result count and clear control make the current selection explicit. Filters remain available when returning from a guide in the same tab. The same table works in the embedded reader and the offline export. External material requires a connection when opened.

The three new subjects are **Repositories and useful workflows**, **Research and business decisions**, and **Knowledge and evaluation**. Four new paths connect research to decisions, investigation to software changes, sources to maintained knowledge, and evaluation to bounded improvement. Source claims were reviewed against scoped primary repository files on 15 October 2026. This does not establish successful use, comparative superiority or complete review of every upstream repository.

Node.js, Python, GitHub Actions, Docker and Repository instructions for agents have dated, scoped claim reviews from 12 October 2026. Corrections include version dependent Node.js and npm behavior, Python environment commands, Docker build checks, GitHub token exceptions and host specific instruction loading. Review does not establish that example commands ran or fit a particular project. The [15 October gap review](knowledge-gap-review.md) appended recommended workflow use, concrete checks and narrowly verified source contributions to 116 entries while preserving original guide text. There are now 78 topics with scoped claim reviews, 70 legacy topics and two still needing review. These badges concern the listed claims, not every earlier assertion, recommendation or implementation.

Six new guides complete the first reference path: Deliver a user-facing feature, JavaScript and TypeScript, React, npm, Vitest and Playwright. They explain project facts to find, a procedure, useful outputs, expected examples and limits. The language guide distinguishes JavaScript runtime behavior from TypeScript checks. Technology guides match their recorded technologies, rather than treating any development stage as a reason to choose that stack.

Four guides add the API and stored data path: Build an API and stored data workflow, Java, Spring Boot API and persistence boundaries, and Maven build and test evidence. PostgreSQL retains its original guide and adds paging, access, transaction and recovery guidance. The neutral path begins with approved interfaces and ordinary code. MCP and a model remain optional. The fictional saved selection separates validation, write authority, bounded correction, uncertain write reconciliation and confirmed completion.

There are 28 technology choices and 16 question profiles, including generic guidance. Seventeen technologies trigger a specialist profile. A choice records a name. A profile adds questions and expected checks to project references in generated skills and to SOURCES.md. Neither establishes installation, compatibility, available credentials or observed behavior. Spring Boot now has a dedicated guide and keeps its original three question meanings and positions. pytest guidance is inside Python, with no separate selectable pytest definition. Gradle and other reported gaps stay visible.

The general procedures for pipeline diagnosis, data and query verification, and source and evidence verification remain proposed guidance awaiting review. Jenkins and country-source pages are visibly scoped examples. RDF/SPARQL verification keeps its data-family guidance, with Neptune execution plans relevant only to Neptune. Broader catalogue review and technology coverage remain unfinished.

In the Knowledge Atlas, search titles, aliases and subject areas, or use **Topic type** to narrow the results. **Browse a subject** groups existing articles across their original clusters. **Take a guided path** includes **Retrieve and check information**. Reading or filtering does not create or edit a project.

### Browse a subject

The home page offers ten subject cards. Choose one to open its topics, or select **Browse a subject** in the topic navigation. On a phone, this opens the Topics dialog. Search and **Topic type** narrow the selected subject further. Choose **All subjects** to remove the subject filter, or clear the filters to return to every topic.

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
| Change an API and stored data | Permitted retrieval, checked results and a separately authorized save | One fictional saved selection, with optional tools and no working API or database connection |

Each subject records its own limits, which appear beside the filtered topics. The displayed count is the number of member articles. It is not a completeness score, a source review or proof of a working integration. Subjects can overlap. They are reading groups, not ordered paths, new map clusters or workflow prerequisites.

Subject membership does not change topic parents, cluster identities, graph positions, published topic links or breadcrumbs. Opening an article keeps the subject filter available for continued reading. It does not change project choices, generated instructions or inference requests. The separate eight-slot maintainer coverage report remains unchanged by grouping articles.

### Explore the 2D map

**Explore the map** opens the new **2D map** by default. **Topic cards** and the preserved **3D map** remain available in both the workspace and standalone Atlas. The 2D map draws 150 reading topics, seven practice definitions and 28 technology definitions. Circles are topics, rounded squares are practices and hexagons are technology names. A topic and its corresponding definition remain separate records.

Use **Find on map** to search all 185 displayed records, independently of the subject and topic filters used for reading. Results distinguish **Guide**, **Practice** and **Technology**. Choose **Show on map** to stay in Explore, bring the node into view and reveal its name above the canvas. Article search remains a separate way to open reading directly. **Browse all map nodes as a list** also includes every displayed record.

Select **Details and connections** beside the selected name to reach its summary, recorded review information, source links and **Connected topics and tools** below the map. The number on that button counts connected items in the enabled connection groups. **Back to map** returns to the selected name. Choosing a connected item selects it and brings its node into view. Choosing an article from the sidebar while exploring also brings that node into view.

Connection summaries describe the relationship in plain words. Expand **Why connected?** for the original direction and relationship name, recorded status, notes and linked sources. A pending relationship is visibly marked **Connection needs review**. The panel states when a relationship has no recorded review status or sources.

**Read topic** opens a guide. A definition with a recorded explanatory article offers **Read explanation**. A recorded link from a guide that uses the definition can offer **Read related guide** instead. A definition without either route says **No guide recorded**. When connections are hidden, **Show all connection groups** reveals them. An isolated name says that no connections are recorded. Atlas does not invent guidance or relationships for it.

Only the selected node's immediate connections are drawn. **Structure** and **Applies** start enabled, and **Reading** starts disabled. Structure contains browsing and part relationships. Applies contains applicability and requirement relationships. Reading contains the remaining relationships between displayed records. Arrows follow the recorded directional relationships, including both directions when applicable. Symmetric `related-reading` and `works-with` relationships have no arrows. These controls filter connections, not the catalogue itself. Source and claim records and other definition types remain in the underlying graph without becoming map shapes.

**Highlight a subject** uses the same subject selection as Topics. It highlights that subject's articles while keeping all nodes available. The subject's coverage limits remain visible. A highlighted article is not a recommendation for the current project.

The generated `catalog.layout2d` record has its own layout `version: 1`, canvas dimensions, node positions, radii and `labelRank`, cluster labels and article counts, and deduplicated connection groups. Each group retains the original directed relationships. `tools/atlas-layout.mjs` computes positions during catalogue compilation, with stable ordering, a radial pull and local separation. Lower label ranks appear earlier as the map is enlarged. Degree, record kind and estimated label overlap set that order. Review status does not.

The ten existing clusters retain their identities, colours and original 3D positions. A linked practice or technology sits with its explanatory article. Unlinked definitions sit in **Factory definitions**. Cluster article counts exclude the cluster's own hub and all definition shapes. They measure recorded articles, not completeness. Layout distance is geometry, not semantic similarity, a source rating or a dependency declaration. Subject selection does not recompute positions.

The browser reads the generated layout and changes the viewport when panning or zooming. Cluster headings wrap at word boundaries and shift into nearby clear space above their groups to separate their measured text blocks from other headings and node shapes. Small guide lines connect shifted headings to their groups. Visible node labels shift vertically to avoid headings. Text keeps its screen size. The numbered phone overview uses a Map key with each cluster name and recorded count, and zooming reveals full headings. These label adjustments do not move nodes or change cluster membership.

The map adds no layout library or inference request. A missing or unsupported layout falls back to Topic cards. Neither map browsing nor the layout projection changes factory definitions, project decisions or generated instructions.

## Browse all knowledge

**All knowledge** opens a table of every catalogue entry, including guides, references, concepts and worked examples. It sits beside **Read**, **Explore** and **Sources**, and uses the same records as the reader and map. Entries are sorted by title. Each row links directly to its guide and shows its type, summary, topic area, declared workflow steps and original sources. Multiple sources expand within the row.

Search matches titles, aliases, guide text, recorded classifications and source titles or publishers. **Workflow step**, **Topic area** and **Source** intersect with search. Topic areas are the ten existing clusters, plus Overview. A source filter selects an exact source record, not every page from the same website. The live count shows the selected entries, and **Clear filters** restores the complete table. Press `/` to focus its search and Escape to clear its filters.

The current 150 entries include 149 with recommended workflow steps and 149 with linked sources. **No recorded step** and **No linked source** retain the local product overview as an explicit exception. That cross-topic entry needs version-specific implementation evidence, rather than a generic external citation or a forced stage. The table does not infer applicability from prose or treat missing metadata as a negative quality judgment. Source-review labels distinguish scoped reviewed claims, earlier claims not rechecked and source review still needed. The exact source options are derived from references actually used by entries. Other records remain accessible in the source library.

Opening a guide and returning with browser Back preserves the table filters. Guide links can also open in a separate tab. The embedded workspace remembers this view when reopened, and browsing leaves project decisions intact. The self-contained export includes the table and filters for offline reading. External source links still need a connection.

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

`atlas/knowledge-index.js` derives the table rows and filter memberships from the compiled catalogue. It does not maintain a separate inventory or write project data.

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

## Schema 1.2, linked reading tables

Table sections retain string `headers` and `rows` for reading, search and retrieval. Optional `cellLinks` provide zero-based `row` and `column`, a visible `label`, and exactly one target: `href` for an HTTPS upstream link, `sourceRef` for an existing source, or `topicId` for an Atlas article. Each source link must also appear in the topic's `refs`. The build rejects missing targets, unsafe URLs and coordinates outside the table.

Optional `tools` declare `searchLabel`, `filterColumn`, `filterLabel` and `itemLabel`. Search covers row text and link labels. The filter uses linked guide IDs in its column, or the plain cell value where there are no links. Both controls affect only the table. Internal links support ordinary browser navigation and offline reading. Link metadata does not add graph relationships or change workflow decisions.

Schema `1.2` adds only these optional presentation fields to `1.1`. Existing records remain valid with the updated version constant.

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

Search matches titles, aliases, applicability, summaries and the full section text without stemming, so an identifier such as `pytest` matches as typed. A topic also indexes the labels and summaries of its linked practice definitions as `practiceTitle` and `practiceSummary`. It does not borrow linked stage descriptions. Match records identify the field that supplied a word. Ordinary words use prefix matching and ignore function words. Recognized short identifiers `CI`, `CD`, `Go`, `R`, `C#`, `C++` and `.NET`, and words in recorded technology or host names and IDs, match exact tokens. For example, `Java` does not expand to `JavaScript`, while an incomplete `pyth` still finds Python. Recognizing an identifier does not create a catalogue entry that is absent.

A proposal combines lexical matches with the project's recorded technologies, stages, recipe and host. It follows definition-to-topic `explained-by` links as well as the existing application and use links. Only omitted stages fall back to the recipe's `has-part` stages. A project's explicit selected stages take precedence, including an empty list. A CLI proposal without `--stage` uses recipe fallback, while supplied `--stage` values limit stage context.

Lexical scores are scaled to the best text match. Recipe and stage support share a maximum of 0.2, direct technology and host support a maximum of 0.4, and related stack support a maximum of 0.1. Unique project seeds prevent repeated facts from increasing a score. These fixed bounds keep generic workflow links from accumulating more weight than the task. They are retrieval heuristics, not fitted quality estimates or probabilities. `scoreParts` reports the components. A `works-with` relation supplies a weaker related-stack signal, not proof that the user chose that technology.

Proposal matching recognizes a limited set of explicit exclusions. It removes recognized exclusion wording from positive matching and suppresses the identified topics. These rules affect proposals. They do not remove an existing project choice or enforce a runtime restriction. A bare restriction such as "No MCP" is recorded separately. It does not remove general API guidance that discusses MCP as optional, or independent practices that do not require it. The exact form "sources are not optional" asserts a requirement rather than excluding sources.

Named omit and exclude requests resolve complete practice names or identifiers through recorded topic-to-practice links. Supported lists use commas, the word and, or both, with an optional "from this pack" or "from this workflow" suffix. For example, "Omit Requirements before implementation, Smallest necessary change and Source backed project wiki from this pack" excludes all three names. No name in the list becomes a positive match. Every target must resolve. A definition without a matching topic link, an unknown name or an ambiguous label can remain unresolved. Alternatives using or, questions and trailing exceptions also pause suggestions. Recognized independent commands and because or since explanations after a comma are processed separately. Other mixed wording can remain unresolved. "Do not remove a wiki" and historical did not statements remain unresolved instead of being treated as instructions to exclude the wiki.

The complete form "Please leave Source backed project wiki out of this pack" uses the same exact name rules. The named scope can be a pack, workflow or instructions, optionally described as exported or generated. A bounded because or since explanation is retained with the sentence but supplies no positive retrieval terms. Explanations containing recognized competing directives or negation remain unresolved. Reported requests such as "The lead says leave Smallest necessary change out of the pack, while the reviewer says it must be included" pause suggestions. So do negated leave-out instructions, questions, unknown names and unsupported compound forms. Atlas does not choose which person's conflicting instruction wins.

Complete passive outcomes such as "Rejected selections are not saved" are recorded as requirements to verify. The finite grammar begins with rejected, invalid, unapproved, unauthorized, unauthorised or failed, followed by a short object name of one to three words. It accepts is not, are not, must not be, should not be, will not be, isn't or aren't followed by saved, stored or persisted. An optional result can use as approved, as accepted or as confirmed followed by another object name of one to three words. For example, "Rejected reservations are not saved as confirmed bookings" and "Invalid vouchers are not stored as approved discounts" fit. This checks word shapes, not whether a noun or business rule is valid. Coordination, exception and negation words inside either object name are rejected. The whole sentence must fit before comma or contrast splitting. Questions, trailing exceptions, destinations and compound outcomes do not fit.

Some complete offline capability forms are also recorded as requirements. Examples include "Inspectors must complete checks without a network connection", "The guide works offline" and "Downloaded instructions remain readable without an internet connection". Supported forms use a positive capability verb and end with offline or without a network or internet connection. Extra conditions, coordination and embedded negation do not fit this grammar. Recognizing an offline capability does not establish a ban on every network operation.

Recognized requirements do not exclude topics, provide positive search words or pause independent practice ideas. The original wording remains in the project and its existing exports. Recognition does not establish that a requirement is satisfied. "Not agreed yet", "We have not agreed on the acceptance examples yet" and bounded statements such as "We have not agreed whether bookings expire automatically" are instead recorded as missing information. They provide no positive match and are not prohibitions. Questions, embedded restrictions, exceptions and unsupported wording can still remain unresolved.

Other unmatched, conditional or ambiguous negation stays visible with the actual clause. Operation restrictions such as "No database writes" or "Do not send personal data", universal wording such as "Selections are not saved", and unsupported conditions remain unresolved because matching an article does not establish which project actions they affect. Leading scope fragments such as "unless", "only if" or "provided that" also remain unresolved. An independent unresolved restriction still pauses selectable practice ideas and their optional JEV assessment, even when a bounded requirement is recognized elsewhere. Useful reading remains available. Keep accurate acceptance text and review a practice manually in the Knowledge map if needed. No restriction or requirement is enforced at runtime. Ordinary search still lets readers find a topic they ruled out. This pattern policy is not general understanding of natural language, exceptions or conflicts across arbitrary sentences.

Workplace examples need their title or ID explicitly named, established context, a named technology or host, or a linked recorded environment. A generic stage or a word such as pipeline does not establish the example's environment. Every result carries the matched words or project facts that led to it, and a source line repeating the recorded review status. The module sends nothing and changes no review status.

Text reasons quote the supplied words, including a typed prefix when it matched a longer topic word. Graph reasons stay separate, so changing a displayed sentence does not change which project facts justify an idea. A legacy topic with no references says "No sources recorded. No claim review recorded." It does not claim that references were retained.

The same module runs from the command line:

```text
node tools/atlas-query.mjs search pull request checks
node tools/atlas-query.mjs get docker
node tools/atlas-query.mjs neighbors stage:implementation
node tools/atlas-query.mjs propose --brief "Add a status filter" --technology nodejs --stage implementation
```

Output is JSON. A result is catalogue text and a deterministic trace. It is not a review of any source and it does not establish that a topic fits a project.

Brief uses `factory/brief-suggestions.mjs` to turn those topic candidates into up to three eligible, unselected practice actions. It checks the actual project's action rules before showing them. Each practice must pass its own local matching rule. A match for a wiki cannot unlock change practices through stage links. With prose present, selected stages constrain eligibility. An empty brief can still use explicit stage choices.

Candidate rules use exact labels, selected title or alias matches, and bounded positive phrases. Software action and object words can support change practices. A request to define requirements or acceptance examples can support the requirements practice. Maintained knowledge and source words can support the wiki. Retrieval, interface and validation words can support retrieval checks. Minimum-change requires a recognized software cue, its exact label or a minimal-change phrase, rather than an isolated adjective such as smallest or necessary. Other lexical gates use corpus frequency thresholds. These are matching heuristics, not confidence scores or proof of the user's intended meaning.

Recognized reading-only and abandoned-plan clauses are filtered from action matching. The software cue rule also skips specific leading uncertainty forms such as "We may build", but this does not resolve every possible future intention or suppress every other lexical match in that sentence. The grammar covers specific wording, not every paraphrase or tense. It can miss relevant ideas or suggest an irrelevant one. A recipe alone does not establish a need for repository instructions, a wiki or retrieval checks. Review the reason and the proposed change before adding a practice.

When wording does not establish software work, Brief can ask the user to identify the task. A confirmed software task supplies minimum-change and specification candidates even without matching vocabulary. A confirmed knowledge task supplies the wiki candidate. **Refine matching** also offers an independent knowledge need, so software work and an ongoing reference can coexist. A one-time or unsure knowledge choice withholds the wiki suggestion. Current stages, exclusions and existing selections still constrain what appears. Other work and an unsure task answer do not supply software candidates. Explicit task choices take priority over the automatic cues for software practices, but cannot override an explicit no-software task scope. A conflicting task choice pauses practices and asks for correction. A conflicting knowledge choice is shown explicitly and withholds the wiki candidate.

Unresolved negative clauses have a separate local review path. The user can classify one exact quoted clause as a requirement, background or a named practice exclusion. Requirements and background supply no positive retrieval terms. A mapped exclusion suppresses its selected practice. Existing named exclusions cannot be overridden through this path. A sentence-first clarification policy recognizes a single attached or leading if, when, unless or until requirement, explicitly time-anchored or past-version negative history and an explicit knowledge-only scope that excludes software inspection and change planning. It keeps the whole sentence before comma splitting. Conditional requirements offer only requirement confirmation. History and supported task scope offer only context confirmation. These answers remove the complete sentence from positive matching, retain its original wording and do not establish that a requirement is satisfied. Scope restrictions remain active after confirmation. Reported instructions, unsupported exceptions, broad operation restrictions and recognized restrictions on inference still require editing the original wording. The parser remains bounded and can miss a paraphrase.

`workflow.intentReview` version 5 records choices, an independent `knowledgeNeed`, source-bound `parts` and an exact snapshot of the description, recipe and recipe answers. Version 1, 2, 3 and 4 records still import unchanged. Explicit edits migrate the container while preserving each untouched statement's policy. A new or reconfirmed clause statement uses policy 3. Earlier generic meanings can use policy 1, supported if/when, dated history and scope meanings can use policy 2. Supported unless/until and past-version clause meanings require policy 3. Every meaning must also pass the current guards. Merely editing a task or knowledge choice never reconfirms an old statement. The local query policy is separate from the JEV inference definitions. A source change makes that record inactive. Stage changes affect eligibility without invalidating its wording. Unsupported or malformed review records fail import validation rather than silently losing their meaning. None of these records enter provider state. Evaluate retrieval before and after scripted clarification separately. Correctness after a supplied answer is not autonomous intent accuracy.

Version 4 introduced an optional sentence organizer. Version 5 adds a policy version to each part. Existing version 4 parts keep policy 1. Explicitly confirming a part writes policy 4. Editing another choice preserves its earlier policy, including saved policy 2 and 3 parts. Handling project input requires policy 2 or later. Each part identifies its source field, sentence index and exact complete text. It splits on whitespace after a full stop, question mark or exclamation mark. Line breaks alone, including blank lines, do not split a part. This preserves line-wrapped conditions but is not a general sentence parser. The roles are task, requirement, context and restriction. Restriction scopes are practices, product behavior, inference, handling project input or unresolved. The older clause statements retain their policies. This new path does not reinterpret them. A new role that conflicts with an applied older clarification is marked for review instead of claiming it took effect. Inherited description answers are shown once. Independently authored duplicate wording stays bound to each original occurrence.

Accepted product rules and background are removed from positive task matching, but retained in the project and exports. Supported simple omission wording can map to several explicitly selected practices. Existing named exclusions and task-scope limits remain active. Mixed directives, conflicts and unsupported conditions remain unresolved rather than accepting a convenient role label. This is still a bounded English grammar, not general language understanding.

Local retrieval and optional assessment have separate pause states. A complete supported restriction on sending text can be scoped explicitly, allowing local ideas without an assessment. Original limits on handling or sending the submitted text cannot be cleared by a requirement, background or task label. Any restriction with unresolved scope pauses the suggestions. These controls are local guidance decisions, not a general permission system for every application request or runtime operation.

Policy 2 supports bounded coordinated product outcomes, dated or past-version facts with a historical noun, a qualified past choice, lists of named omissions, coordinated inference objects and an explicit nonsoftware scope. Independent predicates and commands cannot be discarded as part of these meanings. The supported grammar can still miss natural paraphrases. A short inline card offers only a meaning the local rules support, quotes its exact complete source and requires confirmation. The detailed organizer remains available.

A project-input handling limit can be recorded separately, permitting local matching while withholding optional assessment. This does not approve external storage or make every JEV entry point a permissions system. A broad replacement, rewrite or migration does not receive a minimum-change suggestion solely from its software task classification. A concrete first slice can establish a narrower scope. These are local retrieval rules. The versioned JEV criteria are unchanged.

Run `node tests/browser-clarification-recovery.cjs` for the short questions, known paused cases, broad replacement, policy migration, source editing, actual downloads and reopening.

Part policy 3 composes supported compatible input restrictions across a complete sentence. A covering parse accepts at most four clauses and eight possible conjunctions within 2000 characters. Every clause must match. Copy retention must refer to a preceding recognized input in that sentence or explicitly name its input target. Provider objects joined by or are distinct from alternative actions. Unknown commands, permissions and exceptions keep the complete sentence unresolved. Recognized handling boundaries independently block assessment before confirmation and survive role changes. The source stays whole in the project and exports. This is bounded interpretation, not execution or a guarantee that all paraphrases will be detected. Policy 3 also supports bounded coordinated past predicates, simple shared UI outcomes and named omission lists scoped to the current repair or task. Old parts require explicit reconfirmation for these meanings.

Part policy 4 extends confirmed history to supported past predicates on a named historical component, and to a bounded previous-release decision not to perform coordinated actions. It also supports complete product outcomes sharing a subject and modal, including keeping a title and starting without assignees. Each predicate must fit, and negative initial access does not authorize access. Appended commands, provider instructions and competing current meanings are not discarded as product rules. Saved part policies 1 through 3 keep their previous interpretation until that part is explicitly reconfirmed. Clause statement policy remains 3.

An intact-source exception guard pauses local practice ideas as well as optional assessment when a recognized input or ambiguous broad document-location boundary has an unsupported exception. It runs before role projection and cannot be cleared by relabeling the sentence. A fully supported negative provider fallback ban retains its existing behavior. Ordinary conditional product field behavior is not itself permission to share the submitted brief. The guard cannot recognize every privacy paraphrase. Atlas does not evaluate approval or authorize sharing, and a detailed conditional permission can still require manual workflow planning rather than automatic suggestions.

Current named omissions can use a draft scope and a guidance qualifier on an exact known practice name. A partly recognized omit or exclude list pauses ideas rather than turning the recognized practice into a positive match. Unknown names are not mapped by similarity. Existing saved parts retain their previous omission policy until reconfirmation.

Supported negative provider fallback clauses use a closed failure condition. They do not generalize to arbitrary conditions or positive permission. Input-derived temporary snippets can use the same bounded deletion timing as copies. A provider copy prohibition requires a recognized input binding. A neither/nor transfer prohibition needs at least one explicit input target and only supported artifact nouns for the other target. Unknown targets and appended commands remain unresolved. An exact list of known practice names can use a fronted workflow scope or **plus** between names. These omissions apply before classification. Previously confirmed meanings retain their older interpretation until reviewed. Current confirmation cannot temporarily make an explicitly omitted practice available.

An explicit unresolved deliverable is checked against the intact source before practice matching. Classifying its uncertainty as background cannot make an alternative into selected work. The question asks what to plan now and preserves Not decided yet as a valid answer. While pending, practice offers and their optional assessment pause. After a supported task choice, only explicit task and knowledge choices supply practice intent for that brief. Alternative wording remains available for reading. Independent exclusions, broad-change bounds and stage eligibility still apply. Selecting a task can resolve a supported standalone uncertainty marker, not an appended instruction. These local choices do not become provider state, so JEV can still find the original undecided wording insufficient.

A bounded source conflict check also compares a description starting with an implementation instruction for an existing or current application component against a separate answer that names a sponsor, owner, lead or team cancelling implementation and now requesting a one-time output. It excludes ordinary one-time document tasks and cancellation phrases naming another implementation. It pauses matching until the source text is corrected. Changing task type or labeling that answer as background cannot decide authority between those sources. This is a narrow conflict check, not general contradiction detection.

Run `node tests/browser-compound-intent.cjs` for compound limits, undecided task choices, saved policy 2 reconfirmation, original inference inputs, narrow layouts and actual ZIP, JSON and HTML download reopening.

Run `node tests/browser-compound-regression.cjs` for disclosed follow-up cases involving provider fallback bans, local snippet retention, named omission lists, unapproved alternatives and contradictory answers. These are regression cases, not an independent sample of user success.

Run `node tests/browser-wording-recovery.cjs` for complete historical and product rule confirmation, privacy exception pauses and source correction, historical policy preservation, and actual download reopening. Synthetic transport checks the inference request boundary without calling a provider.

Run `node tests/browser-intent-separation.cjs` for the sentence organizer, scoped restrictions, selected stages, original request payloads, actual downloads and reopening. It uses fictional text and controlled provider responses.

Wiki actions require an established ongoing knowledge need from the user's local choices or the bounded text rule. A topic title word alone is insufficient. Supported maintained handbook and reference wording can retrieve the same practice without calling it a wiki. One-time output and reading cues do not establish that need. Topic search and related reading remain separate from this action gate.

Related reading stays separate. With prose present, reading needs specific wording in the title, aliases, applicability or summary, or a direct recorded technology or host link. Incidental section words and recipe links alone do not justify it. The displayed reason identifies that support. With no prose, recorded workflow facts can still offer reading.

### Check the surfaced suggestions

`docs/jev/retrieval-cases.json` records 15 fictional labeled cases for the final surfaced actions. Run them with:

```text
node --test tests/brief-suggestions.test.mjs
```

The runner prints two numbers. Expected practice hit at three counts cases where at least one expected practice appears among the final suggestions, divided by cases with a nonempty expected set. It does not require every expected practice to appear. Excluded practice suggested counts cases where any excluded practice appears, divided by cases with an excluded set. The two empty-expected cases test abstention separately.

These measurements follow project eligibility, current selections and the final match policy. They are engineering checks on authored cases, not a general accuracy, usability, source-correctness or JEV claim. A later catalogue or matching change can alter the results. Use `npm test` for the complete unit suite.

Run `node tests/browser-ranking-exclusions.cjs` for the integrated user journey. It checks API reading, MCP and unresolved restrictions, conditional acceptance and recovery after editing, selected stage removal, an explicit synthetic assessment, actual blueprint and full pack ZIP downloads and exact project reopening, and desktop and narrow layouts in both themes. It uses fictional inputs and a fake provider, not live JEV or an independent human study. This check also runs in `npm run test:browser`.

Run `node tests/browser-intent-clarification.cjs` for task and sentence questions, exclusion selection, edits that invalidate old choices, stage limits, original inference text, and ZIP, project JSON and HTML reopening. It includes conditional rules, dated history, knowledge-only scope, a conflicting task, legacy reconfirmation, a standalone skill download and narrow layouts in both themes. The requests are synthetic. This suite is included in `npm run test:browser`.

## Read the coverage report

Run npm run check:catalogue to check the projections and print the maintainer report. catalogue/coverage.json is not served and never enters an inference request. Its 51 requested slot entries are a selected backlog, not a complete technology directory or 51 unique products.

| Dimension | What the report establishes | What it does not establish |
| --- | --- | --- |
| Structure | Covered, thin, named only, topic only or missing under the original record rules | Quality, completeness or project fit |
| Reading | Linked topics, explicitly recorded indirect guidance or no guide | Independent support for a name mentioned inside another guide |
| Task guidance | Recorded task, existing procedure and output sections, scope and any worked example sections | That the proposed procedure succeeds for a real user |
| Review | Each related topic's status, review date and number of scoped claims | Whole article certification or verified compatibility |
| Factory effect | Relevant question profile IDs or an available host export target | Installed tools, working connections, execution or successful host use |

Covered still means a name and related topic plus a technology profile, or a supported host record. Thin means a technology name and related topic without a profile. Named only and topic only identify a record without its other side. Missing means neither is directly present. Indirect reading does not silently promote a missing technology to covered. pytest therefore reports missing structurally while showing Python as indirect reading. Spring Boot now reports covered because its question profile has a dedicated guide. That state still does not establish installation or compatibility. A shared host article does not become three complete host adoption guides.

Task metadata explicitly names the section labels. The report rejects nonexistent sections, unknown topics, duplicate entries and unsupported fields. It cannot judge the quality of the prose or whether an external source supports a claim. Recommendations and fictional expected results stay distinct from the factual claims and actual observations. There is no combined completeness score.

### Try the feature reference path

1. In Knowledge map, choose Change a user facing feature under Browse a subject, or under Take a guided path for ordered reading. Start with Deliver a user-facing feature. Reading does not select its stack.
2. In Brief, open Browse examples and choose Feature delivery. Atlas opens the editable Request list status filter example in Workflow. Return to Brief to inspect its outcome and acceptance examples.
3. In Project details, replace the example stack as needed. Supply real component paths, versions, scripts and sources from the target repository. Missing values deliberately keep the export a draft.
4. Read the questions for the selected stack. They distinguish static checks, rule fixtures, simulated rendering, actual browser interaction and delivery gates. Record decisions and keep unresolved questions visible.
5. In Workflow, review the stage notes and planned checks. Expected examples are proposals, not approved requirements or test results.
6. Preview files, then Download. The blueprint includes the proposed workflow and templates. A full pack also includes selected skills, agent profiles and their project references. Inspect WORKFLOW.md, templates/REQUIREMENTS.md and the verification files. Keep evidence empty until someone performs and records a check.
7. Open the downloaded pack to continue. Reading the map must leave the recorded project unchanged.

The optional reference stack is React, TypeScript, Node.js, npm, Vitest, Playwright and GitHub Actions. It is an example path, not a technology recommendation for every team. The app does not implement the status filter or run its tests.

### Try the API and stored data reference path

1. In Knowledge map, choose Change an API and stored data as a subject or guided path. Start with Build an API and stored data workflow. Reading does not select tools or change the project.
2. In Brief, open Browse examples and choose Change an API and stored data. The fictional Saved topic review selection opens with a development recipe and a connected application process.
3. Inspect the outcome and acceptance examples in Brief. This example requires a saved selection. For a read-only task, change the intended outcome and remove persistence and its write gates together. Do not leave a requested save silently unfinished.
4. Replace the optional stack and answer its project questions. Supply the real contracts, permissions, versions, paths and commands. Existing Spring Boot answers retain their original question positions.
5. In Workflow, inspect the application process. It checks a selection, returns corrections to the same check, requires separate save authority and reconciles an uncertain save without repeating it. Two correction attempts are a proposed editable limit. Empty and partial retrieval stop for clarification in this example. Review and apply process edits before downloading.
6. Preview WORKFLOW.md, templates/REQUIREMENTS.md, templates/DECISION.md, templates/CONTRACTS.md and templates/EVALUATION.md. Result structures, checks, approval and routes are supplied design. Unknown fields remain unresolved and planned cases stay NOT RUN. The full pack also includes selected development skills and profiles. Application actors do not become development profiles.
7. Download a blueprint or full pack, then use Open pack to continue from that download. Atlas does not perform the API call, save data, install MCP, implement an agent or establish that the proposed workflow succeeds.

The optional reference stack is Java, Spring Boot, Maven, PostgreSQL and Docker. Any approved interface and suitable technology can use the neutral design. Contracts are included for every recorded custom application process, independently of the older runtime design toggle.

## Project and inference boundaries

The generated `factory/catalog.mjs` exports the existing `CATALOG` API, including action definitions and per-definition revision metadata. The factory uses it for selection, validation, previews and instruction generation. `atlas/data.js` contains the reading, search, map, source and collection projections. Edit the JSON sources instead of either generated file.

Seven topics offer project actions when applicable. **Repository instructions for agents** offers **Keep repository instructions for agents**, which records the practice that the full pack's `AGENTS.md` already follows. **Retrieve and validate** offers **Add retrieval checks** through **Review for my workflow**. Review the proposed files before applying. That action selects `validated-retrieval`. It does not add steps, roles, tools, facts or observations. Downloads include its written guidance and source. Undo can reverse the project edit.

Projects, imported files and snapshots remain in memory. Explicit download and upload keep user-owned work. The public catalogue does not provide project storage. Historical export manifests retain selected definition contents, versions, sources, applicability and limits for comparison with current guidance. A newer catalogue version does not silently establish a new review of older definitions.

JEV's inference definitions and digest remain separate from retrieval. Shared questions and the specification and wiki profiles retain v8. Minimum-change has its own v9 profile, with the original v8 module retained. Its supported recipe, question and practice sets come from that inference contract. New catalogue recipes and questions remain manually usable. Additional question answers are excluded from inference requests until the profile deliberately supports them. Changing inference meaning requires a versioned contract change and evaluation, not just a catalogue edit.

Catalogue retrieval runs in the browser. Atlas does not automatically add catalogue summaries, node digests, topic bodies or the search index to an inference request. User context remains user supplied, including any text the user chooses to paste. An explicit JEV assessment uses only the existing supported practice question path and user context. Its result concerns practice fit, not source correctness. Selecting a related article does not assess or apply a practice.

See the [extension contract](extension-contract.md) for project and export compatibility, [reference practices](reference-practices.md) for source contributions, and [Atlas preservation](atlas-preservation.md) for the retained baseline.
