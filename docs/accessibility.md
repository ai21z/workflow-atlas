# Accessibility review

Review date: 3 October 2026.

## Beta interface review, 5 October 2026

The workspace, Knowledge map, both guide readers and downloaded project Atlas now use a visible Dark mode switch. Its accessible name stays the same, `aria-checked` reports the state, and Space changes the theme while keeping focus. This follows the [WAI switch pattern](https://www.w3.org/WAI/ARIA/apg/patterns/switch/).

The in-app Chromium review checked the start page, Workflow, Files, Knowledge map, guide home and JEV connection guide at 320, 768 and 1440 CSS pixels in both themes. Those 36 verified combinations had no horizontal document overflow. The guide outline starts collapsed at compact widths so it does not push the introduction below a long section list. Topic search and returning from the map remained available.

Separately, nine actual offline project exports, covering all three recipes and output choices, passed 54 width and theme combinations. Each combination exercised the four viewer perspectives. No page errors, remote requests or horizontal document overflow were observed in that export check.

These are functional and visual browser checks. They do not establish screen reader compatibility, real touch-device behavior, browser zoom equivalence, measured human comprehension or WCAG conformance. The earlier observations and remaining checks below still apply. Owner-local screenshots and dimension records are retained in `local-knowledge/reviews/beta-polish-2026-10-05/`, and export observations in `local-knowledge/retests/artifact-beta/`.

[WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level AA is the review baseline. This document records inspected behavior, required checks and open evidence. It does not declare conformance.

The simplified start screen and Workflow/Files authoring interface were exercised in the local in-app Chromium browser on 3 October 2026. Current observations are separated from the earlier interface checks below. Neither set establishes complete accessibility conformance.

## Simplified interface observations

The current exercise used 1440 by 1000 px and 320 by 800 px viewports. It used synthetic project data and the actual interface. Screenshots are in the ignored `exports/browser-qa-v5/` directory.

| Journey | Observed result | Limit |
| --- | --- | --- |
| Start and templates | Fresh sessions showed no fictional project or Download. All three templates opened with blank name and purpose. A worked example was loaded deliberately and labeled fictional | This does not establish first-time user comprehension |
| Assignment | Responsibility changed to a named person. A skill was attached through a checkbox and through Enter on a palette item followed by Enter on a stage | Touch devices and the revised drag route were not exercised |
| Stage decisions | The selected panel exposed inclusion, responsibility and instructions. Excluded stages stayed selectable and could be enabled again | Every combination of excluded stages was not exercised |
| Evidence and details | Planned evidence retained a blank observed outcome. Reassigning its stage immediately moved the panel and focus. Components, global source records and optional runtime controls were reachable through Project details | Recorded data remains supplied assertions |
| Findings | A missing prerequisite finding opened the dependent stage and focused its input. A required component field had a visible error, `aria-invalid` and an associated description. Correcting it removed the error | A screen reader was not used to verify announcement |
| History and replacement | Undo and redo retained edits. Undo after a recipe change with a newer stage open returned to Brief without an error. Canceling replacement retained the current draft | This is a bounded history exercise |
| Knowledge and return | The map occupied the full 1440 px viewport. Returning restored the empty Start screen or the active stage. Browser Back restored the same unsaved note, selection and focus | Every route and focus combination was not exercised |
| Narrow reflow | Start, Workflow, Files, stage panel and Help had no horizontal document overflow at 320 CSS px. Light and dark layouts were inspected. The header was adjusted after finding cramped controls | This is CSS viewport reflow, not observed 400% browser zoom or 200% text enlargement |
| Modal focus | The narrow panel had a dialog name and modal state. Main content and header were inert. Shift+Tab from Close wrapped to the last connected-file control. Escape closed the panel and returned focus to its stage | Full keyboard traversal and assistive technology remain open |
| Help | Opening focused the heading. Escape closed it and returned focus to Help | Other dialog combinations still need a complete audit |
| Files and downloads | Exact workflow text contained the supplied responsibility and note. Search showed a no-results message. JSON, draft ZIP, project HTML, standalone skill, unchanged opened files and reviewed files reached disk | The browser download event API timed out. Disk presence and file contents were checked separately |
| Reopening and edited files | JSON, ZIP, project HTML and an Atlas metadata folder reopened. Malformed input retained the draft. Unchanged-file download preserved every supplied path and content. Reviewed export retained an external Markdown edit and custom text file and rebuilt its viewer | The reviewed instructions were not executed in Copilot |
| Exported reading view | The downloaded Project Atlas was served locally and inspected in both themes. At 320 px it had no horizontal document overflow. Its Sections control opened, navigated to Workflow and collapsed | This does not establish every file URL, offline browser or exported content combination |
| Selected theme tokens | Opaque main text, muted text and accent token pairs against background, paper and soft surfaces measured at least 8.26:1 in dark and 6.46:1 in light. Form-border tokens against background and paper measured at least 4.32:1 and 3.64:1 respectively | These source-token calculations do not cover opacity, every component, the graph, focus state or an entire rendered page |

The browser regression script was updated to the new journey and syntax checked. It was not executed through a separate Playwright runner during this review. Compiler, archive, maintenance and portable-project checks passed. The standalone reference Atlas was rebuilt.

The subsequent audit corrected focus loss after deleting a fact or evidence record. At the default desktop width, deleting the final check returned to Add acceptance check. At 320 CSS px, deleting a newer check returned to the remaining record summary. Shift+Tab from Close wrapped to the last connected-file button, and Escape returned to Project details. The inspected evidence panel had a named modal, inert background and no document overflow in the narrow layout. Distinct skill context was also verified in changed-file labels and accessible names. Screenshots and downloaded-file observations are in ignored `exports/audit-v6/`. No screen-reader, forced-colors or true zoom result is claimed by this follow-up.

The initial screen defers secondary configuration while keeping the main task and Knowledge map visible. This applies [progressive disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/). Its effectiveness still needs observation with another engineer.

## Historical implementation inspection

| Area | Evidence and limit |
| --- | --- |
| Controls and labels | Source includes native buttons, labeled fields, named dialogs, iframe titles and skip links. This does not establish their behavior with every input method |
| Assignment alternatives | Source provides click controls and detailed settings for actor and skill assignment. Dragging is not the only authoring route |
| Reference alternatives | Reading, topic navigation, cards and sources remain available alongside the 3D map |
| Focus styling | Styles define visible focus indicators. Visibility and contrast in every theme and state still need measurement |
| Motion preferences | Styles include reduced-motion rules. Graph source handles initial and live preferences, disables damping for reduced motion, starts with rotation off and retains a focused topic label. A separate Atlas browser exercise checked dynamic reduced motion on 3 October |
| Mobile layout | A 320 by 800 px Chromium workspace exercise checked Overview, workflow editing, Artifacts and Help without horizontal document overflow on 3 October. This is bounded viewport evidence, not a complete reflow audit |

Source inspection establishes that an implementation exists. A recorded browser exercise establishes only the interactions and environment exercised.

## Recorded browser observations before simplification

The local in-app Chromium review on 3 October 2026 used 320 by 800 px and 1440 by 1000 px viewports. Light and dark workspace views were manually inspected.

| Journey | Observed result | Limit |
| --- | --- | --- |
| Narrow workspace | Overview, workflow editing, Artifacts and Help had no horizontal document overflow at 320 px | This does not cover every field, long imported value, text enlargement or browser zoom |
| Help | Opening focused its heading. Escape closed the dialog | A complete screen-reader and keyboard traversal remains open |
| Narrow stage inspector | The inspector was a named dialog with the main area and header inert. Shift+Tab from Close cycled to the last Read related guidance control | This checks one focus wrap, not every modal state or all focus transitions |
| Project to knowledge and back | A stage note survived opening Knowledge map, changing the embedded theme and returning with Escape. The note appeared in `WORKFLOW.md` | This does not establish every editing, import or history combination |
| Full viewport knowledge | At 1440 by 1000 px, Knowledge map occupied the browser viewport without the factory sidebar or an outer dialog frame. Return and Escape restored the workspace | Browser chrome remains outside the application |
| Focus return | Closing a stage editor returned focus to its stage button. Escape did the same. Project tools remained available at 1024 px | Other combinations still require a complete keyboard audit |
| Artifact search | At 320 px, a missing filename produced a visible no-results message. The skip link targeted the artifact region | Large imported packs were not part of this exercise |
| Portable project | A newly generated project ZIP reopened through the local file chooser. The generated HTML was viewed in both themes. At 320 px its compact Sections control opened, navigated and collapsed, with no document overflow | The HTML was served locally for this exercise. This does not establish all file URL or browser download-manager behavior |
| Selected project color pairs | Reviewed semantic color pairs measured at least 6.34:1 in dark and 6.03:1 in light | These measurements cover selected project-view pairs, not every rendered text, border, focus cue or graph state |

A separate Knowledge Atlas browser exercise checked selection of all 105 topics, the 55-source library, the study guided path, focus behavior, parent-message validation, dynamic reduced motion and the 320 px mobile view. The rebuilt standalone reference Atlas loaded WebGL with zero HTTP requests in its offline exercise. These results cover the exercised paths, they do not establish complete keyboard, contrast or assistive-technology coverage.

The original research snapshot remains 2 October 2026. The bounded primary-source follow-up on 3 October is recorded in `reference-practices.md`. Interface observations alone do not refresh source claims.

## Baseline to verify

| Area | Acceptance check | Primary guidance |
| --- | --- | --- |
| Keyboard | Complete start, stage edit, Files, Project details, Help, knowledge and Download without a pointer. Exercise a deliberate example and reopened pack too. No control depends only on hover | [Keyboard accessibility](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) |
| Visible focus | Keep a visible indicator on the focused control, including map labels and dynamically updated regions | [Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) |
| Focus obstruction | Sticky headers, inspectors and overlays must not entirely hide the focused control. Prefer keeping it fully visible | [Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) |
| Dialogs | Focus enters the named dialog, Tab stays inside, Escape closes it, and closing returns focus to a suitable opener. Long help should begin at a readable heading | [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) |
| Reading and reflow | Verify non-excepted content at 320 CSS px, or 1280 px at 400% zoom. A map's two-dimensional exception does not extend to surrounding forms and help text | [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) |
| Text contrast | Measure at least 4.5:1 for ordinary text and 3:1 for WCAG-defined large text, including muted labels and findings in both themes | [Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) |
| Controls and graphics | Required authored control states and meaningful graphic parts need 3:1 against adjacent colors. Check focus, selection and assignment cues | [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) |
| Drag alternatives | Each drag action needs a single-pointer route without dragging, as well as the separate keyboard requirement | [Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) |
| Pointer targets | Check 24 by 24 CSS px or the criterion's defined exceptions. Prefer larger controls for common actions | [Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) |

These summaries do not replace the full criteria, including their exceptions. WCAG Understanding documents explain the normative requirements. WAI's dialog pattern gives implementation guidance.

Reduced motion is also part of the product baseline. Verify that unnecessary camera transitions, inertia and other movement can be avoided. [Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) is Level AAA, it is not an AA criterion.

## Plain language and useful help

Organize help around the task someone wants to complete, such as change an owner or keep edited files. Define owner, skill, agent profile and evidence once. Use the actual control labels and short steps rather than internal schema names. This applies [GOV.UK user-needs guidance](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/plan-manage-content/identify-user-needs/).

Explain specialist terms when needed, use active verbs and remove wording that does not help the next decision. These are adaptations of [GOV.UK clear-language guidance](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/), not a claim that Atlas has been evaluated by GOV.UK.

Help must remain available without changing the project. Keep knowledge exploration, project decisions and generated instructions visibly distinct.

## Planned verification

The middle-priority follow-up inspected the decision brief, semantic review and updated-guidance dialog at 320 CSS px. The exercised states had no horizontal document overflow. Native dialog entry, explicit Tab and Shift+Tab wrapping, cancel and Escape return were observed. The light and dark workspace states were inspected. The actual exported HTML rendered the same brief with technical disclosures collapsed. This is bounded browser evidence, it does not replace the checks below. Screenshots and synthetic fixtures are in ignored `exports/audit-mid/`.

1. Exercise the fresh start, all three recipes, stage edit, Files, Project details and Download keyboard journeys. Check focus entry and return for Help, project dialogs and the full-viewport Knowledge view from empty and active sessions.
2. Extend the 320 px check to long findings and supplied values, and exercise 200% text enlargement and 400% browser zoom with the inspector open.
3. Measure text, control, selection and focus contrast across light and dark states.
4. Exercise pointer alternatives, touch targets and keyboard assignments against the same expected project changes, without requiring an editing mode.
5. Extend recorded reduced-motion observations across the workspace and exports. Exercise Windows forced-colors behavior.
6. Exercise names, headings, state changes, errors and dialog navigation with a screen reader.
7. Check the readable project HTML and standalone reference Atlas separately from the served workspace.

Record the exact build, browser, viewport or zoom, input method, assistive technology where used, expected result and observed result. A single screenshot or automated scan does not cover this scope.

## Unknown in this review

Complete WCAG conformance, comprehensive rendered contrast results, screen-reader behavior, forced-colors behavior, 200% text enlargement, 400% zoom and broad device coverage are not established here. The browser zoom shortcut did not produce an observable zoom change in this environment. Current and historical observations establish only their exercised paths and states.

Generated profiles, source citations and local UI checks do not establish consumer-host discovery, task correctness or improved team productivity.
