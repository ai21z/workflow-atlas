# Atlas preservation

Preserved on 2 October 2026. Interface review updated on 3 October 2026. Public case wording reviewed on 5 October 2026. Focused skills taxonomy updated on 6 October 2026. Subject navigation and the 2D map added on 11 October 2026.

## The retained baseline

The `atlas/` directory was copied from the original Atlas's static assets. Its source baseline was commit `15ce2048edbd749aaff655c06a673d66533738bc` in the prior local Atlas repository. Its topic corpus, reading experience, styles and graph assets remain the reference baseline, with a link to the project workspace and the taxonomy changes recorded below.

It retains:

1. All 105 original topics and the four later general guidance topics. Eight retrieval topics and three general procedure entries brought the catalogue to 120 across the same 10 clusters. Five later topics bring the current total to 125.
2. All 55 original source references and confidence qualifiers, plus the later LLM Wiki reference. The combined catalogue had 72 source records at the retrieval update. It now has 137 records, including the later technology references. More records do not imply a new factual review of earlier material.
3. Existing topic identifiers and browser hash navigation.
4. Reading, 3D map and topic card views, alongside the new 2D map.
5. Source library search and links back to topics.
6. All five earlier guided paths, including the reference-to-configuration feasibility study, plus Retrieve and check information.
7. Light and dark reading themes.
8. Mobile topic browsing and keyboard navigation.
9. The vendored graph library and its original MIT notice.

The old hosting configuration, deployment identity, Git history, credentials, user attachments and research working files are not copied into this new repository.

The existing standalone export script is adapted in `tools/export-atlas.cjs`. It bundles the preserved Atlas into `exports/Workflow Atlas.html` without external asset requests.

## Product migration

The preserved Knowledge Atlas is the reference layer. The Project Atlas shows the current user's configuration and generated decisions. Its editor and artifact preview use the same underlying project model.

Knowledge map is a permanent destination alongside Brief and Workflow. It opens the full reference Atlas in the shared workspace, including its map, reading interface, topic navigation, source library and guided paths. Switching back returns to the retained project session. The embedded reader avoids duplicate workspace branding and theme controls. The reference Atlas remains available independently at its own served route. Reading a topic does not modify the project or add instructions.

The workspace and embedded reference Atlas share light or dark theme changes within the session. Neither saves that preference to browser storage. Help and the [quick start](quick-start.md) explain the learning and authoring paths. The [accessibility review](accessibility.md) records inspected behavior and open checks.

Existing concepts remain usable as reference material, selectable practices, specialized recipes or examples. Workplace technologies become profiles instead of mandatory defaults.

Standalone offline knowledge reading and exploration are preserved by the exporter. It removes the local workspace navigation link so the standalone file has no broken Build link.

The project workspace separately exports a self-contained readable `PROJECT-ATLAS.html` and includes it in a complete project pack. This artifact explains the user's decisions and embeds the supported configuration for reopening. It is not a complete offline editor or a copy of every Knowledge Atlas topic. Editing continues in the served workspace.

## Generic verification taxonomy

The top-level category previously called Talos practices to reuse is now **Verification and evidence**, with **Verification & evidence** as its short navigation label.

Its six child topics explain generic verification practices first. Named Talos examples retain the reviewed commit, source references and limits. The historical source review inspected files but did not execute repository code or verify deployed behavior.

All 105 original topic identifiers, original source records, related reading and five guided paths remain. Internal identifiers such as `talos` and `talos-boundaries` remain compatible with existing links. The 6 October skills update changes three browsing parents to place specialized material under general procedures, as described below. Published topic URLs remain stable.

## Reusable guidance update

The 5 October 2026 knowledge update adds Reusable workflow patterns, Architecture decisions, Break work into deliverable changes, and Release and operate. The overview leads with reusable guidance and keeps the configuration study available as a worked example.

Architecture, Breakdown and Release and operations now open topics that cover those activities. The existing controller, traceability and pilot topics remain available with their original identifiers. Related reading from the feature recipe uses the new general topics.

Generic instructions now distinguish applicable requirements from example tools, repositories, graph data and domain review. Correction guidance explains candidate results, checks, feedback, limits, approval and stopping outcomes. The document example is a learning case, not a newly supported JEV intent.

This update changes reference content and reading destinations. It does not add configurable branches, correction loops or execution to the Factory.

Checks at that update confirmed preservation of all original topic IDs, parent links, related links and source associations. The standalone export matched its then-current topic data and opened reading, search, sources, topic cards and the 3D map without HTTP asset requests in Chrome. The later targeted browsing changes below are deliberate exceptions to original-parent preservation.

The served reading view was exercised at 1440, 390 and 320 CSS pixels. All six lifecycle destinations, the pattern entry, search, topic cards and theme switching worked without captured page errors or horizontal page overflow. Feature-stage guidance returned to the retained notes. The header theme label was corrected and its normal and hover text contrast checked in both themes. These are bounded implementation observations, not a human comprehension study or a full accessibility assessment.

## Public example review

The reference-to-configuration feasibility case adapts a supplied study request. Public wording omits internal ticket identifiers, product names and backend labels. It retains the useful question: should an engineer-assisted process become a governed backend service?

The case explains proposed study work. It is not evidence of a deployed integration, measured savings or a completed implementation. Example technologies illustrate the case and are not required by other projects.

