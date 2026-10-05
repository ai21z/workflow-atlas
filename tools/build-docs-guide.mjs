import { readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JEV_DEFINITIONS, readGuidePages, serializeGuide, buildJevGuide } from './build-jev-guide.mjs';

const directory = fileURLToPath(new URL('../docs/', import.meta.url));
const definitions = [
  { id: 'overview', title: 'Start here', group: 'Use Atlas', description: 'Find the right guide and keep your work.' },
  { id: 'quick-start', title: 'Quick start', group: 'Use Atlas', description: 'Choose a workflow, inspect its output and reopen a download.' },
  { id: 'factory-guide', title: 'Workspace guide', group: 'Use Atlas', description: 'Find controls, review decisions and keep externally edited files.' },
  { id: 'accessibility', title: 'Accessibility review', group: 'Use Atlas', description: 'Read observed behavior, review limits and remaining checks.' },
  { id: 'product-vision', title: 'Product vision', group: 'Project reference', description: 'Understand the project purpose and agreed direction.' },
  { id: 'requirements', title: 'Requirements', group: 'Project reference', description: 'Read the accepted scope and intended behavior.' },
  { id: 'reference-practices', title: 'Reference practices', group: 'Project reference', description: 'Inspect primary sources and what their practices contribute.' },
  { id: 'backlog', title: 'Delivery backlog', group: 'Project reference', description: 'Understand remaining work and proof of value.' },
  { id: 'atlas-preservation', title: 'Atlas preservation', group: 'Project reference', description: 'Review the retained Knowledge Atlas and migration boundaries.' },
  { id: 'extension-contract', title: 'Extension contract', group: 'Extend Atlas', description: 'Understand schema, shared definitions and export adapters.' },
  ...JEV_DEFINITIONS.map((page) => ({
    ...page,
    id: `jev-${page.id}`,
    title: page.id === 'overview' ? 'JEV introduction' : page.title,
    group: ['overview', 'usage', 'architecture', 'integration'].includes(page.id) ? 'JEV pilot' : 'JEV evaluation',
    source: `jev/${page.id}.md`,
  })),
];

const files = await readdir(directory, { recursive: true });
const markdownSources = files.filter((file) => file.endsWith('.md')).map((file) => file.replaceAll('\\', '/'));
const registeredSources = new Set(definitions.map((page) => page.source || `${page.id}.md`));
const unlistedSources = markdownSources.filter((source) => !registeredSources.has(source));
if (unlistedSources.length) throw new Error(`Documentation has no reader page: ${unlistedSources.join(', ')}. Register each document before building.`);
const pages = await readGuidePages(directory, definitions);
for (const page of pages) {
  for (const match of page.markdown.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
    const destination = match[1].replace(/^<(.+)>$/, '$1').split('#')[0];
    if (!destination.endsWith('.md') || /^[a-z][a-z\d+.-]*:/i.test(destination)) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(page.source), destination));
    if (!registeredSources.has(resolved)) throw new Error(`${page.source} links to Markdown without a reader page: ${destination}`);
  }
}
const data = {
  title: 'Atlas guides',
  homeId: 'overview',
  startPath: [
    { id: 'quick-start', label: 'Begin', title: 'Quick start', description: 'Create a workflow and keep its output.' },
    { id: 'factory-guide', label: 'Continue', title: 'Workspace guide', description: 'Find the control or explanation you need.' },
    { id: 'jev-overview', label: 'Understand', title: 'JEV introduction', description: 'Read the pilot scope and its evidence.' },
  ],
  pages,
};
await buildJevGuide();
await writeFile(path.join(directory, 'content.js'), serializeGuide('ATLAS_GUIDE', data), 'utf8');
console.log(`Built offline Atlas guides with ${pages.length} pages.`);
