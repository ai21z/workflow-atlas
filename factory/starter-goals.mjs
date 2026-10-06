import { createRecipe } from './core.mjs'

// Ready goals supply editable planning guidance, never project evidence or setup.
const starters = [
  {
    id: 'add-feature',
    label: 'Add a feature',
    group: 'Build and improve',
    description: 'Turn a user need into a small feature and a review plan.',
    recipeId: 'feature-delivery',
    purpose: 'Plan and deliver a feature that meets an agreed user need.',
    stageNotes: {
      requirements: 'Identify who needs the feature and the problem it should solve. Agree examples of useful behavior, invalid inputs and access boundaries.',
      architecture: 'Inspect the existing feature area and its interfaces. Compare reuse with the smallest necessary change before choosing an approach.',
      breakdown: 'Split the feature into reviewable tasks. Link each task to an agreed behavior and the evidence needed to accept it.',
      implementation: 'Implement one agreed slice using verified repository conventions. Record any scope changes for review.',
      verification: 'Check the agreed examples and nearby behavior. Keep actual results separate from the planned checks.',
      release: 'Confirm the real release and rollback process with its owner before planning the rollout.',
      operations: 'Agree how the owner will detect problems after release and where actual observations will be recorded.',
    },
  },
  {
    id: 'connect-service',
    label: 'Connect a service or API',
    group: 'Build and improve',
    description: 'Plan an integration, its contracts and its failure cases.',
    recipeId: 'feature-delivery',
    purpose: 'Plan and deliver an integration with a service or API through an approved interface.',
    stageNotes: {
      requirements: 'Identify the information or operation needed from the service. Ask the owners about permissions, data handling and expected failure behavior.',
      architecture: 'Verify the service contract, authentication method and allowed operations. Decide where the integration belongs and how responses will be validated.',
      breakdown: 'Separate contract discovery, integration, error handling and verification. Identify access and test environment dependencies before implementation.',
      implementation: 'Use the approved interface and actual contract. Keep credentials outside generated files and record unresolved setup requirements.',
      verification: 'Plan checks for valid, empty, invalid and unavailable responses. For writes, separately agree retry, duplicate and confirmation behavior.',
      release: 'Confirm environment configuration, access ownership and a way to disable or roll back the integration.',
      operations: 'Agree monitoring for integration failures and the owner responsible for changes to the external contract.',
    },
  },
  {
    id: 'automate-task',
    label: 'Automate a repeated task',
    group: 'Build and improve',
    description: 'Make a repeated process explicit before automating it.',
    recipeId: 'feature-delivery',
    purpose: 'Plan and deliver automation for a repeated task with clear inputs, outputs and review boundaries.',
    stageNotes: {
      requirements: 'Document the current task with its owner. Identify inputs, decisions, desired outputs and situations that require a person.',
      architecture: 'Compare ordinary code, existing automation and any justified model decision. Choose a proportionate design with explicit permissions and failure handling.',
      breakdown: 'Split the task into independently checkable steps. Identify what each step needs and when an incomplete result should stop or return for correction.',
      implementation: 'Build the agreed steps using verified tools and interfaces. Keep proposed results distinct from confirmed operations.',
      verification: 'Agree representative, missing-input and failure cases. Check repeated requests and partial completion wherever the task can change data.',
      release: 'Confirm the actual trigger, operating owner and disable or rollback procedure before rollout.',
      operations: 'Agree what task completion means and how exceptions, cost and resource use will be reviewed.',
    },
  },
  {
    id: 'improve-performance',
    label: 'Improve performance',
    group: 'Build and improve',
    description: 'Measure a bottleneck and compare a focused improvement.',
    recipeId: 'feature-delivery',
    purpose: 'Investigate and improve a measured performance problem while preserving required behavior.',
    stageNotes: {
      requirements: 'Identify the operation and user experience to improve. Agree representative workloads, measurement conditions and acceptance criteria before claiming a gain.',
      architecture: 'Collect a baseline and inspect evidence of the bottleneck. Compare targeted options and their correctness, cost and resource tradeoffs.',
      breakdown: 'Separate baseline measurement, one scoped change and comparison. Record how repeatable conditions and behavior checks will be kept.',
      implementation: 'Make the smallest change supported by the bottleneck evidence. Record changed conditions and avoid unrelated optimizations.',
      verification: 'Compare before and after under the agreed conditions. Report observed measurements and behavior checks without assuming an improvement.',
      release: 'Confirm the rollout, monitoring and rollback approach with the release owner.',
      operations: 'Agree how to watch performance and resource use under real workloads, including the conditions that need follow-up.',
    },
  },
  {
    id: 'refactor-code',
    label: 'Refactor existing code',
    group: 'Build and improve',
    description: 'Improve a design while keeping agreed behavior unchanged.',
    recipeId: 'feature-delivery',
    purpose: 'Plan and deliver a scoped refactor that preserves agreed externally visible behavior.',
    stageNotes: {
      requirements: 'Identify the code problem and the behavior that must remain unchanged. Ask the owner how the structural improvement will be reviewed.',
      architecture: 'Inspect dependencies and public contracts. Compare a small refactor with broader alternatives and record migration risks.',
      breakdown: 'Plan small changes that can be reviewed separately. Identify characterization checks needed before changing the implementation.',
      implementation: 'Refactor within the agreed boundary. Surface any proposed behavior or contract change as a separate decision.',
      verification: 'Compare required behavior before and after. Record actual results for the characterization and regression checks.',
      release: 'Confirm whether the refactor needs migration or rollout coordination and use the actual release process.',
      operations: 'Agree how to detect unexpected behavior and who will review whether the refactor solved the original code problem.',
    },
  },
  {
    id: 'fix-bug',
    label: 'Fix a bug',
    group: 'Repair and verify',
    description: 'Reproduce a problem, establish its cause and check the repair.',
    recipeId: 'bugfix',
    purpose: 'Investigate and repair a reported bug with reproduction and regression evidence.',
    stageNotes: {
      reproduction: 'Ask for expected and observed behavior, the affected revision and reproduction inputs. Record an actual reproduction before assuming the cause.',
      diagnosis: 'Trace the failing behavior through the relevant code and contracts. Separate supported causes from hypotheses.',
      'bug-fix': 'Make the smallest repair supported by the diagnosis. Record any newly discovered impact or scope changes.',
      regression: 'Check the original failing case, nearby behavior and boundary inputs. Record actual outcomes and any environment limitations.',
      'bug-review': 'Review the repair and evidence with the owner. Confirm the real release and rollback process before shipment.',
    },
  },
  {
    id: 'repair-pipeline',
    label: 'Repair a failing pipeline',
    group: 'Repair and verify',
    description: 'Trace a failed build or delivery step and verify its repair.',
    recipeId: 'bugfix',
    purpose: 'Investigate and repair a failing build or delivery pipeline using evidence from the affected run.',
    stageNotes: {
      reproduction: 'Locate the failing run, revision, inputs and first actionable error. Establish the intended pipeline behavior from the actual configuration and owner.',
      diagnosis: 'Inspect logs and configuration to distinguish code, dependency, environment, permission and service failures. Keep unsupported causes as hypotheses.',
      'bug-fix': 'Repair the confirmed cause using the real pipeline configuration. Ask for missing access instead of weakening permissions or bypassing required checks.',
      regression: 'Rerun the relevant job under recorded conditions and inspect produced outputs. Check nearby required stages and record remaining environment limitations.',
      'bug-review': 'Review the run evidence and configuration change. Confirm ownership, rollback and whether any delivery step needs separate approval.',
    },
  },
  {
    id: 'improve-tests',
    label: 'Improve test coverage',
    group: 'Repair and verify',
    description: 'Cover important behavior with useful, reliable checks.',
    recipeId: 'feature-delivery',
    purpose: 'Plan and improve tests for important behavior and known verification gaps.',
    stageNotes: {
      requirements: 'Identify important behavior and risks that lack useful checks. Verify the existing test evidence before setting coverage or reliability goals.',
      architecture: 'Inspect current test layers, fixtures and dependencies. Choose the smallest appropriate level for each behavior rather than relying on a coverage percentage alone.',
      breakdown: 'Prioritize checks by risk and usefulness. Separate test setup, representative cases, failure cases and any unreliable existing checks.',
      implementation: 'Add focused tests using actual project conventions and verified commands. Keep assertions connected to intended behavior.',
      verification: 'Run the relevant checks and confirm that they detect a representative failure where practical. Record actual results and limitations.',
      release: 'Confirm how the checks fit the real review and pipeline process, including environment and runtime requirements.',
      operations: 'Agree how test failures and reliability will be maintained and which owner reviews remaining verification gaps.',
    },
  },
  {
    id: 'investigate-idea',
    label: 'Investigate an idea',
    group: 'Explore and plan',
    description: 'Compare options and decide what is worth building.',
    recipeId: 'feasibility',
    purpose: 'Investigate an idea and produce an evidence based decision about the next step.',
    stageNotes: {
      'current-process': 'Ask how the need is handled today. Record actual inputs, decisions, outputs and remaining unknowns.',
      'feasibility-scope': 'Agree the question this study must answer, its boundaries, the decision owner and the evidence needed.',
      options: 'Compare the current approach with proportionate alternatives. State assumptions, dependencies and cost uncertainty for each option.',
      'experiment-plan': 'Plan a small comparison that can distinguish the options. Agree representative inputs and acceptance criteria before collecting results.',
      recommendation: 'Summarize the collected evidence, tradeoffs and unresolved questions. Ask the owner to decide whether to build, investigate further or stop.',
    },
  },
  {
    id: 'plan-ai-workflow',
    label: 'Plan an AI workflow',
    group: 'Explore and plan',
    description: 'Decide where AI helps and plan validation and correction.',
    recipeId: 'feasibility',
    purpose: 'Investigate whether AI can help a defined task and produce a reviewed workflow design with validation and correction boundaries.',
    runtime: true,
    stageNotes: {
      'current-process': 'Describe the task with its owner. Identify current inputs, human decisions, tools, outputs and the evidence available today.',
      'feasibility-scope': 'Agree the decision that may need AI, the intended outcome and the boundary of the study. Leave actual permissions, limits and acceptance thresholds open until confirmed.',
      options: 'Compare deterministic code, existing automation and a bounded AI step. Identify approved tool interfaces, output validation and situations requiring human judgment.',
      'experiment-plan': 'Plan representative and failure cases. Define checks for proposed outputs, bounded correction attempts and a stop or human review route when a result remains unacceptable.',
      recommendation: 'Compare observed results, cost, latency and operating requirements once evidence exists. Record a go, further-study or stop recommendation with its limits.',
    },
  },
]

export const GOAL_STARTERS = Object.freeze(starters.map(starter => Object.freeze({
  ...starter,
  stageNotes: Object.freeze({ ...starter.stageNotes }),
})))

export function createGoalProject(id) {
  const starter = GOAL_STARTERS.find(candidate => candidate.id === id)
  if (!starter) throw new Error('Choose a supported ready goal.')
  const config = createRecipe(starter.recipeId)
  config.project.name = starter.label
  config.project.purpose = starter.purpose
  config.workflow.notes = { ...starter.stageNotes }
  if (starter.runtime) {
    config.runtime.enabled = true
    config.runtime.outcome = starter.purpose
  }
  return config
}
