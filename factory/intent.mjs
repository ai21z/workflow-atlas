const present = value => typeof value === 'string' && value.trim().length > 0

// These questions ask for the same intended result as the opening project brief.
// A repair purpose does not establish the expected behavior of a reported bug.
const outcomeQuestion = { 'feature-delivery': 'user-need', feasibility: 'desired-outcome' }

// Display wording changes neither the recorded question ID nor the pilot contract.
export function getIntentQuestionWording(question) {
  return question.id === 'acceptance'
    ? { ...question, label: 'How will you know it works?', hint: 'Give an example of the result you expect, including what should happen when something goes wrong.' }
    : question
}

export function getIntentAnswer(config, questionId) {
  const recorded = config.workflow?.answers?.[questionId]
  if (present(recorded)) return { text: recorded, source: 'answer', sourcePath: `workflow.answers.${questionId}`, inherited: false }
  const purpose = config.project?.purpose
  if (outcomeQuestion[config.workflow?.recipe] === questionId && present(purpose)) {
    return { text: purpose, source: 'project-outcome', sourcePath: 'project.purpose', inherited: true }
  }
  return { text: '', source: 'unresolved', sourcePath: `workflow.answers.${questionId}`, inherited: false }
}
