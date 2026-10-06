# Workflow model

Implemented locally on 5 October 2026. Project schema `3.0`, workflow model `1.0`, pattern definitions `1.0` and exporter `3.1.0`.

The model records what needs to happen, what passes between steps and where each outcome leads. It describes work. It does not run it.

## What this slice provides

Projects can retain their existing development recipe and carry explicit development, application or manual processes. Input relationships and outcome routes have different meanings. Checks, approval authority, correction limits and evidence references are named records.

Explicit processes appear in Workflow, the downloaded Project Atlas and `WORKFLOW.md`. Their configuration survives JSON, ZIP, folder and project HTML reopening. The process designer edits their steps, inputs, outcomes, checks and correction rules through labelled controls beside a map or step list.

Custom instruction selections now drive skill generation. Selected development or manual agent profiles receive their matching step assignments. Application agents remain runtime design choices. Planned evaluation cases cover declared outcomes, correction exhaustion and checks or approval after a candidate changes. Nothing in this process executes a step or proves that its expected result occurred.

## Edit a connected process

From **Brief**, choose **Design a connected process** for a project without a development recipe, agent profiles or repository components. In an existing project, choose **Design a process** in Workflow to add another process. Give it a name, choose what it describes and select a sequence, review or bounded correction pattern. Choose **Open designer** to inspect the proposed starting design. Existing custom processes have an **Open designer** control.

Select a step in **Map** or **Step list**. Name its action and actor, choose required inputs and produced results, define checks and select destinations under **What happens next?** Expand **Inputs, checks and other records** for correction limits, approval and endings. No dragging is required.

The designer holds a separate, session-only draft until **Review changes**, then **Apply changes**. Review lists changed records, connections, affected files and unresolved decisions. Broken references and unsupported structures prevent applying. Incomplete decisions can remain a draft. Apply changes replaces the process and related references together. Project Undo can restore the prior project state.

Removing a referenced record requires an explicit replacement or cancellation. Observations are kept. If an evidence association cannot remain valid, resolve it rather than silently removing it. **Process overview** and switching workspace views keep pending edits in this tab. Use **Discard process edits** for a deliberate discard. Applying is not saving. Download the project to keep it, then reopen that download for a later session.

To remove a whole process, open **Process details**, then **Remove this process**. Review its removal before applying. A process with linked evidence cannot be removed while those associations refer to it. This designer preserves existing evidence associations and does not provide controls to reassign them.

See the [factory guide](factory-guide.md) for a practical walkthrough.

## How assignments reach the files

| Choice | Export behavior |
| --- | --- |
| A known skill selected on a custom step | Includes that skill with the assigned actor, inputs, results, checks, routes and related correction and approval requirements in its own project reference |
| A development or manual agent step whose ID matches a selected profile | Adds that step's responsibility and relevant skills to the profile. The selected tool list stays unchanged |
| An unmatched or unselected development agent ID | Preserves the planned identity and reports the profile mapping as unresolved. No profile is invented |
| An application agent | Keeps the runtime assignment and skill context in the design. It does not assign that application work to a development profile or deploy an agent |
| A person, existing system or supplied-context reviewer | Retains that scope. Selecting a skill does not transfer human work to an agent or let a reviewer perform missing work |

Requested capabilities must be provided separately in the intended environment. A known tool missing from a selected active profile is a finding. An unmapped capability remains unresolved. Neither case automatically changes the profile's tools.

Each complete skill directory contains its own needed process context. Focused and standalone exports do not acquire links to omitted root documents. A blueprint still omits agent and skill files. Its retained configuration can produce another output later if deliberately selected.

`templates/EVALUATION.md` includes planned cases for each declared outcome, correction exhaustion, changed candidates and renewed approval. Rows start as `NOT RUN`. The expected destination reflects the design, including unresolved routes. The template does not create observed evidence or verify business criteria.

File explanations and manifest entries use `processes` for process IDs and `steps` for `processId/stepId` references. Existing `stages` associations retain their recipe meaning. Definition snapshots include custom skills and supported profile assignments, with application scope kept separate.

## One authoring source

`project.json` contains `workflowModel`, with `version`, `processes` and `evidenceLinks`.

An existing recipe has a reference record:

```json
{
  "version": "1.0",
  "processes": [
    { "id": "development", "source": "recipe", "kind": "development" }
  ],
  "evidenceLinks": []
}
```

This reference reads the existing `workflow` settings and catalog stage definitions. There is no second stored copy of its stages, assignments or prerequisites. A disposable reading projection resolves those records when needed. Editing a projected object does not edit the project.

Removing the recipe reference makes those recipe settings inactive. They remain in the project for recovery. Selecting a recipe again restores a reference and preserves custom processes. A project can contain at most one active recipe reference.

For a custom process, `source` is `custom` and its own records are authoritative. Processes have separate identifiers and do not automatically start one another.

## Process records

All fields are required by the shape. Empty text or `null` where specified can represent an unresolved decision. Unknown fields and unsupported versions are rejected instead of being discarded.

