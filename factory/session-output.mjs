import { createDecisionReview, exportDecisionReview } from './decision-review.mjs'

export function attachReviewArtifacts(config, input, { baseline = config, reason = '', guidanceReview = null } = {}) {
  const pack = JSON.parse(JSON.stringify(input))
  const manifestFile = pack.files.find(file => file.path === 'manifest.json')
  if (!manifestFile) throw new Error('The selected output needs a manifest before adding its review.')
  const manifest = JSON.parse(manifestFile.content)
  const selection = { kind: manifest.kind, ...(manifest.skill ? { skillId: manifest.skill } : {}) }
  const review = JSON.stringify(baseline) !== JSON.stringify(config) || reason.trim() ? createDecisionReview(baseline, config, { reason, selection }) : null
  if (review && (review.changes.length || reason.trim())) {
    for (const file of exportDecisionReview(review)) {
      const record = { ...file, why: file.path.endsWith('.md') ? 'Review changes in recorded decisions and their supplied reason.' : 'Preserve the exact comparison baseline and supplied reason for reopening.' }
      pack.files = pack.files.filter(item => item.path !== record.path)
      pack.files.push(record)
      pack.reasons ||= {}
      pack.reasons[record.path] = { purpose: record.why, stages: record.stages, roles: record.roles, sources: record.sources, assumptions: record.assumptions }
      if (Array.isArray(manifest.artifacts)) manifest.artifacts = [...manifest.artifacts.filter(item => item.path !== record.path), { path: record.path, purpose: record.why, stages: record.stages, roles: record.roles }]
    }
  }
  if (guidanceReview) manifest.guidanceReview = { kind: 'user-reviewed-definition-selection', fromCatalogVersion: guidanceReview.fromCatalogVersion, currentCatalogVersion: guidanceReview.currentCatalogVersion, definitionIds: [...guidanceReview.definitionIds], limit: 'A user selected these definitions for a download. This is not a new source check or observed host behavior.' }
  manifest.files = pack.files.map(file => file.path).sort()
  manifestFile.content = JSON.stringify(manifest, null, 2) + '\n'
  pack.stats = { ...pack.stats, fileCount: pack.files.length, bytes: pack.files.reduce((sum, file) => sum + new TextEncoder().encode(file.content).length, 0) }
  return pack
}
