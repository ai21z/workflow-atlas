window.TOPIC_DATA = {
  "nodes": [
    {
      "id": "overview",
      "parent": null,
      "title": "Project overview",
      "summary": "Understand a workflow, choose relevant practices and see how steps, outputs and checks connect.",
      "sections": [
        {
          "type": "p",
          "label": "Start with the outcome",
          "text": "Name the result, who needs it and what would make it acceptable. Then identify the steps, responsible people or systems, inputs and evidence. Use a model only where its contribution is useful."
        },
        {
          "type": "table",
          "label": "Three examples to adapt",
          "headers": [
            "Example workflow",
            "Result"
          ],
          "rows": [
            [
              "Investigate requirements or debt",
              "A supported brief, decision or actionable finding"
            ],
            [
              "Implement and verify a change",
              "A reviewable change with evidence for the relevant revision"
            ],
            [
              "Curate domain data",
              "A candidate assertion with source support, scope and uncertainty"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Examples are optional",
          "text": "The map includes issue tracking, documentation, source control, CI, services and graph data. Named technologies illustrate particular environments. Choose the practices that match your task."
        },
        {
          "type": "p",
          "label": "How to use this map",
          "text": "Read a general topic, follow a relevant example and compare its assumptions with your project. The map groups related knowledge. Its lines do not schedule work or pass data between running agents."
        },
        {
          "type": "p",
          "label": "What Atlas currently does",
          "text": "The Factory records decisions in supported development recipes and exports instructions and evidence templates. Configurable outcome branches and correction loops are planned. Reading these patterns does not add them to your project or execute them."
        },
        {
          "type": "p",
          "label": "What remains unknown",
          "text": "This map has not audited your repository or process. Establish actual requirements, coverage, model fit, integration effort and benefits with project evidence."
        },
        {
          "type": "p",
          "label": "Worked feasibility study",
          "text": "The reference-to-configuration example assesses whether an engineer-assisted process should become a governed service. It illustrates a study, with no claim of measured savings or a deployed integration."
        }
      ],
      "refs": [],
      "related": [
        "task-contract",
        "pilot",
        "confidence-summary",
        "construct-study",
        "workflow-patterns",
        "architecture-decisions",
        "work-breakdown",
        "release-operations"
      ],
      "basis": "Research synthesis",
      "confidence": "High for documented facts; moderate for fit"
    },
    {
      "id": "workflows",
      "parent": "overview",
      "title": "Workflows & orchestration",
      "summary": "Use explicit stages and acceptance criteria, with models performing analysis inside the process.",
      "sections": [
        {
          "type": "p",
          "label": "Recommended architecture",
          "text": "Start with one bounded outcome. Identify the steps, their inputs and outputs, who performs them and what happens after each check. Share useful instructions and controls where their assumptions fit."
        },
        {
          "type": "p",
          "label": "Control and judgment",
          "text": "For an automated process, code enforces state transitions, permissions and limits. Models can investigate ambiguity, propose results and explain findings. A manual process can use the same explicit steps and checks with people responsible for them."
        },
        {
          "type": "p",
          "label": "Platform choice",
          "text": "Check whether existing automation and CI can meet the need. Atlassian Automation and Jenkins are examples. Evaluate durable execution when restart recovery, long waits or reliable resumption of external actions justify it."
        },
        {
          "type": "p",
          "label": "Apply proportionately",
          "text": "Distinguish the work of developing a capability from what the finished application does for each request. A study may end in a decision package. It does not require building an execution platform."
        }
      ],
      "refs": [
        "temporal"
      ],
      "related": [
        "skills",
        "task-contract",
        "pilot",
        "construct-study",
        "study-contract",
        "workflow-patterns",
        "architecture-decisions"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "workflow-patterns",
      "parent": "workflows",
      "title": "Reusable workflow patterns",
      "summary": "Connect steps, results and checks. Decide what happens when a result passes, needs correction or cannot continue.",
      "sections": [
        {
          "type": "p",
          "label": "Start with five questions",
          "text": "What happens here, who does it, what does it need, what does it produce and how do we know the result is acceptable? A person, ordinary code, an agent or an existing system can perform a step."
        },
        {
          "type": "table",
          "label": "Choose a pattern",
          "headers": [
            "Pattern",
            "Use it when"
          ],
          "rows": [
            [
              "Sequence",
              "A known step produces an input for the next one."
            ],
            [
              "Review gate",
              "A check or authorized review determines whether work can continue."
            ],
            [
              "Bounded correction",
              "Useful feedback can improve a result and the process has a clear stopping rule."
            ]
          ]
        },
        {
          "type": "table",
          "label": "Three different connections",
          "headers": [
            "Connection",
            "Meaning"
          ],
          "rows": [
            [
              "Input",
              "The check needs this candidate and these criteria."
            ],
            [
              "Outcome route",
              "A repairable finding sends work to the correction step."
            ],
            [
              "Instruction",
              "The assigned skill describes how that step should be carried out."
            ]
          ]
        },
        {
          "type": "code",
          "label": "Example correction flow",
          "text": "Produce or supply a candidate\n → Check the candidate\n   Pass → approval if required → deliver\n   Repairable → limit allows → correct → check again\n   Missing input → ask for clarification\n   Blocked or limit reached → stop with findings"
        },
        {
          "type": "list",
          "label": "Define the loop",
          "items": [
            "Return the relevant candidate and specific findings to the correction step.",
            "Record an attempt limit and its counting rule. Add time or spending limits with units when needed.",
            "Keep unknown, unavailable and unrun checks separate from a pass.",
            "Check the revised candidate. Preserve earlier evidence as history rather than approving the new version automatically.",
            "If approval is needed, name its authority and the candidate it concerns. Changed work may need approval again.",
            "Define what happens when correction cannot help, input is missing or the limit is reached."
          ]
        },
        {
          "type": "p",
          "label": "Approval outcomes",
          "text": "Approval concerns the checked candidate. Declined approval stops or follows its explicit route. Requested changes may enter the bounded correction path. A revision must go through the relevant checks and any required approval again."
        },
        {
          "type": "p",
          "label": "Retry or correction",
          "text": "A transport retry repeats an operation. A correction changes a candidate using feedback and then checks it again. If a timeout may have followed a write, establish the resulting state before repeating that action."
        },
        {
          "type": "p",
          "label": "Choose the right check",
          "text": "Use applicable schema checks, tests, evidence review or human judgment. Model grading needs evaluation against reviewed examples. The generator saying it succeeded is not enough. Passing a format check does not establish that the result meets the intended meaning."
        },
        {
          "type": "table",
          "label": "The same structure in different work",
          "headers": [
            "Case",
            "Result and feedback"
          ],
          "rows": [
            [
              "Backend generation",
              "A candidate configuration and validation findings."
            ],
            [
              "Bug repair",
              "A proposed change and regression evidence."
            ],
            [
              "Document review",
              "A draft and requested changes against the brief."
            ]
          ]
        },
        {
          "type": "p",
          "label": "Development and application behavior",
          "text": "How a team builds and releases a generator is different from what the generator does on each request. Link the development evaluation to the application behavior it tests. Do not mix those steps into one unexplained process."
        },
        {
          "type": "p",
          "label": "Current Atlas boundary",
          "text": "This topic teaches a design pattern. The Factory currently uses fixed development recipes and exports files. Editable outcome routes and correction loops are planned, not implemented. General document workflows are outside the current JEV recipe suggestions."
        },
        {
          "type": "p",
          "label": "Source and adaptation",
          "text": "Anthropic describes chains with programmatic gates and an evaluator-optimizer loop using model feedback. The broader person, code and agent examples here are proposed Atlas adaptations. A runtime must implement and enforce the designed behavior."
        }
      ],
      "refs": [
        "simple-agents",
        "evals"
      ],
      "related": [
        "task-contract",
        "retries",
        "architecture",
        "study-contract",
        "study-quality",
        "verification-loops",
        "post-change-checks"
      ],
      "basis": "Documented patterns + proposed adaptation",
      "confidence": "Moderate for fit. No workflow execution established"
    },
    {
      "id": "architecture-decisions",
      "parent": "workflows",
      "title": "Architecture decisions",
      "summary": "Choose a proportionate design from the required behavior, existing systems and evidence.",
      "sections": [
        {
          "type": "p",
          "label": "Start with the decision",
          "text": "Describe the outcome and constraints that the design must satisfy. Identify which decision is needed now and who can accept it. Leave missing business or operating requirements explicit."
        },
        {
          "type": "steps",
          "label": "Compare workable approaches",
          "items": [
            "Read the agreed behavior, relevant constraints and evidence about the current system.",
            "Map affected components, interfaces, data ownership and external dependencies.",
            "Compare retaining the current approach with proportionate changes. State tradeoffs in quality, effort, cost and recovery.",
            "Investigate the uncertainty most likely to change the choice, using a small experiment where useful.",
            "Record the selected approach, reasons, alternatives, owner and unresolved questions."
          ]
        },
        {
          "type": "p",
          "label": "When an agent is part of the design",
          "text": "Separate the model task from application controls. Define its input, output, permitted tools, checks and failure outcomes. Controller and harness guidance explains this particular architecture concern."
        },
        {
          "type": "p",
          "label": "Example decision",
          "text": "A configuration service might compare extending an existing API with a separate generation job. Request duration, recovery, user feedback and access requirements inform the choice. This example does not establish which approach your project needs."
        },
        {
          "type": "p",
          "label": "Useful result",
          "text": "A decision record and component or interface sketch that another developer can explain and challenge. A list of fashionable tools is not enough to establish architectural fit."
        }
      ],
      "refs": [],
      "related": [
        "requirements-workflow",
        "impact-skill",
        "architecture",
        "study-contract",
        "durable-execution",
        "work-breakdown"
      ],
      "basis": "Proposed practice",
      "confidence": "Moderate. Project constraints require investigation"
    },
    {
      "id": "work-breakdown",
      "parent": "workflows",
      "title": "Break work into deliverable changes",
      "summary": "Turn an agreed outcome into reviewable pieces with clear acceptance, owners and dependencies.",
      "sections": [
        {
          "type": "steps",
          "label": "Plan the pieces",
          "items": [
            "Start with the outcome, selected approach and remaining uncertainty.",
            "Choose a small useful result that can be reviewed and checked.",
            "Describe the work, acceptance examples and responsible actor for each piece.",
            "Identify required inputs and dependent work. An existing artifact can satisfy an input.",
            "Separate investigation of an unresolved decision from implementation that depends on it.",
            "Keep integration and end-to-end acceptance visible across the pieces."
          ]
        },
        {
          "type": "table",
          "label": "Example feature slices",
          "headers": [
            "Piece",
            "Observable result"
          ],
          "rows": [
            [
              "Save and reopen a basic search",
              "A supported set of criteria survives reopening."
            ],
            [
              "Handle invalid and failed saves",
              "The user receives the agreed recovery behavior."
            ],
            [
              "Add naming, if required",
              "A named search behaves according to its acceptance examples."
            ]
          ]
        },
        {
          "type": "p",
          "label": "Adapt the granularity",
          "text": "A slice may need coordinated UI, service and data changes. Do not claim that every technical subtask is independently releasable. For a bug or debt finding, use the remediation guidance to plan a coherent correction."
        },
        {
          "type": "p",
          "label": "Breakdown and traceability",
          "text": "Breakdown decides which work pieces exist and their order. Traceability explains how those pieces, requirements and checks relate. Use both where they help."
        },
        {
          "type": "p",
          "label": "Useful result",
          "text": "Each work item contributes to the outcome, has checkable acceptance and names its prerequisites. Unknown estimates and decisions remain visible."
        }
      ],
      "refs": [],
      "related": [
        "architecture-decisions",
        "requirements-workflow",
        "traceability",
        "decomposition",
        "implementation-workflow"
      ],
      "basis": "Proposed practice with fictional example",
      "confidence": "Moderate. Granularity depends on the project"
    },
    {
      "id": "release-operations",
      "parent": "workflows",
      "title": "Release and operate",
      "summary": "Plan how a checked change reaches its users, how its behavior is observed and how problems are handled.",
      "sections": [
        {
          "type": "p",
          "label": "When this applies",
          "text": "Use this guidance when a software or data change is moving into an operating environment. A feasibility study may instead end with a recommendation. Piloting a new automation is a separate adoption decision."
        },
        {
          "type": "steps",
          "label": "Prepare the release",
          "items": [
            "Identify the candidate revision and required acceptance evidence, including unresolved checks.",
            "Confirm the release owner, decision authority and existing deployment process.",
            "Review relevant interface, configuration and data changes and their compatibility requirements.",
            "Define how exposure, observation and recovery will work for this change.",
            "After deployment, inspect relevant service and user behavior and record the actual result.",
            "Hand over operating ownership, support information and remaining follow-up work."
          ]
        },
        {
          "type": "p",
          "label": "Recovery is a design decision",
          "text": "Choose an applicable recovery path, such as rollback, disabling a feature or a forward correction. A data migration or external action may not be reversible. Establish the recovery procedure and its constraints before relying on it."
        },
        {
          "type": "p",
          "label": "An AI feature needs both checks",
          "text": "Evaluate the service and its failure paths before release. Where required, also validate individual generated results during use. A successful pre-release evaluation does not make every later result correct."
        },
        {
          "type": "p",
          "label": "Example to adapt",
          "text": "A configuration generator can retain a checked draft until its application is explicitly authorized. An ordinary web feature may use the existing release pipeline. Neither example requires a particular CI product."
        },
        {
          "type": "p",
          "label": "Useful result",
          "text": "A release plan and, after execution, evidence of the deployed candidate, observed behavior and operating owner. A passing check or a generated plan alone does not establish deployment."
        }
      ],
      "refs": [],
      "related": [
        "verification-loops",
        "qa-packet",
        "pilot",
        "workflow-patterns",
        "eval-metrics",
        "study-contract"
      ],
      "basis": "Proposed practice",
      "confidence": "Moderate. Release procedures are project specific"
    },
    {
      "id": "requirements-workflow",
      "parent": "workflows",
      "title": "Requirements investigation",
      "summary": "Turn a request into a traceable brief before generating implementation tickets.",
      "sections": [
        {
          "type": "steps",
          "label": "Sequence",
          "items": [
            "Read the request and relevant reviewed decisions from the sources your team uses.",
            "Inspect pinned code/data revisions and existing verification.",
            "Separate confirmed requirements, observed behavior, proposals, and unresolved questions.",
            "Identify the affected data, components, interfaces and tests. Include only the parts that exist in this project.",
            "Prepare acceptance scenarios and evidence links."
          ]
        },
        {
          "type": "p",
          "label": "Worked example",
          "text": "In the reference-to-configuration case, the request is in Jira, reviewed decisions are in Confluence, and impact may include an ontology, SPARQL queries, services and a user interface. These illustrate the workflow. They are not required tools for other projects."
        },
        {
          "type": "p",
          "label": "Output",
          "text": "A reviewed implementation brief: desired outcome, scope, source versions, affected components, acceptance criteria, uncertainties, and owner."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Every asserted requirement has supporting evidence or is explicitly proposed. Missing context remains visible rather than guessed."
        }
      ],
      "refs": [],
      "related": [
        "requirement-status",
        "traceability",
        "task-contract",
        "requirements-skill"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "implementation-workflow",
      "parent": "workflows",
      "title": "Verified implementation",
      "summary": "Implement a scoped change and prepare a PR supported by actual execution evidence.",
      "sections": [
        {
          "type": "steps",
          "label": "Sequence",
          "items": [
            "Confirm the task contract and relevant repository revision, including submodules where used.",
            "Inspect affected source and tests.",
            "Make the smallest coherent change.",
            "Run focused verification after the relevant edits.",
            "Review the diff and use broader checks at the established gate.",
            "Prepare the pull request or review submission with its evidence packet."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Evidence identifies the resulting revision, actual commands or pipeline runs, results, exclusions, and unresolved concerns. The model’s statement “tests pass” is not verification."
        },
        {
          "type": "p",
          "label": "Scope control",
          "text": "New requirements or unrelated refactors become explicit proposals; they do not silently enlarge the change."
        },
        {
          "type": "p",
          "label": "Example toolchain",
          "text": "A team using Bitbucket can attach the review to a pull request and link Jenkins results. Use the equivalent review and verification records for your environment."
        }
      ],
      "refs": [
        "taloscycle"
      ],
      "related": [
        "post-change-checks",
        "jenkins",
        "bitbucket",
        "qa-packet",
        "workflow-patterns",
        "work-breakdown",
        "release-operations"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "curation-workflow",
      "parent": "workflows",
      "title": "Country-data curation",
      "summary": "Compare proposed assertions with source evidence before they become approved domain data.",
      "sections": [
        {
          "type": "steps",
          "label": "Sequence",
          "items": [
            "Capture original source version and relevant passages.",
            "Construct candidate assertions preserving jurisdiction, population, classification scheme, and temporal scope.",
            "Run deterministic parsing, datatype, shape, and temporal checks.",
            "Optionally apply narrow Jev support/mapping judgments.",
            "Prepare conflicts and uncertainty for domain review.",
            "Publish through the existing approved-data process."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The resulting assertion preserves the source’s meaning and applicability, and its derivation is recorded. Candidate data does not leak into ordinary serving queries."
        }
      ],
      "refs": [
        "shacl",
        "neptune"
      ],
      "related": [
        "jev-support",
        "candidate-isolation",
        "answer-contract",
        "applicability"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "architecture",
      "parent": "workflows",
      "title": "Controller & harness",
      "summary": "The missing layer above skills and agents provides execution state and enforceable controls.",
      "sections": [
        {
          "type": "table",
          "label": "Responsibilities",
          "headers": [
            "Component",
            "Job"
          ],
          "rows": [
            [
              "Instructions",
              "Persistent project conventions"
            ],
            [
              "Skills",
              "Reusable procedures and resources"
            ],
            [
              "Agent definitions",
              "Role, model, and selected tools"
            ],
            [
              "Workflow controller",
              "Stages, dependencies, conditions, handoffs"
            ],
            [
              "Harness",
              "Environment, credentials, execution, budgets, observations"
            ],
            [
              "Knowledge layer",
              "Retrievable project/domain evidence"
            ],
            [
              "Evaluation layer",
              "Measures actual performance"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Design boundary",
          "text": "A prompt can describe a rule. The runtime must enforce permissions, state changes, and budget controls. A skill does not create durable execution or prove successful completion."
        }
      ],
      "refs": [
        "skillspec"
      ],
      "related": [
        "task-contract",
        "agent-roles",
        "durable-execution",
        "skill-definition",
        "architecture-decisions",
        "workflow-patterns"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "task-contract",
      "parent": "workflows",
      "title": "Task & evidence contract",
      "summary": "Make the expected outcome, inputs, permissions, verification, and limits explicit.",
      "sections": [
        {
          "type": "list",
          "label": "Required fields",
          "items": [
            "Task identity, owner, desired outcome and exclusions.",
            "Relevant input and source versions. Include repository and dependency revisions when the task changes or inspects code.",
            "Allowed actions and affected systems.",
            "Acceptance criteria, required checks and expected evidence.",
            "Applicable time, correction, tool-call or spending limits, with units and a stopping outcome.",
            "Expected outputs and conditions requiring clarification or assistance."
          ]
        },
        {
          "type": "p",
          "label": "Completion record",
          "text": "Keep observed facts, inferences, unresolved questions, executed checks and exceptions distinct. A relevant change requires a review of which earlier checks or approvals still apply. Preserve the earlier evidence as history."
        },
        {
          "type": "p",
          "label": "Reusable across workflows",
          "text": "The same structure can describe a code investigation, document review or data curation task. Each adds its own acceptance criteria. A repository, model call or automated write is not required for every task."
        }
      ],
      "refs": [],
      "related": [
        "qa-packet",
        "finding-contract",
        "answer-contract",
        "budgets",
        "permissions",
        "workflow-patterns"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "deterministic-control",
      "parent": "workflows",
      "title": "Code vs model decisions",
      "summary": "Assign exact calculations and enforceable rules to deterministic components.",
      "sections": [
        {
          "type": "table",
          "label": "Division of work",
          "headers": [
            "Deterministic component",
            "Model-assisted task"
          ],
          "rows": [
            [
              "Compare dates and compute rates",
              "Extract possible values from unstructured passages"
            ],
            [
              "Enforce access and publication state",
              "Flag ambiguity and recommend routing"
            ],
            [
              "Check commit/run identity",
              "Investigate a failed pipeline"
            ],
            [
              "Validate schema and shapes",
              "Suggest ontology mapping"
            ],
            [
              "Deduplicate known event IDs",
              "Assess semantic similarity of bounded candidates"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Models cannot turn an unsupported claim into approved data by expressing certainty. Every resulting action remains constrained by the controller’s rules."
        }
      ],
      "refs": [
        "jevlimits"
      ],
      "related": [
        "jev-limitations",
        "permissions",
        "event-state"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "event-state",
      "parent": "workflows",
      "title": "State & duplicate events",
      "summary": "Represent work explicitly so retries and duplicate deliveries do not create repeated actions.",
      "sections": [
        {
          "type": "code",
          "label": "Example states",
          "text": "Received → Evidence collected → Analyzed → Proposed → Verified → Ready for review → Accepted\nAlternative outcomes: Needs information, Failed, Unsupported, Cancelled"
        },
        {
          "type": "p",
          "label": "Implementation proposal",
          "text": "Store task/run identity, triggering event identity, completed steps, input versions, artifacts, and terminal status. Use idempotency for externally visible writes and suppress self-triggering automation loops."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Replaying the same event does not create another ticket or PR. A retry reuses valid completed work and clearly identifies which input changed."
        }
      ],
      "refs": [],
      "related": [
        "retries",
        "durable-execution",
        "rovo",
        "task-contract"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "parallelism",
      "parent": "workflows",
      "title": "Parallel investigations",
      "summary": "Delegate independent work when it improves speed or evidence quality.",
      "sections": [
        {
          "type": "p",
          "label": "Example split",
          "text": "One investigator traces React behavior while another checks SPARQL fixtures. They return structured findings with versions and source locations."
        },
        {
          "type": "p",
          "label": "Merge discipline",
          "text": "One owner combines findings, resolves contradictions, and controls the implementation. Avoid concurrent independent edits of the same files."
        },
        {
          "type": "p",
          "label": "Cost discipline",
          "text": "Add an agent for a separable task or justified review perspective. Agent count and model agreement are not quality metrics."
        }
      ],
      "refs": [],
      "related": [
        "agent-roles",
        "handoffs",
        "cost-per-result"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "durable-execution",
      "parent": "workflows",
      "title": "Durable execution",
      "summary": "Introduce persistent orchestration when jobs must recover or wait across long periods.",
      "sections": [
        {
          "type": "list",
          "label": "Evaluate when needed",
          "items": [
            "A process must survive runner/service restarts.",
            "Approval or external data can arrive days later.",
            "A workflow must resume without repeating external writes.",
            "Long tasks need persistent checkpoints and inspectable progress."
          ]
        },
        {
          "type": "p",
          "label": "Technology option",
          "text": "Temporal provides durable workflow guidance for AI applications. This is a candidate to evaluate against requirements, not a mandatory addition to the stack."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Failure recovery and resumption are tested with real side effects and recorded state. An in-memory chat history is not durable orchestration."
        }
      ],
      "refs": [
        "temporal"
      ],
      "related": [
        "architecture",
        "event-state",
        "dynamic-workflows"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "dynamic-workflows",
      "parent": "workflows",
      "title": "Copilot Dynamic Workflows",
      "summary": "A recently introduced, code-defined orchestration option to evaluate for the pilot.",
      "sections": [
        {
          "type": "p",
          "label": "Verified capability",
          "text": "The 1 October 2026 announcement covers Copilot CLI, the Copilot app, and SDK. Workflows can mix deterministic steps, agents, tools, structured results, and review checkpoints. Status: public preview."
        },
        {
          "type": "p",
          "label": "Scope",
          "text": "Do not assume the same feature is available directly in IntelliJ’s interface. Check the actual client and enterprise policy before selecting it."
        },
        {
          "type": "p",
          "label": "Limits and permissions",
          "text": "Documented credit limits are approximate because usage is reported after it occurs. Extension code can run outside subagent permission prompts; runner credentials and sandbox controls still matter."
        },
        {
          "type": "p",
          "label": "Decision",
          "text": "Try a small, versioned workflow with fixed inputs and recorded outputs. Compare its maintainability and recovery behavior with existing Jenkins/Atlassian automation."
        }
      ],
      "refs": [
        "dynamic",
        "dynamicdocs"
      ],
      "related": [
        "intellij",
        "budgets",
        "permissions",
        "durable-execution"
      ],
      "basis": "Documented capability + proposed evaluation",
      "confidence": "High for capability; unknown for tenant fit"
    },
    {
      "id": "retries",
      "parent": "workflows",
      "title": "Retries & stopping rules",
      "summary": "Distinguish repeating an operation from correcting a result, and define when each must stop.",
      "sections": [
        {
          "type": "p",
          "label": "Retry or correction",
          "text": "A retry repeats an operation after a failure such as a connection problem. A correction uses findings to change an unacceptable result. An uncertain write outcome needs confirmation or reconciliation before another write."
        },
        {
          "type": "list",
          "label": "Proposed controls",
          "items": [
            "Bound attempts, wall-clock time, tool calls, model calls, and spend.",
            "Record why an attempt failed and what changed before retrying.",
            "Stop repeated diagnosis that produces no new evidence.",
            "Handle unavailable sources and permission denial as explicit outcomes.",
            "Deduplicate external writes before retries."
          ]
        },
        {
          "type": "p",
          "label": "A bounded correction loop",
          "text": "Specify which step receives the candidate and findings, what counts as an attempt and where the process stops. For example, two corrections after the initial candidate is a clear counting rule, not a recommended default. Recheck the revised result."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "A run can end with a useful partial finding rather than fabricate completion. The reviewer can inspect attempted actions and remaining blockers."
        }
      ],
      "refs": [
        "talosbudget"
      ],
      "related": [
        "budgets",
        "verdicts",
        "event-state",
        "workflow-patterns"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "toolchain",
      "parent": "overview",
      "title": "Tools and integrations",
      "summary": "Assign existing systems concrete responsibilities and verify actual integration boundaries.",
      "sections": [
        {
          "type": "p",
          "label": "Start with responsibilities",
          "text": "Identify where requests, decisions, source files, checks and operational records live today. Keep existing systems when they meet the need. Add an integration only when a workflow requires a supported action."
        },
        {
          "type": "p",
          "label": "Example toolchain",
          "text": "One workplace example uses Jira for requests, Confluence for reviewed decisions, Bitbucket for source control, IntelliJ/Copilot for local work, Jenkins/Sonar for checks, Rovo for configured Atlassian tasks and Neptune for graph data. These are possible assignments, not required products."
        },
        {
          "type": "p",
          "label": "Integration check",
          "text": "Inventory client/plugin versions, active harnesses, models, organization policies, tools, credentials, and supported write actions before implementation."
        }
      ],
      "refs": [],
      "related": [
        "architecture",
        "capability-inventory",
        "permissions"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "jira",
      "parent": "toolchain",
      "title": "Jira",
      "summary": "Task contracts, acceptance criteria, ownership, and reviewed findings.",
      "sections": [
        {
          "type": "list",
          "label": "Useful automation",
          "items": [
            "Flag missing acceptance criteria with evidence-backed questions.",
            "Draft a requirements brief or deduplicated debt finding.",
            "Link affected modules, tests, source decisions, and build evidence.",
            "Record unresolved questions and owner decisions."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Do not replace missing product decisions with invented requirements. Preserve confirmed/proposed/unresolved distinctions. Review findings before converting a large scan into tickets."
        }
      ],
      "refs": [],
      "related": [
        "requirements-workflow",
        "finding-contract",
        "requirement-status",
        "rovo"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "confluence",
      "parent": "toolchain",
      "title": "Confluence",
      "summary": "Reviewed architecture, requirements, decisions, runbooks, and explanations.",
      "sections": [
        {
          "type": "list",
          "label": "Useful automation",
          "items": [
            "Draft documentation from accepted changes and linked evidence.",
            "Detect conflicts or stale references between documents and implementation.",
            "Prepare architecture decision material with alternatives and unresolved constraints.",
            "Maintain source anchors, owner, review status, and last verification date."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Generated prose becomes reviewed project knowledge through the normal ownership process. A summary is a navigation aid; its citations must lead back to underlying evidence."
        }
      ],
      "refs": [],
      "related": [
        "llm-wiki",
        "engineering-knowledge",
        "answer-contract",
        "rovo"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "bitbucket",
      "parent": "toolchain",
      "title": "Bitbucket",
      "summary": "Versioned code, TTL, SPARQL, tests, and reviewable changes.",
      "sections": [
        {
          "type": "p",
          "label": "Recommended use",
          "text": "Keep relevant procedures and verification scripts near the code/data they describe. Link findings and PR evidence to exact revisions, including submodule revisions."
        },
        {
          "type": "p",
          "label": "Verified constraint",
          "text": "GitHub Copilot cloud agent currently works with GitHub-hosted repositories. A Bitbucket checkout used in IntelliJ is a different execution route; do not assume GitHub’s cloud PR automation applies."
        },
        {
          "type": "p",
          "label": "Implementation path",
          "text": "Use supervised IDE work or an approved runner that can operate on Bitbucket and your established pipelines. Repository migration is not a prerequisite of this proposal."
        }
      ],
      "refs": [
        "cloud"
      ],
      "related": [
        "implementation-workflow",
        "intellij",
        "post-change-checks"
      ],
      "basis": "Documented constraint + proposed use",
      "confidence": "High"
    },
    {
      "id": "intellij",
      "parent": "toolchain",
      "title": "IntelliJ & Copilot",
      "summary": "A supervised entry point for repository investigation and implementation.",
      "sections": [
        {
          "type": "p",
          "label": "Useful work",
          "text": "Inspect affected modules, edit a bounded change, run local checks, and prepare review evidence in the actual checkout."
        },
        {
          "type": "p",
          "label": "Current distinction",
          "text": "JetBrains’ September update includes session-model selection for built-in subagents. Independent per-agent routing still depends on the harness. Do not transplant SDK configuration assumptions into every IDE mode."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Record the effective client, plugin, harness, model, and permitted tools. Verify execution evidence against the resulting revision."
        }
      ],
      "refs": [
        "jetbrains",
        "sdk"
      ],
      "related": [
        "model-inheritance",
        "capability-inventory",
        "bitbucket"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "jenkins",
      "parent": "toolchain",
      "title": "Jenkins & Sonar",
      "summary": "Executed tests and quality evidence attached to the actual candidate.",
      "sections": [
        {
          "type": "list",
          "label": "Proposed automation",
          "items": [
            "Fetch the failed stage and first actionable failure.",
            "Distinguish code, fixture, environment, permission, and infrastructure failures.",
            "Run focused checks during development; apply established broader gates at milestones.",
            "Attach run identity, commit, report links, quality-gate result, and exclusions."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Pipeline success is evidence of the checks that ran, not proof of every requirement. A missing or skipped report remains visible."
        }
      ],
      "refs": [],
      "related": [
        "ci-skill",
        "coverage",
        "sonar-debt",
        "verification-loops"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "rovo",
      "parent": "toolchain",
      "title": "Rovo Cloud",
      "summary": "Use Atlassian context and configured automation actions for bounded tasks.",
      "sections": [
        {
          "type": "p",
          "label": "Verified write behavior",
          "text": "Current Use agent documentation supports direct writes via “Let this agent take actions”, off by default. It also supports agentResponse passed to explicit downstream actions."
        },
        {
          "type": "p",
          "label": "Initial design",
          "text": "Use a specified Jira or Confluence action after the analysis when you want a tightly defined mutation. Inspect action traces and actor identity."
        },
        {
          "type": "p",
          "label": "Reasoning and cost",
          "text": "Rovo offers Quick and Think deeper tiers; available selections and limits vary. Match the tier to the task and measure credit consumption. Rovo Cloud is the relevant product here, not Rovo CLI."
        }
      ],
      "refs": [
        "rovo",
        "rovotier",
        "rovocredits"
      ],
      "related": [
        "jira",
        "confluence",
        "billing-boundaries",
        "permissions"
      ],
      "basis": "Documented capability + proposed use",
      "confidence": "High for docs; unknown for tenant configuration"
    },
    {
      "id": "neptune-stack",
      "parent": "toolchain",
      "title": "RDF4J & Neptune",
      "summary": "Preserve ontology semantics and verify graph behavior in the actual serving environment.",
      "sections": [
        {
          "type": "p",
          "label": "Proposed role",
          "text": "Use deterministic SPARQL for known relations, versioned TTL and graph fixtures for reproducibility, and applicable SHACL constraints for structural validation."
        },
        {
          "type": "p",
          "label": "Environment fidelity",
          "text": "RDF4J/local fixtures can support focused checks; they do not by themselves establish equivalent behavior and performance in Neptune. Record the tested engine/environment."
        },
        {
          "type": "p",
          "label": "Critical checks",
          "text": "Measure query plans and latency, preserve provenance and scope, and verify candidate isolation because Neptune’s default graph unions named graphs."
        }
      ],
      "refs": [
        "shacl",
        "explain",
        "neptune"
      ],
      "related": [
        "query-performance",
        "candidate-isolation",
        "rdf-skill",
        "provenance"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "permissions",
      "parent": "toolchain",
      "title": "Identity & scoped access",
      "summary": "Enforce allowed actions in credentials and runtime controls.",
      "sections": [
        {
          "type": "p",
          "label": "Two meanings of tokens",
          "text": "Scoped application tokens authorize API actions. Model tokens measure inference input/output; AI credits are a billing unit. These controls solve different problems."
        },
        {
          "type": "list",
          "label": "Proposed controls",
          "items": [
            "Scope tools and credentials to the assigned task and environment.",
            "Record the identity performing each action, such as a requesting user or a service account. Check the configured actor for tools such as Rovo.",
            "Filter retrieval by access rights before generating output.",
            "Constrain both model-invoked tools and direct workflow code.",
            "Keep code review, data approval, and publication rules executable and attributable."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "An agent cannot exceed its assigned access by following a prompt. Output does not expose evidence inaccessible to the intended reader."
        }
      ],
      "refs": [
        "rovo",
        "dynamicdocs"
      ],
      "related": [
        "task-contract",
        "retrieval",
        "candidate-isolation",
        "deterministic-control"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "capability-inventory",
      "parent": "toolchain",
      "title": "Capability inventory",
      "summary": "Check what your organization can actually run before choosing the architecture.",
      "sections": [
        {
          "type": "list",
          "label": "Inventory",
          "items": [
            "The clients, extensions, runtime and versions actually used.",
            "Models available under the applicable account and organization settings, where AI is used.",
            "The model actually reported for each role or delegated run, when relevant.",
            "Supported tools and integrations, their permissions and the identity performing each action.",
            "Access to the relevant source, checks, data and execution environment.",
            "Operating ownership, billing, budgets and evidence retention."
          ]
        },
        {
          "type": "p",
          "label": "Example inventory",
          "text": "For the workplace example, inspect Copilot in IntelliJ, Rovo connections, and access to Bitbucket, Jenkins and Neptune. Another project needs an inventory of its own systems."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Every proposed integration has a tested execution path. A feature announced for one client is not treated as available in every client."
        }
      ],
      "refs": [
        "models",
        "jetbrains",
        "sdk"
      ],
      "related": [
        "dynamic-workflows",
        "model-inheritance",
        "billing-boundaries"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "economy",
      "parent": "overview",
      "title": "Models & token economy",
      "summary": "Optimize accepted outcomes, context quality, and repeated work before elaborate routing.",
      "sections": [
        {
          "type": "p",
          "label": "Operating principle",
          "text": "A lower token price can still create higher total cost if review and correction increase. Compare quality, cost, elapsed time, and review effort on the same representative tasks."
        },
        {
          "type": "p",
          "label": "Starting strategy",
          "text": "Use code for exact work, a utility model for checkable bounded tasks, a main model for normal engineering, and stronger models when task difficulty or measured failure warrants it."
        }
      ],
      "refs": [
        "billing"
      ],
      "related": [
        "routing",
        "cost-per-result",
        "model-prices",
        "eval-metrics"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "model-prices",
      "parent": "economy",
      "title": "Model candidates & prices",
      "summary": "Published Copilot pricing snapshot; candidate choices require project-specific evaluation.",
      "sections": [
        {
          "type": "table",
          "label": "USD per 1 million ordinary tokens · 2 October 2026",
          "headers": [
            "Candidate",
            "Input",
            "Output",
            "Initial benchmark role"
          ],
          "rows": [
            [
              "GPT-6 Luna",
              "$0.10",
              "$0.50",
              "Bounded utility work"
            ],
            [
              "Claude Haiku 4.5",
              "$1",
              "$5",
              "Alternative utility worker"
            ],
            [
              "GPT-5.3-Codex",
              "$1.75",
              "$14",
              "Coding baseline"
            ],
            [
              "Claude Sonnet 5.5",
              "$2",
              "$10",
              "Routine implementation"
            ],
            [
              "GPT-6.1 Sol",
              "$2",
              "$10",
              "Alternative implementation"
            ],
            [
              "Claude Opus 5.5",
              "$4",
              "$20",
              "Difficult interpretation/review"
            ],
            [
              "GPT-6 Astra",
              "$10",
              "$50",
              "Measured escalation"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Pricing scope",
          "text": "Copilot rates, not universal vendor API prices. Cache reads/writes and applicable long-context tiers are excluded from this table. Model availability depends on client and organization policy. Refresh before estimating spend."
        },
        {
          "type": "p",
          "label": "Not a ranking",
          "text": "These are starting candidates, not measured recommendations for your tasks. RDF, Java, React, source-language and review work are example benchmark areas. Evaluate the tasks your project actually needs."
        }
      ],
      "refs": [
        "prices",
        "models"
      ],
      "related": [
        "routing",
        "cost-per-result",
        "capability-inventory"
      ],
      "basis": "Documented pricing + proposed benchmarks",
      "confidence": "High for snapshot; unknown for task performance"
    },
    {
      "id": "routing",
      "parent": "economy",
      "title": "Task-based model routing",
      "summary": "Choose the least expensive route that satisfies the task’s measured acceptance criteria.",
      "sections": [
        {
          "type": "steps",
          "label": "Proposed routing policy",
          "items": [
            "Use deterministic code for structured parsing, calculations, dates, permissions, schema checks, and execution.",
            "Use a utility model for bounded tasks with readily checkable outputs.",
            "Use a main implementation model for normal repository analysis and changes.",
            "Route difficult or consequential interpretation directly to a stronger model when justified.",
            "Escalate on a defined condition: contradictory evidence, unresolved diagnosis, or failed verification."
          ]
        },
        {
          "type": "p",
          "label": "Avoid repeated work",
          "text": "Do not pass every task through every model tier. A second model needs a specific purpose, such as a different investigation or independently checking a difficult finding."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Routing is backed by held-out task results, cost, latency, and review effort rather than model reputation alone."
        }
      ],
      "refs": [],
      "related": [
        "model-prices",
        "model-inheritance",
        "jev-judgments",
        "eval-corpus"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "cost-per-result",
      "parent": "economy",
      "title": "Cost per accepted result",
      "summary": "Include rejected runs, retries, and human correction when measuring value.",
      "sections": [
        {
          "type": "code",
          "label": "Metric",
          "text": "Cost per accepted result =\n(total inference + connectors + runner + review/rework cost across all attempts)\n÷ accepted results"
        },
        {
          "type": "list",
          "label": "Record per run",
          "items": [
            "Task class, input versions, model/version, and supported reasoning configuration.",
            "Input, output, cache usage, tool calls, retries, and runner time where observable.",
            "Accepted/rejected/partial outcome, reviewer edits, and downstream defects.",
            "Elapsed time and human review effort alongside cost."
          ]
        },
        {
          "type": "p",
          "label": "Interpretation",
          "text": "Token savings without acceptable quality are not a successful optimization. Do not claim a savings percentage before measuring the baseline."
        },
        {
          "type": "p",
          "label": "Denominator and evidence",
          "text": "Use all-attempt cost for one workload/window divided by accepted task artifacts counted once. Report zero accepted outcomes explicitly. Separate first-pass/repaired acceptance and observations/forecasts. Workplace savings are unmeasured."
        }
      ],
      "refs": [],
      "related": [
        "eval-metrics",
        "routing",
        "billing-boundaries",
        "confidence-summary",
        "study-economics"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "context-selection",
      "parent": "economy",
      "title": "Relevant context",
      "summary": "Retrieve high-signal evidence when needed instead of loading the whole project.",
      "sections": [
        {
          "type": "list",
          "label": "Proposed practice",
          "items": [
            "Begin with a compact task brief and affected module map.",
            "Retrieve relevant source passages, decisions, symbols, files, and tests.",
            "Return compact tool output with identifiers for follow-up reads.",
            "Preserve applicability, negative evidence, and unresolved requirements.",
            "Compact long sessions using explicit checkpoints and artifact links."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The context contains enough evidence for the decision without unrelated repository/wiki material. Smaller context is useful only when necessary meaning remains intact."
        }
      ],
      "refs": [
        "context"
      ],
      "related": [
        "retrieval",
        "handoffs",
        "eager-skills"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "revision-cache",
      "parent": "economy",
      "title": "Revision-keyed reuse",
      "summary": "Reuse analysis only while its source inputs remain valid.",
      "sections": [
        {
          "type": "p",
          "label": "Cache proposal",
          "text": "Key repository analysis by commit and relevant submodule revisions; source analysis by document/entity version; graph results by dataset and ontology/shape versions."
        },
        {
          "type": "p",
          "label": "Invalidation",
          "text": "A changed input, schema, prompt, or evaluation policy can invalidate a derived result. Preserve source anchors so the reviewer can identify what the cache describes."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "A reused result is attributable to the current task inputs. Old passing checks never masquerade as verification of a changed candidate."
        }
      ],
      "refs": [],
      "related": [
        "post-change-checks",
        "provenance",
        "task-contract"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "handoffs",
      "parent": "economy",
      "title": "Compact agent handoffs",
      "summary": "Pass structured findings and evidence identifiers rather than entire conversations.",
      "sections": [
        {
          "type": "list",
          "label": "Handoff fields",
          "items": [
            "Task and input revision identity.",
            "Confirmed observations and exact source locations.",
            "Inferences labeled separately from facts.",
            "Actions executed, resulting artifacts, and verification results.",
            "Unresolved questions, constraints, and next required decision."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The receiving agent can retrieve underlying evidence and continue without inheriting irrelevant conversation or silently losing constraints."
        }
      ],
      "refs": [],
      "related": [
        "parallelism",
        "task-contract",
        "answer-contract"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "budgets",
      "parent": "economy",
      "title": "Budgets & limits",
      "summary": "Bound work and measure consumption before scaling a workflow.",
      "sections": [
        {
          "type": "list",
          "label": "Budget dimensions",
          "items": [
            "Model calls and token/output allowances supported by the runtime.",
            "Tool calls, repair attempts, and wall-clock time.",
            "Workflow spend, concurrent agents, and total agent launches.",
            "Runner and connector consumption as separate cost components."
          ]
        },
        {
          "type": "p",
          "label": "Documented limits",
          "text": "GitHub states that budget exhaustion does not automatically fall back to a cheaper model. Dynamic Workflow credit limits are approximate, so usage already underway can overshoot the stated threshold."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Run a small scope, inspect actual usage, and size limits from evidence. Stop launching more work when the remaining budget cannot support a useful next stage."
        },
        {
          "type": "p",
          "label": "SDK session soft cap",
          "text": "Copilot SDK checks limits after responses return; a response can overshoot before another call is blocked. Connector, runtime and review costs need separate accounting."
        }
      ],
      "refs": [
        "billing",
        "dynamicdocs",
        "sdk-session-limits"
      ],
      "related": [
        "retries",
        "cost-per-result",
        "dynamic-workflows",
        "study-runtime"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "model-inheritance",
      "parent": "economy",
      "title": "Subagent model routing",
      "summary": "Effective model selection varies between SDK, IDE, and other harnesses.",
      "sections": [
        {
          "type": "p",
          "label": "Verified distinctions",
          "text": "Copilot SDK supports per-agent model and reasoningEffort overrides. JetBrains’ September update supports selecting the session model used by built-in subagents. This does not imply arbitrary independent routing for every child in every client."
        },
        {
          "type": "p",
          "label": "Configuration practice",
          "text": "Verify the effective model in the actual run. Confirm supported effort settings rather than assuming they are available everywhere or inherited across different models."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The intended route and observed route agree, and their cost/performance are measured."
        }
      ],
      "refs": [
        "sdk",
        "jetbrains"
      ],
      "related": [
        "capability-inventory",
        "routing",
        "intellij"
      ],
      "basis": "Documented harness-specific behavior",
      "confidence": "High"
    },
    {
      "id": "billing-boundaries",
      "parent": "economy",
      "title": "Copilot & Rovo billing",
      "summary": "A cross-platform workflow can consume more than one allowance.",
      "sections": [
        {
          "type": "p",
          "label": "Copilot Business",
          "text": "Current billing uses model-priced input/output/cache tokens converted into AI credits; 1 credit equals $0.01. Included Business credits are pooled at the billing entity. Additional usage and administrative budgets affect availability."
        },
        {
          "type": "p",
          "label": "Rovo",
          "text": "Some enriched Teamwork Graph context supplied to external AI clients consumes Rovo credits as well as external inference usage. Inspect your tenant’s current rules and reports."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Use measured reports from each relevant system. Do not equate an Atlassian API token, a model token, and an AI credit, or reuse a legacy request-multiplier estimate blindly."
        },
        {
          "type": "p",
          "label": "Production model access",
          "text": "A documented SDK server-to-server route exists. Check organization enablement, permissions, runtime support and billing attribution; IDE access does not establish this organization's eligibility."
        }
      ],
      "refs": [
        "billing",
        "rovocredits",
        "sdk-server-auth"
      ],
      "related": [
        "cost-per-result",
        "permissions",
        "rovo",
        "study-economics",
        "study-runtime"
      ],
      "basis": "Documented billing behavior",
      "confidence": "High for docs; unknown for actual consumption"
    },
    {
      "id": "skills",
      "parent": "overview",
      "title": "Skills & agent roles",
      "summary": "Package repeatable procedures around real tasks and executable supporting tools.",
      "sections": [
        {
          "type": "p",
          "label": "Starting package",
          "text": "Choose procedures that repeat in the actual work, such as requirements investigation, impact analysis, verification or review preparation. Add specialized skills only when their tasks are present."
        },
        {
          "type": "p",
          "label": "Author from evidence",
          "text": "Create a skill when a useful procedure repeats or an observed failure reveals missing guidance. A large persona catalog does not substitute for working tools and acceptance criteria."
        },
        {
          "type": "p",
          "label": "Specialized examples",
          "text": "Jenkins diagnosis, RDF/SPARQL verification and country-source review illustrate particular environments. They are not a required starter package."
        }
      ],
      "refs": [
        "anthropicskills"
      ],
      "related": [
        "skill-definition",
        "agent-roles",
        "eager-skills"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "skill-definition",
      "parent": "skills",
      "title": "Skill contract",
      "summary": "A skill packages a procedure; the host supplies execution and enforcement.",
      "sections": [
        {
          "type": "list",
          "label": "Include",
          "items": [
            "Trigger and the problem it addresses.",
            "Required inputs and evidence.",
            "Procedure with clear decision points.",
            "Expected output and acceptance checks.",
            "Failure/escalation conditions.",
            "Supporting scripts, examples, and referenced resources."
          ]
        },
        {
          "type": "p",
          "label": "Scope",
          "text": "Keep persistent repository instructions concise. Place specialized procedures in targeted skills. Exact repetitive logic belongs in scripts or tools."
        },
        {
          "type": "p",
          "label": "Limit",
          "text": "A skill does not enforce permissions, persist a job, or prove that its instructions were followed successfully."
        }
      ],
      "refs": [
        "skillspec",
        "anthropicskills"
      ],
      "related": [
        "architecture",
        "task-contract",
        "eager-skills",
        "study-runtime"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "requirements-skill",
      "parent": "skills",
      "title": "Requirements skill",
      "summary": "Produce a traceable brief with supported behavior and open questions.",
      "sections": [
        {
          "type": "p",
          "label": "Inputs",
          "text": "The request, reviewed decisions, relevant source material, affected implementation versions where available and existing acceptance evidence."
        },
        {
          "type": "p",
          "label": "Procedure",
          "text": "Establish intended behavior; classify evidence and uncertainty; trace affected components; derive acceptance scenarios; identify missing decisions."
        },
        {
          "type": "p",
          "label": "Output",
          "text": "A brief with scope, sources, requirement status, dependencies, scenarios, owner, and unresolved questions."
        },
        {
          "type": "p",
          "label": "Failure condition",
          "text": "Missing authority or conflicting requirements must remain unresolved; the skill must not invent a decision."
        }
      ],
      "refs": [],
      "related": [
        "requirements-workflow",
        "requirement-status",
        "traceability"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "impact-skill",
      "parent": "skills",
      "title": "Change-impact skill",
      "summary": "Trace the parts of a system affected by a proposed change and identify what needs verification.",
      "sections": [
        {
          "type": "p",
          "label": "Inputs",
          "text": "The proposed outcome, known component and data dependencies, relevant versions, consumer contracts and existing checks."
        },
        {
          "type": "p",
          "label": "Graph application example",
          "text": "For an RDF application, the inputs may include ontology concepts, TTL and query locations, service revisions and API consumers. These are one implementation of the general dependency investigation."
        },
        {
          "type": "p",
          "label": "Procedure",
          "text": "Follow known relationships and actual references. Identify direct effects, migrations, consumer contracts, and test scenarios. Label indirect impacts as hypotheses until checked."
        },
        {
          "type": "p",
          "label": "Output",
          "text": "Affected component map, dependency order, suggested verification, and evidence for each impact."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "A claimed impact links to a source relationship, code reference, contract, or executed observation."
        }
      ],
      "refs": [],
      "related": [
        "traceability",
        "decomposition",
        "neptune-stack",
        "architecture-decisions",
        "work-breakdown"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "ci-skill",
      "parent": "skills",
      "title": "Jenkins diagnosis skill",
      "summary": "Investigate the first actionable failure with build and revision context.",
      "sections": [
        {
          "type": "p",
          "label": "Inputs",
          "text": "Jenkins run identity, candidate revision, failed stage, relevant logs/reports, environment, and recent changes."
        },
        {
          "type": "p",
          "label": "Procedure",
          "text": "Locate the first actionable error; distinguish implementation, fixture, environment, access, and infrastructure causes; inspect relevant source; propose the smallest supported next step."
        },
        {
          "type": "p",
          "label": "Output",
          "text": "Finding, evidence, cause confidence, verification performed, and next action."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "A proposed cause is supported by the actual failure. Repeated retries stop when no new evidence appears."
        }
      ],
      "refs": [],
      "related": [
        "jenkins",
        "retries",
        "finding-contract"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "rdf-skill",
      "parent": "skills",
      "title": "RDF/SPARQL skill",
      "summary": "Verify graph structure and query behavior using versioned fixtures and the right engine.",
      "sections": [
        {
          "type": "p",
          "label": "Inputs",
          "text": "TTL change, ontology/shapes version, graph fixtures, SPARQL queries, expected outputs, and target environment."
        },
        {
          "type": "list",
          "label": "Procedure",
          "items": [
            "Validate applicable structural constraints.",
            "Exercise positive, negative, scope, missing-data, and temporal scenarios.",
            "Check API-visible semantics and named-graph selection.",
            "Use measured Neptune execution plans for performance findings."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Report engine, dataset, query, expected result, actual result, and limitations. Structural validity does not establish source truth."
        }
      ],
      "refs": [
        "shacl",
        "explain",
        "neptune"
      ],
      "related": [
        "coverage",
        "candidate-isolation",
        "query-performance"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "source-skill",
      "parent": "skills",
      "title": "Country-source skill",
      "summary": "Prepare a source-evidence packet for a proposed domain assertion.",
      "sections": [
        {
          "type": "p",
          "label": "Inputs",
          "text": "Original source passage, source/version identifier, candidate assertion, and relevant ontology definitions."
        },
        {
          "type": "list",
          "label": "Procedure",
          "items": [
            "Preserve jurisdiction, population, classification scheme, and effective period.",
            "Distinguish publication, effective, retrieval, and approval dates.",
            "Check quoted evidence and surface contradictory or missing support.",
            "Optionally apply an evaluated bounded Jev judgment."
          ]
        },
        {
          "type": "p",
          "label": "Output",
          "text": "Candidate assertion, derivation, evidence passages, conflicts, uncertainty, and reviewer finding. No unsupported publication default."
        }
      ],
      "refs": [],
      "related": [
        "jev-support",
        "applicability",
        "answer-contract",
        "provenance"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "packet-skill",
      "parent": "skills",
      "title": "Review-packet skill",
      "summary": "Assemble a concise review result that points to actual artifacts.",
      "sections": [
        {
          "type": "p",
          "label": "Inputs",
          "text": "Task contract, final revision, diff, commands/pipeline reports, findings, source versions, and exclusions."
        },
        {
          "type": "p",
          "label": "Output",
          "text": "Concrete behavior change, scope, verification, evidence links, unresolved issues, and appropriate verdict."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Descriptions reflect the final change. Actual executed results are distinguishable from intended checks, and skipped/unsupported checks remain visible."
        }
      ],
      "refs": [
        "talospacket"
      ],
      "related": [
        "qa-packet",
        "verdicts",
        "post-change-checks"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "agent-roles",
      "parent": "skills",
      "title": "Bounded agent roles",
      "summary": "Give each role a task, evidence inputs, permitted tools, and output contract.",
      "sections": [
        {
          "type": "table",
          "label": "Suggested initial roles",
          "headers": [
            "Role",
            "Responsibility"
          ],
          "rows": [
            [
              "Investigator",
              "Read evidence, trace behavior, produce supported findings"
            ],
            [
              "Implementer",
              "Make one scoped change and perform focused checks"
            ],
            [
              "Reviewer",
              "Inspect the result against requirements and evidence"
            ],
            [
              "Documentation writer",
              "Draft explanations from accepted changes and sources"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Model assignment",
          "text": "Choose models from measured task performance. A reviewer is not automatically the most expensive model, and an architect persona alone is not a verification mechanism."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Roles have distinct useful work. The controller decides permissible actions and acceptance, not a majority vote between agents."
        }
      ],
      "refs": [],
      "related": [
        "routing",
        "parallelism",
        "deterministic-control"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "eager-skills",
      "parent": "skills",
      "title": "Skill-loading cost",
      "summary": "Progressive disclosure is not universal across every agent configuration.",
      "sections": [
        {
          "type": "p",
          "label": "Verified behavior",
          "text": "The Agent Skills specification describes progressive loading. Copilot SDK skills explicitly assigned to a custom agent are eagerly injected in full at startup; children do not automatically inherit all parent skills."
        },
        {
          "type": "p",
          "label": "Proposed practice",
          "text": "Assign only needed skills to each role. Inspect actual prompt/context usage and keep supporting resources separate where the runtime loads them on demand."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The agent has enough procedural guidance without every project runbook appearing in every session."
        }
      ],
      "refs": [
        "skillspec",
        "sdk"
      ],
      "related": [
        "context-selection",
        "skill-definition",
        "agent-roles"
      ],
      "basis": "Documented runtime distinction",
      "confidence": "High"
    },
    {
      "id": "requirements",
      "parent": "overview",
      "title": "Requirements & traceability",
      "summary": "Discover intended behavior before generating tickets or changing code.",
      "sections": [
        {
          "type": "p",
          "label": "Core distinction",
          "text": "Confirmed requirements, observed behavior, proposals, and unresolved questions are different. Code demonstrates behavior; it does not automatically establish intent."
        },
        {
          "type": "p",
          "label": "Trace",
          "text": "Source or decision → required behavior → affected components → meaningful checks → delivery evidence. Preserve enough links to move from the requirement to its verification and back."
        }
      ],
      "refs": [
        "traceability"
      ],
      "related": [
        "requirement-status",
        "traceability",
        "requirements-workflow"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "requirement-status",
      "parent": "requirements",
      "title": "Requirement status",
      "summary": "Label authority and uncertainty instead of treating all statements as requirements.",
      "sections": [
        {
          "type": "table",
          "label": "Four statuses",
          "headers": [
            "Status",
            "Meaning"
          ],
          "rows": [
            [
              "Confirmed",
              "Supported by an approved decision or appropriate source"
            ],
            [
              "Observed",
              "Demonstrated by implementation or execution"
            ],
            [
              "Proposed",
              "Suggested improvement awaiting a decision"
            ],
            [
              "Unresolved",
              "Missing, ambiguous, or contradictory evidence"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "A brief or generated Jira ticket identifies the status of each substantive claim. Unsupported assumptions do not silently become acceptance criteria."
        }
      ],
      "refs": [],
      "related": [
        "jira",
        "discovery",
        "answer-contract"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "traceability",
      "parent": "requirements",
      "title": "End-to-end traceability",
      "summary": "Connect a requirement to affected components, meaningful checks and delivery evidence.",
      "sections": [
        {
          "type": "code",
          "label": "Trace chain",
          "text": "Source or reviewed decision\n → required behavior\n → affected components and interfaces\n → meaningful checks\n → evidence for the delivered revision"
        },
        {
          "type": "code",
          "label": "Example for a graph application",
          "text": "Requirement\n → ontology concepts and TTL\n → SPARQL behavior\n → Spring service and REST contract\n → React behavior\n → verification"
        },
        {
          "type": "p",
          "label": "Bidirectional links",
          "text": "From a requirement, find its implementation and checks. From a changed query, API, or test, identify the requirement and source decision it serves."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Relevant components and verification have revision-linked evidence. The map can expose missing links without guessing that every missing link is a defect."
        }
      ],
      "refs": [
        "traceability"
      ],
      "related": [
        "impact-skill",
        "coverage",
        "engineering-knowledge",
        "work-breakdown"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "applicability",
      "parent": "requirements",
      "title": "Scope & applicability",
      "summary": "Country-baseline assertions must preserve who, where, when, and which scheme they concern.",
      "sections": [
        {
          "type": "list",
          "label": "Fields to establish",
          "items": [
            "Jurisdiction and subnational region where relevant.",
            "Population or sector covered.",
            "Effective period and applicable version.",
            "Source authority and exact supporting passage.",
            "Classification scheme, issuer, and version where relevant.",
            "Expected API and UI semantics."
          ]
        },
        {
          "type": "p",
          "label": "Unknown terminology",
          "text": "Confirm project-specific terminology with its owner before designing a schema or integration around it. Do not silently expand an unfamiliar acronym."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Information narrowed by a source qualifier remains narrow through ingestion, graph representation, serving, and documentation."
        }
      ],
      "refs": [],
      "related": [
        "temporal-scope",
        "holiday-example",
        "wikidata-statements",
        "jev-support"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "temporal-scope",
      "parent": "requirements",
      "title": "Temporal semantics",
      "summary": "Publication date, effective date, observation time, and approval time serve different purposes.",
      "sections": [
        {
          "type": "p",
          "label": "Proposed representation",
          "text": "Keep when a source was published separate from when a rule applies, when your system retrieved it, and when a reviewed assertion became approved. Use source and dataset versions to reproduce past answers."
        },
        {
          "type": "p",
          "label": "Exact operations",
          "text": "Parse and compare dates in deterministic code. Treat missing date components explicitly rather than letting a model guess."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Historical and current queries use the intended applicability window. A later publication or retrieval does not automatically supersede an earlier effective period."
        }
      ],
      "refs": [
        "jevlimits"
      ],
      "related": [
        "jev-limitations",
        "provenance",
        "applicability"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "holiday-example",
      "parent": "requirements",
      "title": "Holiday example",
      "summary": "Hypothetical acceptance scenarios expose scope mistakes that formatting checks miss.",
      "sections": [
        {
          "type": "p",
          "label": "Hypothetical requirement",
          "text": "A holiday applying only to a specified region retains that region through source ingestion, RDF storage, API output, and frontend presentation. This is an illustrative scenario, not a finding about your data."
        },
        {
          "type": "list",
          "label": "Acceptance scenarios",
          "items": [
            "A matching-region query returns the applicable assertion.",
            "A different-region query does not broaden it into a national assertion.",
            "Unspecified scope remains explicit rather than defaulted.",
            "Missing or conflicting support is surfaced for review.",
            "Relevant effective-period and source-version changes are exercised."
          ]
        },
        {
          "type": "p",
          "label": "Verification",
          "text": "Check the whole semantic path, not only that a valid date and label are present."
        }
      ],
      "refs": [],
      "related": [
        "coverage",
        "jev-support",
        "traceability",
        "applicability"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "discovery",
      "parent": "requirements",
      "title": "Discovery procedure",
      "summary": "Investigate one bounded capability deeply enough to establish a useful baseline.",
      "sections": [
        {
          "type": "steps",
          "label": "Procedure",
          "items": [
            "Select a concrete user/domain scenario and identify its owner.",
            "Read the request and reviewed decisions at known versions.",
            "Follow the relevant data, components, interfaces and user behavior using actual evidence.",
            "Inspect existing tests and recent pipeline evidence.",
            "Classify requirements and unresolved assumptions.",
            "Prepare acceptance scenarios, impact, and a reviewed implementation brief."
          ]
        },
        {
          "type": "p",
          "label": "Example to adapt",
          "text": "In a graph-backed web application, the investigation may cross TTL, SPARQL, a service, an API and a UI. A document or process study uses its own sources and handoffs."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The investigation produces a concrete decision or implementable task. The discovered facts are distinguishable from suggestions and remaining unknowns."
        }
      ],
      "refs": [],
      "related": [
        "requirements-workflow",
        "pilot",
        "requirement-status",
        "finding-contract"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "debt",
      "parent": "overview",
      "title": "Debt & coverage",
      "summary": "Use evidence-backed findings and multiple verification dimensions.",
      "sections": [
        {
          "type": "p",
          "label": "Workplace state",
          "text": "Actual technical debt and coverage are unknown until repositories and execution evidence are inspected. The categories here are an investigation plan."
        },
        {
          "type": "p",
          "label": "Operating method",
          "text": "Collect specific findings, deduplicate, prioritize consequences and break remediation into reviewable outcomes. Avoid flooding the issue tracker with every static-analysis finding."
        }
      ],
      "refs": [],
      "related": [
        "debt-categories",
        "finding-contract",
        "coverage",
        "prioritization"
      ],
      "basis": "Proposed audit plan",
      "confidence": "Unknown actual debt"
    },
    {
      "id": "debt-categories",
      "parent": "debt",
      "title": "Debt investigation categories",
      "summary": "Look beyond code smells to data, contracts, pipelines, decisions, and agent behavior.",
      "sections": [
        {
          "type": "table",
          "label": "Evidence and possible remedies",
          "headers": [
            "Category",
            "Evidence",
            "Possible remedy"
          ],
          "rows": [
            [
              "Structure",
              "Cycles, coupling, repeated change patterns",
              "Clarify interface or dependency"
            ],
            [
              "Verification",
              "Flakes, absent assertions/scenarios",
              "Repair or add meaningful checks"
            ],
            [
              "Data/ontology",
              "Lost scope/provenance, inconsistent representation",
              "Preserve semantics and migrate"
            ],
            [
              "Queries",
              "Measured latency and plans",
              "Change query/access pattern"
            ],
            [
              "CI/release",
              "Stale or nonreproducible evidence",
              "Revision-linked execution"
            ],
            [
              "Docs/requirements",
              "Conflicting decisions, missing links",
              "Resolve decision and traceability"
            ],
            [
              "Agent workflows",
              "Repeated calls, unsupported summaries",
              "Improve retrieval/contracts/stops"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Classification",
          "text": "A wrong requirement or data defect is not automatically technical debt. Classify the finding by actual cause and ownership."
        }
      ],
      "refs": [],
      "related": [
        "finding-contract",
        "sonar-debt",
        "query-performance"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "finding-contract",
      "parent": "debt",
      "title": "Finding contract",
      "summary": "Record enough evidence for someone else to confirm and act on the issue.",
      "sections": [
        {
          "type": "list",
          "label": "Fields",
          "items": [
            "Affected revision, module/location, and expected invariant.",
            "Observed behavior with exact evidence.",
            "Impact, exposure, recurrence, and uncertainty.",
            "Dependencies, owner, and remediation proposal.",
            "Meaningful acceptance/verification and estimated effort with uncertainty.",
            "Duplicate-ticket check and release implications where relevant."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The finding is actionable and reproducible or clearly states its evidential limits. The owner can distinguish a defect, missing requirement, environment problem, or audit-design issue."
        }
      ],
      "refs": [
        "talosfinding"
      ],
      "related": [
        "verdicts",
        "prioritization",
        "jira"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "prioritization",
      "parent": "debt",
      "title": "Prioritize & deduplicate",
      "summary": "Rank consequences and change exposure rather than precise-looking guessed scores.",
      "sections": [
        {
          "type": "list",
          "label": "Assessment dimensions",
          "items": [
            "Consequence for users or domain correctness.",
            "Exposure and recurrence.",
            "Frequency of changes in the affected area.",
            "Dependencies and remediation effort.",
            "Evidence strength and remaining uncertainty."
          ]
        },
        {
          "type": "p",
          "label": "Ticket discipline",
          "text": "Cluster duplicate findings, inspect root causes, and have an owner triage before creating many tickets. One root cause may explain several warnings."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Priority explains why this outcome is worth addressing now. Estimates disclose uncertainty and do not pretend Sonar costs equal delivery effort."
        }
      ],
      "refs": [],
      "related": [
        "sonar-debt",
        "decomposition",
        "finding-contract"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "decomposition",
      "parent": "debt",
      "title": "Break down remediation",
      "summary": "Create independently reviewable outcomes in dependency order.",
      "sections": [
        {
          "type": "steps",
          "label": "Possible sequence",
          "items": [
            "Characterize current behavior and its evidence.",
            "Add a missing regression scenario where it is meaningful.",
            "Implement a coherent correction or refactor.",
            "Migrate affected data/contracts if necessary.",
            "Verify downstream API/UI/query behavior.",
            "Update the relevant decision and documentation."
          ]
        },
        {
          "type": "p",
          "label": "Scope",
          "text": "Not every finding needs every stage. Distinguish behavior correction from structural cleanup when they need separate review."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Each task has a verifiable outcome and known dependencies, while the end-to-end scenario remains represented."
        }
      ],
      "refs": [],
      "related": [
        "impact-skill",
        "implementation-workflow",
        "traceability",
        "work-breakdown"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "coverage",
      "parent": "debt",
      "title": "Coverage dimensions",
      "summary": "Choose checks for the consequences of a change. Execution percentages describe only part of that evidence.",
      "sections": [
        {
          "type": "table",
          "label": "Possible dimensions",
          "headers": [
            "Area",
            "Question"
          ],
          "rows": [
            [
              "Code execution",
              "Which instructions or branches ran, and what did the assertions check?"
            ],
            [
              "User experience",
              "Which relevant states, interactions and failure cases were exercised?"
            ],
            [
              "Interfaces",
              "Do the affected producer and consumer contracts agree?"
            ],
            [
              "Data",
              "Do representative inputs produce the expected meaning and results?"
            ],
            [
              "Structural constraints",
              "Do applicable schemas or validation rules hold?"
            ],
            [
              "Source support",
              "Are meaning, scope and applicability preserved?"
            ],
            [
              "Requirements",
              "Do the accepted requirements have meaningful verification?"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Technology examples",
          "text": "Java coverage, React interaction checks and RDF/SPARQL fixtures measure different things. SHACL applies when a project uses shapes to validate RDF. Select relevant dimensions rather than requiring every technology."
        },
        {
          "type": "p",
          "label": "Aggregation",
          "text": "Missing reports mean unknown coverage. Aggregate covered and total units only for comparable metrics. Keep code execution, user scenarios and domain checks distinct. Do not average unrelated percentages."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The verification plan covers consequences and meaningful scenarios rather than a universal percentage target."
        }
      ],
      "refs": [
        "jacoco",
        "shacl"
      ],
      "related": [
        "jacoco-counters",
        "holiday-example",
        "eval-metrics"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "jacoco-counters",
      "parent": "debt",
      "title": "JaCoCo limitations",
      "summary": "Coverage records execution, not whether a test established the right behavior.",
      "sections": [
        {
          "type": "p",
          "label": "Verified definition",
          "text": "JaCoCo counters include instructions, lines, and branches for constructs such as if/switch. Exception handling is not included in its branch counter."
        },
        {
          "type": "p",
          "label": "Implication",
          "text": "High coverage can coexist with weak assertions or missing semantic scenarios. Review test outcomes and important paths, and consider focused mutation tests where justified."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Coverage reports identify the tested revision and scope. They complement requirement and domain verification rather than replace it."
        }
      ],
      "refs": [
        "jacoco"
      ],
      "related": [
        "coverage",
        "mutation-testing"
      ],
      "basis": "Documented metric limitation",
      "confidence": "High"
    },
    {
      "id": "sonar-debt",
      "parent": "debt",
      "title": "Sonar debt limitations",
      "summary": "Rule remediation costs are useful input, not a complete project-debt measure.",
      "sections": [
        {
          "type": "p",
          "label": "Verified definition",
          "text": "Sonar’s technical-debt metric uses remediation costs associated with detected rules. It does not measure every architectural, data, requirements, or workflow problem."
        },
        {
          "type": "p",
          "label": "Proposed practice",
          "text": "Use rule findings as evidence to investigate. Protect new code through appropriate quality gates and improve existing debt incrementally. Do not equate a displayed remediation estimate with a calibrated delivery estimate."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Prioritized findings have actual impact, owner, evidence, and verification beyond the rule label."
        }
      ],
      "refs": [
        "sonar",
        "newcode"
      ],
      "related": [
        "debt-categories",
        "prioritization",
        "jenkins"
      ],
      "basis": "Documented metric + proposed use",
      "confidence": "High for definition"
    },
    {
      "id": "mutation-testing",
      "parent": "debt",
      "title": "Targeted mutation testing",
      "summary": "Assess whether important changed-code assertions detect meaningful faults.",
      "sections": [
        {
          "type": "p",
          "label": "Published practice",
          "text": "Google describes filtered, review-focused mutation testing at scale. It provides an engineering example for incremental use, not evidence that every current Google team uses one identical process."
        },
        {
          "type": "p",
          "label": "Proposed pilot",
          "text": "Apply mutation testing to critical changed logic and inspect surviving mutations. Bound the scope and runner cost before broader adoption."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The experiment improves useful assertion strength without drowning reviewers in irrelevant mutations."
        }
      ],
      "refs": [
        "mutation"
      ],
      "related": [
        "jacoco-counters",
        "verification-loops",
        "cost-per-result"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "query-performance",
      "parent": "debt",
      "title": "SPARQL performance",
      "summary": "A query-performance finding needs measured behavior and execution evidence.",
      "sections": [
        {
          "type": "p",
          "label": "Evidence",
          "text": "Record query text/version, dataset, engine/environment, relevant parameters, observed latency, and Neptune explain output where applicable."
        },
        {
          "type": "p",
          "label": "Proposed investigation",
          "text": "Identify expensive execution behavior, test a constrained change on representative data, and compare correctness and performance."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The optimization preserves expected results and improves the measured target. A query that looks complicated is not automatically slow, and local engine timing is not Neptune evidence."
        }
      ],
      "refs": [
        "explain"
      ],
      "related": [
        "rdf-skill",
        "neptune-stack",
        "finding-contract"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "jev",
      "parent": "overview",
      "title": "Jev decision support",
      "summary": "Evaluate narrow semantic judgments between evidence collection and domain curation.",
      "sections": [
        {
          "type": "p",
          "label": "Domain curation example",
          "text": "Check whether a source passage supports a proposed assertion’s scope or ontology mapping, using previously reviewed examples."
        },
        {
          "type": "p",
          "label": "Boundary",
          "text": "For these proposed domain checks, confidence does not establish statutory truth or replace the approved-data process. Exact temporal arithmetic needs suitable deterministic logic. Fit for a particular domain task remains unmeasured until evaluated."
        },
        {
          "type": "p",
          "label": "Separate Atlas integration",
          "text": "The Factory has a distinct JEV pilot for selecting supported development recipes and assessing defined information gaps. Its results do not validate the source-support and ontology tasks in this branch. Read the JEV guide in Help for that integration and its evidence."
        }
      ],
      "refs": [
        "jevlimits",
        "jevconfidence"
      ],
      "related": [
        "jev-support",
        "jev-shadow",
        "jev-limitations"
      ],
      "basis": "Proposed experiment",
      "confidence": "Unknown task suitability"
    },
    {
      "id": "jev-judgments",
      "parent": "jev",
      "title": "Bounded judgment tasks",
      "summary": "Supply a precise question and a small, explicit answer space.",
      "sections": [
        {
          "type": "table",
          "label": "Candidate tasks",
          "headers": [
            "Task",
            "Example decision"
          ],
          "rows": [
            [
              "Passage relevance",
              "Relevant / irrelevant / unclear"
            ],
            [
              "Ontology mapping",
              "One supplied concept / none / uncertain"
            ],
            [
              "Scope support",
              "Supported / contradicted / insufficient"
            ],
            [
              "Source-change classification",
              "Substantive / editorial / unclear"
            ],
            [
              "Workflow routing",
              "One allowed investigation / escalation"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Define boundary cases and include insufficient evidence or none-of-these. The controller owns permissible actions and combines the result with deterministic checks."
        }
      ],
      "refs": [
        "jevlimits"
      ],
      "related": [
        "deterministic-control",
        "jev-support",
        "jev-mapping"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "jev-support",
      "parent": "jev",
      "title": "Evidence-support check",
      "summary": "Test semantic support with original passages, the candidate assertion, and definitions.",
      "sections": [
        {
          "type": "code",
          "label": "Proposed pattern",
          "text": "Original source passage\n+ proposed assertion\n+ relevant ontology definitions\n→ supported / contradicted / insufficient evidence\n→ evidence-linked reviewer finding"
        },
        {
          "type": "p",
          "label": "Hypothetical scope error",
          "text": "A source establishes a banking-sector closure while a candidate record represents a holiday for all employees. A structurally valid record can still misstate the source. This is an example, not an audited workplace defect."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Measure missed scope errors and false alarms on reviewed examples. Quote/source existence checks and semantic-support judgments are separate components; neither alone proves applicability."
        }
      ],
      "refs": [
        "jevcitation"
      ],
      "related": [
        "source-skill",
        "holiday-example",
        "answer-contract",
        "jev-shadow"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "jev-mapping",
      "parent": "jev",
      "title": "Ontology mapping",
      "summary": "Compare source terminology against supplied concepts and explicit definitions.",
      "sections": [
        {
          "type": "p",
          "label": "Inputs",
          "text": "Relevant source passage, a bounded candidate concept list, definitions, and scope constraints. Use existing retrieval to shortlist candidates rather than pass an entire ontology."
        },
        {
          "type": "p",
          "label": "Output",
          "text": "Selected concept or explicit none/uncertain, linked to the source and candidate set. Keep new-concept proposals separate from mappings to approved concepts."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Evaluate semantic mapping errors, especially neighboring concepts and missing correct alternatives. Domain review and deterministic schema checks still apply."
        }
      ],
      "refs": [
        "jevlimits"
      ],
      "related": [
        "applicability",
        "retrieval",
        "jev-judgments"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "jev-limitations",
      "parent": "jev",
      "title": "Jev limitations",
      "summary": "Keep precision and enforceable rules outside semantic judgment.",
      "sections": [
        {
          "type": "list",
          "label": "Documented weaknesses",
          "items": [
            "Numeric precision and counting.",
            "Date/time comparison.",
            "Complex indirection and multi-hop questions.",
            "Irrelevant large state and contradictory instructions.",
            "Adversarial or misleading content.",
            "Free-form generation is not its trained purpose."
          ]
        },
        {
          "type": "p",
          "label": "Design response",
          "text": "Filter evidence, ask one explicit judgment at a time, allow missing information, and implement calculations/dates/invariants in code. Pin the evaluated model version."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Adverse cases are tested before expanding use. A confident answer cannot override structural, access, or publication rules."
        }
      ],
      "refs": [
        "jevlimits"
      ],
      "related": [
        "deterministic-control",
        "jev-confidence",
        "temporal-scope"
      ],
      "basis": "Documented limitations",
      "confidence": "High"
    },
    {
      "id": "jev-confidence",
      "parent": "jev",
      "title": "Confidence ≠ correctness",
      "summary": "Distribution-derived confidence is not a guarantee about an individual domain assertion.",
      "sections": [
        {
          "type": "p",
          "label": "Verified meaning",
          "text": "TypeSafe’s confidence measure reflects the shape of the answer distribution. Treat calibration as something to evaluate over relevant examples, not a certificate attached to one result."
        },
        {
          "type": "p",
          "label": "Threshold practice",
          "text": "Choice and Score confidence thresholds need task-specific evaluation; Noul does not return confidence. Tune routing separately for the exact question, primitive, language, and task. Do not multiply separate outputs as if their errors were independent."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Routing thresholds achieve acceptable measured missed-error/false-alarm behavior. Two agreeing models remain two judgments, not independent source evidence."
        }
      ],
      "refs": [
        "jevconfidence",
        "jevlimits"
      ],
      "related": [
        "jev-shadow",
        "eval-metrics",
        "answer-contract"
      ],
      "basis": "Documented semantics + evaluation guidance",
      "confidence": "High for semantics; unknown threshold"
    },
    {
      "id": "jev-clustering",
      "parent": "jev",
      "title": "Clustering & reconciliation",
      "summary": "Define what is being grouped and why before selecting an AI component.",
      "sections": [
        {
          "type": "list",
          "label": "Possible objectives",
          "items": [
            "Duplicate or near-duplicate candidate assertions.",
            "Terminology reconciliation across sources.",
            "Source-change grouping.",
            "Reusable template structures for investigation."
          ]
        },
        {
          "type": "p",
          "label": "Jev’s possible role",
          "text": "It can judge bounded retrieved candidate pairs or categories. This is not a general embedding or clustering engine. Use separate retrieval/analytics where they fit the defined objective."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Grouping has an evaluated downstream purpose and preserves jurisdiction, time, and scheme distinctions. Similar wording does not establish interchangeable statutory meaning."
        }
      ],
      "refs": [],
      "related": [
        "jev-mapping",
        "applicability",
        "retrieval"
      ],
      "basis": "Proposed exploration",
      "confidence": "Unknown"
    },
    {
      "id": "jev-shadow",
      "parent": "jev",
      "title": "Shadow-mode evaluation",
      "summary": "Compare Jev with reviewed outcomes and simpler credible alternatives.",
      "sections": [
        {
          "type": "steps",
          "label": "Experiment",
          "items": [
            "Select a narrow task such as holiday scope-support checking.",
            "Build reviewed positive, negative, ambiguous, and conflicting examples.",
            "Run Jev without changing publication behavior.",
            "Compare existing rules, a constrained utility LLM, and the current reviewer process.",
            "Measure missed errors, false alarms, review effort, cost, and language differences.",
            "Decide whether benefits justify integration and which cases need escalation."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Improvement is demonstrated on held-out cases. The model and question versions are recorded and changes trigger re-evaluation."
        }
      ],
      "refs": [],
      "related": [
        "eval-corpus",
        "jev-languages",
        "routing",
        "pilot"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "jev-languages",
      "parent": "jev",
      "title": "Language & domain evaluation",
      "summary": "Measure source-language performance instead of assuming English results transfer.",
      "sections": [
        {
          "type": "p",
          "label": "Documented context",
          "text": "TypeSafe’s model guidance describes English as its strongest setting. Your official sources may use other languages and domain-specific terminology."
        },
        {
          "type": "p",
          "label": "Proposed practice",
          "text": "Retain original passages, record translation use, and stratify reviewed examples by language and task. Inspect whether translations preserve qualifiers, conditions, and effective dates."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Performance and escalation rules are justified for the languages actually used. A high aggregate result does not conceal a weak language subset."
        }
      ],
      "refs": [
        "jevmodels"
      ],
      "related": [
        "jev-shadow",
        "eval-corpus",
        "applicability"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "knowledge",
      "parent": "overview",
      "title": "Evidence & knowledge",
      "summary": "Build source-backed retrieval over existing authoritative assets and clearly derived summaries.",
      "sections": [
        {
          "type": "p",
          "label": "Recommended foundation",
          "text": "Begin with authoritative source material and reviewed decisions. Keep derived summaries and workflow evidence distinguishable from those sources. Add retrieval indexes or an approved domain graph when the actual information needs justify them."
        },
        {
          "type": "p",
          "label": "Correctness",
          "text": "Retrieval relevance, citation validity, semantic support, and applicability are different checks. A generated wiki or another graph framework does not solve them automatically."
        }
      ],
      "refs": [],
      "related": [
        "knowledge-assets",
        "answer-contract",
        "retrieval",
        "candidate-isolation"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "knowledge-assets",
      "parent": "knowledge",
      "title": "Knowledge assets",
      "summary": "Separate source material, approved assertions, indexes, summaries, and execution state.",
      "sections": [
        {
          "type": "table",
          "label": "Assets to choose when needed",
          "headers": [
            "Asset",
            "Purpose"
          ],
          "rows": [
            [
              "Source corpus",
              "Original documents, versions, passages, and identifiers"
            ],
            [
              "Approved domain graph, if needed",
              "Curated assertions and relationships when graph queries serve the task"
            ],
            [
              "Engineering knowledge",
              "Reviewed requirements, decisions, code/test links"
            ],
            [
              "Retrieval index",
              "Reproducible search over permitted evidence"
            ],
            [
              "Generated summaries",
              "Source-linked navigation with review status"
            ],
            [
              "Workflow state",
              "Progress, checkpoints, budgets, run artifacts"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Every derived asset can identify its source and version. Execution state does not accidentally become shared domain authority."
        }
      ],
      "refs": [],
      "related": [
        "engineering-knowledge",
        "llm-wiki",
        "provenance"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "engineering-knowledge",
      "parent": "knowledge",
      "title": "Engineering knowledge",
      "summary": "Represent useful requirement, code, test, and build relationships without inventing them.",
      "sections": [
        {
          "type": "p",
          "label": "Possible relationships",
          "text": "Requirement → affected component or interface → relevant check → recorded result. Use source locations and decision records that actually exist."
        },
        {
          "type": "p",
          "label": "Graph application example",
          "text": "An ontology concept can connect a requirement to a query, service or UI. Confluence decisions and Bitbucket locations can provide source links in that particular toolchain."
        },
        {
          "type": "p",
          "label": "Implementation choice",
          "text": "Begin with a traceability table or existing metadata. Add a development knowledge graph only if actual queries and maintenance needs justify it."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Relationships have provenance and versions. Model-extracted suggestions remain distinguishable from confirmed dependencies."
        }
      ],
      "refs": [
        "traceability"
      ],
      "related": [
        "traceability",
        "confluence",
        "graphrag-option"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "retrieval",
      "parent": "knowledge",
      "title": "Hybrid retrieval",
      "summary": "Select search and retrieval methods according to the question and available evidence.",
      "sections": [
        {
          "type": "list",
          "label": "Retrieval routes",
          "items": [
            "Exact search for identifiers, symbols, filenames and precise terms.",
            "Semantic search where conceptual matching adds useful evidence.",
            "Structured queries where the data supports them. SPARQL applies to RDF relationships.",
            "Filter by access and relevant versions. Include jurisdiction, effective period or approval state when the question depends on them."
          ]
        },
        {
          "type": "p",
          "label": "Proposed sequence",
          "text": "Retrieve a bounded candidate set, verify relevance/applicability, and provide source passages with identifiers. Add reranking only if it measurably helps."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The needed evidence is retrieved, permitted, current for the question, and accessible for verification. Measure retrieval separately from answer generation."
        }
      ],
      "refs": [
        "ragchecker"
      ],
      "related": [
        "retrieval-diagnosis",
        "permissions",
        "context-selection",
        "jev-mapping"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "answer-contract",
      "parent": "knowledge",
      "title": "Evidence-based answer",
      "summary": "Require support for each substantive claim rather than a list of impressive links.",
      "sections": [
        {
          "type": "list",
          "label": "Claim record",
          "items": [
            "Atomic claim and its status: observed, inferred, proposed, or unresolved.",
            "Exact source identifier, passage/section, and version.",
            "Scope that affects the claim. This might be a software version and environment, or a jurisdiction, population and effective period for a domain assertion.",
            "Supporting or contradictory evidence.",
            "Uncertainty and missing information."
          ]
        },
        {
          "type": "p",
          "label": "Verification layers",
          "text": "A working link proves availability, not support. A relevant passage may still fail to support the claim. A supported claim may still be inapplicable to the requested scope."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The reader can reproduce the evidential basis. Missing support leads to a useful uncertainty statement rather than a fabricated answer."
        }
      ],
      "refs": [],
      "related": [
        "jev-support",
        "source-conflicts",
        "provenance",
        "eval-metrics"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "llm-wiki",
      "parent": "knowledge",
      "title": "LLM wiki boundary",
      "summary": "Generated summaries can aid navigation when sources and review state stay visible.",
      "sections": [
        {
          "type": "p",
          "label": "Reference pattern",
          "text": "Andrej Karpathy's LLM Wiki idea file describes keeping original sources separate from maintained derived pages, with ingest, query and maintenance conventions. The live gist was read on 3 October 2026. It is a concept, not a deployed service or proof of correctness. The metadata and approval boundaries below are proposed Atlas practices."
        },
        {
          "type": "list",
          "label": "Required metadata",
          "items": [
            "Underlying source anchors and versions.",
            "Owner and reviewed/unreviewed status.",
            "Last verification date.",
            "Known conflicts and remaining uncertainty."
          ]
        },
        {
          "type": "p",
          "label": "Avoid recursive authority",
          "text": "A generated page does not establish a fact because another generated page cites it. Follow links back to original evidence and reviewed decisions."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The wiki helps locate and explain knowledge while authoritative source material and approval remain identifiable."
        }
      ],
      "refs": [
        "llmwiki"
      ],
      "related": [
        "confluence",
        "knowledge-assets",
        "answer-contract"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "graphrag-option",
      "parent": "knowledge",
      "title": "GraphRAG decision",
      "summary": "Compare graph retrieval with a simpler baseline using the questions your project needs to answer.",
      "sections": [
        {
          "type": "p",
          "label": "Documented options",
          "text": "Microsoft GraphRAG offers local graph/text retrieval and global community-summary search. Global search can be resource intensive."
        },
        {
          "type": "p",
          "label": "Project recommendation",
          "text": "Measure a simpler retrieval baseline first. If a curated RDF graph already exists, include relevant SPARQL queries in that comparison. Preserve reviewed relationships when evaluating model-extracted alternatives."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The alternative improves needed-evidence retrieval or answer quality enough to justify indexing cost, maintenance, and version handling."
        }
      ],
      "refs": [
        "graphrag"
      ],
      "related": [
        "retrieval",
        "engineering-knowledge",
        "cost-per-result"
      ],
      "basis": "Documented option + proposed comparison",
      "confidence": "Unknown winner"
    },
    {
      "id": "wikidata-statements",
      "parent": "knowledge",
      "title": "Wikidata qualifiers",
      "summary": "Preserve full statements when qualifiers, references, rank, and version matter.",
      "sections": [
        {
          "type": "p",
          "label": "Verified representation",
          "text": "The wdt: “truthy” RDF representation provides best-ranked values without full qualifiers and references. Full statements expose those details. “Truthy” does not mean independently verified factual truth."
        },
        {
          "type": "p",
          "label": "Import design",
          "text": "Retain needed scope, dates, rank, references, and entity/source revision. Follow underlying sources; an imported-Wikimedia reference or label match alone does not establish a country assertion."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "A flattened import does not silently broaden applicability or lose the evidence needed for curation."
        }
      ],
      "refs": [
        "wikibase",
        "wikisources"
      ],
      "related": [
        "applicability",
        "provenance",
        "curation-workflow"
      ],
      "basis": "Documented representation caveat",
      "confidence": "High"
    },
    {
      "id": "candidate-isolation",
      "parent": "knowledge",
      "title": "Candidate isolation in Neptune",
      "summary": "A separate named graph alone is not quarantine in Neptune.",
      "sections": [
        {
          "type": "p",
          "label": "Verified behavior",
          "text": "Neptune’s default SPARQL graph is the union of named graphs. An unscoped serving query can therefore encounter candidate assertions."
        },
        {
          "type": "p",
          "label": "Design options",
          "text": "Use a separate candidate store/environment, or enforce and test explicit approved datasets throughout serving queries. Audit every relevant serving path rather than assuming a candidate graph label prevents exposure."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Candidate-only assertions do not appear through ordinary REST/UI serving before the approved publication process. Include a regression scenario for this boundary."
        }
      ],
      "refs": [
        "neptune"
      ],
      "related": [
        "curation-workflow",
        "neptune-stack",
        "rdf-skill",
        "permissions"
      ],
      "basis": "Documented engine behavior + required design check",
      "confidence": "High"
    },
    {
      "id": "provenance",
      "parent": "knowledge",
      "title": "Provenance & versions",
      "summary": "Record what an assertion or analysis was derived from and how it became approved.",
      "sections": [
        {
          "type": "list",
          "label": "Useful provenance",
          "items": [
            "Source entity/document and revision.",
            "Exact supporting passage and retained qualifiers.",
            "Extraction/mapping activity and model/tool version where used.",
            "Revisions of the inputs that affect the result, such as code, data, schemas, or ontology and shapes where used.",
            "Reviewer/approval record and relevant times."
          ]
        },
        {
          "type": "p",
          "label": "Established vocabulary",
          "text": "W3C PROV-O provides entities, activities, agents, derivation, and attribution concepts. Apply the principles to existing mechanisms; an ontology rewrite is not a prerequisite."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "A past answer or finding can be reproduced from its input versions and process evidence."
        }
      ],
      "refs": [
        "prov"
      ],
      "related": [
        "temporal-scope",
        "revision-cache",
        "qa-packet"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "source-conflicts",
      "parent": "knowledge",
      "title": "Conflicts & insufficient evidence",
      "summary": "Preserve disagreement and missing information rather than force one answer.",
      "sections": [
        {
          "type": "p",
          "label": "Proposed procedure",
          "text": "Compare source authority under the project’s reviewed rules, applicability, version, and effective period. Separate conflicting assertions from simple wording differences."
        },
        {
          "type": "p",
          "label": "Model role",
          "text": "Models can highlight relevant passages or suggest the nature of a conflict. Their agreement cannot substitute for independent source support."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The answer or review packet identifies the competing evidence and unresolved decision. The approved process determines whether one source supersedes another."
        }
      ],
      "refs": [],
      "related": [
        "answer-contract",
        "jev-confidence",
        "requirement-status",
        "applicability"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "talos",
      "parent": "overview",
      "title": "Verification and evidence",
      "summary": "Match checks and evidence to the change being reviewed, with clear outcomes and project specific gates.",
      "sections": [
        {
          "type": "p",
          "label": "Recommended practice",
          "text": "Use focused checks while developing and broader checks when reviewing a release candidate. Record the state checked, the actual results, unresolved findings, and checks that were not run."
        },
        {
          "type": "p",
          "label": "Concepts to adapt",
          "text": "Two verification loops, post-change evidence, structured findings, distinct verdicts, QA packets, adverse-case audits, and budget stopping behavior."
        },
        {
          "type": "p",
          "label": "Project adaptation",
          "text": "Choose checks that fit your services, interfaces, data, and deployment process. Separate evidence for a particular change from evaluations of workflow quality, cost, and rollout outcomes."
        },
        {
          "type": "p",
          "label": "Example source: Talos work-test cycle",
          "text": "The historical source review inspected work-cycle-docs and selected supporting code, scripts, and test definitions in Talos at commit 970385bedac11a6bf0eecbe951aa815735d73a1b on chore/cleanup-before-release. Repository code was not executed. Test pass status and deployed behavior were not verified. Talos is an example source, not a dependency of Workflow Atlas."
        }
      ],
      "refs": [
        "taloscycle",
        "talosreadme"
      ],
      "related": [
        "verification-loops",
        "qa-packet",
        "talos-boundaries"
      ],
      "basis": "Recommended practice + inspected example",
      "confidence": "Moderate for adaptation. High for inspected contents, execution unverified"
    },
    {
      "id": "verification-loops",
      "parent": "talos",
      "title": "Two verification loops",
      "summary": "Focused development checks and candidate release gates serve different purposes.",
      "sections": [
        {
          "type": "p",
          "label": "Recommended practice",
          "text": "Use quick checks for the change in progress and broader gates for the candidate being reviewed. Define what each loop must prove before choosing its checks."
        },
        {
          "type": "p",
          "label": "Project adaptation",
          "text": "Use relevant unit, integration, query, and interface checks while developing. Apply your project's established CI, quality, and release gates at the appropriate milestone. Jenkins and Sonar are examples."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Do not run every expensive gate after every edit, and do not treat one focused check as sufficient release evidence."
        },
        {
          "type": "p",
          "label": "Example source: Talos work-test cycle",
          "text": "The inspected Talos runbook describes a focused inner loop for small changes and a heavier Release QA Gate for candidate evidence tied to the exact SHA. This is a finding about the reviewed contents, not a verified execution result."
        }
      ],
      "refs": [
        "taloscycle"
      ],
      "related": [
        "implementation-workflow",
        "jenkins",
        "cost-per-result",
        "workflow-patterns",
        "release-operations"
      ],
      "basis": "Recommended practice + inspected example",
      "confidence": "Moderate for adaptation. High for inspected runbook contents"
    },
    {
      "id": "post-change-checks",
      "parent": "talos",
      "title": "Checks after the change",
      "summary": "Verification must describe the final relevant state.",
      "sections": [
        {
          "type": "p",
          "label": "Recommended practice",
          "text": "Record checks for the final relevant code or data state. Repeat affected checks after a subsequent change, and keep command success distinct from verification of the resulting content."
        },
        {
          "type": "p",
          "label": "Project adaptation",
          "text": "Identify the candidate revision, dependency revisions, pipeline run, tested fixture or environment, and applicable quality results. For the workplace example, these include the Bitbucket commit, submodules, Jenkins run, and tested graph."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The completion packet points to actual evidence for the candidate being reviewed, not a stale local success."
        },
        {
          "type": "p",
          "label": "Example source: Talos verification tests",
          "text": "The inspected Talos test definitions require rejection of checks from before the last mutation, failed verification commands, build-only profiles, and ambiguous summaries. They also cover failed file readback despite command success. These test definitions were inspected, not executed."
        }
      ],
      "refs": [
        "talosverify"
      ],
      "related": [
        "revision-cache",
        "task-contract",
        "qa-packet"
      ],
      "basis": "Recommended practice + inspected test definitions",
      "confidence": "High for test contents. Execution unverified, adaptation proposed"
    },
    {
      "id": "verdicts",
      "parent": "talos",
      "title": "Distinct result verdicts",
      "summary": "Failed, skipped, unavailable, denied, and invalid-audit outcomes must remain distinguishable.",
      "sections": [
        {
          "type": "p",
          "label": "Recommended practice",
          "text": "Keep success, failure, partial verification, unavailable environments, denied access, invalid audits, and unrun checks distinct. Choose labels that fit your project and define the evidence required for each outcome."
        },
        {
          "type": "p",
          "label": "Example source: Talos verdict template",
          "text": "The inspected Talos summary template provides the following verdict vocabulary. The explanations show a proposed use for your project, not a mandatory standard or observed test results."
        },
        {
          "type": "table",
          "label": "Example verdict vocabulary",
          "headers": [
            "Verdict",
            "How to use the distinction"
          ],
          "rows": [
            [
              "PASS",
              "Required applicable evidence supports the outcome"
            ],
            [
              "FAIL",
              "Observed behavior violates the expected invariant"
            ],
            [
              "PARTIAL",
              "Only part of the intended scope was verified"
            ],
            [
              "UNSUPPORTED",
              "The operation/environment cannot support the check"
            ],
            [
              "POLICY_DENIED",
              "An enforced policy prevented execution"
            ],
            [
              "AUDIT_DESIGN",
              "The fixture or audit design is invalid"
            ],
            [
              "NOT_RUN",
              "The check was not executed"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Project example",
          "text": "Missing Neptune access is not a failed query. A skipped integration test is not a pass. A broken fixture is not necessarily an implementation defect."
        }
      ],
      "refs": [
        "talosverdict"
      ],
      "related": [
        "finding-contract",
        "retries",
        "jenkins"
      ],
      "basis": "Inspected vocabulary + proposed use",
      "confidence": "High for inspected vocabulary. Moderate for project adaptation"
    },
    {
      "id": "qa-packet",
      "parent": "talos",
      "title": "Revision-linked QA packet",
      "summary": "Prepare a reviewable machine-readable record of task, candidate, checks, and exclusions.",
      "sections": [
        {
          "type": "p",
          "label": "Recommended practice",
          "text": "Make the review handoff describe one identifiable candidate and its actual evidence. Include unresolved findings and unrun checks so that a reviewer can assess the limits of the result."
        },
        {
          "type": "list",
          "label": "Suggested project packet fields",
          "items": [
            "Task, owner, candidate code or data revision, and dependency revisions where relevant.",
            "Applicable schema, ontology, shapes, dataset, source, and environment versions.",
            "Executed commands and pipeline runs with actual results and report links.",
            "Relevant API, interface, or query fixtures and expected outcomes.",
            "Findings, unresolved issues, exclusions, and verdict.",
            "Model/workflow versions and cost observations where relevant."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The packet agrees with the candidate and executed checks. It can support an issue brief, pull request, or data review without falsely claiming unrun gates."
        },
        {
          "type": "p",
          "label": "Example source: Talos QA packet",
          "text": "This proposed handoff adapts the inspected Talos QA packet template. Select fields that fit your project. The existence of a template does not establish that its checks were executed."
        }
      ],
      "refs": [
        "talospacket"
      ],
      "related": [
        "task-contract",
        "packet-skill",
        "answer-contract",
        "eval-metrics"
      ],
      "basis": "Proposed design + inspected example",
      "confidence": "Moderate"
    },
    {
      "id": "adverse-audits",
      "parent": "talos",
      "title": "Adverse-case audits",
      "summary": "Compare claims with traces, tool results, approvals, and final changes.",
      "sections": [
        {
          "type": "p",
          "label": "Recommended practice",
          "text": "Exercise failure and uncertainty cases, then compare the reported outcome with traces, tool results, approvals, and the actual resulting state. Use cases that challenge the assumptions of your workflow."
        },
        {
          "type": "list",
          "label": "Example cases to adapt",
          "items": [
            "Stale decision or source document.",
            "Duplicate event and self-triggering update.",
            "Similar or wrong module names, or a stale dependency revision.",
            "Unavailable source or environment, and denied access.",
            "Repeated pipeline failure with no new evidence.",
            "Unreviewed candidate data entering a serving environment."
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The run reports the right failure class and actual resulting state, with bounded cost and no fabricated completion."
        },
        {
          "type": "p",
          "label": "Example source: Talos QA material",
          "text": "The inspected Talos manual QA runbook describes fresh workspaces, confusing filenames, protected markers, approval lanes, traces, and final diffs. Its budget test definitions cover timeouts and stalled or repetitive streams. The runbook and test definitions were inspected, not executed."
        }
      ],
      "refs": [
        "talosmanual",
        "talosbudget"
      ],
      "related": [
        "eval-corpus",
        "candidate-isolation",
        "retries"
      ],
      "basis": "Proposed design + inspected example",
      "confidence": "Moderate"
    },
    {
      "id": "talos-boundaries",
      "parent": "talos",
      "title": "What not to copy blindly",
      "summary": "Source examples need adaptation and do not prove checks were executed.",
      "sections": [
        {
          "type": "p",
          "label": "Recommended practice",
          "text": "Check the assumptions, environment, and evidence behind a source before adapting its procedures. A document or test definition can describe a gate without proving that the gate ran successfully."
        },
        {
          "type": "p",
          "label": "Example source: Talos limitations",
          "text": "Some Talos contract tests check required text in documents/scripts. They help prevent omissions but do not prove the gates executed successfully. The README describes local traces as not tamper-evident."
        },
        {
          "type": "p",
          "label": "Adaptation boundary",
          "text": "The reviewed Talos work-cycle-docs directory contains maintained runbooks and templates, not a ready-made conventional Copilot skills package. Adapt selected procedures after reviewing local installer, PTY, and version conventions."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Use actual check outputs and appropriate evidence retention. If adapting a local procedure into a hosted runtime, review authentication, application access, event processing, idempotency, and job recovery separately."
        }
      ],
      "refs": [
        "talosdocs",
        "talosreadme"
      ],
      "related": [
        "skill-definition",
        "durable-execution",
        "permissions"
      ],
      "basis": "Recommended practice + inspected limitations",
      "confidence": "High for inspected limitations. Project fit needs review"
    },
    {
      "id": "evaluation",
      "parent": "overview",
      "title": "Evaluations & rollout",
      "summary": "Measure real outcomes before expanding automation or claiming savings.",
      "sections": [
        {
          "type": "p",
          "label": "Baseline",
          "text": "Use representative historical tasks with reviewed expected outcomes. Evaluate retrieval, analysis, execution, and resulting state, not whether the agent sounds confident."
        },
        {
          "type": "p",
          "label": "Rollout",
          "text": "Measure the current approach, try a bounded task, inspect outcomes and expand only where evidence supports it. Use shadow evaluation when comparing a new decision component without changing live behavior. A Jev source-support experiment is one optional example."
        }
      ],
      "refs": [
        "evals"
      ],
      "related": [
        "eval-corpus",
        "eval-metrics",
        "pilot",
        "architect-proposal"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "eval-corpus",
      "parent": "evaluation",
      "title": "Representative evaluation set",
      "summary": "Cover routine tasks and failures that matter to your actual project.",
      "sections": [
        {
          "type": "list",
          "label": "Cases",
          "items": [
            "Ordinary positive outcomes and hard negative examples.",
            "Ambiguous requirements and contradictory sources.",
            "Missing evidence, unavailable tools, and permission denial.",
            "Stale commits/documents/datasets and duplicate events.",
            "Relevant source languages and domain boundary cases.",
            "Correct abstention or escalation, not only successful completion."
          ]
        },
        {
          "type": "p",
          "label": "Held-out design",
          "text": "Keep related document families and revisions together when separating development and evaluation material; near-duplicates can inflate results."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Each case has expected evidence and a reviewed outcome. The set represents important task classes rather than an arbitrary demonstration count."
        },
        {
          "type": "p",
          "label": "Workload sample versus probes",
          "text": "Separate representative workload examples from diagnostic error probes. Report results separately; a small chosen set cannot guarantee production reliability."
        }
      ],
      "refs": [
        "evals"
      ],
      "related": [
        "adverse-audits",
        "jev-shadow",
        "routing",
        "study-quality"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "eval-metrics",
      "parent": "evaluation",
      "title": "Workflow-specific metrics",
      "summary": "Measure usefulness, correctness, review effort, latency, and accepted-result cost.",
      "sections": [
        {
          "type": "table",
          "label": "Measures",
          "headers": [
            "Workflow",
            "Quality",
            "Economics"
          ],
          "rows": [
            [
              "Ticket refinement",
              "Supported requirements; useful questions; invented facts",
              "Review/edit time; accepted-brief cost"
            ],
            [
              "Debt investigation",
              "Actionable findings; duplicates; false positives",
              "Investigation effort; accepted-finding cost"
            ],
            [
              "Implementation",
              "Behavior; required checks; rework",
              "Accepted-change cost; elapsed time"
            ],
            [
              "Source review",
              "Missed errors; false alarms; scope preserved",
              "Reviewer effort; reviewed-record cost"
            ],
            [
              "Knowledge answers",
              "Needed evidence; supported claims; abstention",
              "Accepted-answer cost; latency"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Include failures and retries in spend. Report important subsets separately so one strong average does not conceal weak tasks or languages."
        }
      ],
      "refs": [],
      "related": [
        "cost-per-result",
        "jev-languages",
        "grader-design"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "grader-design",
      "parent": "evaluation",
      "title": "Grading & regression",
      "summary": "Judge actual artifacts and outcomes with the right evidence.",
      "sections": [
        {
          "type": "list",
          "label": "Grading approach",
          "items": [
            "Deterministic checks for exact state, schemas, identifiers, and test outcomes.",
            "Human judgments for intended behavior and domain support.",
            "Model graders only where calibrated against reviewed references.",
            "Traces and resulting state to verify actions and diagnose failures."
          ]
        },
        {
          "type": "p",
          "label": "Regression policy",
          "text": "Re-run relevant evaluations when model, prompt, skill, retrieval, or workflow logic changes. Repeat selected cases when variability is consequential."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "The system’s success declaration is never the sole grade. Reviewers can locate the evidence used to accept or reject a result."
        }
      ],
      "refs": [
        "evals"
      ],
      "related": [
        "qa-packet",
        "post-change-checks",
        "routing"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "retrieval-diagnosis",
      "parent": "evaluation",
      "title": "Retrieval vs generation",
      "summary": "An unsupported answer can fail at different stages requiring different fixes.",
      "sections": [
        {
          "type": "table",
          "label": "Diagnosis",
          "headers": [
            "Stage",
            "Question"
          ],
          "rows": [
            [
              "Retrieval",
              "Was the needed permitted evidence found?"
            ],
            [
              "Selection",
              "Was the relevant passage/version/scope selected?"
            ],
            [
              "Generation",
              "Does the answer accurately use and support itself with that evidence?"
            ],
            [
              "Applicability",
              "Does the claim answer this question within the required scope and conditions?"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Research example",
          "text": "RAGChecker separates retrieval and generation diagnosis with claim-level evaluation. Use the principle even if you do not adopt that implementation."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Fix missing evidence or wrong selection before assuming a larger model will resolve every unsupported answer."
        }
      ],
      "refs": [
        "ragchecker"
      ],
      "related": [
        "retrieval",
        "answer-contract",
        "context-selection"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "pilot",
      "parent": "evaluation",
      "title": "Pilot sequence",
      "summary": "Expand through concrete reviewable deliverables and measured acceptance.",
      "sections": [
        {
          "type": "table",
          "label": "Possible stages for an automation pilot",
          "headers": [
            "Stage",
            "Deliverable",
            "Decision"
          ],
          "rows": [
            [
              "Baseline discovery",
              "One process, reviewed examples and current effort",
              "Where value is plausible"
            ],
            [
              "Bounded trial",
              "Results and evidence for a limited task",
              "Whether the approach is useful"
            ],
            [
              "Controlled use",
              "Limited changes under the agreed checks and authority",
              "Whether quality and operating effort are acceptable"
            ],
            [
              "Optional component comparison",
              "Shadow results against reviewed examples",
              "Whether an added decision component helps"
            ],
            [
              "Measured expansion",
              "Defined operating ownership, limits and recovery",
              "What deserves wider support"
            ]
          ]
        },
        {
          "type": "p",
          "label": "First deliverable",
          "text": "Record a representative task, its expected result and the evidence needed to judge it. Set acceptance criteria with the relevant owners before collecting results. Select only the stages the trial needs."
        },
        {
          "type": "p",
          "label": "Optional Jev example",
          "text": "For a country-data curation study, a Jev shadow comparison can test source-support judgments. It is not a required stage for other workflows or proof of the separate Atlas suggestion pilot."
        },
        {
          "type": "p",
          "label": "Acceptance",
          "text": "Expand only where quality and accepted-result economics improve. Select durable infrastructure from demonstrated execution requirements."
        }
      ],
      "refs": [],
      "related": [
        "task-contract",
        "requirements-workflow",
        "jev-shadow",
        "cost-per-result",
        "release-operations"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "architect-proposal",
      "parent": "evaluation",
      "title": "Architect discussion",
      "summary": "A concrete proposal with separable decisions and evidence to collect.",
      "sections": [
        {
          "type": "p",
          "label": "Adaptable proposal",
          "text": "Choose one outcome and compare the current approach with a bounded alternative. Identify the people and systems involved, the acceptance evidence, operating limits and unresolved decisions. Use the findings to decide what to implement or test next."
        },
        {
          "type": "p",
          "label": "Workplace example",
          "text": "The original proposal considered requirements and debt investigation, verified implementation and source-backed country-data review. These are separable opportunities, not a required three-workflow programme."
        },
        {
          "type": "list",
          "label": "Decisions to resolve",
          "items": [
            "Choose one end-to-end capability and task owner for the baseline.",
            "Confirm available clients, models, integrations, and execution environment.",
            "Agree on required evidence, review ownership, and acceptance criteria.",
            "Define applicable data, source and publication boundaries. A domain curation process may require candidate isolation and source-scope rules.",
            "Select the smallest orchestration that satisfies recovery and state needs."
          ]
        },
        {
          "type": "p",
          "label": "Reviewable next result",
          "text": "A capability map, sample evidence packet, evaluation cases, and measured small pilot that informs the next scope decision."
        }
      ],
      "refs": [],
      "related": [
        "pilot",
        "capability-inventory",
        "task-contract",
        "candidate-isolation",
        "architecture-decisions"
      ],
      "basis": "Proposed design",
      "confidence": "Moderate"
    },
    {
      "id": "confidence-summary",
      "parent": "evaluation",
      "title": "Confidence & unknowns",
      "summary": "Separate verified facts from proposed fit and unmeasured workplace outcomes.",
      "sections": [
        {
          "type": "table",
          "label": "Confidence",
          "headers": [
            "Area",
            "Assessment"
          ],
          "rows": [
            [
              "Published capabilities",
              "High for inspected documentation; tenant availability must be checked"
            ],
            [
              "Verification source example",
              "High for inspected Talos files at the recorded commit. Code was not executed, and adaptation remains proposed"
            ],
            [
              "Proposed architecture fit",
              "Moderate until workplace constraints and evidence are audited"
            ],
            [
              "Best model for each task",
              "Unknown before a project-specific benchmark"
            ],
            [
              "Actual debt and coverage",
              "Unknown before repository/pipeline investigation"
            ],
            [
              "Domain curation savings and Jev benefit",
              "Unknown for these proposed domain tasks before baseline and shadow evaluation"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Freshness",
          "text": "Prices, features, models and tenant settings can change. Check each source and its recorded review date. New general guidance does not refresh older product claims. Verify changing capabilities before implementation."
        },
        {
          "type": "p",
          "label": "Unresolved context",
          "text": "Country-data and holiday scenarios in this map are illustrative examples, not verified current rules or country data."
        },
        {
          "type": "p",
          "label": "reference-to-configuration unknowns",
          "text": "The supplied example establishes study scope, not output quality, portability, access policy or savings. The case-study branch separates recommendations from the supplied scenario."
        }
      ],
      "refs": [],
      "related": [
        "model-prices",
        "discovery",
        "jev-shadow",
        "construct-study",
        "study-decision"
      ],
      "basis": "Research limits",
      "confidence": "Explicit by area"
    },
    {
      "id": "construct-study",
      "parent": "workflows",
      "title": "Reference-to-configuration feasibility study",
      "summary": "Assess an existing engineer-assisted reference-to-configuration process as a governed backend capability.",
      "sections": [
        {
          "type": "p",
          "label": "Evidence basis",
          "text": "Adapted from a supplied feasibility example reviewed on 2 October 2026. Internal names and ticket identifiers are omitted. No private system, repository, runtime or execution result was inspected. This is a study example, not evidence of a deployed service."
        },
        {
          "type": "p",
          "label": "Actual scope",
          "text": "Users describe or import references in reference-to-configuration. Engineers currently run local Agents/Skills and hand-produce a pipeline/configuration. The study assesses a backend API/workflow for Phase 2 planning. Its baseline already uses AI; it is not a non-AI manual process."
        },
        {
          "type": "table",
          "label": "Already covered by the tickets",
          "headers": [
            "Existing deliverable",
            "Purpose"
          ],
          "rows": [
            [
              "End-to-end process map",
              "Tools, inputs, outputs and engineer involvement"
            ],
            [
              "Feasibility/constraints",
              "Credible technical approach and dependencies"
            ],
            [
              "Effort and runtime cost",
              "Build effort, compute, model calls and orchestration"
            ],
            [
              "API/workflow recommendation",
              "Sync/async, hosting and integration options"
            ],
            [
              "Go/no-go",
              "A reasoned next-phase recommendation"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Our contribution",
          "text": "Make output usability, engineer interventions, baseline measurements and initial comparison evidence explicit within these existing deliverables. Our broad development workflow helps the team build the capability; this product workflow generates a user's artifact."
        },
        {
          "type": "p",
          "label": "Study-sized boundary",
          "text": "A decision package, plus an assumption-resolving experiment if needed. Full production implementation, polished UX, automatic activation, a new enterprise platform, Jev and a knowledge graph are not established requirements."
        },
        {
          "type": "p",
          "label": "Unknowns",
          "text": "Reference formats, pipeline semantics, the existing ingestion integration and backend implementation remain unverified. A platform label alone does not establish a hosting architecture. Value, savings and model fit remain unknown."
        }
      ],
      "refs": [
        "gov-discovery",
        "simple-agents",
        "nist-core"
      ],
      "related": [
        "study-baseline",
        "study-quality",
        "study-contract",
        "study-runtime",
        "study-economics",
        "study-experiment",
        "study-decision",
        "study-ticket-wording",
        "study-scenarios",
        "task-contract"
      ],
      "basis": "User-provided ticket scope + explicitly labeled recommendations",
      "confidence": "High for visible scope; moderate for recommendations; outcomes unknown"
    },
    {
      "id": "study-baseline",
      "parent": "construct-study",
      "title": "Map the engineer-assisted baseline",
      "summary": "Observe the existing AI-assisted process and the decisions engineers make around it.",
      "sections": [
        {
          "type": "p",
          "label": "Follow existing cases",
          "text": "Trace a supported reference through agent/tool execution, corrections, checks and artifact acceptance. Separate waiting time, active engineer work, execution and review."
        },
        {
          "type": "list",
          "label": "Record each step",
          "items": [
            "Inputs/outputs and supporting tools or scripts.",
            "Context, files and versions supplied by the engineer.",
            "Missing-information and unsupported-case decisions.",
            "Corrections and the checks establishing usability.",
            "Dependencies, permissions, credential categories and workstation state.",
            "Observed time/cost, with gaps labeled rather than guessed."
          ]
        },
        {
          "type": "p",
          "label": "Hypothesis to investigate",
          "text": "Engineers may supply hidden interpretation or repair between visible steps. The screenshots do not establish that this work exists or is undocumented."
        },
        {
          "type": "p",
          "label": "Fair comparison",
          "text": "Use the same supported task class and usability criteria. Include the current process's model usage and engineer effort. A simpler automated alternative may still use limited model assistance."
        },
        {
          "type": "p",
          "label": "Study output",
          "text": "A concise process map and case evidence table. Reuse checked examples or traces where available; a new observability platform is not required."
        }
      ],
      "refs": [
        "gov-discovery",
        "evals"
      ],
      "related": [
        "construct-study",
        "study-quality",
        "study-economics",
        "capability-inventory",
        "skill-definition"
      ],
      "basis": "Ticket-scoped recommendation; not an implemented workplace capability",
      "confidence": "Moderate for fit; workplace benefit unknown"
    },
    {
      "id": "study-quality",
      "parent": "construct-study",
      "title": "Evaluate usable outputs",
      "summary": "Separate first-pass usability, repaired acceptance and errors that validation misses.",
      "sections": [
        {
          "type": "table",
          "label": "Different checks",
          "headers": [
            "Check",
            "What it establishes"
          ],
          "rows": [
            [
              "Mechanical validity",
              "Parsing, schema, supported components and compatibility."
            ],
            [
              "Meaning/behaviour",
              "The artifact represents the requirements and works on agreed examples."
            ],
            [
              "Interaction",
              "Incomplete/unsupported inputs produce intended clarification or failure."
            ]
          ]
        },
        {
          "type": "p",
          "label": "Schema validity is insufficient",
          "text": "OpenAI documents remaining mistakes in structured outputs. A schema-valid mapping or value can still be wrong; domain checks evaluate a different property."
        },
        {
          "type": "list",
          "label": "Initial case design",
          "items": [
            "Reuse existing reviewed examples and manual checks.",
            "Keep representative workload cases separate from diagnostic cases selected to expose failures.",
            "Include incomplete, conflicting and unsupported inputs with expected behaviour.",
            "Allow equivalent correct artifacts rather than requiring one exact byte sequence.",
            "Reserve untouched comparison examples where evidence permits; group related reference families/revisions to reduce leakage.",
            "Repeat selected cases when variability could change the decision."
          ]
        },
        {
          "type": "table",
          "label": "Separate outcomes",
          "headers": [
            "Outcome",
            "Meaning"
          ],
          "rows": [
            [
              "First-pass usable",
              "Accepted before human or repair-loop correction."
            ],
            [
              "Usable after repair",
              "Include attempts, latency and engineer correction effort."
            ],
            [
              "Rejected/unresolved",
              "No usable output under the trial policy."
            ],
            [
              "Incorrect but passed checks",
              "Independent review found a validation gap; classify consequence."
            ]
          ]
        },
        {
          "type": "p",
          "label": "Criteria and limitations",
          "text": "Product/domain and technical owners define usability and unacceptable errors. The generator's success claim is insufficient. Model grading is optional and needs reviewed calibration. State sample counts/coverage; a small chosen set does not guarantee production reliability. No arbitrary acceptance percentage or sample size is supplied here."
        }
      ],
      "refs": [
        "structured-output",
        "evals",
        "eval-best-practice",
        "dataset-splits"
      ],
      "related": [
        "study-baseline",
        "study-decision",
        "eval-corpus",
        "grader-design",
        "post-change-checks",
        "workflow-patterns"
      ],
      "basis": "Ticket-scoped recommendation; not an implemented workplace capability",
      "confidence": "Moderate for fit; workplace benefit unknown"
    },
    {
      "id": "study-contract",
      "parent": "construct-study",
      "title": "Define the service contract",
      "summary": "Specify inputs, results and failure behaviour without prematurely selecting a platform.",
      "sections": [
        {
          "type": "list",
          "label": "Questions to resolve",
          "items": [
            "Supported reference/task classes and unsupported-input response.",
            "Output schema/version, supported components and compatibility.",
            "Generation, saving, application and execution as separate actions.",
            "Progress, clarification, preview and failure information visible to the user.",
            "Repeated submissions, retry, cancellation and partial completion.",
            "Caller/tenant permissions, job state and artifact storage."
          ]
        },
        {
          "type": "p",
          "label": "Sync versus async",
          "text": "Base the choice on observed duration/variance, caller timeouts, clarification and recovery needs. Asynchronous request-reply with a job/status resource is a candidate pattern, not an established requirement."
        },
        {
          "type": "p",
          "label": "Minimal UX during study",
          "text": "Full experience design may stay deferred. A lightweight sketch of clarification, preview and failure behaviour can still inform feasibility and effort."
        },
        {
          "type": "code",
          "label": "Illustrative proposed flow",
          "text": "Reference -> input checks -> bounded generation -> candidate validation\nusable -> artifact + validation evidence\nincomplete -> clarification\nunsupported / failed / limits reached -> explicit outcome or assistance\nApplication/execution is separately specified."
        },
        {
          "type": "p",
          "label": "Candidate evidence",
          "text": "Identify input/reference version, candidate artifact, workflow/skill/model versions and checks. This evidence design does not require exposing every implementation detail in product UI."
        }
      ],
      "refs": [
        "async-request-reply",
        "skillspec",
        "nist-core"
      ],
      "related": [
        "study-runtime",
        "study-quality",
        "task-contract",
        "event-state",
        "durable-execution",
        "workflow-patterns"
      ],
      "basis": "Ticket-scoped recommendation; not an implemented workplace capability",
      "confidence": "Moderate for fit; workplace benefit unknown"
    },
    {
      "id": "study-runtime",
      "parent": "construct-study",
      "title": "Assess backend execution",
      "summary": "Check runtime identity, dependencies, limits and ownership.",
      "sections": [
        {
          "type": "p",
          "label": "Recipes need a host",
          "text": "Skills package instructions, scripts and examples. The runtime supplies tools, context, dependencies, persistence and enforcement; SKILL.md alone is not a service or permission boundary."
        },
        {
          "type": "p",
          "label": "Copilot route to assess",
          "text": "GitHub documents server-to-server SDK authentication. Outside GitHub Actions, its route uses a GitHub App, organization enablement and installation tokens; the current permission check requires All repositories access. Eligibility and compatibility with company policy are unknown."
        },
        {
          "type": "p",
          "label": "Separate identities",
          "text": "Model authentication does not grant Jira, Bitbucket, Jenkins or Neptune permissions. Check each application's supported identity/scopes and credential ownership. Keep private tokens out of study artifacts."
        },
        {
          "type": "p",
          "label": "Soft budget boundary",
          "text": "SDK session limits are checked after model responses return. A response can exceed the cap before the next call is blocked. Connectors, runner work and review have separate costs."
        },
        {
          "type": "list",
          "label": "Study findings",
          "items": [
            "Allowed operations and imported-content/action boundaries.",
            "Caller/tenant isolation, artifact storage and evidence retention.",
            "Tool, repair, time and concurrency limits and exhaustion outcomes.",
            "Retries and duplicate-effect handling for side effects.",
            "Owners for operating cost, incidents, artifact acceptance and evaluation."
          ]
        },
        {
          "type": "p",
          "label": "Imported material",
          "text": "Treat references as task data rather than authority to change permissions or execute instructions. Match controls to real tool capabilities; a new security platform is not automatically required."
        }
      ],
      "refs": [
        "skillspec",
        "sdk-server-auth",
        "sdk-session-limits",
        "prompt-injection",
        "nist-core"
      ],
      "related": [
        "study-contract",
        "study-economics",
        "permissions",
        "budgets",
        "architecture"
      ],
      "basis": "Ticket-scoped recommendation; not an implemented workplace capability",
      "confidence": "Moderate for fit; workplace benefit unknown"
    },
    {
      "id": "study-economics",
      "parent": "construct-study",
      "title": "Cost per accepted artifact",
      "summary": "Account for all attempts and remaining human work, with estimates labeled.",
      "sections": [
        {
          "type": "code",
          "label": "Defined comparison",
          "text": "For one workload and reporting window:\ncost per accepted artifact =\n(model + tools/connectors + runner + validation + review/repair cost across ALL attempts)\n/ accepted artifacts\nWith zero accepted artifacts, report no accepted outcome; do not divide by zero."
        },
        {
          "type": "p",
          "label": "Denominator",
          "text": "Acceptance means meeting agreed usability criteria. Count the accepted task/artifact once; repairs are not extra successes. Include failed/rejected attempts in cost. Separate first-pass and repaired acceptance."
        },
        {
          "type": "table",
          "label": "Evidence labels",
          "headers": [
            "Measured",
            "Estimated/unknown"
          ],
          "rows": [
            [
              "Observed usage and engineer effort",
              "Future demand, bursts and task mix"
            ],
            [
              "Observed completion/repair time",
              "Hosting, support and maintenance effort"
            ],
            [
              "Billable units and current rates",
              "Rate/cache changes and policy feasibility"
            ]
          ]
        },
        {
          "type": "p",
          "label": "Explicit units",
          "text": "Keep engineer minutes separate unless an agreed cost conversion exists. Separate build effort, recurring maintenance and per-run cost; avoid double-counting."
        },
        {
          "type": "p",
          "label": "Runtime/billing evidence",
          "text": "An IDE subscription alone does not establish backend access. Verify organization enablement, billing owner and task/report correlation. GitHub documents the SDK usage cost field as a request multiplier rather than currency."
        },
        {
          "type": "p",
          "label": "Forecast",
          "text": "Use volume assumptions and ranges that show what changes the recommendation. Measurements and estimates can coexist. A cheaper model helps only when total accepted-outcome evidence supports it."
        }
      ],
      "refs": [
        "agentic-costs",
        "agentic-economics",
        "sdk-server-auth",
        "sdk-usage",
        "billing"
      ],
      "related": [
        "cost-per-result",
        "study-baseline",
        "study-quality",
        "study-decision",
        "billing-boundaries"
      ],
      "basis": "Ticket-scoped recommendation; not an implemented workplace capability",
      "confidence": "Moderate for fit; workplace benefit unknown"
    },
    {
      "id": "study-experiment",
      "parent": "construct-study",
      "title": "Resolve material assumptions",
      "summary": "Run small experiments only when their evidence can change the decision.",
      "sections": [
        {
          "type": "p",
          "label": "Compare options proportionately",
          "text": "Shortlist the existing engineer-assisted process, credible simpler automation and bounded agent options. The study need not build three prototypes."
        },
        {
          "type": "table",
          "label": "Candidate experiments",
          "headers": [
            "Uncertainty",
            "Proportionate evidence"
          ],
          "rows": [
            [
              "Workstation-specific state",
              "Small isolated replay with dependencies recorded."
            ],
            [
              "Usability before correction",
              "Reviewed cases, independent checks and intervention logs."
            ],
            [
              "Approved model/tool access",
              "Configuration review or narrow connectivity demonstration."
            ],
            [
              "Async requirement",
              "Duration/variance evidence and caller constraints."
            ]
          ]
        },
        {
          "type": "p",
          "label": "Experiment contract",
          "text": "Name the assumption, owner, timebox, expected evidence and decision it could change. Prioritize consequential uncertainty."
        },
        {
          "type": "p",
          "label": "Conditional completion",
          "text": "The study can finish with a named uncertainty and costed next experiment. A feasibility ticket is not a requirement to build production."
        },
        {
          "type": "p",
          "label": "Architecture guidance",
          "text": "Anthropic recommends added complexity when it improves outcomes; its older article explicitly notes tooling changes. This guidance does not establish a winning model, agent count or engine here."
        }
      ],
      "refs": [
        "simple-agents",
        "gov-discovery"
      ],
      "related": [
        "study-baseline",
        "study-quality",
        "study-runtime",
        "study-decision",
        "routing"
      ],
      "basis": "Ticket-scoped recommendation; not an implemented workplace capability",
      "confidence": "Moderate for fit; workplace benefit unknown"
    },
    {
      "id": "study-decision",
      "parent": "construct-study",
      "title": "Make the next-phase decision",
      "summary": "Go, conditional go or no-go is a study recommendation, not production certification.",
      "sections": [
        {
          "type": "p",
          "label": "Agree criteria first",
          "text": "Domain/product and technical owners define usable behaviour, unacceptable errors, access constraints and the cost/time improvement justifying investment before interpreting results. This Atlas invents no percentages."
        },
        {
          "type": "table",
          "label": "Recommended decisions",
          "headers": [
            "Decision",
            "Required explanation"
          ],
          "rows": [
            [
              "Go to scoped next phase",
              "Initial evidence supports defined useful tasks, credible runtime/access, plausible economics and ownership; state limitations."
            ],
            [
              "Conditional go",
              "Name the unresolved assumption, owner, condition, experiment, effort and result reversing the decision."
            ],
            [
              "No-go",
              "Explain the hard constraint, unacceptable quality or weak economics; assess narrower assisted alternatives."
            ]
          ]
        },
        {
          "type": "list",
          "label": "Decision package",
          "items": [
            "Recommendation and supported input/task scope.",
            "Evidence for examples, outcomes, observations and estimates.",
            "Alternatives retained/rejected and why.",
            "Measured facts, assumptions, unknowns and their consequences.",
            "Effort/cost, dependencies, owners and phased next scope."
          ]
        },
        {
          "type": "p",
          "label": "Different success measures",
          "text": "Acceptance into Phase 2 planning is the ticket's planning outcome. Future feature success needs quality and user-value measures. A supported no-go can be a successful study."
        },
        {
          "type": "p",
          "label": "Source status",
          "text": "GOV.UK discovery and NIST inform this framework; they are not binding company procedures. NIST's cited Core is AI RMF 1.0, with a revision in progress."
        }
      ],
      "refs": [
        "gov-discovery",
        "nist-core",
        "agentic-economics"
      ],
      "related": [
        "study-quality",
        "study-economics",
        "study-experiment",
        "study-ticket-wording",
        "confidence-summary"
      ],
      "basis": "Ticket-scoped recommendation; not an implemented workplace capability",
      "confidence": "Moderate for fit; workplace benefit unknown"
    },
    {
      "id": "study-ticket-wording",
      "parent": "construct-study",
      "title": "Refine ticket acceptance wording",
      "summary": "Make evidence explicit while retaining the time-boxed feasibility scope.",
      "sections": [
        {
          "type": "p",
          "label": "Existing coverage",
          "text": "The supplied study scope already requires process documentation, constraints, effort and cost, API shape and a go/no-go recommendation. The refinements below make evidence more explicit within that scope."
        },
        {
          "type": "code",
          "label": "Paste-ready refinement",
          "text": "The feasibility report includes representative input/output examples with agreed usability criteria, evidence of current engineer-assisted effort and required interventions, and an initial evaluation of the proposed approach. It distinguishes measured results from estimates, documents incomplete/unsupported-input behaviour and the generation/application boundary, and provides a go, conditional-go or no-go recommendation with explicit assumptions, owners and a costed next phase."
        },
        {
          "type": "list",
          "label": "Supporting detail",
          "items": [
            "Reuse checked cases and execution evidence.",
            "Separate first-pass and repaired acceptance.",
            "State access and operating ownership constraints.",
            "Experiment to resolve a material assumption.",
            "Document coverage limits and unknown benefits."
          ]
        },
        {
          "type": "p",
          "label": "Complementary contribution",
          "text": "Define representative examples, behavior, checks and comparison evidence alongside the hosting and integration study. Agree ownership within the team. These are suggested study activities."
        },
        {
          "type": "p",
          "label": "Evidence basis",
          "text": "Adapted from supplied study material. Internal ticket identifiers are omitted. The wording and division of work are recommendations, not observed workplace outcomes."
        }
      ],
      "refs": [
        "gov-discovery",
        "evals"
      ],
      "related": [
        "construct-study",
        "study-quality",
        "study-decision",
        "study-scenarios"
      ],
      "basis": "Ticket-scoped recommendation; not an implemented workplace capability",
      "confidence": "Moderate for fit; workplace benefit unknown"
    },
    {
      "id": "study-scenarios",
      "parent": "construct-study",
      "title": "Walk through study scenarios",
      "summary": "Hypothetical cases explain proposed behaviour without claiming workplace results.",
      "sections": [
        {
          "type": "table",
          "label": "Illustrative cases",
          "headers": [
            "Input/event",
            "Evidence to decide"
          ],
          "rows": [
            [
              "Complete supported reference",
              "Artifact, checks, first-pass usability, latency and effort."
            ],
            [
              "Required detail missing",
              "Clarification/incomplete outcome without invented domain choices."
            ],
            [
              "Reference/request conflict",
              "Conflict surfaced; agreed policy determines response."
            ],
            [
              "Valid format, wrong meaning",
              "Domain check detects error despite parsing."
            ],
            [
              "Timeout/exhausted budget",
              "Explicit outcome/recovery and actual cost recorded."
            ],
            [
              "Retry saving an artifact",
              "Repeated request avoids unintended duplicate effects."
            ],
            [
              "Person corrects a draft",
              "Repaired acceptance and effort rather than first-pass success."
            ]
          ]
        },
        {
          "type": "p",
          "label": "ELI15",
          "text": "An assistant drafts a configuration. The study asks if the draft is useful, which checks find mistakes, when a person must help, and whether the complete process improves time or cost."
        },
        {
          "type": "p",
          "label": "No implied activation",
          "text": "Cases stop at the generated result unless application/execution is separately specified. They do not assume production deployment, a Jenkins pipeline or a country-policy change."
        },
        {
          "type": "p",
          "label": "Adapt to actual formats",
          "text": "Convert relevant cases into reviewed checks. Separate diagnostic failures from the sample estimating routine performance."
        }
      ],
      "refs": [
        "structured-output",
        "evals",
        "sdk-session-limits"
      ],
      "related": [
        "study-quality",
        "study-contract",
        "study-economics",
        "adverse-audits",
        "workflow-patterns"
      ],
      "basis": "Ticket-scoped recommendation; not an implemented workplace capability",
      "confidence": "Moderate for fit; workplace benefit unknown"
    }
  ],
  "sources": {
    "skillspec": [
      "Agent Skills specification",
      "https://agentskills.io/specification"
    ],
    "anthropicskills": [
      "Anthropic: engineering Agent Skills",
      "https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills"
    ],
    "context": [
      "Anthropic: effective context engineering",
      "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    ],
    "dynamic": [
      "GitHub: Dynamic Workflows announcement, 1 October 2026",
      "https://github.blog/changelog/2026-10-01-dynamic-workflows-in-copilot-cli-and-the-copilot-app/"
    ],
    "dynamicdocs": [
      "GitHub: Dynamic Workflows behavior and limits",
      "https://docs.github.com/en/copilot/concepts/agents/dynamic-workflows"
    ],
    "temporal": [
      "Temporal: durable AI workflows",
      "https://docs.temporal.io/ai"
    ],
    "cloud": [
      "GitHub: cloud-agent repository limitations",
      "https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent"
    ],
    "sdk": [
      "GitHub: SDK agents, model overrides, eager skills",
      "https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents"
    ],
    "jetbrains": [
      "GitHub: JetBrains update, 8 September 2026",
      "https://github.blog/changelog/2026-09-08-enterprise-managed-sandbox-in-copilot-for-jetbrains/"
    ],
    "billing": [
      "GitHub: Copilot Business billing",
      "https://docs.github.com/en/copilot/concepts/billing-and-usage/organizations-and-enterprises/billing"
    ],
    "prices": [
      "GitHub: Copilot model pricing",
      "https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing"
    ],
    "models": [
      "GitHub: model availability",
      "https://docs.github.com/en/copilot/reference/ai-models/supported-models"
    ],
    "rovo": [
      "Atlassian: configure Use agent automation",
      "https://support.atlassian.com/cloud-automation/docs/tips-to-configure-the-action-use-rovo-agent/"
    ],
    "rovocredits": [
      "Atlassian: Rovo credit rules",
      "https://support.atlassian.com/rovo/docs/rovo-usage-limits/"
    ],
    "rovotier": [
      "Atlassian: Rovo reasoning tiers",
      "https://support.atlassian.com/studio/docs/set-a-reasoning-tier-for-a-rovo-agent/"
    ],
    "traceability": [
      "NASA: bidirectional traceability",
      "https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695427/SWE-052%2B-%2BBidirectional%2BTraceability"
    ],
    "sonar": [
      "Sonar: metric definitions",
      "https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition"
    ],
    "newcode": [
      "Sonar: new-code approach",
      "https://docs.sonarsource.com/sonarqube-cloud/standards/about-new-code"
    ],
    "jacoco": [
      "JaCoCo: coverage counters",
      "https://www.jacoco.org/jacoco/trunk/doc/counters.html"
    ],
    "mutation": [
      "Google: practical mutation testing at scale",
      "https://research.google/pubs/practical-mutation-testing-at-scale-a-view-from-google/"
    ],
    "shacl": [
      "W3C: SHACL specification",
      "https://www.w3.org/TR/shacl/"
    ],
    "explain": [
      "AWS: Neptune SPARQL explain",
      "https://docs.aws.amazon.com/neptune/latest/userguide/sparql-explain.html"
    ],
    "neptune": [
      "AWS: Neptune SPARQL and graph behavior",
      "https://docs.aws.amazon.com/neptune/latest/userguide/feature-sparql-compliance.html"
    ],
    "jevlimits": [
      "TypeSafe: Jev 1.13 limitations",
      "https://docs.typesafe.ai/model-jaggedness/jev-1.13"
    ],
    "jevconfidence": [
      "TypeSafe: confidence semantics",
      "https://docs.typesafe.ai/confidence"
    ],
    "jevmodels": [
      "TypeSafe: Jev models",
      "https://docs.typesafe.ai/models"
    ],
    "jevcitation": [
      "TypeSafe: citation-check cookbook",
      "https://docs.typesafe.ai/cookbooks/citation_check"
    ],
    "wikibase": [
      "Wikibase: full-statement RDF format",
      "https://www.mediawiki.org/wiki/Wikibase/Indexing/RDF_Dump_Format"
    ],
    "wikisources": [
      "Wikidata: sourcing guidance",
      "https://www.wikidata.org/wiki/Help:Sources"
    ],
    "graphrag": [
      "Microsoft: GraphRAG query strategies",
      "https://microsoft.github.io/graphrag/query/overview/"
    ],
    "prov": [
      "W3C: PROV-O provenance ontology",
      "https://www.w3.org/TR/prov-o/"
    ],
    "evals": [
      "Anthropic: evaluating AI agents",
      "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents"
    ],
    "ragchecker": [
      "Amazon Science: RAGChecker",
      "https://github.com/amazon-science/RAGChecker"
    ],
    "taloscycle": [
      "Talos: work-test cycle at reviewed commit",
      "https://github.com/ai21z/talos-assistant/blob/970385bedac11a6bf0eecbe951aa815735d73a1b/work-cycle-docs/work-test-cycle.md"
    ],
    "talosverify": [
      "Talos: command-verification evidence tests",
      "https://github.com/ai21z/talos-assistant/blob/970385bedac11a6bf0eecbe951aa815735d73a1b/src/test/java/dev/talos/runtime/verification/CommandVerificationEvidenceTest.java"
    ],
    "talosfinding": [
      "Talos: audit-finding template",
      "https://github.com/ai21z/talos-assistant/blob/970385bedac11a6bf0eecbe951aa815735d73a1b/work-cycle-docs/templates/audit-finding.md"
    ],
    "talosverdict": [
      "Talos: summary and verdict template",
      "https://github.com/ai21z/talos-assistant/blob/970385bedac11a6bf0eecbe951aa815735d73a1b/work-cycle-docs/templates/talosbench-summary-template.md"
    ],
    "talospacket": [
      "Talos: QA packet",
      "https://github.com/ai21z/talos-assistant/blob/970385bedac11a6bf0eecbe951aa815735d73a1b/work-cycle-docs/templates/qa-packet.md"
    ],
    "talosmanual": [
      "Talos: adverse-case manual QA",
      "https://github.com/ai21z/talos-assistant/blob/970385bedac11a6bf0eecbe951aa815735d73a1b/work-cycle-docs/runbooks/manual-qa.md"
    ],
    "talosdocs": [
      "Talos: documentation contract test",
      "https://github.com/ai21z/talos-assistant/blob/970385bedac11a6bf0eecbe951aa815735d73a1b/src/test/java/dev/talos/docs/ReleaseQaGateContractTest.java"
    ],
    "talosbudget": [
      "Talos: LLM call-budget tests",
      "https://github.com/ai21z/talos-assistant/blob/970385bedac11a6bf0eecbe951aa815735d73a1b/src/test/java/dev/talos/core/llm/LlmCallBudgetTest.java"
    ],
    "talosreadme": [
      "Talos: README at reviewed commit",
      "https://github.com/ai21z/talos-assistant/blob/970385bedac11a6bf0eecbe951aa815735d73a1b/README.md"
    ],
    "simple-agents": [
      "Anthropic: composable architectures (tooling caveat noted)",
      "https://www.anthropic.com/engineering/building-effective-agents"
    ],
    "gov-discovery": [
      "GOV.UK: discovery scope and next-phase decisions",
      "https://www.gov.uk/service-manual/agile-delivery/how-the-discovery-phase-works"
    ],
    "nist-core": [
      "NIST AI RMF 1.0 Core (revision in progress)",
      "https://airc.nist.gov/airmf-resources/airmf/5-sec-core/"
    ],
    "sdk-server-auth": [
      "GitHub: Copilot SDK server-to-server authentication",
      "https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/server-to-server-tokens"
    ],
    "sdk-session-limits": [
      "GitHub: Copilot SDK session soft limits",
      "https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/session-limits"
    ],
    "sdk-usage": [
      "GitHub: Copilot SDK usage and billing telemetry",
      "https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing"
    ],
    "structured-output": [
      "OpenAI: structured outputs and remaining semantic errors",
      "https://developers.openai.com/api/docs/guides/structured-outputs"
    ],
    "eval-best-practice": [
      "OpenAI: evaluation design and held-out testing",
      "https://developers.openai.com/api/docs/guides/evaluation-best-practices"
    ],
    "async-request-reply": [
      "Microsoft: asynchronous request-reply pattern",
      "https://learn.microsoft.com/en-us/azure/architecture/patterns/asynchronous-request-reply"
    ],
    "agentic-costs": [
      "AWS: assessing agentic workflow costs",
      "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-economics/assessing-costs.html"
    ],
    "agentic-economics": [
      "AWS: agentic AI economics and investment choices",
      "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-economics/understanding.html"
    ],
    "dataset-splits": [
      "Google: separate development, validation and test data",
      "https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets"
    ],
    "prompt-injection": [
      "OWASP: prompt injection in imported/retrieved content",
      "https://genai.owasp.org/llmrisk/llm01-prompt-injection/"
    ],
    "llmwiki": [
      "Andrej Karpathy: LLM Wiki idea file, live gist reviewed 3 October 2026",
      "https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
    ]
  }
};
