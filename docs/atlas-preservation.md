# Atlas preservation

Preserved on 2 October 2026. Interface review updated on 3 October 2026. Public case wording reviewed on 5 October 2026.

## The retained baseline

The `atlas/` directory was copied from the original Atlas's static assets. Its source baseline was commit `15ce2048edbd749aaff655c06a673d66533738bc` in the prior local Atlas repository. Its topic corpus, reading experience, styles and graph assets remain the reference baseline, with a link to the project workspace and the taxonomy changes recorded below.

It retains:

1. 105 topics across 10 clusters.
2. All 55 original source references and confidence qualifiers, with the primary LLM Wiki reference added on 3 October for 56 current sources.
3. Existing topic identifiers and browser hash navigation.
4. Reading, 3D map and topic card views.
5. Source library search and links back to topics.
6. Five guided paths, including the reference-to-configuration feasibility study.
7. Light and dark reading themes.
8. Mobile topic browsing and keyboard navigation.
9. The vendored graph library and its original MIT notice.

The old hosting configuration, deployment identity, Git history, credentials, user attachments and research working files are not copied into this new repository.

The existing standalone export script is adapted in `tools/export-atlas.cjs`. It bundles the preserved Atlas into `exports/Workflow Atlas.html` without external asset requests.

## Product migration

The preserved Knowledge Atlas is the reference layer. The Project Atlas shows the current user's configuration and generated decisions. Its editor and artifact preview use the same underlying project model.

Knowledge map opens the full reference Atlas in a dedicated full-viewport workspace view, including its map, reading interface, topic navigation, source library and guided paths. Back to workspace returns to the retained project session. The reference Atlas also remains available at its own served route. Reading a topic does not modify the project or add instructions.

The workspace and embedded reference Atlas share light or dark theme changes within the session. Neither saves that preference to browser storage. Help and the [quick start](quick-start.md) explain the learning and authoring paths. The [accessibility review](accessibility.md) records inspected behavior and open checks.

Existing concepts remain usable as reference material, selectable practices, specialized recipes or examples. Workplace technologies become profiles instead of mandatory defaults.

Standalone offline knowledge reading and exploration are preserved by the exporter. It removes the local workspace navigation link so the standalone file has no broken Build link.

The project workspace separately exports a self-contained readable `PROJECT-ATLAS.html` and includes it in a complete project pack. This artifact explains the user's decisions and embeds the supported configuration for reopening. It is not a complete offline editor or a copy of every Knowledge Atlas topic. Editing continues in the served workspace.

## Generic verification taxonomy

The top-level category previously called Talos practices to reuse is now **Verification and evidence**, with **Verification & evidence** as its short navigation label.

Its six child topics explain generic verification practices first. Named Talos examples retain the reviewed commit, source references and limits. The historical source review inspected files but did not execute repository code or verify deployed behavior.

All 105 topic identifiers, 55 source records, parent and related links, and five guided paths are retained. Internal identifiers such as `talos` and `talos-boundaries` remain compatible with existing links.

## Public example review

The reference-to-configuration feasibility case adapts a supplied study request. Public wording omits internal ticket identifiers, product names and backend labels. It retains the useful question: should an engineer-assisted process become a governed backend service?

The case explains proposed study work. It is not evidence of a deployed integration, measured savings or a completed implementation. Example technologies illustrate the case and are not required by other projects.

Existing topic identifiers, including `construct-study`, remain stable so saved links still work. Public Talos repository references remain attributed where they contributed a reviewed practice.

This content revision does not publish a deployment or push the repository.
