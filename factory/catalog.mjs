// Compiled from catalogue/. Edit source records and run npm run build:catalogue.
export const SCHEMA_VERSION = "3.0";
export const DEFINITION_VERSION = "2.1.0";
export const REVIEW_DATE = "2026-10-02";
export const SOURCES = Object.freeze({
  "agents": "https://docs.github.com/en/copilot/reference/custom-agents-configuration",
  "install": "https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents",
  "skills": "https://agentskills.io/specification",
  "copilotSkills": "https://docs.github.com/en/copilot/concepts/agents/about-agent-skills"
});
export const TOOL_ALIASES = Object.freeze([
  "read",
  "search",
  "edit",
  "execute",
  "agent",
  "web",
  "todo"
]);
function deepFreeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
export const CATALOG = deepFreeze({
  "schemaVersion": "3.0",
  "version": "2.1.0",
  "reviewedOn": "2026-10-02",
  "stages": [
    {
      "id": "requirements",
      "title": "Requirements and evidence",
      "purpose": "Define the problem and the evidence needed to accept a result.",
      "inputs": [
        "User need or ticket",
        "Relevant policies and authoritative sources",
        "Current behavior and affected users"
      ],
      "actions": [
        "Separate facts, assumptions and open questions.",
        "Write examples and measurable acceptance checks.",
        "Record source locations and review owners."
      ],
      "outputs": [
        "Requirement brief with source links",
        "Acceptance examples",
        "Open questions and decision owners"
      ],
      "checks": [
        "The problem and intended outcome are clear.",
        "Each material claim has evidence or is marked unresolved.",
        "The owner agrees the acceptance examples."
      ],
      "dependsOn": [],
      "defaultSkills": [
        "requirement-refinement"
      ],
      "defaultActor": {
        "actorType": "human",
        "actorId": "",
        "actorName": "Requirement owner"
      },
      "capabilities": [],
      "atlasTopic": "requirements"
    },
    {
      "id": "architecture",
      "title": "Architecture and impact",
      "purpose": "Choose a proportionate approach and identify the affected contracts.",
      "inputs": [
        "Requirement brief",
        "Existing implementation and interfaces",
        "Project constraints"
      ],
      "actions": [
        "Inspect the affected components before proposing changes.",
        "Compare reuse with the smallest necessary change.",
        "Record alternatives, risks and rollback implications."
      ],
      "outputs": [
        "Impact analysis",
        "Design decision and alternatives",
        "Interface and data change list"
      ],
      "checks": [
        "The design uses evidence from the current repository.",
        "Known constraints and migration risks are addressed.",
        "Unverified compatibility remains explicit."
      ],
      "dependsOn": [
        "requirements"
      ],
      "defaultSkills": [
        "impact-analysis"
      ],
      "defaultActor": {
        "actorType": "agent",
        "actorId": "analyst",
        "actorName": ""
      },
      "capabilities": [
        "read",
        "search"
      ],
      "atlasTopic": "architecture-decisions"
    },
    {
      "id": "breakdown",
      "title": "Stories and delivery plan",
      "purpose": "Break the approved approach into small pieces that can be reviewed.",
      "inputs": [
        "Accepted requirement examples",
        "Impact analysis",
        "Design decision"
      ],
      "actions": [
        "Split work into independently reviewable changes.",
        "Connect each task to its acceptance checks and dependencies.",
        "Identify fixtures, test layers and review owners."
      ],
      "outputs": [
        "Delivery plan with dependencies",
        "Stories or tasks with acceptance checks",
        "Verification plan"
      ],
      "checks": [
        "Every task contributes to an agreed outcome.",
        "Dependencies and unresolved decisions are visible.",
        "The first change can be implemented and verified."
      ],
      "dependsOn": [
        "architecture"
      ],
      "defaultSkills": [
        "delivery-planning"
      ],
      "defaultActor": {
        "actorType": "human",
        "actorId": "",
        "actorName": "Delivery owner"
      },
      "capabilities": [],
      "atlasTopic": "work-breakdown"
    },
    {
      "id": "implementation",
      "title": "Development",
      "purpose": "Implement the scoped change using the actual project conventions.",
      "inputs": [
        "Delivery plan",
        "Repository conventions",
        "Selected task and acceptance examples"
      ],
      "actions": [
        "Read the relevant implementation and tests.",
        "Make the smallest coherent change.",
        "Keep a record of decisions and observed checks."
      ],
      "outputs": [
        "Reviewable change",
        "Relevant tests and fixtures",
        "Change notes and unresolved concerns"
      ],
      "checks": [
        "Changes stay within the agreed scope.",
        "Behavior is connected to the acceptance examples.",
        "Unexpected dependencies or policy questions are surfaced."
      ],
      "dependsOn": [
        "breakdown"
      ],
      "defaultSkills": [
        "implementation"
      ],
      "defaultActor": {
        "actorType": "agent",
        "actorId": "implementer",
        "actorName": ""
      },
      "capabilities": [
        "read",
        "edit"
      ],
      "atlasTopic": "implementation-workflow"
    },
    {
      "id": "verification",
      "title": "Tests and review",
      "purpose": "Collect observed evidence that the change meets the requirement.",
      "inputs": [
        "Proposed change",
        "Acceptance examples",
        "Configured component commands"
      ],
      "actions": [
        "Use the supplied test commands in the correct component directory.",
        "Run the relevant checks and inspect their actual output.",
        "Review boundary cases, integrations and unresolved risks."
      ],
      "outputs": [
        "Verification record with commands and results",
        "Review findings",
        "Requirement to evidence trace"
      ],
      "checks": [
        "Observed results are distinguished from intended behavior.",
        "Failures and unrun checks are recorded.",
        "A reviewer resolves material findings before release."
      ],
      "dependsOn": [
        "implementation"
      ],
      "defaultSkills": [
        "verification"
      ],
      "defaultActor": {
        "actorType": "agent",
        "actorId": "implementer",
        "actorName": ""
      },
      "capabilities": [
        "read",
        "execute"
      ],
      "atlasTopic": "verification-loops"
    },
    {
      "id": "release",
      "title": "Release and production",
      "purpose": "Prepare an approved release and a way to recover from failure.",
      "inputs": [
        "Reviewed change",
        "Verification record",
        "Deployment and rollback procedures"
      ],
      "actions": [
        "Confirm the release owner and actual deployment procedure.",
        "Build using supplied component commands.",
        "Record rollout, monitoring and rollback checks before release."
      ],
      "outputs": [
        "Release checklist",
        "Deployment and rollback notes",
        "Release approval record"
      ],
      "checks": [
        "Release approval follows the project boundary.",
        "Deployment commands and environment are verified separately.",
        "A recovery path and monitoring owner are identified."
      ],
      "dependsOn": [
        "verification"
      ],
      "defaultSkills": [],
      "defaultActor": {
        "actorType": "external",
        "actorId": "",
        "actorName": "Release pipeline"
      },
      "capabilities": [
        "read",
        "execute"
      ],
      "atlasTopic": "release-operations"
    },
    {
      "id": "operations",
      "title": "Observe and improve",
      "purpose": "Check production behavior and feed the next delivery cycle.",
      "inputs": [
        "Release record",
        "Observed production signals",
        "User feedback and incidents"
      ],
      "actions": [
        "Compare observed behavior with the acceptance outcome.",
        "Record regressions and operational findings.",
        "Turn supported findings into improvements or debt items."
      ],
      "outputs": [
        "Outcome review",
        "Prioritized follow up work",
        "Updated evidence and knowledge records"
      ],
      "checks": [
        "Production observations have a source and owner.",
        "New work has an explicit outcome and priority.",
        "Outdated knowledge is corrected with source traceability."
      ],
      "dependsOn": [
        "release"
      ],
      "defaultSkills": [
        "knowledge-maintenance"
      ],
      "defaultActor": {
        "actorType": "human",
        "actorId": "",
        "actorName": "Operations owner"
      },
      "capabilities": [],
      "atlasTopic": "eval-metrics"
    },
    {
      "id": "current-process",
      "title": "Understand the current process",
      "purpose": "Document how work is performed today and where evidence is missing.",
      "inputs": [
        "Current request and examples",
        "Available process notes and source material"
      ],
      "actions": [
        "Follow one representative case from input to result.",
        "Record manual decisions, tools and failure points.",
        "Separate confirmed facts from assumptions."
      ],
      "outputs": [
        "Current process record",
        "Representative inputs and outcomes"
      ],
      "checks": [
        "The source and owner of each material fact are recorded.",
        "Missing process knowledge stays explicit."
      ],
      "dependsOn": [],
      "defaultSkills": [
        "feasibility-analysis"
      ],
      "defaultActor": {
        "actorType": "agent",
        "actorId": "analyst",
        "actorName": ""
      },
      "capabilities": [
        "read",
        "search"
      ],
      "atlasTopic": "study-baseline"
    },
    {
      "id": "feasibility-scope",
      "title": "Define the proposed outcome",
      "purpose": "State the desired result, boundaries and evidence needed for a decision.",
      "inputs": [
        "Current process record",
        "Stakeholder need and constraints"
      ],
      "actions": [
        "Describe a successful result and unacceptable changes.",
        "Identify required information and who resolves missing values.",
        "Define measurable acceptance examples."
      ],
      "outputs": [
        "Requirement brief",
        "Constraints and open questions"
      ],
      "checks": [
        "Success can be assessed from actual results.",
        "Business decisions have a named owner."
      ],
      "dependsOn": [
        "current-process"
      ],
      "defaultSkills": [
        "requirement-refinement"
      ],
      "defaultActor": {
        "actorType": "human",
        "actorId": "",
        "actorName": "Requirement owner"
      },
      "capabilities": [],
      "atlasTopic": "study-contract"
    },
    {
      "id": "options",
      "title": "Compare feasible approaches",
      "purpose": "Compare proportionate options using current project facts.",
      "inputs": [
        "Requirement brief",
        "Current approach and relevant constraints"
      ],
      "actions": [
        "Compare keeping the current approach with the smallest plausible changes that address the outcome.",
        "Examine benefits, tradeoffs, failure handling and ownership for each option.",
        "Record effort and operating cost assumptions separately from measurements. If model behavior is part of the proposal, compare it with ordinary code and other suitable approaches."
      ],
      "outputs": [
        "Options and tradeoffs",
        "Proposed approach and affected interfaces",
        "Effort and cost assumptions"
      ],
      "checks": [
        "The recommended option addresses the defined outcome.",
        "Unverified compatibility and cost assumptions remain visible."
      ],
      "dependsOn": [
        "feasibility-scope"
      ],
      "defaultSkills": [
        "feasibility-analysis",
        "impact-analysis"
      ],
      "defaultActor": {
        "actorType": "agent",
        "actorId": "analyst",
        "actorName": ""
      },
      "capabilities": [
        "read",
        "search"
      ],
      "atlasTopic": "study-runtime"
    },
    {
      "id": "experiment-plan",
      "title": "Plan the evidence",
      "purpose": "Define a small experiment that can support or reject the proposal.",
      "inputs": [
        "Options and acceptance examples",
        "Representative successful and failed cases"
      ],
      "actions": [
        "Compare the current approach with the proposed options using representative situations.",
        "Define expected results and independent acceptance checks before collecting observations.",
        "Record actual results, evidence sources, relevant versions, effort, elapsed time and cost. Keep estimates and unrun checks separate."
      ],
      "outputs": [
        "Evaluation cases",
        "Measurement plan",
        "Evidence record"
      ],
      "checks": [
        "Cases include failure and incomplete input.",
        "A proposed check is not reported as a passing result."
      ],
      "dependsOn": [
        "options"
      ],
      "defaultSkills": [
        "evaluation-planning"
      ],
      "defaultActor": {
        "actorType": "human",
        "actorId": "",
        "actorName": "Evaluation owner"
      },
      "capabilities": [],
      "atlasTopic": "study-experiment"
    },
    {
      "id": "recommendation",
      "title": "Recommend go or no-go",
      "purpose": "Produce a reviewable decision with supporting evidence and remaining uncertainty.",
      "inputs": [
        "Options, assumptions and evidence",
        "Decision owner and operational owner"
      ],
      "actions": [
        "Summarize which claims the available evidence supports.",
        "Identify the next experiment if evidence is insufficient.",
        "Recommend a phased scope or a no-go decision."
      ],
      "outputs": [
        "Decision record",
        "Go/no-go recommendation",
        "Follow up scope"
      ],
      "checks": [
        "Measurements and estimates are distinguished.",
        "Unresolved concerns and ownership are explicit."
      ],
      "dependsOn": [
        "experiment-plan"
      ],
      "defaultSkills": [
        "feasibility-analysis",
        "knowledge-maintenance"
      ],
      "defaultActor": {
        "actorType": "human",
        "actorId": "",
        "actorName": "Decision owner"
      },
      "capabilities": [],
      "atlasTopic": "study-decision"
    },
    {
      "id": "reproduction",
      "title": "Reproduce the observed problem",
      "purpose": "Record expected and observed behavior and establish a reliable reproduction.",
      "inputs": [
        "Bug report",
        "Affected revision and environment",
        "Existing acceptance rules"
      ],
      "actions": [
        "Capture a failing example without inventing a cause.",
        "Use supplied commands or record the external reproduction procedure.",
        "Preserve evidence needed to check the fix."
      ],
      "outputs": [
        "Reproduction record",
        "Expected and observed behavior"
      ],
      "checks": [
        "The failing case and environment are recorded.",
        "A claimed reproduction includes an observed result."
      ],
      "dependsOn": [],
      "defaultSkills": [
        "bug-diagnosis"
      ],
      "defaultActor": {
        "actorType": "agent",
        "actorId": "implementer",
        "actorName": ""
      },
      "capabilities": [
        "read",
        "execute"
      ],
      "atlasTopic": "verification-loops"
    },
    {
      "id": "diagnosis",
      "title": "Investigate the cause",
      "purpose": "Connect a proposed cause to repository evidence and the failing case.",
      "inputs": [
        "Reproduction record",
        "Affected implementation and interfaces"
      ],
      "actions": [
        "Inspect the relevant path and adjacent behavior.",
        "Test competing explanations where needed.",
        "Separate the confirmed cause from hypotheses."
      ],
      "outputs": [
        "Cause analysis",
        "Affected scope and proposed fix"
      ],
      "checks": [
        "The cause explains the observed failure.",
        "Alternative explanations and unknowns stay visible."
      ],
      "dependsOn": [
        "reproduction"
      ],
      "defaultSkills": [
        "bug-diagnosis",
        "impact-analysis"
      ],
      "defaultActor": {
        "actorType": "agent",
        "actorId": "analyst",
        "actorName": ""
      },
      "capabilities": [
        "read",
        "search"
      ],
      "atlasTopic": "finding-contract"
    },
    {
      "id": "bug-fix",
      "title": "Make a scoped repair",
      "purpose": "Apply a minimal coherent fix using the actual conventions.",
      "inputs": [
        "Cause analysis",
        "Reproduction case",
        "Project constraints"
      ],
      "actions": [
        "Read adjacent behavior and existing tests.",
        "Make the scoped repair and add a meaningful regression check.",
        "Record any unexpected scope change."
      ],
      "outputs": [
        "Reviewable repair",
        "Regression check"
      ],
      "checks": [
        "The repair addresses the established cause.",
        "Unrelated changes are excluded or explained."
      ],
      "dependsOn": [
        "diagnosis"
      ],
      "defaultSkills": [
        "implementation"
      ],
      "defaultActor": {
        "actorType": "agent",
        "actorId": "implementer",
        "actorName": ""
      },
      "capabilities": [
        "read",
        "edit"
      ],
      "atlasTopic": "implementation-workflow"
    },
    {
      "id": "regression",
      "title": "Verify the repair",
      "purpose": "Check the failing case and relevant neighboring behavior.",
      "inputs": [
        "Proposed repair",
        "Reproduction case",
        "Actual project commands"
      ],
      "actions": [
        "Run the reproduction and relevant checks when available.",
        "Inspect real results and remaining failures.",
        "Record unrun checks and review concerns."
      ],
      "outputs": [
        "Verification record",
        "Regression evidence"
      ],
      "checks": [
        "The original case behaves as expected.",
        "Reported results were observed."
      ],
      "dependsOn": [
        "bug-fix"
      ],
      "defaultSkills": [
        "verification"
      ],
      "defaultActor": {
        "actorType": "agent",
        "actorId": "implementer",
        "actorName": ""
      },
      "capabilities": [
        "read",
        "execute"
      ],
      "atlasTopic": "verification-loops"
    },
    {
      "id": "bug-review",
      "title": "Review and hand off",
      "purpose": "Review the repair and provide the evidence needed for the normal release process.",
      "inputs": [
        "Repair and verification record",
        "Release owner and procedure"
      ],
      "actions": [
        "Review scope and failure evidence.",
        "Record remaining risks and hand off through the existing release process.",
        "Correct project knowledge when the diagnosis changes a recorded fact."
      ],
      "outputs": [
        "Review findings",
        "Release handoff",
        "Knowledge correction where needed"
      ],
      "checks": [
        "Material findings have a resolution or owner.",
        "Review completion does not imply deployment."
      ],
      "dependsOn": [
        "regression"
      ],
      "defaultSkills": [
        "knowledge-maintenance"
      ],
      "defaultActor": {
        "actorType": "agent",
        "actorId": "reviewer",
        "actorName": ""
      },
      "capabilities": [
        "read",
        "search"
      ],
      "atlasTopic": "post-change-checks"
    }
  ],
  "skills": [
    {
      "id": "impact-analysis",
      "label": "Impact analysis",
      "description": "Inspect requirements and the current repository before a feature change. Use when planning a change, estimating its impact or identifying affected interfaces.",
      "steps": [
        "Read the requirement, acceptance examples and configured source locations.",
        "Inspect the relevant components and their interfaces using available read and search tools.",
        "List affected code, data, contracts, test layers and possible migrations.",
        "Separate observed facts from assumptions. Link evidence and identify unresolved questions.",
        "Deliver a concise impact report and a recommended scope for human review."
      ],
      "checks": [
        "Claims identify the file or source that supports them.",
        "Alternatives and risks are connected to the requested outcome.",
        "No repository modification is required for the report."
      ]
    },
    {
      "id": "verification",
      "label": "Verification",
      "description": "Verify a proposed change against acceptance examples using configured project commands. Use when reviewing implementation, testing a feature or preparing release evidence.",
      "steps": [
        "Read the acceptance examples and current change.",
        "Read the component paths and commands in references/project.md.",
        "Confirm command context and the selected role capabilities before running anything.",
        "Run only the relevant supplied commands when execution is available and authorized.",
        "Record command, directory, observed result and any skipped checks. Never infer a passing result.",
        "Report requirement coverage, failures and unresolved review findings."
      ],
      "checks": [
        "Each reported result was observed.",
        "Missing commands are reported rather than invented.",
        "A passing command does not establish complete requirement coverage."
      ]
    },
    {
      "id": "requirement-refinement",
      "label": "Requirement refinement",
      "description": "Turn a request and its supporting sources into a requirement brief with acceptance examples. Use when a feature request is ambiguous or lacks an agreed outcome.",
      "steps": [
        "Read the request and relevant authoritative sources.",
        "Describe current behavior, affected users and the desired result.",
        "Separate requirements, assumptions, constraints and open questions.",
        "Write concrete acceptance examples, including boundary cases.",
        "Identify who can resolve each open question and deliver a reviewable brief."
      ],
      "checks": [
        "Requirements have source traceability or an explicit owner.",
        "Acceptance examples can be checked.",
        "The brief does not invent policy or business decisions."
      ]
    },
    {
      "id": "knowledge-maintenance",
      "label": "Knowledge maintenance",
      "description": "Maintain a project knowledge record with traceable sources, decisions and unresolved questions. Use after a decision, research result, release or correction changes project knowledge.",
      "steps": [
        "Read the existing index and relevant source records.",
        "Keep original source material separate from summaries.",
        "Update only the supported claims and link their source locations.",
        "Record conflicts, stale content and unanswered questions.",
        "Update the index and change log so a reviewer can trace the change."
      ],
      "checks": [
        "A summary identifies its supporting source.",
        "Conflicting claims remain visible until resolved.",
        "Maintaining a wiki does not establish factual correctness by itself."
      ]
    },
    {
      "id": "feasibility-analysis",
      "version": "2.0.2",
      "label": "Feasibility analysis",
      "description": "Investigate a proposed capability using the current process, options, constraints and evidence. Use before deciding whether and how to build a feature.",
      "steps": [
        "Read the documented current process and source evidence. Preserve the difference between information not supplied, not measured and confirmed absent.",
        "Define the intended outcome and unresolved decisions.",
        "Compare the smallest plausible approaches and their operational needs. Label any untested capability or benefit as a hypothesis and state how to test it.",
        "Separate measured effort, cost and performance from estimates and assumptions. Do not describe an approach as slow, variable, reliable or more efficient without supporting observations. If none were supplied, say these outcomes are unknown.",
        "Deliver a recommendation with evidence, ownership and a proportionate next step. Check that every citation supports the exact claim and its certainty, including benefits and limitations in comparison tables."
      ],
      "checks": [
        "Every material conclusion has evidence or is marked unresolved.",
        "Missing information is not treated as proof that a policy or capability does not exist.",
        "Potential benefits remain hypotheses until supported by relevant observed results.",
        "Performance and efficiency descriptions have supporting observations or remain unknown.",
        "The recommendation does not imply an unobserved experiment passed."
      ]
    },
    {
      "id": "evaluation-planning",
      "label": "Evaluation planning",
      "description": "Design representative cases and acceptance checks to compare a proposal with the current approach. Use when preparing a feasibility experiment or evaluating a change.",
      "steps": [
        "Define expected outcomes and independent acceptance checks.",
        "Record representative normal, incomplete and failed cases.",
        "Compare the current approach with the actual project options under equivalent conditions. If instructions are the subject of the study, compare the existing setup, minimal project facts, a focused skill and a complete pack only where useful.",
        "Record the inputs, relevant environment and versions, procedure and evidence source so another person can understand the comparison.",
        "Report observed results, corrections, effort, elapsed time and cost separately from expectations and estimates. Record model usage only when a model is involved."
      ],
      "checks": [
        "Expected outcomes and observed results remain separate.",
        "Passing a structural check or receiving a success message does not establish the intended outcome."
      ]
    },
    {
      "id": "bug-diagnosis",
      "label": "Bug diagnosis",
      "description": "Investigate a reproducible defect and connect a proposed cause to observed behavior. Use when expected behavior differs from the actual result.",
      "steps": [
        "Capture expected behavior, observed behavior, revision and environment.",
        "Reproduce using supplied inputs and commands when available.",
        "Inspect the affected implementation and compare explanations.",
        "Record the evidence supporting the cause and any remaining uncertainty.",
        "Recommend a scoped repair and regression checks."
      ],
      "checks": [
        "A proposed cause is not presented as confirmed without evidence.",
        "A passing fix requires relevant regression evidence."
      ]
    },
    {
      "id": "implementation",
      "label": "Scoped implementation",
      "description": "Implement an agreed change using the existing conventions and relevant verification evidence. Use after the task, scope and acceptance examples are understood.",
      "steps": [
        "Read the supplied design or diagnosis and acceptance examples.",
        "Inspect the affected implementation and existing tests.",
        "Reuse existing capabilities and make the smallest coherent change.",
        "Add the checks needed to verify the behavior.",
        "Record actual results, skipped checks and scope changes for review."
      ],
      "checks": [
        "The change follows the agreed scope.",
        "Commands, test results and compatibility are not invented."
      ]
    },
    {
      "id": "delivery-planning",
      "label": "Delivery planning",
      "description": "Break an agreed approach into reviewable tasks with acceptance checks and explicit handoffs. Use when planning implementation across components.",
      "steps": [
        "Read the accepted outcome and design decision.",
        "Split the work into changes that can be reviewed and verified.",
        "Record dependencies, supplied artifacts and responsible actors.",
        "Connect each task to its acceptance checks.",
        "Identify open decisions before implementation starts."
      ],
      "checks": [
        "Every task contributes to the outcome.",
        "A dependency can be fulfilled by an existing verified artifact."
      ]
    }
  ],
  "roles": [
    {
      "id": "analyst",
      "label": "Analyst",
      "description": "Clarify requirements and inspect the impact of a proposed change using repository evidence.",
      "defaultTools": [
        "read",
        "search"
      ],
      "responsibilities": [
        "Produce the requirement brief and impact analysis.",
        "Link evidence and make unresolved questions explicit.",
        "Leave business and policy decisions with their named owners."
      ]
    },
    {
      "id": "implementer",
      "label": "Implementer",
      "description": "Implement a scoped change and collect relevant verification evidence using configured project commands.",
      "defaultTools": [
        "read",
        "search",
        "edit",
        "execute"
      ],
      "responsibilities": [
        "Follow the delivery plan and existing conventions.",
        "Use the selected skills and actual component commands.",
        "Report changes, observed checks and unresolved concerns for review."
      ]
    },
    {
      "id": "reviewer",
      "label": "Reviewer",
      "description": "Review a proposed change against its requirements, evidence and project boundaries.",
      "defaultTools": [
        "read",
        "search"
      ],
      "responsibilities": [
        "Assess the requirement to implementation trace.",
        "Inspect the verification record and unresolved failures.",
        "Deliver actionable findings without treating a generated report as proof."
      ]
    },
    {
      "id": "knowledge-curator",
      "label": "Knowledge curator",
      "description": "Keep project knowledge and decision records aligned with source evidence.",
      "defaultTools": [
        "read",
        "search",
        "edit"
      ],
      "responsibilities": [
        "Use the knowledge maintenance skill when selected.",
        "Keep source material and derived summaries distinct.",
        "Record corrections, source links and remaining uncertainty."
      ]
    }
  ],
  "practices": [
    {
      "id": "portable-behavior",
      "label": "Shared behavior, thin adapters",
      "description": "Keep task guidance independent from the host profile that delivers it.",
      "version": "2.0.1",
      "limits": "This is an adaptation of a portability pattern. It is not a claim that every host supports every field or tool.",
      "application": "Put reusable task guidance in skills. Keep agent profiles focused on roles, capabilities and project references.",
      "source": "https://github.com/DietrichGebert/ponytail/blob/e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156/docs/agent-portability.md"
    },
    {
      "id": "minimum-change",
      "label": "Smallest necessary change",
      "description": "Check whether a change is needed, reuse what exists and avoid unnecessary dependencies.",
      "version": "2.0.1",
      "limits": "This does not justify skipping required tests, accessibility or project constraints. Upstream benchmark results do not predict this project.",
      "application": "Before adding code or dependencies, explain the need and inspect existing capabilities. Retain the checks required by the change.",
      "source": "https://github.com/DietrichGebert/ponytail/blob/e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156/README.md#how-it-works"
    },
    {
      "id": "evidence-wiki",
      "label": "Source backed project wiki",
      "description": "Separate source records from a maintained index, summaries, decisions and corrections.",
      "version": "2.0.1",
      "limits": "The original reference is an idea and suggested structure. A wiki can contain errors and does not replace source verification.",
      "application": "Keep original sources available. Link derived claims to sources, record conflicts and maintain an index and change log.",
      "source": "https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
    },
    {
      "id": "specification-first",
      "label": "Requirements before implementation",
      "description": "Connect a requirement, design and delivery tasks before writing the change.",
      "version": "2.0.1",
      "limits": "Adopt the traceability idea. This pack does not install or execute Spec Kit, and the upstream tool has its own workflow.",
      "application": "Connect each delivery task to acceptance examples and a design decision. Revise the plan when evidence changes.",
      "source": "https://github.com/github/spec-kit/blob/4a339209c877a1b68e7a790b2b2269a2b68e461f/README.md#spec-driven-development"
    },
    {
      "id": "progressive-context",
      "label": "Load context when needed",
      "description": "Keep skill instructions short and move project detail into focused references.",
      "version": "2.0.1",
      "limits": "This reduces duplicated instruction text. It does not establish a measured token or cost saving for a particular model.",
      "application": "Read only relevant references. Keep project facts in the linked project reference and avoid copying the entire Atlas into prompts.",
      "source": "https://agentskills.io/specification"
    },
    {
      "id": "validated-retrieval",
      "label": "Retrieve and validate information",
      "description": "Plan checks for information retrieved through an approved interface.",
      "version": "2.1.0",
      "reviewedOn": "2026-10-05",
      "application": "Name the approved retrieval interface and required inputs. Define expected results, permitted scope and resource limits. Validate returned information against the request before using it. Cover normal, empty, invalid and unavailable cases. Record actual observations separately from expected results. Define any later write permissions and confirmation separately.",
      "limits": "This is written guidance. It does not configure access, execute checks or establish correct results. OWASP supports the validation principle. The retrieval sequence is an Atlas adaptation.",
      "source": "https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html"
    }
  ],
  "recipes": [
    {
      "id": "feasibility",
      "label": "Feasibility investigation",
      "description": "Understand the current process, compare options and produce an evidence backed go/no-go recommendation.",
      "stageIds": [
        "current-process",
        "feasibility-scope",
        "options",
        "experiment-plan",
        "recommendation"
      ],
      "questions": [
        {
          "id": "current-work",
          "label": "How is this done today?",
          "hint": "Inputs, manual decisions, tools and expected outputs."
        },
        {
          "id": "desired-outcome",
          "label": "What should improve?",
          "hint": "Describe success and who accepts the result."
        },
        {
          "id": "decision-boundary",
          "label": "What must the study decide?",
          "hint": "Scope, constraints, cost assumptions and decision owners."
        }
      ]
    },
    {
      "id": "bugfix",
      "label": "Bug investigation and repair",
      "description": "Reproduce the issue, establish the cause, make a scoped repair and collect regression evidence.",
      "stageIds": [
        "reproduction",
        "diagnosis",
        "bug-fix",
        "regression",
        "bug-review"
      ],
      "questions": [
        {
          "id": "expected",
          "label": "What should happen?",
          "hint": "Expected behavior and the source that establishes it."
        },
        {
          "id": "observed",
          "label": "What actually happens?",
          "hint": "Reproduction input, environment and affected revision."
        },
        {
          "id": "impact",
          "label": "Who or what is affected?",
          "hint": "Observed impact and unresolved scope."
        }
      ]
    },
    {
      "id": "feature-delivery",
      "label": "Feature delivery",
      "description": "Connect requirements, architecture, implementation, verification and the normal release process.",
      "stageIds": [
        "requirements",
        "architecture",
        "breakdown",
        "implementation",
        "verification",
        "release",
        "operations"
      ],
      "questions": [
        {
          "id": "user-need",
          "label": "What outcome does the user need?",
          "hint": "Current behavior and the change that matters."
        },
        {
          "id": "acceptance",
          "label": "How will the outcome be accepted?",
          "hint": "Concrete acceptance and boundary examples."
        },
        {
          "id": "affected",
          "label": "Which components or contracts change?",
          "hint": "Known impact and remaining questions."
        }
      ]
    }
  ],
  "technologyProfiles": [
    {
      "id": "generic",
      "label": "Generic technology",
      "technologies": [],
      "questions": [
        "Which conventions and interfaces govern this component?",
        "Which actual checks establish the intended behavior?"
      ],
      "checks": [
        "Confirm commands, versions and conventions from project evidence."
      ],
      "limits": "Provides a generic review structure. It does not supply expert guidance for every technology.",
      "source": "https://agentskills.io/specification"
    },
    {
      "id": "spring-boot",
      "label": "Spring Boot and APIs",
      "technologies": [
        "spring-boot"
      ],
      "questions": [
        "Which API contracts and validation rules apply?",
        "Which unit, focused controller and actual server checks are relevant?",
        "What are the failure and transaction boundaries?"
      ],
      "checks": [
        "Record request and response examples, invalid input and observed integration results.",
        "Confirm the actual project test setup and version before selecting a test layer."
      ],
      "limits": "Questions inform review. The profile does not infer commands, deployment settings or API correctness.",
      "source": "https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html",
      "sources": [
        "https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html"
      ]
    },
    {
      "id": "react",
      "label": "React and browser behavior",
      "technologies": [
        "react"
      ],
      "questions": [
        "Which state and component responsibilities change?",
        "What loading, empty and failed states must users understand?",
        "How will keyboard, labels, responsive and browser behavior be exercised?"
      ],
      "checks": [
        "Record observed behavior for relevant user interactions and states.",
        "Combine relevant automated checks with manual interaction and accessibility assessment."
      ],
      "limits": "Automated checks cover some issues. The selected technology does not prove rendering, accessibility or framework compatibility.",
      "source": "https://react.dev/learn/thinking-in-react",
      "sources": [
        "https://playwright.dev/docs/accessibility-testing"
      ]
    },
    {
      "id": "graph-data",
      "label": "RDF and SPARQL",
      "technologies": [
        "rdf",
        "sparql",
        "neptune"
      ],
      "questions": [
        "Which triples, graph scope and expected result semantics apply?",
        "How are missing values, duplicate results and empty results handled?",
        "Which query fixtures and any update rules require verification?",
        "If shapes are relevant, which data graph, shapes graph and available processor establish conformance?"
      ],
      "checks": [
        "Record expected and observed results against representative graph fixtures.",
        "Distinguish RDF syntax, shape conformance and domain correctness.",
        "Confirm engine specific behavior and permissions separately."
      ],
      "limits": "These questions do not establish engine configuration, update behavior or an available SHACL processor.",
      "source": "https://www.w3.org/TR/sparql11-query/",
      "sources": [
        "https://www.w3.org/TR/shacl/"
      ]
    }
  ],
  "runtimeControls": [
    {
      "id": "before-write",
      "label": "Validate permitted changes before writes"
    },
    {
      "id": "bounded-execution",
      "label": "Bound time, tool calls, retries and data volume"
    },
    {
      "id": "duplicate-writes",
      "label": "Handle duplicate requests and uncertain writes"
    },
    {
      "id": "confirmed-result",
      "label": "Separate backend confirmation from inference"
    },
    {
      "id": "failure-trace",
      "label": "Record failures and incomplete runs"
    }
  ],
  "technologies": [
    {
      "id": "react",
      "label": "React"
    },
    {
      "id": "typescript",
      "label": "TypeScript"
    },
    {
      "id": "javascript",
      "label": "JavaScript"
    },
    {
      "id": "java",
      "label": "Java"
    },
    {
      "id": "spring-boot",
      "label": "Spring Boot"
    },
    {
      "id": "python",
      "label": "Python"
    },
    {
      "id": "nodejs",
      "label": "Node.js"
    },
    {
      "id": "go",
      "label": "Go"
    },
    {
      "id": "rust",
      "label": "Rust"
    },
    {
      "id": "dotnet",
      "label": ".NET"
    },
    {
      "id": "kotlin",
      "label": "Kotlin"
    },
    {
      "id": "vue",
      "label": "Vue"
    },
    {
      "id": "angular",
      "label": "Angular"
    },
    {
      "id": "sparql",
      "label": "SPARQL"
    },
    {
      "id": "rdf",
      "label": "RDF"
    },
    {
      "id": "neptune",
      "label": "Amazon Neptune"
    },
    {
      "id": "graphql",
      "label": "GraphQL"
    },
    {
      "id": "postgresql",
      "label": "PostgreSQL"
    },
    {
      "id": "docker",
      "label": "Docker"
    },
    {
      "id": "aws",
      "label": "AWS"
    },
    {
      "id": "jena-fuseki",
      "label": "Apache Jena Fuseki",
      "source": "https://jena.apache.org/documentation/fuseki2/"
    },
    {
      "id": "neo4j",
      "label": "Neo4j",
      "source": "https://neo4j.com/docs/getting-started/"
    }
  ],
  "hosts": [
    {
      "id": "jetbrains",
      "label": "Copilot in JetBrains",
      "source": "https://docs.github.com/en/copilot/reference/custom-agents-configuration"
    },
    {
      "id": "vscode",
      "label": "Copilot in VS Code",
      "source": "https://docs.github.com/en/copilot/reference/custom-agents-configuration"
    },
    {
      "id": "github",
      "label": "Copilot cloud agent on GitHub",
      "source": "https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents"
    }
  ],
  "factStatuses": [
    "detected",
    "inferred",
    "confirmed",
    "unresolved",
    "not-applicable"
  ],
  "evidenceStatuses": [
    "planned",
    "recorded",
    "passed",
    "failed",
    "not-run",
    "not-applicable"
  ],
  "controlStatuses": [
    "requirement",
    "implementation-linked",
    "evidence-recorded"
  ],
  "practiceActions": [
    {
      "topicId": "context-selection",
      "practiceId": "progressive-context",
      "title": "Load relevant context when needed",
      "reason": "Keep reusable instructions focused and put project detail in linked references. This selects the existing context practice without claiming a measured cost saving.",
      "eligibility": "always"
    },
    {
      "topicId": "implementation-workflow",
      "practiceId": "minimum-change",
      "title": "Prefer the smallest necessary change",
      "reason": "This workflow includes a change stage. Record the existing reuse and scope practice while keeping required verification and accessibility checks.",
      "eligibility": "change-stage"
    },
    {
      "topicId": "requirements-workflow",
      "practiceId": "specification-first",
      "title": "Connect requirements to implementation",
      "reason": "This workflow includes requirements and implementation. Record the existing traceability practice. It does not install or run Spec Kit.",
      "eligibility": "requirements-and-change"
    },
    {
      "topicId": "llm-wiki",
      "practiceId": "evidence-wiki",
      "title": "Keep source backed project knowledge",
      "reason": "Record the existing source, summary and correction practice. It does not create a wiki service, verify supplied facts or add a knowledge agent.",
      "eligibility": "always"
    },
    {
      "topicId": "study-contract",
      "runtimeControlId": "before-write",
      "title": "Record validation before writes",
      "reason": "For a feasibility study or an existing runtime design, record a requirement to validate permitted changes before persistence. The backend still needs actual authorization and business rules.",
      "eligibility": "runtime-design"
    },
    {
      "topicId": "retrieve-and-validate",
      "practiceId": "validated-retrieval",
      "title": "Add retrieval checks",
      "reason": "Record written checks for the approved interface, inputs and returned information. This adds a selected practice to the workflow and source record. It does not change steps, roles, tools or evidence.",
      "eligibility": "always"
    }
  ],
  "definitionMetadata": {
    "stage:requirements": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:architecture": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:breakdown": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:implementation": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:verification": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:release": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:operations": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:current-process": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:feasibility-scope": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:options": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:experiment-plan": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:recommendation": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:reproduction": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:diagnosis": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:bug-fix": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:regression": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "stage:bug-review": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "skill:impact-analysis": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "skill:verification": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "skill:requirement-refinement": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "skill:knowledge-maintenance": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "skill:feasibility-analysis": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "skill:evaluation-planning": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "skill:bug-diagnosis": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "skill:implementation": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "skill:delivery-planning": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "role:analyst": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "role:implementer": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "role:reviewer": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "role:knowledge-curator": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "practice:portable-behavior": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "reference-57"
      ]
    },
    "practice:minimum-change": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "reference-58"
      ]
    },
    "practice:evidence-wiki": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "llmwiki"
      ]
    },
    "practice:specification-first": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "reference-59"
      ]
    },
    "practice:progressive-context": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "skillspec"
      ]
    },
    "recipe:feasibility": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "recipe:bugfix": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "recipe:feature-delivery": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "profile:generic": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "skillspec"
      ]
    },
    "profile:spring-boot": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "reference-60",
        "reference-61"
      ]
    },
    "profile:react": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "reference-62",
        "reference-63"
      ]
    },
    "profile:graph-data": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "reference-64",
        "shacl"
      ]
    },
    "control:before-write": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "control:bounded-execution": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "control:duplicate-writes": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "control:confirmed-result": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "control:failure-trace": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:react": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:typescript": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:javascript": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:java": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:spring-boot": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:python": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:nodejs": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:go": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:rust": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:dotnet": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:kotlin": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:vue": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:angular": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:sparql": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:rdf": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:neptune": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:graphql": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:postgresql": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:docker": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "technology:aws": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": []
    },
    "host:jetbrains": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "reference-65"
      ]
    },
    "host:vscode": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "reference-65"
      ]
    },
    "host:github": {
      "revision": "2.0.1",
      "reviewedOn": "",
      "sourceRefs": [
        "reference-66"
      ]
    },
    "technology:jena-fuseki": {
      "revision": "2.1.0",
      "reviewedOn": "2026-10-05",
      "sourceRefs": [
        "jena-fuseki"
      ]
    },
    "technology:neo4j": {
      "revision": "2.1.0",
      "reviewedOn": "2026-10-05",
      "sourceRefs": [
        "neo4j-start"
      ]
    },
    "practice:validated-retrieval": {
      "revision": "2.1.0",
      "reviewedOn": "2026-10-05",
      "sourceRefs": [
        "input-validation"
      ]
    }
  }
});