| Record | Fields and meaning |
| --- | --- |
| Process | `id`, `source`, `kind`, `name`, `purpose`, `pattern`, `entryStepId`, `steps`, `results`, `checks`, `transitions`, `corrections`, `approvals`, `terminals`. Kinds are `development`, `application` and `manual`. Patterns are `sequence`, `review-gate` and `bounded-correction`, each with an explicit version |
| Step | `id`, `name`, `action`, `actor`, `capabilities`, `inputIds`, `outputIds`, `instructionIds`, `outcomes`. Actor records contain `type`, `id`, `name` and `contextOnly`. Types are `human`, `agent` and `external`. Instruction IDs refer to known catalog skills |
| Result | `id`, `name`, `description`, `producerStepId`, `suppliedSource`, `expectedStructure`, `versionPolicy`, `version`. Choose an initial producer or a supplied source. Consumers derive from step input references |
| Check | `id`, `stepId`, `candidateId`, `criteria`, `evidenceResultId`, `outcomes`, `method`, `revisionPolicy`. Methods are `human`, `code` and `model`. Policy is `recheck-after-change` |
| Transition | `id`, `fromStepId`, `outcome`, `to`. A destination contains `type` and `id`. Types are `step`, `terminal` and `unresolved`. An unresolved destination has an empty ID |
| Correction | `id`, `decisionStepId`, `outcome`, `correctionStepId`, `checkStepId`, `candidateId`, `feedbackResultId`, `maxCorrections`, `exhaustedTerminalId`. A missing maximum is `null`. Zero allows no corrections |
| Approval | `id`, `stepId`, `authority`, `candidateId`, `evidenceResultIds`, `revisionPolicy`. Policy is `reapprove-after-change`. Its step declares distinct `accepted`, `changes-requested` and `declined` outcomes |
| Terminal | `id`, `name`, `status`. Status is `completed`, `stopped`, `needs-information`, `cancelled` or `unresolved`. This is a planned terminal, not an observed execution status |
| Evidence association | `id`, `evidenceId`, `processId`, `checkId`, `resultId`, `candidateVersion`. Associates an existing supplied evidence record with a check and candidate revision |

IDs start with a lowercase letter, followed by lowercase letters, numbers or hyphens, up to 64 characters. References are local to their process unless they explicitly contain a process ID. A result is not an instruction file. An assignment or named capability does not grant runtime permissions.

## A bounded correction

```text
Initial producer -> Candidate -> Check
                                  |
          pass -> approval or handoff
          repairable -> limit allows -> correction -> check again
          limit exhausted -> stop with findings
          unavailable or missing information -> unresolved, stop or clarify
```

The logical candidate keeps one result ID. Its initial producer is named in `producerStepId`. A declared correction step can revise that candidate, consumes both candidate and findings, and returns to the named check.

Count each entry into a correction attempt after the initial candidate, including an unsuccessful attempt. Reset only for a new run. When the maximum is reached, take the exhausted terminal instead of starting another attempt. These are design semantics that a future implementation must enforce. Atlas has no attempt counter or workflow runner.

A changed candidate needs all its declared checks and any required approval again before completion. This version does not model exemptions for checks unaffected by a change. Earlier evidence stays historical. An evidence link with a different recorded candidate version is flagged. Matching versions only associate supplied records. They do not prove validity or automatically approve anything.

Transport retry and uncertain write recovery are separate from correction. The backend fixture routes an uncertain write to reconciliation without repeating the write. This model cannot inspect whether the eventual implementation follows that action description.

## What validation establishes

Malformed records fail import and serialization. Checks include identifiers, references, producer and consumer consistency, declared outcomes, unique destinations, reachable steps, required producer order, approval bypass and unsupported cycles. Cycles require an explicit correction policy. Known nonpassing check outcomes cannot reach completion without revisiting that check.

Incomplete decisions remain downloadable drafts. Examples include missing criteria, unknown sources, unresolved destinations and a missing correction maximum. Model findings are shown in the guide and validation record.

Validation does not interpret arbitrary prose. Renaming an outcome does not give Atlas an understanding of its business meaning. Describing a command does not verify or run it. A context-only assignment cannot request known mutation or execution capabilities or perform a configured correction. Written actions still require review for consistency with that scope.

This version supports at most 8 processes, 64 steps, 128 results and 256 transitions per process. Correction maxima range from 0 to 1000 or remain unresolved. Text and reference collections are bounded. Project JSON remains subject to the existing 8 MiB limit.

Parallel joins, concurrent corrections, arbitrary routing expressions, cross-process control routes and configurable time or spending budgets are not supported. Budget prose can remain context, but it is not an additional modeled stopping condition.

## Migration and preserved files

Supported project versions `1.0` and `2.0` pass their original shape checks before migration to `3.0`. Version 1 keeps its existing assignment migration rules. Version 2 retains all its existing fields and adds the recipe reference.

Prerequisites remain input relationships. Notes stay notes. Migration creates no conditional routes, checks, approvals, correction budgets or observations. Runtime notes and their fixed illustrative diagram do not become a custom application process.

Supported older decision review baselines and current settings migrate together. Restoration checks them against the opened project and rebuilds derived summaries while retaining the supplied reason. Old schema 2 output manifests retain blueprint or focused skill scope. Version 1 project migration does not imply support for a version 1 reduced-output manifest.

Imported files stay exact supplied text, separately from the migrated configuration. Differences remain available for comparison. A focused skill pack keeps the full configuration for reopening, while its omitted root documents remain omitted. A standalone skill still does not preserve a whole project.

## Representative fixtures

`factory/workflow-fixtures.mjs` provides three fictional constructors for implementation review. They are not user trials or shipped workflow executions.

| Fixture | What it demonstrates |
| --- | --- |
| Backend configuration | Separate development recipe and application process. Generate, check, correct, optionally approve, deliver and reconcile uncertain writes |
| Bug repair | Repair and regression correction, a supplied test procedure still to confirm, context-only review, and historical failed evidence for a different candidate version |
| Document review | Draft, human review, revision, approval and handoff without requiring repository components, build commands or an API |

The sample limit of two corrections is fixture data. New projects receive no correction maximum. Current JEV continues to support its existing three development recipes. It does not propose these explicit patterns or classify general document writing.

See the [workflow design specification](workflow-design-spec.md) for the milestone boundaries and remaining human walkthroughs, and the [extension contract](extension-contract.md) for the file and import contracts.
