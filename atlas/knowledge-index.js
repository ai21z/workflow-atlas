(() => {
  'use strict';

  const list = value => Array.isArray(value) ? value : [];
  const validText = value => typeof value === 'string' && value.trim().length > 0;
  const strings = value => typeof value === 'string' ? [value] : list(value).flatMap(strings);
  const compare = (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id);

  window.createKnowledgeIndex = function createKnowledgeIndex(data = {}) {
    const nodes = new Map();
    for (const node of list(data?.nodes)) {
      if (node && validText(node.id) && validText(node.title) && !nodes.has(node.id)) nodes.set(node.id, node);
    }

    const stageMap = new Map();
    for (const record of list(data?.catalog?.definitions)) {
      if (record?.type === 'stage' && validText(record.id) && validText(record.label) && !stageMap.has(record.id)) {
        stageMap.set(record.id, { id: record.id, label: record.label });
      }
    }
    const stages = [...stageMap.values()].sort(compare);
    const clusterLabels = new Map(list(data?.catalog?.clusters)
      .filter(record => record && validText(record.id) && validText(record.short))
      .map(record => [record.id, record.short]));
    const topicMap = new Map([['__overview__', { id: '__overview__', label: 'Overview' }]]);
    for (const node of nodes.values()) {
      if (node.parent === 'overview') topicMap.set(node.id, { id: node.id, label: clusterLabels.get(node.id) || node.title });
    }
    const topics = [...topicMap.values()].sort(compare);
    const topicFor = node => {
      const seen = new Set();
      while (node && node.id !== 'overview' && !seen.has(node.id)) {
        if (topicMap.has(node.id)) return node.id;
        seen.add(node.id);
        node = nodes.get(node.parent);
      }
      return '__overview__';
    };

    const sourceMap = new Map();
    if (data?.sources && typeof data.sources === 'object' && !Array.isArray(data.sources)) {
      for (const [id, value] of Object.entries(data.sources)) {
        if (validText(id) && Array.isArray(value) && validText(value[0]) && validText(value[1])) {
          sourceMap.set(id, { id, label: value[0], url: value[1] });
        }
      }
    }
    const publishers = new Map(list(data?.catalog?.sources)
      .filter(record => record && validText(record.id) && validText(record.publisher))
      .map(record => [record.id, record.publisher]));
    const usedSources = new Set();
    const rows = [...nodes.values()].map(node => {
      const sourceStatus = typeof node.catalog?.sourceStatus === 'string' ? node.catalog.sourceStatus : '';
      const reviewLabel = sourceStatus === 'reviewed' ? 'Scoped source claims reviewed' : sourceStatus === 'needs-review' ? 'Source review needed' : sourceStatus === 'legacy' ? 'Earlier claims not rechecked' : 'No source review recorded';
      const topicId = topicFor(node);
      const stageIds = [...new Set(list(node.catalog?.applies?.stages).filter(id => stageMap.has(id)))];
      const sourceIds = [...new Set(list(node.refs).filter(id => sourceMap.has(id)))];
      sourceIds.forEach(id => usedSources.add(id));
      const sourceText = sourceIds.flatMap(id => {
        const source = sourceMap.get(id);
        let hostname = '';
        try { hostname = new URL(source.url).hostname; } catch {}
        return [source.label, publishers.get(id) || '', hostname];
      });
      const text = [node.title, reviewLabel, topicMap.get(topicId).label, ...strings(node.catalog?.kind),
        ...stageIds.map(id => stageMap.get(id).label), ...strings(node.summary), ...strings(node.catalog?.aliases),
        ...list(node.sections).flatMap(section => section ? [
          ...strings(section.label), ...strings(section.text), ...strings(section.items),
          ...strings(section.headers), ...strings(section.rows),
        ] : []), ...sourceText].join(' ').toLocaleLowerCase();
      return {
        id: node.id,
        title: node.title,
        summary: typeof node.summary === 'string' ? node.summary : '',
        kind: typeof node.catalog?.kind === 'string' ? node.catalog.kind : '',
        sourceStatus,
        reviewLabel,
        topicId,
        topicLabel: topicMap.get(topicId).label,
        stageIds,
        sourceIds,
        text,
      };
    }).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    const sources = [...usedSources].map(id => sourceMap.get(id)).sort(compare);

    function filter(criteria = {}) {
      const query = typeof criteria?.query === 'string' ? criteria.query : '';
      const stage = typeof criteria?.stage === 'string' ? criteria.stage : '';
      const topic = typeof criteria?.topic === 'string' ? criteria.topic : '';
      const source = typeof criteria?.source === 'string' ? criteria.source : '';
      const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      return rows.filter(row =>
        (!stage || (stage === '__none__' ? row.stageIds.length === 0 : row.stageIds.includes(stage))) &&
        (!topic || row.topicId === topic) &&
        (!source || (source === '__none__' ? row.sourceIds.length === 0 : row.sourceIds.includes(source))) &&
        terms.every(term => row.text.includes(term)));
    }

    return { rows, stages, topics, sources, filter };
  };
})();
