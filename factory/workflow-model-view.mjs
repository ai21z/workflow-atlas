import { CORRECTION_SEMANTICS, resolveWorkflowProcesses, workflowModelIssues } from './workflow-model.mjs';

import { renderProcessDiagram, PROCESS_DIAGRAM_STYLES } from './process-diagram.mjs';

const text = value => typeof value === 'string' && value.trim() ? value : 'Unresolved';
const list = values => values.length ? values.join(', ') : 'None';
const html = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = value => String(value).replace(/[\\`*_{}\[\]<>#|]/g, '\\$&').replace(/[\r\n]+/g, ' ');
const purpose = { development: 'How we build it', application: 'How it works when used', manual: 'Manual process' };
const boundary = 'These are planned steps and outcomes. Atlas does not run them. Edit connections in the Process designer. Assigned instructions feed generated skills, matching selected development roles and planned evaluation cases. Application actors describe the system being designed. They do not configure a running agent.';

// A single reading projection supplies both the app and the downloaded guide.
function sections(process) {
  const stepName = id => process.steps.find(step => step.id === id)?.name || text(id);
  const resultName = id => process.results.find(result => result.id === id)?.name || text(id);
  const destination = to => to.type === 'step' ? stepName(to.id) : to.type === 'terminal' ? `End: ${process.terminals.find(terminal => terminal.id === to.id)?.name || text(to.id)}` : 'Unresolved';
  return [
    { title: 'Outcome routes', rows: process.transitions.map(route => {
      const correction = process.corrections.find(item => item.decisionStepId === route.fromStepId && item.outcome === route.outcome);
      const budget = correction ? ` Start a correction only while its limit allows it. Maximum corrections: ${correction.maxCorrections ?? 'Unresolved'}. Otherwise end at ${process.terminals.find(item => item.id === correction.exhaustedTerminalId)?.name || 'Unresolved'}.` : '';
      return { title: `${stepName(route.fromStepId)} / ${text(route.outcome)}`, fields: [['Next', `${destination(route.to)}.${budget}`]] };
    }) },
    { title: 'Steps and responsibilities', rows: process.steps.map(step => ({ title: `${step.name || step.id} (${step.id})`, fields: [
      ['Action', text(step.action)], ['Actor', `${step.actor.type}: ${text(step.actor.name || step.actor.id)}${step.actor.contextOnly ? '. Review supplied context only' : ''}`],
      ['Requested capabilities', list(step.capabilities)], ['Needs', list(step.inputIds.map(resultName))], ['Produces', list(step.outputIds.map(resultName))], ['Instruction IDs', list(step.instructionIds)], ['Declared outcomes', list(step.outcomes)],
    ] })) },
    { title: 'Results and input relationships', rows: process.results.map(result => ({ title: `${result.name || result.id} (${result.id})`, fields: [
      ['Meaning', text(result.description)], ['Initial producer', result.producerStepId ? stepName(result.producerStepId) : 'Supplied input'], ['Supplied source', result.producerStepId ? 'Produced in this process' : text(result.suppliedSource)],
      ['Consumers', list(result.consumerStepIds.map(stepName))], ['Revisers', list(result.reviserStepIds.map(stepName))], ['Expected structure', text(result.expectedStructure)], ['Version policy', text(result.versionPolicy)], ['Recorded candidate version', text(result.version)],
    ] })) },
    { title: 'Checks', rows: process.checks.map(check => ({ title: check.id, fields: [
      ['At step', stepName(check.stepId)], ['Candidate', resultName(check.candidateId)], ['Criteria', check.criteria.length ? check.criteria.map(text).join('\n') : 'Unresolved'], ['Method', check.method], ['Expected evidence', resultName(check.evidenceResultId)], ['Outcomes', list(check.outcomes)], ['After changes', 'Check the revised candidate again. Earlier evidence remains historical.'],
    ] })) },
    { title: 'Correction limits', rows: process.corrections.map(correction => ({ title: correction.id, fields: [
      ['Decision', `${stepName(correction.decisionStepId)} / ${text(correction.outcome)}`], ['Correction step', stepName(correction.correctionStepId)], ['Recheck at', stepName(correction.checkStepId)],
      ['Candidate', resultName(correction.candidateId)], ['Feedback', resultName(correction.feedbackResultId)], ['Maximum corrections after initial candidate', String(correction.maxCorrections ?? 'Unresolved')],
      ['When exhausted', process.terminals.find(terminal => terminal.id === correction.exhaustedTerminalId)?.name || 'Unresolved'], ...Object.entries(CORRECTION_SEMANTICS),
    ] })) },
    { title: 'Approval authority', rows: process.approvals.map(approval => ({ title: approval.id, fields: [
      ['At step', stepName(approval.stepId)], ['Authority', text(approval.authority)], ['Candidate', resultName(approval.candidateId)], ['Evidence to review', list(approval.evidenceResultIds.map(resultName))], ['After changes', 'Obtain approval again for the revised candidate. Declined and changes requested have separate routes.'],
    ] })) },
    { title: 'Terminal outcomes', rows: process.terminals.map(terminal => ({ title: `${terminal.name || terminal.id} (${terminal.id})`, fields: [['Planned status', terminal.status]] })) },
  ];
}

export function workflowModelMarkdown(config) {
  const processes = resolveWorkflowProcesses(config).filter(process => process.source === 'custom');
  if (!processes.length) return '';
  const findings = workflowModelIssues(config);
  return `\n## Explicit process designs\n\n${boundary}\n\n${processes.map(process => `### ${md(process.name || process.id)}\n\n${purpose[process.kind]}. Process ID: ${md(process.id)}. Pattern: ${md(process.pattern.id)}, version ${md(process.pattern.version)}.\n\n${md(text(process.purpose))}\n\nEntry step: ${md(text(process.entryStepId))}.\n\n${sections(process).map(section => `#### ${section.title}\n\n${section.rows.map(row => `**${md(row.title)}**\n\n${row.fields.map(([label, value]) => `- ${md(label)}: ${md(value)}`).join('\n')}`).join('\n\n') || 'None recorded.'}`).join('\n\n')}`).join('\n\n')}\n\n### Supplied evidence associations\n\n${config.workflowModel.evidenceLinks.map(link => `- ${md(link.id)}. Evidence ${md(link.evidenceId)} for process ${md(link.processId)}, check ${md(link.checkId)}, result ${md(link.resultId)}, candidate version ${md(text(link.candidateVersion))}. Supplied evidence is not independently verified.`).join('\n') || 'None recorded.'}\n\n### Model findings\n\n${findings.map(issue => `- ${md(issue.path)}: ${md(issue.message)}`).join('\n') || 'No model rule findings. This does not establish that the work ran or the criteria are adequate.'}\n`;
}

export function renderWorkflowModel(config) {
  const processes = resolveWorkflowProcesses(config).filter(process => process.source === 'custom');
  if (!processes.length) return '';
  const findings = workflowModelIssues(config);
  return `<section class="process-design"><h2>Explicit process designs</h2><p>${html(boundary)}</p>${processes.map(process => `<article><h3>${html(process.name || process.id)}</h3><p>${html(purpose[process.kind])}. ${html(text(process.purpose))}</p><p>Entry: ${html(text(process.entryStepId))}. Pattern: ${html(process.pattern.id)}, version ${html(process.pattern.version)}.</p>${renderProcessDiagram(process, {prefix: `read-${process.id}`})}${sections(process).map((section, index) => `<details${index === 0 ? ' open' : ''}><summary>${html(section.title)} (${section.rows.length})</summary>${section.rows.map(row => `<section><h4>${html(row.title)}</h4><dl>${row.fields.map(([label, value]) => `<dt>${html(label)}</dt><dd>${html(value)}</dd>`).join('')}</dl></section>`).join('') || '<p>None recorded.</p>'}</details>`).join('')}</article>`).join('')}<details><summary>Evidence associations (${config.workflowModel.evidenceLinks.length})</summary><ul>${config.workflowModel.evidenceLinks.map(link => `<li>${html(link.id)}. Supplied evidence ${html(link.evidenceId)} for ${html(link.processId)}, check ${html(link.checkId)}, result ${html(link.resultId)}, candidate ${html(text(link.candidateVersion))}.</li>`).join('')}</ul><p>Atlas has not executed or verified these records.</p></details><details><summary>Model findings (${findings.length})</summary><ul>${findings.map(issue => `<li>${html(issue.message)}</li>`).join('')}</ul><p>Structural checks do not establish task success or the adequacy of written criteria.</p></details></section>`;
}

export const WORKFLOW_MODEL_STYLES = `${PROCESS_DIAGRAM_STYLES}.process-design{margin-block:2rem;overflow-wrap:anywhere}.process-design article{margin-block:1.5rem}.process-design summary{cursor:pointer;padding-block:.7rem;font-weight:600}.process-design dd{margin:0 0 .7rem;white-space:pre-wrap}.process-design dt{font-weight:600}.process-design details>section{padding-inline:1rem}.process-design h4{margin-bottom:.7rem}`;
