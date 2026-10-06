import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const JEV_DEFINITIONS = [
  { id: 'overview', title: 'Start here', group: 'Learn', description: 'Understand JEV and what this guide covers.' },
  { id: 'usage', title: 'Use JEV', group: 'Learn', description: 'Prepare a brief and review a useful judgment.' },
  { id: 'integration', title: 'Suggest a workflow', group: 'Learn', description: 'Use the in-app suggestion, review answers and start the local server.' },
  { id: 'integrated-trial', title: 'Historical integrated trial', group: 'Evaluate', description: 'Read the earlier interface protocol. Replay needs its matching frozen build.' },
  { id: 'architecture', title: 'How it works', group: 'Understand', description: 'Follow the flow from judgment to artifact.' },
  { id: 'metrics', title: 'Evidence and metrics', group: 'Understand', description: 'Read the measured results and their limits.' },
  { id: 'trial', title: 'Historical people trial', group: 'Evaluate', description: 'Read the earlier facilitator protocol and its limits.' },
  { id: 'repeatable-trial', title: 'Historical identical test', group: 'Evaluate', description: 'Read the frozen seven-card protocol for its matching historical interface.' },
  { id: 'trial-record', title: 'Identical test record', group: 'Evaluate', description: 'Record actual results for every numbered step and JEV card.' },
  { id: 'session-record', title: 'Trial record template', group: 'Evaluate', description: 'Read and download the blank participant record.' },
  { id: 'reference', title: 'Technical reference', group: 'Evaluate', description: 'Check terms, sources, and implementation details.' },
  { id: 'history', title: 'Decision history', group: 'Evaluate', description: 'See how the conclusions developed.' },
];

export const JEV_START_PATH = [
  { id: 'integration', label: 'Use it', title: 'Suggest a workflow', description: 'Start with your description and review a draft.' },
  { id: 'metrics', label: 'Check it', title: 'Read the evidence', description: 'Understand what the results show.' },
  { id: 'integrated-trial', label: 'Earlier protocol', title: 'Historical integrated trial', description: 'The current three-view interface needs a new protocol and frozen round.' },
];

export function serializeGuide(globalName, value) {
  if (!/^[A-Z_]+$/.test(globalName)) throw new Error('Invalid guide global name.');
  const data = JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `window.${globalName} = ${data};\n`;
}

export async function readGuidePages(directory, definitions) {
  const results = await Promise.allSettled(definitions.map(async (definition) => {
    const source = definition.source || `${definition.id}.md`;
    const markdown = (await readFile(path.join(directory, source), 'utf8')).replaceAll('\r\n', '\n');
    return { ...definition, source, markdown };
  }));
  const missing = results.flatMap((result, index) => result.status === 'rejected' ? [definitions[index].source || `${definitions[index].id}.md`] : []);
  if (missing.length) throw new Error(`Guide sources could not be read: ${missing.join(', ')}. Existing bundled content was preserved.`);
  const pages = results.map((result) => result.value);
  const ids = new Set();
  for (const page of pages) {
    if (!/^[a-z][a-z\d-]*$/.test(page.id) || ids.has(page.id)) throw new Error(`Invalid or duplicate page ID: ${page.id}`);
    ids.add(page.id);
    if (!/^#\s+\S/m.test(page.markdown)) throw new Error(`${page.source} must contain a Markdown title.`);
  }
  return pages;
}

export async function buildJevGuide() {
  const guideDirectory = fileURLToPath(new URL('../docs/jev/', import.meta.url));
  const pages = await readGuidePages(guideDirectory, JEV_DEFINITIONS);
  await writeFile(path.join(guideDirectory, 'content.js'), serializeGuide('JEV_GUIDE', {
    title: 'JEV guide', homeId: 'overview', startPath: JEV_START_PATH, pages,
  }), 'utf8');
  console.log(`Built offline JEV guide with ${pages.length} pages.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildJevGuide();
