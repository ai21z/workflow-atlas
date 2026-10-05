import { CATALOG, PROJECT_JSON_MAX_BYTES, parseImport, getStages, getEffectiveSkills, getTechnologyProfiles } from './core.mjs'
import { unzipTextFiles, validateFilePaths } from './zip.mjs'
import { renderDecisionBrief, DECISION_BRIEF_STYLES } from './decision-brief.mjs'
import { reviewGuidance, renderGuidanceDetails } from './guidance-review.mjs'
import { getIntentAnswer } from './intent.mjs'
import { renderWorkflowModel, WORKFLOW_MODEL_STYLES } from './workflow-model-view.mjs'

export const PORTABLE_LIMITS = Object.freeze({ maxArchiveBytes: 32 * 1024 * 1024, maxEntries: 4096, maxFileBytes: PROJECT_JSON_MAX_BYTES, maxTotalBytes: 32 * 1024 * 1024 })
const encoder = new TextEncoder()
const clone = value => JSON.parse(JSON.stringify(value))
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const sameModel = (first, second) => JSON.stringify(canonical(first)) === JSON.stringify(canonical(second))
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
const safeJSON = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
const basename = path => path.split('/').at(-1)
const ignored = path => /(?:^|\/)(?:\.git|node_modules|vendor|dist|build|target|coverage|\.next)(?:\/|$)/i.test(path)
const rootArtifacts = /^(?:project\.json|manifest\.json|PROJECT-ATLAS\.html|ATLAS-(?:COMPARISON|SOURCE-MANIFEST)(?:-\d+)?\.json|WORKFLOW\.md|INSTALL\.md|SOURCES\.md|PROJECT-FACTS\.md|EVIDENCE\.md|VALIDATION\.md|RUNTIME-DESIGN\.md|README\.md)$/i
const textArtifact = path => /\.(?:md|txt|json|jsonl|ya?ml|toml|xml|csv|tsv|html?|js|mjs|cjs|ts|tsx|jsx|py|sh|ps1|sql|sparql|ttl|rq)$/i.test(path)
const recognizedArtifact = path => rootArtifacts.test(path) || /^(?:templates\/|\.github\/(?:skills\/|agents\/|instructions\/|copilot-instructions\.md$))/i.test(path) && textArtifact(path)

function manifestInventory(content) {
  const paths = new Set()
  const warnings = []
  if (!content) return { paths, warnings }
  let manifest
  try { manifest = JSON.parse(content) }
  catch { return { paths, warnings: ['The supplied manifest could not be read. Project metadata and recognized artifact locations were still opened.'] } }
  if (!Array.isArray(manifest?.files)) return { paths, warnings }
  if (manifest.files.length > PORTABLE_LIMITS.maxEntries) throw new RangeError('The manifest lists more than 4096 artifact paths.')
  if (manifest.files.some(path => typeof path !== 'string')) throw new TypeError('Manifest inventory paths must be text.')
  const issues = validateFilePaths(manifest.files.map(path => ({ path, content: '' })))
  if (issues.length) throw new TypeError(`Unsafe manifest inventory. ${issues[0].message}`)
  for (const path of manifest.files) {
    if (ignored(path)) warnings.push(`Manifest-listed artifact belongs to an ignored directory and was skipped: ${path}.`)
    else if (!textArtifact(path)) warnings.push(`Manifest-listed artifact has an unsupported text extension and was skipped: ${path}.`)
    else paths.add(path)
  }
  return { paths, warnings }
}

function selectedArtifact(path, inventory) {
  return !ignored(path) && (recognizedArtifact(path) || inventory.paths.has(path))
}

function checkedFiles(input) {
  if (!Array.isArray(input) || input.length > PORTABLE_LIMITS.maxEntries) throw new TypeError('Choose no more than 4096 project files.')
  const files = input.map(file => ({ path: file.path, content: file.content }))
  const issues = validateFilePaths(files)
  if (issues.length) throw new TypeError(issues[0].message)
  let total = 0
  for (const file of files) {
    const size = encoder.encode(file.content).byteLength
    if (size > PORTABLE_LIMITS.maxFileBytes) throw new RangeError(`Selected artifact exceeds 8 MB: ${file.path}.`)
    total += size
    if (total > PORTABLE_LIMITS.maxTotalBytes) throw new RangeError('The selected text artifacts exceed 32 MB.')
    if (file.content.includes('\0')) throw new TypeError(`Selected artifact contains binary data: ${file.path}.`)
  }
  return files
}

function projectLocation(paths) {
  const candidates = paths.filter(path => !ignored(path) && basename(path).toLowerCase() === 'project.json')
  if (candidates.length > 1) throw new TypeError('More than one project.json was found. Choose one project pack or its project.json.')
  if (candidates.length === 1) return { path: candidates[0], prefix: candidates[0].slice(0, -'project.json'.length), kind: 'json' }
  const viewers = paths.filter(path => !ignored(path) && basename(path).toLowerCase() === 'project-atlas.html')
  if (viewers.length > 1) throw new TypeError('More than one Project Atlas was found. Choose one project snapshot.')
  if (viewers.length === 1) return { path: viewers[0], prefix: viewers[0].slice(0, -'PROJECT-ATLAS.html'.length), kind: 'html' }
  throw new TypeError('No Atlas project metadata was found. Open an exported project pack, project.json or Project Atlas HTML. Ordinary repository files cannot restore missing workflow decisions.')
}