Existing topic identifiers, including `construct-study`, remain stable so saved links still work. Public Talos repository references remain attributed where they contributed a reviewed practice.

The Atlas content is included in the public static site. Reading it does not execute workflows or change project decisions.

## Catalogue migration

Catalogue version `2.1.0` moves authored content into `catalogue/` JSON records. `atlas/data.js` and `factory/catalog.mjs` are generated from those records. Existing topic IDs, browsing connections, source associations and collections remain the compatibility baseline. Source records, typed relationships and action mappings have shared validation. The [catalogue guide](catalogue.md) documents the source files and build commands.

Topics now declare their kind, applicability, limits, aliases and source-review scope. Those fields help reading and search. Metadata marked `legacy` records the migration of earlier material, not a new factual review. The new retrieval topics illustrate capability, practice, technology and example records without claiming complete technology coverage.

The catalogue migration changes authoring and generated reference data. User projects remain in memory with explicit download and upload. Reading topics, searching by type and following a collection do not change a project. A supported practice action still requires review before applying its proposed project edit. JEV's frozen inference profile and its retained evidence remain separate from catalogue growth.

## Focused skills taxonomy

The Skills and agent roles cluster adds general reading procedures for pipeline diagnosis, source and evidence verification, and data and query verification. They explain the common task before specialized material.

The stable `ci-skill` topic becomes **Jenkins diagnosis example**, `source-skill` becomes **Country-source review example**, and `rdf-skill` becomes **RDF/SPARQL verification procedure**. Their browsing parents change to the relevant general procedure. Their original identifiers, source references and related reading remain available.

Neptune execution-plan guidance now applies only to Neptune deployments. SQL, RDF/SPARQL and property graphs retain distinct semantics and verification needs. Generic reading does not imply that their queries or tools are interchangeable.

The three new general procedures are marked as proposed guidance needing review. No new factual source-review date, export adapter or actionable skill mapping is established by this change. This is a focused content pass, not a complete rewrite or verification of the catalogue.

## Subject navigation

The 11 October 2026 update adds four reading groups across existing clusters: CI and pipelines, Containers, Access and action controls, and Workflow measurements. The optional `subjects` records in `catalogue/navigation.json` carry their summaries, limits and explicit topic membership. A topic can appear in more than one subject without moving.

Home cards and **Browse a subject** in Topics open the same filtered list. Search and topic type intersect with that selection. Opening a topic retains the subject for continued reading, while its published hash, breadcrumbs and original parent remain unchanged. **All subjects** restores browsing across subjects. The existing 3D map, its cluster positions, ten clusters, 125 topics and six guided paths stay available. Subject navigation itself does not introduce or replace a map renderer.

Subjects describe the available articles, not a complete technology directory. Containers currently contains Docker only. Access and action controls is not a full security review. Workflow measurements is not full observability coverage. The eight-slot maintainer coverage report and recorded source statuses keep their own meaning. Reading a subject does not change project decisions, practice matching or inference requests. The same subject controls are part of standalone knowledge reading and its offline export.

## 2D map

The later map update adds an SVG **2D map** as the default exploration view. **Topic cards** and **3D map** stay beside it in the workspace and standalone Atlas. The Three.js scene, original cluster positions, camera controls, library and MIT notice remain. The SVG renderer uses generated geometry and no browser layout dependency.

All 125 topics retain their published identifiers, parents, breadcrumbs and source records. Seven practice definitions and 24 technology definitions add separate shapes to the 2D map. Linked definitions sit in their explanatory article's cluster. Unlinked definitions use a separate **Factory definitions** area. Existing graph relationships remain intact. The new layout groups reciprocal connections for drawing while retaining their directed predicates and metadata.

**Highlight a subject** shares the Topics selection without hiding the rest of the graph or rearranging its clusters. Article counts and subject limits retain their original meanings. Positions, proximity, shape size and label prominence do not establish source quality, applicability or complete coverage. The selected node panel reports recorded review information and source counts separately.

**Find on map** searches every displayed guide, practice and technology independently of the reading filters. Selection stays in Explore and reveals the selected name above the canvas. **Details and connections** reaches the panel below, with **Back to map** for the return. **Connected topics and tools** offers named controls and plain connection meanings. **Why connected?** exposes the recorded relationship, review status, notes and sources. Pending links remain visibly flagged. Reading routes use recorded explanation or definition links, with no invented route for isolated names. Arrows follow directional relationships, while symmetric reading and stack links remain undirected.

The map offers background dragging, zoom controls and **Fit map**. With keyboard focus in the map, arrows pan, Home fits, and plus and minus zoom. Browser modifier shortcuts remain available. Enter or Space selects a focused node, and Escape moves focus to the selected record panel. Choosing a sidebar article while exploring brings its node into view. Structure and Applies connections start enabled. Reading connections can be enabled separately. Topic reading, search, sources, guided paths and cards remain alternative ways to navigate.

The standalone exporter now inlines the 2D renderer and its stylesheet alongside the existing data and 3D assets. This does not change the separate Project Atlas artifact into a copy of the Knowledge Atlas. Older or malformed layout data falls back to cards. No workflow runs and no catalogue text is added to inference requests by this map.

These controls support browser verification. Independent human comprehension, screen reader use and Firefox behavior remain separate checks, not established by the implementation alone.
