# Reference practices

Review date: 2 October 2026.

Copilot, Agent Skills, MCP and repository practice sources rechecked on 3 October 2026. This checks published documentation, not discovery or task behavior in a Copilot host.

GitHub's custom agent configuration and agent skills pages were rechecked on 5 October 2026 for the beta review. Their documented locations, tool selection rules and JetBrains preview status still support the format notes below. Other reference dates remain unchanged.

These primary references identify the contribution considered and its limits. They do not rank repositories, certify upstream behavior or demonstrate that Atlas packs improve productivity. Selecting guidance does not install an upstream project, activate hooks or provide its runtime.

## Export formats

| Source | Contribution | Limits |
| --- | --- | --- |
| [Agent Skills specification](https://agentskills.io/specification) | Required skill metadata, names matching directories, focused relative resources and progressive disclosure | Reviewed live documentation. `allowed-tools` is experimental. Valid structure does not establish successful task behavior |
| [Copilot custom agent configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration) | Repository profiles use `.github/agents/*.agent.md`. Explicit tools distinguish no tools from selected tools. Documented target values are `vscode` and `github-copilot` | Reviewed live documentation. JetBrains custom agents are listed as public preview. Omitting tools permits all available tools, while `tools: []` disables them. Profiles do not provision integrations or credentials |
| [Copilot agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) | Documents skills in supported IDEs and cloud surfaces, with repository locations including `.github/skills` | Reviewed live documentation. Discovery and behavior require exercise in the intended host. A cloud profile does not make a repository on another host available to the cloud agent |

Atlas keeps its environment selection separate from a generated `target` value. A format adapter emits only its documented fields. A model recorded for evaluation does not imply that every host accepts the same identifier.

## Guidance in the workspace

The Knowledge Atlas holds reference concepts, source statements and reviewed examples. The Project Atlas holds the user's decisions and their recorded basis. Opening reference guidance does not add it to the project or establish that the source fits the task.

Use generic practice names for workflow topics. Keep named repositories in explicit example and source sections, with the reviewed revision and limits. Verification and evidence follows this distinction, retaining Talos as an inspected example rather than a product dependency.

Project facts, proposed practices, decisions, expected checks and supplied observations remain separate. A downloadable project Atlas explains the recorded configuration, it does not independently verify the sources or execute the described workflow.

The public catalogue now keeps source records in `catalogue/sources.json` and claim-to-source links in each topic's `catalog.claims`. A claim identifies the section it concerns and the references that support it. Existing material marked `legacy` retains its earlier wording and references without asserting a new claim-level review. A `reviewed` record applies to its stated contribution, not every recommendation in the topic. See [catalogue authoring](catalogue.md).

## Projects worth learning from

The revisions identify inspected snapshots. They are source revisions, not Atlas definition versions or records of upstream execution.

Generated Ponytail and Spec Kit practice references use these pinned revisions. Format specifications and the LLM Wiki gist use live documentation links, so their content can change after review.

| Reference at reviewed revision | Snapshot | Contribution | Limits |
| --- | --- | --- | --- |
| [Spec Kit process reference](https://github.com/github/spec-kit/blob/4a339209c877a1b68e7a790b2b2269a2b68e461f/README.md#spec-driven-development), [bundle reference](https://github.com/github/spec-kit/blob/4a339209c877a1b68e7a790b2b2269a2b68e461f/docs/reference/bundles.md) | `4a339209c877a1b68e7a790b2b2269a2b68e461f`, 2 October 2026 | Requirements connected to plans and tasks, distinct assessment and bug workflows, composable definitions, previews, versioned ZIP distribution and provenance | Bundles are a distribution and composition layer. Atlas does not export an installable Spec Kit bundle |
| [AgentRC concepts](https://github.com/microsoft/agentrc/blob/daa92160534031186327e3d8b25b11beeda7c021/docs/concepts.md) | `daa92160534031186327e3d8b25b11beeda7c021`, 23 September 2026 | Actual repository analysis, area-scoped instructions and comparison with and without instructions | Its documented evaluation compares implementation-planning responses using a judge model. That is not executed code correctness or team productivity. Atlas does not run AgentRC or adopt its readiness score |
| [APM README](https://github.com/microsoft/apm/blob/7dfc5dd74e2da7cef0e103bddcefa93a703f19e6/README.md) | `7dfc5dd74e2da7cef0e103bddcefa93a703f19e6`, 2 October 2026 | Manifests, locked dependencies, provenance and drift review | Installation policy and runtime permissions are separate. Atlas does not resolve APM dependencies, enforce its policies or emit a verified APM package |
| [Awesome Copilot README](https://github.com/github/awesome-copilot/blob/143a3d976b3c1603cc8932984d5e1f28501cb5fc/README.md) | `143a3d976b3c1603cc8932984d5e1f28501cb5fc`, 1 October 2026 | Search and explanations for agents, instructions, skills, workflows and bundles | Community inclusion does not establish project fit or successful behavior. Atlas does not install the collection or duplicate its marketplace |
| [Superpowers README](https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/README.md) | `8ca22dba9a94f28898bbce59f2537ff4d87c747d`, 25 September 2026 | Focused clarification, planning, debugging, review and verification procedures with handoffs | The full process is opinionated, including mandatory testing practices. Atlas adapts relevant principles without importing every rule or presuming that more agents help |
| [Ponytail portability reference](https://github.com/DietrichGebert/ponytail/blob/e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156/docs/agent-portability.md), [implementation guidance](https://github.com/DietrichGebert/ponytail/blob/e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156/README.md#how-it-works) | `e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156`, 14 September 2026 | Shared behavior with thin host adapters. Reuse and the smallest sufficient implementation with required checks | Instruction-only hosts differ from hosts with hooks and commands. Atlas does not activate Ponytail. Benchmark headlines do not become promises about quality, security or savings |

Spec Kit, AgentRC and APM export adapters remain future work. Their existing capabilities also mean that versioned packs and instruction generation are not unique to Atlas.

### Andrej Karpathy's LLM Wiki

Primary source: [LLM Wiki idea file](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

Primary gist content successfully read on 3 October 2026. This review uses the live gist URL. Its revision-specific fetch was unavailable, so no verified gist revision is claimed.

Contribution: separate original sources from maintained derived knowledge and make ingest, query and maintenance conventions explicit.

Limit: the source is a conceptual gist, not a finished enterprise knowledge service or evidence that maintained pages are automatically correct. Atlas uses the source and derived-claim distinction without requiring a graph database or automatically maintaining a wiki. Review metadata and approval boundaries are Atlas recommendations, not capabilities supplied by the gist.

## Technology profiles

These sources support questions and expected evidence. They do not identify a repository's setup. The current catalogue has 22 technology choices and four profiles: the three specialist profiles below and a generic profile. Selecting a technology is not a claim of specialist coverage or an installed integration.

| Profile | Primary source | Contribution | Limits |
| --- | --- | --- | --- |
| Spring Boot and APIs | [Spring MVC validation](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html), [Spring Boot testing](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html) | Invalid inputs, error responses, controller behavior and isolated web tests versus actual service observations | Live documentation is version-specific. Framework versions, test modules and commands remain supplied facts. Request validation does not establish authorization or domain correctness |
| React and browsers | [React input labels](https://react.dev/reference/react-dom/components/input#providing-a-label-for-an-input), [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing) | Important UI states, labels, keyboard use and browser observations | Automated accessibility tests find only some issues. Manual assessment remains relevant. The profile does not establish that React or Playwright is installed or certify accessibility |
| RDF and SPARQL | [SHACL recommendation](https://www.w3.org/TR/2017/REC-shacl-20170720/) | Distinguish RDF syntax, graph selection, shape conformance and validation results. Record relevant data, shapes and processor | Recommendation dated 20 July 2017. Conformance depends on supplied shapes and does not establish domain truth. Atlas does not execute queries, validate RDF or assume a database has a SHACL processor |

Other technologies use a generic profile until specific guidance is reviewed. No profile supplies a guessed repository command.

## Retrieval example and source scope

The eight-topic retrieval slice connects a capability, a practice, technology examples and a fictional use case. Its source records mark the following contributions reviewed on 5 October 2026. They do not establish performance, project compatibility, credentials or a working connection.

| Source record | Recorded contribution | Scope limit |
| --- | --- | --- |
| [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html), `input-validation` | Structural and business validation, with authorization treated separately | Supports the validation principle. The full retrieval sequence and example are Atlas guidance |
| [PostgreSQL tutorial](https://www.postgresql.org/docs/current/tutorial.html), `postgresql-tutorial` | Relational data and SQL | Does not establish a project's version, query correctness or performance |
| [Amazon Neptune SPARQL access](https://docs.aws.amazon.com/neptune/latest/userguide/access-graph-sparql.html), `neptune-sparql-access` | SPARQL access to RDF data and a pointer to compliance details | Engine-specific behavior needs its own check |
| [Apache Jena Fuseki documentation](https://jena.apache.org/documentation/fuseki2/), `jena-fuseki` | SPARQL query and update protocols | Does not configure a server or grant write access |
| [Neo4j getting started](https://neo4j.com/docs/getting-started/), `neo4j-start` | Property graphs and Cypher | Does not establish equivalence to RDF and SPARQL |

**Add retrieval checks** selects the `validated-retrieval` practice after project review. Its generated guidance asks for an approved interface, scoped inputs, expected results, normal and failure cases, and separate observations. It preserves project steps, actors, tools, facts and evidence. Later writes require their own permissions and confirmation. The fictional example is marked `needs-review`, with no source-backed claim of a completed implementation.

## Backend agent feasibility case

| Primary source | Contribution | Limits |
| --- | --- | --- |
| [MCP tools, revision 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) | Tool inputs, result contracts, validation, access control and execution handling | A protocol schema does not enforce business rules. Typed wrappers remain an alternative to MCP |
| [AWS, safe retries with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) | Questions about repeated requests and uncertain write outcomes | Semantics depend on the operation. A timeout does not establish that persistence failed |
| [Anthropic, building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Evaluate fixed application steps versus useful adaptive tool selection | Vendor engineering guidance, not proof that an architecture improves this feature |

Atlas records requirements and links to implementation and observations. Exporting a limit or control does not enforce it.

## Maintaining source records

For adopted guidance, keep a stable identifier, source URL, review date, known revision, applicability, exact contribution and limitations. Link a claim to supporting evidence rather than treating every source as support for every instruction.

Copying upstream files is a separate decision. Preserve required licenses and notices when material is reused. A reference link does not replace a notice.

Keep format validation, source review, observed behavior and demonstrated improvement distinct.