function snapshotFromHTML(html) {
  const matches = [...html.matchAll(/<script\b(?=[^>]*\bid\s*=\s*["']workflow-atlas-project["'])(?=[^>]*\btype\s*=\s*["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi)]
  if (matches.length !== 1) throw new TypeError('This HTML has no unambiguous Atlas project snapshot. Imported HTML is read as text and never executed.')
  let snapshot
  try { snapshot = JSON.parse(matches[0][1]) } catch { throw new TypeError('The embedded Atlas project data is invalid JSON.') }
  if (snapshot?.kind !== 'workflow-atlas-project' || snapshot?.snapshotVersion !== '1.0') throw new TypeError('This Atlas snapshot version is not supported.')
  const config = parseImport(JSON.stringify(snapshot.config))
  const files = checkedFiles(snapshot.files || [])
  const project = files.find(file => file.path.toLowerCase() === 'project.json')
  if (project && !sameModel(config, parseImport(project.content))) throw new TypeError('The embedded snapshot and project.json disagree. Open the authoritative project.json instead.')
  const inventory = manifestInventory(files.find(file => file.path.toLowerCase() === 'manifest.json')?.content)
  const selected = files.filter(file => selectedArtifact(file.path, inventory)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  const warnings = ['Opened an exported read-only snapshot. Later changes in a repository are not part of this snapshot.', ...inventory.warnings]
  if (selected.length < files.length) warnings.push(`${files.length - selected.length} unrelated or unsupported snapshot files were skipped.`)
  return { config, files: selected, warnings }
}

function resultFromFiles(input, skipped = 0, additionalWarnings = []) {
  const files = checkedFiles(input)
  const location = projectLocation(files.map(file => file.path))
  if (location.kind === 'html') {
    const result = snapshotFromHTML(files.find(file => file.path === location.path).content)
    if (skipped) result.warnings.push(`${skipped} unrelated or unsupported repository files were skipped.`)
    result.warnings.push(...additionalWarnings)
    return result
  }
  const config = parseImport(files.find(file => file.path === location.path).content)
  const manifestFile = files.find(file => file.path.startsWith(location.prefix) && file.path.slice(location.prefix.length).toLowerCase() === 'manifest.json')
  const inventory = manifestInventory(manifestFile?.content)
  const selected = files.filter(file => file.path.startsWith(location.prefix) && selectedArtifact(file.path.slice(location.prefix.length), inventory)).map(file => ({ path: file.path.slice(location.prefix.length), content: file.content })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  const warnings = ['Project decisions were restored from project.json. File contents were preserved as supplied. Their behavior and any edits were not independently verified.', ...inventory.warnings, ...additionalWarnings]
  const omitted = skipped + files.length - selected.length
  if (omitted) warnings.push(`${omitted} unrelated or unsupported repository files were skipped. Only Atlas metadata, recognized artifact locations and manifest-listed text artifacts were opened.`)
  const manifest = selected.find(file => file.path.toLowerCase() === 'manifest.json')
  if (manifest) {
    try {
      const data = JSON.parse(manifest.content)
      if (Array.isArray(data.files)) {
        const actual = new Set(selected.map(file => file.path))
        const missing = data.files.filter(path => typeof path === 'string' && !actual.has(path))
        if (missing.length) warnings.push(`${missing.length} files listed in the manifest are missing from the selected pack.`)
      }
    } catch {}
  }
  return { config, files: selected, warnings }
}

async function readText(file) {
  if (file.size > PORTABLE_LIMITS.maxFileBytes) throw new RangeError(`Selected artifact exceeds 8 MB: ${file.name}.`)
  let content
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
  catch { throw new TypeError(`Selected artifact is not UTF8 text: ${file.name}.`) }
  if (content.includes('\0')) throw new TypeError(`Selected artifact contains binary data: ${file.name}.`)
  return content
}

/** Open selected local files without persistence, network calls or execution. */
export async function readProjectFiles(input) {
  const selected = Array.from(input || [])
  if (!selected.length) throw new TypeError('Choose a project pack, project.json, Project Atlas HTML or project folder.')
  if (selected.length > PORTABLE_LIMITS.maxEntries) throw new RangeError('Choose no more than 4096 project files.')
  if (selected.some(file => typeof file?.arrayBuffer !== 'function' || typeof file.name !== 'string')) throw new TypeError('Choose local project files.')
  if (selected.length === 1 && /\.zip$/i.test(selected[0].name)) {
    const file = selected[0]
    if (file.size > PORTABLE_LIMITS.maxArchiveBytes) throw new RangeError('The ZIP exceeds the 32 MB archive limit.')
    let location
    const bytes = new Uint8Array(await file.arrayBuffer())
    const metadata = await unzipTextFiles(bytes, { ...PORTABLE_LIMITS, select(path, paths) {
      location ||= projectLocation(paths)
      return path === location.path || path.startsWith(location.prefix) && path.slice(location.prefix.length).toLowerCase() === 'manifest.json'
    } })
    if (location?.kind === 'html') return resultFromFiles(metadata.files, metadata.skipped)
    const model = metadata.files.find(entry => entry.path === location?.path)
    if (!model) throw new TypeError('The selected ZIP does not contain an Atlas project.')
    parseImport(model.content)
    const inventory = manifestInventory(metadata.files.find(entry => entry.path.startsWith(location.prefix) && entry.path.slice(location.prefix.length).toLowerCase() === 'manifest.json')?.content)
    const opened = new Set(metadata.files.map(entry => entry.path))
    const metadataBytes = metadata.files.reduce((sum, entry) => sum + encoder.encode(entry.content).byteLength, 0)
    const artifacts = await unzipTextFiles(bytes, { ...PORTABLE_LIMITS, maxTotalBytes: PORTABLE_LIMITS.maxTotalBytes - metadataBytes, select(path) {
      return !opened.has(path) && path.startsWith(location.prefix) && selectedArtifact(path.slice(location.prefix.length), inventory)
    }, skipNonText(path) { return inventory.paths.has(path.slice(location.prefix.length)) } })
    const files = [...metadata.files, ...artifacts.files]
    return resultFromFiles(files, metadata.files.length + metadata.skipped - files.length, artifacts.warnings)
  }
  if (selected.some(file => /\.zip$/i.test(file.name))) throw new TypeError('Open one project ZIP at a time, or choose a project folder.')
  if (selected.length === 1 && !selected[0].webkitRelativePath && /\.json$/i.test(selected[0].name)) {
    const content = await readText(selected[0])
    const config = parseImport(content)
    return { config, files: [{ path: 'project.json', content }], warnings: ['Only project settings were opened. Existing artifact edits require opening the complete pack or folder.'] }
  }
  if (selected.length === 1 && !selected[0].webkitRelativePath && /\.html?$/i.test(selected[0].name)) return snapshotFromHTML(await readText(selected[0]))
  const paths = selected.map(file => file.webkitRelativePath || file.name)
  const pathIssues = validateFilePaths(paths.map(path => ({ path, content: '' })))
  if (pathIssues.length) throw new TypeError(pathIssues[0].message)
  const location = projectLocation(paths)
  if (location.kind === 'html') return resultFromFiles([{ path: location.path, content: await readText(selected[paths.indexOf(location.path)]) }], selected.length - 1)
  const metadata = new Map()
  const projectFile = selected[paths.indexOf(location.path)]
  metadata.set(location.path, await readText(projectFile))
  parseImport(metadata.get(location.path))
  const manifestIndex = paths.findIndex(path => path.startsWith(location.prefix) && path.slice(location.prefix.length).toLowerCase() === 'manifest.json')
  if (manifestIndex >= 0) metadata.set(paths[manifestIndex], await readText(selected[manifestIndex]))
  const inventory = manifestInventory(manifestIndex >= 0 ? metadata.get(paths[manifestIndex]) : '')
  const entries = []
  const warnings = []
  let skipped = 0
  let bytes = 0
  for (let index = 0; index < selected.length; index++) {
    const path = paths[index]
    if (!path.startsWith(location.prefix) || !selectedArtifact(path.slice(location.prefix.length), inventory)) { skipped++; continue }
    bytes += selected[index].size
    if (bytes > PORTABLE_LIMITS.maxTotalBytes) throw new RangeError('The selected text artifacts exceed 32 MB.')
    let content
    try { content = metadata.has(path) ? metadata.get(path) : await readText(selected[index]) }
    catch (error) {
      if (!metadata.has(path) && inventory.paths.has(path.slice(location.prefix.length)) && /not UTF8 text|binary data/.test(error.message)) { warnings.push(`Manifest-listed artifact was skipped. ${error.message}`); skipped++; continue }
      throw error
    }
    entries.push({ path, content })
  }
  return resultFromFiles(entries, skipped, warnings)
}

function sourceLink(value) {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password) return `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(value)} (opens in a new tab)">${escape(value)} ↗</a>`
  } catch {}
  return escape(value || 'No source recorded')
}

const list = values => `<ul>${values.map(value => `<li>${escape(value)}</li>`).join('')}</ul>`
const empty = text => `<p class="empty">${escape(text)}</p>`
const textBlock = text => `<p class="preserve">${escape(String(text ?? '').trim() ? text : 'Unresolved')}</p>`
const badge = text => `<span class="badge">${escape(text)}</span>`
const palettes = ['#247aa0', '#7460b0', '#af7540', '#3b8974', '#a44d73', '#657799', '#667946']

function viewerRuntime() {
  'use strict'
  const snapshot = JSON.parse(document.getElementById('workflow-atlas-project').textContent)
  const { config, files } = snapshot
  let selectedFile = files.find(file => file.path === 'WORKFLOW.md') || files[0]
  const status = document.getElementById('viewer-status')
  const themeButton = document.getElementById('viewer-theme')
  const navigation = document.getElementById('viewer-sections')
  const navigationButton = document.getElementById('viewer-nav-toggle')
  const compactNavigation = matchMedia('(max-width: 800px)')
  let navigationExpanded = false
  function syncNavigation() {
    const hideLinks = compactNavigation.matches && !navigationExpanded
    const focusWasInLinks = navigation.contains(document.activeElement)
    const focusWasOnToggle = document.activeElement === navigationButton
    navigationButton.hidden = !compactNavigation.matches
    navigationButton.setAttribute('aria-expanded', String(navigationExpanded))
    navigation.hidden = hideLinks
    if (hideLinks && focusWasInLinks) navigationButton.focus({ preventScroll: true })
    else if (!compactNavigation.matches && focusWasOnToggle) navigation.querySelector('[aria-current="page"]')?.focus({ preventScroll: true })
  }
  navigationButton.addEventListener('click', () => {
    navigationExpanded = !navigationExpanded
    syncNavigation()
  })
  compactNavigation.addEventListener('change', () => {
    navigationExpanded = false
    syncNavigation()
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && compactNavigation.matches && navigationExpanded) {
      event.preventDefault()
      navigationExpanded = false
      syncNavigation()
      navigationButton.focus({ preventScroll: true })
    }
  })
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme
    themeButton.setAttribute('aria-checked', String(theme === 'dark'))
    themeButton.title = theme === 'dark' ? 'Use light mode' : 'Use dark mode'
  }
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  themeButton.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'))
  function show(view, focus = false, updateHash = true) {
    let section = document.getElementById(view)
    if (!section?.matches('[data-pane]')) { section = document.getElementById('overview'); view = 'overview' }
    document.querySelectorAll('[data-pane]').forEach(pane => { pane.hidden = pane !== section })
    document.querySelectorAll('[data-view]').forEach(link => { link.setAttribute('aria-current', link.dataset.view === view ? 'page' : 'false') })
    document.getElementById('viewer-current-section').textContent = navigation.querySelector(`[data-view="${view}"] span`)?.textContent || 'Project overview'
    navigationExpanded = false
    syncNavigation()
    if (updateHash && location.hash !== `#${view}`) { try { history.replaceState(null, '', `#${view}`) } catch {} }
    window.scrollTo(0, 0)
    if (focus) section.querySelector('h1, h2')?.focus({ preventScroll: true })
    window.PROJECT_ATLAS_STATE = { projectName: config.project.name, recipe: config.workflow.recipe, view, fileCount: files.length }
  }
  function download(name, content) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    status.textContent = `${name} downloaded. The snapshot was not changed.`
  }
  function preview(file) {
    if (!file) return
    selectedFile = file
    document.getElementById('file-path').textContent = file.path
    document.getElementById('file-content').textContent = file.content
    document.querySelectorAll('[data-file-index]').forEach(button => { button.setAttribute('aria-pressed', String(files[Number(button.dataset.fileIndex)] === file)) })
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-view], [data-open-stage], [data-file-index]')
    if (!link) return
    event.preventDefault()
    if (link.dataset.view) show(link.dataset.view, true)
    if (link.dataset.openStage) {
      show('workflow')
      const target = document.getElementById(`stage-${link.dataset.openStage}`)
      target?.scrollIntoView({ block: 'start' })
      target?.querySelector('h3')?.focus({ preventScroll: true })
    }
    if (link.dataset.fileIndex) preview(files[Number(link.dataset.fileIndex)])
  })
  document.getElementById('download-project').addEventListener('click', () => download('project.json', JSON.stringify(config, null, 2) + '\n'))
  document.getElementById('download-file').addEventListener('click', () => { if (selectedFile) download(selectedFile.path.split('/').at(-1), selectedFile.content) })
  document.getElementById('file-search').addEventListener('input', event => {
    const query = event.target.value.trim().toLocaleLowerCase()
    let count = 0
    document.querySelectorAll('[data-file-index]').forEach(button => {
      button.hidden = !files[Number(button.dataset.fileIndex)].path.toLocaleLowerCase().includes(query)
      if (!button.hidden) count++
    })
    document.getElementById('file-search-status').textContent = count ? `${count} ${count === 1 ? 'file' : 'files'} found` : 'No files match this search.'
  })
  window.addEventListener('hashchange', () => show(location.hash.slice(1), true, false))
  preview(selectedFile)
  show(location.hash.slice(1) || 'overview', false, false)
}

/** A self-contained, read-only Project Atlas. It does not save or fetch data. */
export function buildProjectAtlas(input, pack) {
  const config = parseImport(JSON.stringify(input))
  const files = checkedFiles((pack?.files || []).filter(file => file.path !== 'PROJECT-ATLAS.html'))
  const projectDocument = files.find(file => file.path.toLowerCase() === 'project.json')
  if (projectDocument && !sameModel(config, parseImport(projectDocument.content))) throw new TypeError('The Project Atlas must use the same decisions as its included project.json.')
  let reviewed = false
  try { reviewed = JSON.parse(files.find(file => file.path === 'manifest.json')?.content || '{}').kind === 'reviewed-file-set' } catch {}
  const stages = getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id))
  const processes = config.workflowModel.processes.filter(process => process.source === 'custom')
  const customSteps = processes.flatMap(process => process.steps)
  const plannedStepCount = stages.length + customSteps.length
  const assignmentCount = type => stages.filter(stage => config.workflow.bindings[stage.id]?.actorType === type).length + customSteps.filter(step => step.actor.type === type).length
  const recipe = getStages(config).length ? CATALOG.recipes.find(item => item.id === config.workflow.recipe) : undefined
  const skills = getEffectiveSkills(config)
  const skillName = id => CATALOG.skills.find(skill => skill.id === id)?.label || id
  const roleName = binding => binding?.actorType === 'agent' ? CATALOG.roles.find(role => role.id === binding.actorId)?.label || binding.actorId || 'Unresolved agent role' : binding?.actorName?.trim() ? binding.actorName : 'Unresolved owner'
  const stageName = id => id ? CATALOG.stages.find(stage => stage.id === id)?.title || id : 'Project level'
  const snapshot = { kind: 'workflow-atlas-project', snapshotVersion: '1.0', config, files }
  const guidanceDetails = renderGuidanceDetails(reviewGuidance(config, files).previous)
  const cards = stages.map((stage, index) => {
    const binding = config.workflow.bindings[stage.id]
    return `<button class="path-card" style="--stage-color:${palettes[index % palettes.length]}" data-open-stage="${escape(stage.id)}"><span class="stage-number">${String(index + 1).padStart(2, '0')}</span><strong>${escape(stage.title)}</strong><span>${escape(roleName(binding))}</span><small>${escape(stage.outputs[0] || 'Recorded outcome')} →</small></button>`
  }).join('')
  const processCards = processes.map((process, index) => `<a class="path-card" style="--stage-color:${palettes[(stages.length + index) % palettes.length]}" href="#workflow" data-view="workflow"><span class="stage-number process-kind">${escape(process.kind === 'application' ? 'APPLICATION' : process.kind === 'development' ? 'DEVELOPMENT' : 'TEAM PROCESS')}</span><strong>${escape(process.name || process.id)}</strong><span>${process.steps.length} planned steps, ${process.transitions.length} outcome routes</span><small>Read inputs, checks and destinations →</small></a>`).join('')
  const stageDetails = stages.map((stage, index) => {
    const binding = config.workflow.bindings[stage.id]
    const stageSkills = binding?.skills || []
    const evidence = config.evidence.filter(record => record.stageId === stage.id)
    const artifacts = files.filter(file => pack?.reasons?.[file.path]?.stages?.includes(stage.id))
    return `<article class="stage-detail" id="stage-${escape(stage.id)}" style="--stage-color:${palettes[index % palettes.length]}"><header><span class="stage-number">${String(index + 1).padStart(2, '0')}</span><div><span class="eyebrow">${escape(binding?.actorType || 'unresolved')} responsibility</span><h3 tabindex="-1">${escape(stage.title)}</h3><p>${escape(stage.purpose)}</p></div></header><div class="owner-line">${badge(roleName(binding))}${stageSkills.map(id => badge(skillName(id))).join('')}${binding?.actorType === 'agent' && binding.contextOnly ? badge('Context only') : ''}</div>${config.workflow.notes[stage.id] ? `<div class="decision-note"><strong>Project decision</strong>${textBlock(config.workflow.notes[stage.id])}</div>` : ''}<div class="columns"><div><h4>Inputs</h4>${list(stage.inputs)}${stage.dependsOn.length ? `<h4>Prerequisites</h4>${list(stage.dependsOn.map(id => config.workflow.enabledStages.includes(id) ? stageName(id) : `${stageName(id)}: ${config.workflow.suppliedInputs[id] || 'No supplied artifact recorded'}`))}` : ''}</div><div><h4>Expected outputs</h4>${list(stage.outputs)}</div></div><details><summary>Activities and acceptance checks</summary><div class="columns"><div><h4>Activities</h4>${list(stage.actions)}</div><div><h4>Acceptance checks</h4>${list(stage.checks)}</div></div></details>${artifacts.length ? `<div class="artifact-links"><strong>Linked artifacts</strong>${artifacts.map(file => badge(file.path)).join('')}</div>` : ''}${evidence.length ? `<h4>Recorded evidence</h4>${evidence.map(record => `<div class="record"><strong>${escape(record.check)}</strong>${badge(`Recorded: ${record.status}`)}${textBlock(record.observed || 'No observed result recorded')}</div>`).join('')}` : ''}</article>`
  }).join('')
  const components = config.components.map(component => `<article class="card"><div class="card-heading"><h3>${escape(component.name || 'Unnamed component')}</h3><code>${escape(component.path || 'Unresolved path')}</code></div><div class="chips">${component.technologies.map(technology => badge(`${technology.id}${technology.version ? ` ${technology.version}` : ''}`)).join('') || badge('Technology unresolved')}</div><dl class="commands">${Object.entries(component.commands).map(([name, command]) => `<div><dt>${escape(name)}</dt><dd><code>${escape(command || 'Unresolved')}</code></dd></div>`).join('')}</dl></article>`).join('')
  const answers = (recipe?.questions || []).map(question => { const answer = getIntentAnswer(config, question.id); return `<article class="card"><h3>${escape(question.label)}</h3>${answer.inherited ? '<p class="muted">Uses the recorded project outcome.</p>' : ''}${textBlock(answer.text)}</article>` }).join('')
  const technologyAnswers = getTechnologyProfiles(config).map(profile => `<article class="card"><h3>${escape(profile.label)}</h3>${profile.questions.map((question, index) => `<h4>${escape(typeof question === 'string' ? question : question.label)}</h4>${textBlock(config.workflow.answers[typeof question === 'string' ? `technology-${profile.id}-${index}` : question.id])}`).join('')}</article>`).join('')
  const facts = config.facts.map(fact => `<article class="record"><div class="card-heading"><h3>${escape(fact.claim)}</h3>${badge(`Recorded: ${fact.status}`)}</div><dl><dt>Source</dt><dd>${sourceLink(fact.source)}</dd>${fact.revision ? `<dt>Revision</dt><dd>${escape(fact.revision)}</dd>` : ''}${fact.reviewer ? `<dt>Reviewer</dt><dd>${escape(fact.reviewer)}</dd>` : ''}</dl>${fact.notes ? textBlock(fact.notes) : ''}</article>`).join('')
  const evidence = config.evidence.map(record => `<article class="record"><div class="card-heading"><h3>${escape(record.check)}</h3>${badge(`Recorded: ${record.status}`)}</div><p class="muted">${escape(stageName(record.stageId))} · ${escape(record.method)}</p><div class="columns"><div><h4>Expected</h4>${textBlock(record.expected)}</div><div><h4>Observed</h4>${textBlock(record.observed || 'Not recorded')}</div></div><p class="muted">${sourceLink(record.source)}${record.reviewer ? ` · ${escape(record.reviewer)}` : ''}</p></article>`).join('')
  const runtimeNames = { outcome: 'Intended outcome', requiredInputs: 'Required information', judgment: 'Model judgment', tools: 'Tool and backend boundaries', validation: 'Validation', limits: 'Execution limits', duplicates: 'Duplicates and uncertain writes', failures: 'Failure handling', confirmation: 'Confirmed results' }
  const runtime = config.runtime.enabled ? `<section class="pane" id="runtime" data-pane><span class="eyebrow">Optional product design</span><h1 tabindex="-1">Runtime design</h1><p class="intro">This describes the proposed feature. It does not implement or execute the runtime.</p><div class="two-grid">${Object.entries(runtimeNames).map(([key, label]) => `<article class="card"><h3>${label}</h3>${textBlock(config.runtime[key])}</article>`).join('')}</div><h3>Control requirements and supplied links</h3>${config.runtime.controls.map(control => `<article class="record"><div class="card-heading"><h4>${escape(control.label)}</h4>${badge(control.status)}</div>${textBlock(control.implementation || 'No implementation link recorded')}${control.evidenceId ? `<p class="muted">Evidence record: ${escape(control.evidenceId)}</p>` : ''}</article>`).join('') || empty('No controls recorded.')}</section>` : ''
  const sources = [...new Set([...config.facts.map(fact => fact.source), ...config.evidence.map(record => record.source), ...CATALOG.practices.filter(practice => config.practices.includes(practice.id)).map(practice => practice.source)])].filter(Boolean)
  const name = config.project.name || 'Untitled project'
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><meta name="color-scheme" content="light dark"><script>document.documentElement.dataset.theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';</script><title>${escape(name)} · Project Atlas</title><style>${viewerStyles}${DECISION_BRIEF_STYLES}${WORKFLOW_MODEL_STYLES}</style></head>
<body><a class="skip" href="#overview" data-view="overview">Skip to project</a><header class="topbar"><a class="brand" href="#overview" data-view="overview"><span class="brand-mark" aria-hidden="true">◈</span><span><strong>Workflow Atlas</strong><small>YOUR PROJECT, EXPLAINED</small></span></a><div class="topbar-actions"><span class="snapshot-label">Read-only snapshot</span><button type="button" id="viewer-theme" class="secondary theme-switch" role="switch" aria-label="Dark mode" aria-checked="false"><span class="theme-switch-label">Dark mode</span><span class="theme-switch-track" aria-hidden="true"><span class="theme-switch-thumb"></span></span></button><button type="button" id="download-project" class="primary">Download project JSON ↓</button></div></header><div class="workspace"><aside class="sidebar"><div class="project-label"><span class="eyebrow">Open project</span><strong>${escape(name)}</strong><small>${escape(recipe?.label || 'Workflow')}</small></div><button type="button" id="viewer-nav-toggle" class="section-toggle" aria-expanded="false" aria-controls="viewer-sections" hidden><span>Sections: <strong id="viewer-current-section">Project overview</strong></span><span class="section-chevron" aria-hidden="true">⌄</span></button><nav id="viewer-sections" aria-label="Project sections"><a href="#overview" data-view="overview">◈ <span>Project overview</span></a><a href="#workflow" data-view="workflow">↳ <span>Workflow and handoffs</span></a><a href="#decisions" data-view="decisions">◇ <span>Decisions and context</span></a><a href="#evidence" data-view="evidence">◎ <span>Facts and evidence</span></a>${config.runtime.enabled ? '<a href="#runtime" data-view="runtime">⇄ <span>Runtime design</span></a>' : ''}<a href="#artifacts" data-view="artifacts">▤ <span>Artifact files</span></a><a href="#sources" data-view="sources">↗ <span>Source references</span></a></nav><div class="sidebar-note"><i></i><div>Portable and local<p>Open this HTML offline. Import its project data into Workflow Atlas to edit. This snapshot does not save changes or follow later repository edits.</p></div></div></aside><main>
<section class="pane" id="overview" data-pane><span class="eyebrow">Your visible workflow artifact</span><h1 tabindex="-1">${escape(name)}</h1>${renderDecisionBrief(config, { id: 'snapshot-decision-brief' })}<details class="overview-detail"><summary>More project detail</summary><div class="overview-detail-body"><div class="meta-line">${badge(recipe?.label || 'Explicit process design')}${badge(config.project.host || 'Environment not chosen')}${badge(config.project.sourceControl || 'Source control not chosen')}</div><div class="hero"><div><span class="eyebrow">THE PROJECT AT A GLANCE</span><h2>Your decisions form the workflow.</h2><p>${processes.length ? "Read the process to see its planned owners, inputs, checks and outcome routes. Open artifact files to inspect the assigned instructions." : "Follow a stage to see its owner, context, expected outputs and acceptance checks. Open artifact files to inspect the corresponding instructions."}</p><a class="text-link" href="#workflow" data-view="workflow">Read the full workflow →</a></div><div class="stat-grid"><div><strong>${plannedStepCount}</strong><span>${processes.length ? "planned steps" : "workflow stages"}</span></div><div><strong>${skills.length}</strong><span>focused skills</span></div><div><strong>${config.components.length}</strong><span>components</span></div><div><strong>${files.length}</strong><span>artifact files</span></div></div></div><div class="section-heading"><div><span class="eyebrow">FOLLOW THE HANDOFFS</span><h2>The selected workflow</h2></div><span class="muted">${processes.length ? "Open a process or stage" : "Select a stage"}</span></div><div class="workflow-path">${cards}${processCards}${!cards && !processCards ? empty("No workflow stages selected.") : ""}</div><div class="two-grid"><article class="card"><h3>Responsibility</h3><p>${assignmentCount("agent")} agent assignments, ${assignmentCount("human")} human assignments, ${assignmentCount("external")} system assignments.</p><p class="muted">Assignments describe intended work and requested capabilities.</p></article><article class="card"><h3>Evidence</h3><p>${config.facts.length} fact records and ${config.evidence.length} check records.</p><p class="muted">Sources and statuses describe supplied records. Atlas has not independently verified their authenticity.</p></article></div></div></details></section>
<section class="pane" id="workflow" data-pane><span class="eyebrow">Owners, inputs and outputs</span><h1 tabindex="-1">Workflow and handoffs</h1><p class="intro">${processes.length ? "These are planned steps, inputs and outcomes. Connections describe the design, not observed progress or an automatic runner." : "These stages describe intended work. Existing artifacts can satisfy prerequisites when a producing stage is omitted."}</p>${stageDetails || (processes.length ? "" : empty("No recipe stages selected."))}${renderWorkflowModel(config)}</section>
<section class="pane" id="decisions" data-pane><span class="eyebrow">What the project actually records</span><h1 tabindex="-1">Decisions and context</h1><div class="two-grid">${answers}</div><h3>Project components</h3><div class="two-grid">${components}</div><h3>Project boundaries</h3><div class="card"><div class="chips">${badge(config.constraints.readOnly ? 'Read only' : 'Changes within the assigned scope')}${badge(config.constraints.approvalRequired ? 'Approval required' : 'No approval requirement selected')}</div>${textBlock(config.constraints.notes || 'No additional project constraint recorded.')}</div><h3>Source locations</h3><div class="card">${textBlock(config.project.sourceLocations)}</div><h3>Questions for the selected technologies</h3>${technologyAnswers}<h3>Model choices</h3><div class="card"><dl><dt>Name and version</dt><dd>${escape([config.model.name, config.model.version].filter(Boolean).join(' ') || 'Unresolved')}</dd><dt>Budget</dt><dd>${escape(config.model.budget || 'Unresolved')}</dd></dl>${textBlock(config.model.notes || 'No measured model outcome recorded.')}</div></section>
<section class="pane" id="evidence" data-pane><span class="eyebrow">Claims and observed results stay separate</span><h1 tabindex="-1">Facts and evidence</h1><p class="intro">A planned check is not an observed result. Recorded statuses are supplied assertions, not independent verification by Atlas. Each record retains its source and reviewer.</p><h3>Project facts</h3>${facts || empty('No project facts recorded.') }<h3>Check records</h3>${evidence || empty('No check records supplied.')}</section>${runtime}
<section class="pane" id="artifacts" data-pane><span class="eyebrow">Inspect what the pack contains</span><h1 tabindex="-1">Artifact files</h1><p class="intro">${reviewed ? 'These are the resolved file contents from a reviewed comparison. Any claims in supplied README, INSTALL or VALIDATION files were carried as text, not endorsed or revalidated. ' : 'These are the supplied snapshot files. '}Instructions describe behavior. They do not configure credentials or execute tools.</p><div class="file-workspace"><div class="file-list"><label for="file-search">Find a file</label><input id="file-search" type="search" placeholder="Search file paths…" aria-controls="file-options"><p id="file-search-status" class="muted" role="status">${files.length} files</p><div id="file-options">${files.map((file, index) => `<button type="button" data-file-index="${index}" aria-pressed="false" aria-controls="file-content">${escape(file.path)}</button>`).join('')}</div></div><div class="file-preview"><div class="preview-heading"><strong id="file-path">${escape(files[0]?.path || 'No file selected')}</strong><button id="download-file" class="secondary">Download file ↓</button></div><pre id="file-content" tabindex="0" aria-label="Selected artifact contents">${escape(files[0]?.content || '')}</pre></div></div></section>
<section class="pane" id="sources" data-pane><span class="eyebrow">Follow the recorded references</span><h1 tabindex="-1">Source references</h1><p class="intro">Links open in a new tab only when selected. A reference can support a practice without proving this project's implementation.</p>${guidanceDetails}${sources.map(source => `<article class="source-card">${sourceLink(source)}</article>`).join('') || empty('No source references recorded.')}</section>
<footer>Project schema ${escape(config.schemaVersion)}. This is a read-only exported snapshot. Reopen the project in Workflow Atlas to make changes.</footer></main></div><p class="sr-only" id="viewer-status" role="status"></p><script id="workflow-atlas-project" type="application/json">${safeJSON(snapshot)}</script><script>(${viewerRuntime.toString()})();</script></body></html>`
  if (encoder.encode(html).byteLength > PORTABLE_LIMITS.maxFileBytes) throw new RangeError('The portable Project Atlas exceeds 8 MB. Reduce the included artifact text before exporting a reopenable snapshot.')
  return html
}

/** Include the portable viewer and update the file inventory without mutation. */
export function packageProject(config, input) {
  config = parseImport(JSON.stringify(config))
  const pack = clone(input)
  pack.files = pack.files.filter(file => file.path !== 'PROJECT-ATLAS.html')
  const project = pack.files.find(file => file.path === 'project.json')
  if (!project || !sameModel(config, parseImport(project.content))) throw new TypeError('A complete project pack needs a project.json matching the current project.')
  const manifestFile = pack.files.find(file => file.path === 'manifest.json')
  if (!manifestFile) throw new TypeError('A complete project pack needs manifest.json.')
  let manifest
  try { manifest = JSON.parse(manifestFile.content) } catch { throw new TypeError('The pack manifest is invalid JSON.') }
  const paths = [...pack.files.map(file => file.path), 'PROJECT-ATLAS.html'].sort()
  manifest.files = paths
  manifest.portableAtlas = { path: 'PROJECT-ATLAS.html', snapshotVersion: '1.0', readOnly: true }
  const associations = {
    stages: getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id)).map(stage => stage.id),
    processes: config.workflowModel.processes.map(process => process.id),
    steps: config.workflowModel.processes.filter(process => process.source === 'custom').flatMap(process => process.steps.map(step => `${process.id}/${step.id}`)),
  }
  if (Array.isArray(manifest.artifacts)) manifest.artifacts = [...manifest.artifacts.filter(artifact => artifact.path !== 'PROJECT-ATLAS.html'), { path: 'PROJECT-ATLAS.html', purpose: 'Read the project decisions, relationships and artifact files offline.', ...associations, roles: [] }]
  manifestFile.content = JSON.stringify(manifest, null, 2) + '\n'
  const viewer = { path: 'PROJECT-ATLAS.html', content: buildProjectAtlas(config, pack), why: 'Read the project decisions, workflow, facts and artifacts offline.', ...associations, roles: [], sources: [], assumptions: ['This snapshot does not follow later repository changes.'] }
  pack.files.push(viewer)
  pack.files.sort((a, b) => a.path.localeCompare(b.path))
  checkedFiles(pack.files)
  pack.reasons ||= {}
  pack.reasons[viewer.path] = { purpose: viewer.why, ...associations, roles: [], sources: [], assumptions: viewer.assumptions }
  pack.stats = { ...pack.stats, fileCount: pack.files.length, bytes: pack.files.reduce((sum, file) => sum + encoder.encode(file.content).byteLength, 0) }
  return pack
}

/**
 * Package resolved file choices. Rebuild derived inventory and viewer from the
 * retained authoritative project.json, never from an unrelated live draft.
 * Returns { files, config, warnings }. With no model, config is null and the
 * result is explicitly a file set, without a viewer or a reopenable project.
 */
export function packageReviewedFiles(input, comparisonRecord) {
  const original = checkedFiles(input)
  if (!comparisonRecord || typeof comparisonRecord !== 'object' || Array.isArray(comparisonRecord)) throw new TypeError('Supply the comparison decision record for this reviewed file set.')
  const record = clone(comparisonRecord)
  const warnings = ['The reviewed inventory is accurate. Artifact contents, including README, INSTALL and VALIDATION claims, were preserved as resolved text and were not revalidated.']
  const files = original.filter(file => !['project-atlas.html', 'manifest.json'].includes(file.path.toLowerCase()))
  const projectDocuments = files.filter(file => file.path.toLowerCase() === 'project.json')
  if (projectDocuments.length > 1) throw new TypeError('A reviewed file set cannot contain more than one authoritative project.json.')
  let config = null
  if (projectDocuments.length) {
    try { config = parseImport(projectDocuments[0].content) }
    catch (error) { throw new TypeError(`The resolved project.json cannot be reopened. ${error.message} Resolve that file or remove it to export a file set without an Atlas.`) }
  }
  function uniquePath(base) {
    const names = new Set(files.map(file => file.path.normalize('NFC').toLowerCase()))
    let path = base
    let index = 2
    while (names.has(path.toLowerCase())) { path = base.replace(/\.json$/, `-${index++}.json`) }
    return path
  }
  const supportingRecords = []
  const suppliedManifest = original.find(file => file.path.toLowerCase() === 'manifest.json')
  if (suppliedManifest) {
    const path = uniquePath('ATLAS-SOURCE-MANIFEST.json')
    files.push({ path, content: JSON.stringify({ kind: 'supporting-source-manifest', description: 'Original supplied manifest retained as supporting text. Its inventory and validation claims do not describe or verify this reviewed file set.', originalPath: suppliedManifest.path, content: suppliedManifest.content }, null, 2) + '\n' })
    supportingRecords.push(path)
  }
  const comparisonPath = uniquePath('ATLAS-COMPARISON.json')
  files.push({ path: comparisonPath, content: JSON.stringify({ kind: 'reviewed-file-comparison', description: 'Supplied file-resolution choices. This record does not establish format, host, behavior or outcome verification.', comparison: record }, null, 2) + '\n' })
  const inventory = [...files.map(file => file.path), 'manifest.json', ...(config ? ['PROJECT-ATLAS.html'] : [])].sort()
  const manifest = {
    manifestVersion: '1.0', kind: 'reviewed-file-set', files: inventory,
    project: config ? { path: projectDocuments[0].path, parsedSchemaVersion: config.schemaVersion, metadataParsed: true } : { path: null, metadataParsed: false },
    validation: { configurationComplete: false, formatChecked: false, hostExercised: false, behaviorObserved: false, improvementEstablished: false },
    scope: 'File inventory and supported project metadata parsing only. Imported instructions, file relationships and inherited README, INSTALL or VALIDATION claims are not endorsed or verified.',
    reviewRecord: comparisonPath, supportingRecords,
    ...(config ? { portableAtlas: { path: 'PROJECT-ATLAS.html', snapshotVersion: '1.0', readOnly: true, filePreviews: 'Resolved artifact contents' } } : {}),
  }
  files.push({ path: 'manifest.json', content: JSON.stringify(manifest, null, 2) + '\n' })
  if (config) {
    files.push({ path: 'PROJECT-ATLAS.html', content: buildProjectAtlas(config, { files, reasons: {} }) })
    warnings.push('The Project Atlas was rebuilt from the resolved project.json and actual resolved files. Earlier viewers and generated relationship claims were not carried forward.')
  } else warnings.push('No project.json was retained. This is a reviewed file set, with no Project Atlas and no project to reopen.')
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  checkedFiles(files)
  return { files, config, warnings }
}

const viewerStyles = `
:root {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 15px;
  color-scheme: light;
  --bg: #f5f7fb;
  --panel: #ffffff;
  --soft: #edf2f7;
  --hover: #e2ebf3;
  --ink: #17293b;
  --muted: #46586f;
  --border: #c3cfdb;
  --nav: #121c2d;
  --accent: #075f50;
  --accent-soft: #e5f3ed;
  --focus: #075f50;
  color: var(--ink);
  background: var(--bg);
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #090f1b;
  --panel: #111c2c;
  --soft: #172638;
  --hover: #22364a;
  --ink: #edf2fb;
  --muted: #b0bed0;
  --border: #324359;
  --nav: #0c1421;
  --accent: #8ee3cf;
  --accent-soft: #142f32;
  --focus: #a9fbe7;
}
* { box-sizing: border-box; }
body { margin: 0; line-height: 1.6; }
button, input { font: inherit; }
button, a, summary { touch-action: manipulation; }
button { cursor: pointer; min-height: 40px; min-width: 40px; overflow-wrap: anywhere; }
a { color: var(--accent); text-underline-offset: 3px; overflow-wrap: anywhere; }
:is(button, a, input, summary, pre, [tabindex]):focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.overview-detail { margin: 20px 0; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); }
.overview-detail > summary { cursor: pointer; min-height: 46px; padding: 12px 16px; font-weight: 600; font-size: 14px; color: var(--accent); }
.overview-detail-body { padding: 4px 20px 20px; }
.skip { position: absolute; left: 20px; top: -80px; background: var(--panel); color: var(--ink); padding: 12px; z-index: 10; }
.skip:focus { top: 10px; }
.topbar { height: 78px; background: var(--nav); color: #f3f8ff; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0 26px; position: sticky; top: 0; z-index: 5; border-bottom: 1px solid #344458; }
.topbar :is(button, a):focus-visible { outline-color: #a9fbe7; }
.brand { display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none; min-width: 0; }
.brand-mark { font-size: 34px; color: #8ee3cf; }
.brand strong { font-size: 18px; letter-spacing: .1px; }
.brand small { display: block; color: #b0bed0; font-size: 12px; letter-spacing: .06em; margin-top: 3px; }
.topbar-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.snapshot-label { font-size: 12px; color: #b0bed0; }
.primary, .secondary { border: 1px solid var(--border); border-radius: 9px; padding: 10px 14px; font-size: 14px; line-height: 1.5; font-weight: 600; background: var(--panel); color: var(--ink); }
.primary { background: #8ee3cf; border-color: #8ee3cf; color: #092520; }
.primary:hover { background: #aff3e2; }
.secondary:hover { background: var(--hover); }
.topbar .secondary { background: #1c2b40; border-color: #53677f; color: #edf2fb; }
.topbar .secondary:hover { background: #293e55; }
.theme-switch { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 44px; }
.theme-switch-track { display: inline-flex; align-items: center; flex: none; width: 42px; height: 24px; border: 1px solid #a3b5cb; border-radius: 999px; padding: 2px; background: #34465c; }
.theme-switch-thumb { display: block; width: 18px; height: 18px; border-radius: 50%; background: #f3f8ff; transition: transform .15s; }
.theme-switch[aria-checked="true"] .theme-switch-track { background: #8ee3cf; border-color: #8ee3cf; }
.theme-switch[aria-checked="true"] .theme-switch-thumb { transform: translateX(18px); background: #092520; }
@media (prefers-reduced-motion: reduce) { .theme-switch-thumb { transition: none; } }
@media (forced-colors: active) {
  .theme-switch-track { forced-color-adjust: none; border-color: ButtonText; background: Canvas; }
  .theme-switch-thumb { forced-color-adjust: none; background: ButtonText; }
  .theme-switch[aria-checked="true"] .theme-switch-track { background: Highlight; border-color: Highlight; }
  .theme-switch[aria-checked="true"] .theme-switch-thumb { background: HighlightText; }
}
.workspace { display: grid; grid-template-columns: 250px minmax(0, 1fr); min-height: calc(100vh - 78px); }
.sidebar { background: var(--panel); border-right: 1px solid var(--border); padding: 25px 18px; position: sticky; top: 78px; height: calc(100vh - 78px); overflow: auto; }
.project-label { border-bottom: 1px solid var(--border); padding: 0 9px 21px; margin-bottom: 20px; }
.project-label strong { display: block; font-size: 18px; line-height: 1.4; margin: 10px 0; overflow-wrap: anywhere; }
.project-label small { font-size: 12px; color: var(--muted); }
.eyebrow { color: var(--accent); font-size: 12px; letter-spacing: .09em; font-weight: 700; text-transform: uppercase; }
.sidebar nav { display: grid; gap: 6px; }
.sidebar nav a { display: flex; gap: 10px; align-items: center; text-decoration: none; padding: 11px; min-height: 44px; color: var(--muted); font-size: 14px; border: 1px solid transparent; border-radius: 8px; }
.sidebar nav a[aria-current="page"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); font-weight: 650; }
.sidebar nav a:hover { background: var(--hover); }
.sidebar-note { margin: 27px 10px 0; display: flex; gap: 10px; color: var(--muted); font-size: 14px; }
.sidebar-note i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none; margin-top: 7px; }
.sidebar-note p { color: var(--muted); line-height: 1.7; font-size: 12px; margin: 8px 0; }
.pane[hidden], button[hidden], .sidebar nav[hidden] { display: none !important; }
.section-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); color: var(--ink); padding: 10px 12px; text-align: left; font-size: 14px; line-height: 1.5; }
.section-toggle > span:first-child { min-width: 0; }
.section-toggle strong { font-weight: 650; }
.section-toggle .section-chevron { font-size: 18px; color: var(--accent); flex: none; }
.section-toggle[aria-expanded="true"] .section-chevron { transform: rotate(180deg); }
main { padding: 30px clamp(22px, 4vw, 60px) 24px; min-width: 0; }
.pane { max-width: 1250px; margin: 0 auto; }
:is(h1, h2, h3, h4) { overflow-wrap: anywhere; }
h1 { font-size: clamp(29px, 3.6vw, 42px); font-weight: 680; letter-spacing: -.035em; line-height: 1.18; margin: 12px 0 16px; }
h2 { font-size: 27px; font-weight: 650; letter-spacing: -.025em; margin: 12px 0 20px; }
h3 { font-size: 18px; line-height: 1.4; margin: 0 0 12px; letter-spacing: -.015em; }
h4 { font-size: 14px; margin: 20px 0 9px; font-weight: 700; }
p { line-height: 1.7; margin: 10px 0; overflow-wrap: anywhere; }
.intro { font-size: 15px; color: var(--muted); max-width: 850px; line-height: 1.75; margin-bottom: 24px; }
.preserve { white-space: pre-wrap; overflow-wrap: anywhere; }
.meta-line, .chips, .owner-line { display: flex; flex-wrap: wrap; gap: 8px; }
.badge { display: inline-block; font-size: 12px; line-height: 1.5; padding: 5px 9px; background: var(--soft); color: var(--muted); border: 1px solid var(--border); border-radius: 6px; overflow-wrap: anywhere; max-width: 100%; }
.hero { margin: 24px 0 30px; border: 1px solid var(--border); background: linear-gradient(120deg, var(--accent-soft), var(--panel)); padding: 26px; border-radius: 16px; display: grid; grid-template-columns: 1.25fr 1fr; gap: 26px; }
.hero > div { min-width: 0; }
.hero h2 { font-size: 25px; margin: 12px 0; }
.hero p { font-size: 14px; color: var(--muted); }
.text-link { display: inline-flex; align-items: center; min-height: 40px; padding: 8px 0; margin-top: 7px; font-size: 14px; font-weight: 650; }
.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-content: center; }
.stat-grid strong { display: block; font-size: 28px; color: var(--accent); font-weight: 650; }
.stat-grid span { font-size: 12px; color: var(--muted); }
.section-heading { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
.section-heading h2 { font-size: 23px; margin: 9px 0 19px; }
.muted { color: var(--muted); font-size: 12px; }
.workflow-path { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 26px; }
.path-card { border: 1px solid var(--border); border-top: 3px solid var(--stage-color, var(--accent)); border-radius: 10px; background: var(--panel); text-align: left; display: grid; gap: 12px; min-height: 170px; padding: 16px; color: var(--ink); transition: background .15s, border-color .15s; min-width: 0; }
.path-card:hover { background: var(--accent-soft); border-color: var(--accent); }
.path-card strong { font-size: 15px; line-height: 1.5; }
.path-card > span:not(.stage-number) { font-size: 14px; color: var(--muted); }
.path-card small { font-size: 12px; color: var(--accent); align-self: end; line-height: 1.6; }
.stage-number { font-size: 12px; font-weight: 750; color: var(--accent); background: var(--accent-soft); width: 34px; height: 34px; display: grid; place-content: center; border-radius: 8px; flex: none; }
.process-kind { width: fit-content; height: auto; min-height: 34px; padding: 6px 9px; font-size: 11px; letter-spacing: .04em; }
.two-grid, .columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
.card, .record, .source-card { border: 1px solid var(--border); border-radius: 11px; background: var(--panel); padding: 22px; margin-bottom: 17px; min-width: 0; }
.card h3, .record h3 { font-size: 17px; }
.card p, .record p { font-size: 14px; }
.card-heading { display: flex; align-items: start; justify-content: space-between; flex-wrap: wrap; gap: 10px 14px; }
.card-heading h3 { margin-bottom: 9px; }
.card-heading code { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.empty { border: 1px dashed var(--border); padding: 20px; border-radius: 10px; color: var(--muted); font-size: 14px; }
.stage-detail { border: 1px solid var(--border); border-left: 4px solid var(--stage-color, var(--accent)); border-radius: 12px; background: var(--panel); padding: 25px; margin-bottom: 23px; scroll-margin-top: 100px; }
.stage-detail header { display: flex; gap: 17px; margin-bottom: 18px; }
.stage-detail header > div { min-width: 0; }
.stage-detail header h3 { font-size: 22px; margin: 7px 0; }
.stage-detail header p { font-size: 14px; color: var(--muted); margin: 0; }
.decision-note { background: var(--soft); border-radius: 8px; padding: 15px 17px; margin: 22px 0; font-size: 14px; }
.decision-note strong { font-size: 12px; letter-spacing: .04em; color: var(--accent); }
.decision-note p { margin-bottom: 0; }
.columns ul { padding-left: 19px; margin: 0; }
.columns li { font-size: 14px; line-height: 1.75; margin-bottom: 6px; color: var(--muted); overflow-wrap: anywhere; }
.stage-detail details { border-top: 1px solid var(--border); margin-top: 20px; padding-top: 13px; }
.stage-detail summary { font-size: 14px; color: var(--accent); cursor: pointer; font-weight: 600; min-height: 40px; padding: 8px 0; }
.artifact-links { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.artifact-links strong { font-size: 12px; color: var(--muted); margin-right: 6px; }
dl { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 10px; font-size: 14px; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }
.commands { display: block; margin-bottom: 0; }
.commands > div { display: grid; grid-template-columns: 65px minmax(0, 1fr); gap: 10px; margin: 15px 0; }
.commands code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.source-card { font-size: 14px; overflow-wrap: anywhere; }
.source-card a, dd a { display: inline-block; min-height: 40px; padding: 8px 0; }
.file-workspace { border: 1px solid var(--border); border-radius: 12px; display: grid; grid-template-columns: minmax(190px, 30%) minmax(0, 1fr); background: var(--panel); min-height: 450px; }
.file-list { border-right: 1px solid var(--border); background: var(--soft); max-height: 75vh; overflow: auto; padding: 17px 13px; border-radius: 12px 0 0 12px; }
.file-list label { display: block; font-size: 14px; color: var(--muted); margin-bottom: 9px; }
.file-list input { width: 100%; min-height: 42px; padding: 10px; border: 1px solid var(--border); background: var(--panel); color: var(--ink); border-radius: 7px; font-size: 14px; margin-bottom: 3px; }
.file-list input::placeholder { color: var(--muted); opacity: 1; }
.file-list button { display: block; width: 100%; text-align: left; background: none; border: 1px solid transparent; padding: 10px 8px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; line-height: 1.6; color: var(--ink); overflow-wrap: anywhere; }
.file-list button:hover { background: var(--hover); }
.file-list button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.file-preview { min-width: 0; }
.preview-heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding: 17px; border-bottom: 1px solid var(--border); }
.preview-heading strong { font-size: 12px; color: var(--ink); overflow-wrap: anywhere; min-width: 0; }
.preview-heading button { font-size: 14px; flex: none; padding: 8px 10px; }
pre { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 14px; line-height: 1.8; margin: 0; padding: 22px; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 70vh; overflow: auto; }
footer { max-width: 1250px; margin: 30px auto 0; border-top: 1px solid var(--border); padding: 19px 0; color: var(--muted); font-size: 12px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 1050px) {
  .workspace { grid-template-columns: 220px minmax(0, 1fr); }
  .sidebar { padding: 22px 14px; }
  main { padding: 28px 24px; }
  .hero { grid-template-columns: 1fr; gap: 15px; }
  .stat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .stat-grid strong { font-size: 25px; }
  .snapshot-label { display: none; }
  .file-workspace { grid-template-columns: 1fr; }
  .file-list { max-height: 240px; border-right: 0; border-bottom: 1px solid var(--border); border-radius: 12px 12px 0 0; }
  .two-grid, .columns { grid-template-columns: 1fr; gap: 0; }
}
@media (max-width: 800px) {
  .topbar { height: auto; min-height: 78px; padding: 15px 18px; gap: 14px; flex-wrap: wrap; position: static; }
  .brand strong { font-size: 17px; }
  .brand-mark { font-size: 30px; }
  .topbar-actions { gap: 8px; }
  .workspace { display: block; }
  .sidebar { height: auto; position: static; border-right: 0; border-bottom: 1px solid var(--border); padding: 12px 18px; }
  .project-label, .sidebar-note { display: none; }
  .sidebar nav { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
  .sidebar nav a { padding: 9px 10px; background: var(--soft); gap: 6px; }
  main { padding: 25px 18px; }
  h1 { font-size: 31px; }
  h2 { font-size: 25px; }
  .hero { padding: 22px; margin: 22px 0; }
  .hero h2 { font-size: 23px; }
  .stat-grid { gap: 12px; }
  .workflow-path { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .path-card { min-height: 160px; padding: 15px; }
  .stage-detail { padding: 20px; scroll-margin-top: 18px; }
  .stage-detail header { gap: 12px; }
  .stage-detail header h3 { font-size: 20px; }
  .card, .record { padding: 20px; }
  dl { grid-template-columns: 95px minmax(0, 1fr); }
  .preview-heading { padding: 14px; }
  pre { padding: 18px; }
  .section-heading { flex-wrap: wrap; gap: 0; margin-bottom: 14px; }
  .section-heading h2 { font-size: 22px; margin-bottom: 5px; }
}
@media (max-width: 420px) {
  .topbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding: 12px 18px; }
  .brand { grid-column: 1; grid-row: 1; gap: 8px; }
  .brand strong { font-size: 16px; }
  .brand small { display: none; }
  .brand-mark { font-size: 28px; }
  .topbar-actions { display: contents; }
  #viewer-theme { grid-column: 2; grid-row: 1; padding: 8px 11px; }
  #download-project { grid-column: 1 / -1; grid-row: 2; width: 100%; }
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .workflow-path { grid-template-columns: 1fr; }
  dl { grid-template-columns: 1fr; gap: 3px; }
  dd { margin-bottom: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
@media (forced-colors: active) {
  .sidebar nav a[aria-current="page"], .file-list button[aria-pressed="true"] { border: 2px solid Highlight; }
  :is(button, a, input, summary, pre, [tabindex]):focus-visible { outline-color: Highlight; }
}
`
