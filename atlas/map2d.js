(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let instance = 0;
  const make = (tag, attrs = {}) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };
  const familyFor = type => ['browse-under', 'browses', 'part-of', 'has-part'].includes(type) ? 'structure' : ['applies-to', 'applied-by', 'requires', 'required-by'].includes(type) ? 'applies' : 'reading';

  window.mountAtlas2D = function mountAtlas2D({ container, data, byId, colors, onSelect, onEscape }) {
    const layout = data?.catalog?.layout2d;
    const sourceNodes = layout?.nodes;
    const valid = layout?.version === 1 && Number.isFinite(layout.width) && layout.width > 0 && Number.isFinite(layout.height) && layout.height > 0 && Array.isArray(layout.clusters) && (layout.edges === undefined || Array.isArray(layout.edges)) && Array.isArray(sourceNodes) && sourceNodes.length && sourceNodes.every(node => node && typeof node.id === 'string' && /^(topic|practice|technology):[a-z][a-z0-9-]*$/.test(node.id) && ['topic', 'practice', 'technology'].includes(node.kind) && node.id.startsWith(node.kind + ':') && [node.x, node.y, node.radius, node.labelRank].every(Number.isFinite) && node.radius > 0) && new Set(sourceNodes.map(node => node.id)).size === sourceNodes.length;
    container.replaceChildren();
    if (!valid) {
      const message = document.createElement('p');
      message.className = 'map2d-unavailable';
      message.textContent = 'This pack has no supported 2D layout. Use Topic cards or the 3D map to explore.';
      container.append(message);
      return null;
    }

    const prefix = `atlas2d-${++instance}`;
    const definitions = new Map((data.catalog?.definitions || []).map(record => [record.ref, record]));
    const topics = byId || new Map((data.nodes || []).map(record => [record.id, record]));
    const records = new Map(sourceNodes.map(node => [node.id, node]));
    const labels = new Map(sourceNodes.map(node => [node.id, node.kind === 'topic' ? topics.get(node.topicId || node.id.slice(6))?.title || node.id.slice(6) : definitions.get(node.definitionRef || node.id)?.label || node.id.split(':').slice(1).join(':')]));
    const clusterColors = new Map((data.catalog?.clusters || []).map(cluster => [cluster.id, cluster.color]));
    const colorFor = node => {
      const custom = colors instanceof Map ? colors.get(node.clusterId) : colors?.[node.clusterId];
      return typeof custom === 'string' ? custom : custom?.color || clusterColors.get(node.clusterId) || '#8faec7';
    };
    const pairs = new Map();
    if (Array.isArray(layout.edges)) {
      for (const edge of layout.edges) {
        if (!records.has(edge?.from) || !records.has(edge?.to) || !['structure', 'applies', 'reading'].includes(edge.family) || !Array.isArray(edge.relations) || !edge.relations.length) continue;
        const relations = edge.relations.filter(relation => relation && typeof relation.type === 'string' && records.has(relation.from) && records.has(relation.to) && ((relation.from === edge.from && relation.to === edge.to) || (relation.from === edge.to && relation.to === edge.from)));
        if (relations.length) pairs.set(`${edge.from}|${edge.to}|${edge.family}`, { ...edge, relations });
      }
    } else {
      for (const relation of data.catalog?.edges || []) {
        if (!relation || typeof relation.type !== 'string' || !records.has(relation.from) || !records.has(relation.to) || relation.from === relation.to) continue;
        const [from, to] = [relation.from, relation.to].sort(), family = familyFor(relation.type), key = `${from}|${to}|${family}`;
        if (!pairs.has(key)) pairs.set(key, { from, to, family, relations: [] });
        pairs.get(key).relations.push(relation);
      }
    }
    const edges = [...pairs.values()];
    const families = { structure: true, applies: true, reading: false };
    let selected = records.has('topic:overview') ? 'topic:overview' : sourceNodes[0].id;
    let roving = selected, subject = null, active = true, drag = null, theme = 'light';
    let box = { x: 0, y: 0, width: layout.width, height: layout.height };
    const svg = make('svg', { class: 'map2d-svg', role: 'group', 'aria-label': 'Knowledge map. Arrow keys pan, plus and minus zoom, Home shows the full map. Tab reaches the selected node.', tabindex: '0', preserveAspectRatio: 'xMidYMid meet' });
    const title = make('title');
    title.textContent = 'Knowledge map';
    const description = make('desc');
    description.textContent = 'Fixed clusters contain reading topics, practices and technologies. Select a node to inspect its recorded connections. Use the Neighbours list for named links. Drag empty space to pan. Hold Control while scrolling to zoom.';
    svg.append(title, description);
    const defs = make('defs');
    for (const family of Object.keys(families)) {
      const marker = make('marker', { id: `${prefix}-${family}`, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse', markerUnits: 'strokeWidth' });
      marker.append(make('path', { d: 'M 1 1 L 7 4 L 1 7 z', class: `map2d-arrow map2d-arrow-${family}` }));
      defs.append(marker);
    }
    svg.append(defs);
    const background = make('rect', { class: 'map2d-background', fill: 'transparent' });
    const clusterLayer = make('g', { class: 'map2d-clusters', 'aria-hidden': 'true' });
    const edgeLayer = make('g', { class: 'map2d-edges', 'aria-hidden': 'true' });
    const hitLayer = make('g', { class: 'map2d-hit-targets', 'aria-hidden': 'true' });
    const labelLayer = make('g', { class: 'map2d-labels', 'aria-hidden': 'true' });
    const nodeLayer = make('g', { class: 'map2d-nodes' });
    // Visible glyphs take priority over nearby labels and enlarged transparent targets.
    svg.append(background, clusterLayer, edgeLayer, hitLayer, labelLayer, nodeLayer);
    const compactKey = document.createElement('div');
    compactKey.className = 'map2d-compact-key';
    compactKey.hidden = true;
    const keyTitle = document.createElement('p');
    keyTitle.textContent = 'Map key';
    const keyList = document.createElement('ol');
    keyList.className = 'map2d-cluster-key';
    keyList.setAttribute('aria-label', 'Map clusters and recorded counts');
    const subjectList = document.createElement('ul');
    subjectList.className = 'map2d-subject-key';
    subjectList.setAttribute('aria-label', 'Highlighted articles');
    subjectList.hidden = true;
    const keyDetails = document.createElement('details');
    keyDetails.className = 'map2d-key-details';
    keyDetails.hidden = true;
    const keySummary = document.createElement('summary');
    keySummary.textContent = 'Map key';
    keyDetails.append(keySummary);
    compactKey.append(keyTitle, subjectList, keyDetails, keyList);
    let keySubject = '';
    const groups = new Map();
    for (const node of sourceNodes) {
      const group = make('g', { class: `map2d-node map2d-node-${node.kind}`, transform: `translate(${node.x} ${node.y})`, 'data-record': node.id, 'data-kind': node.kind, role: 'button', tabindex: node.id === roving ? '0' : '-1', 'aria-label': `${labels.get(node.id)}, ${node.kind}` });
      group.style.setProperty('--map2d-node-color', colorFor(node));
      const target = make('circle', { class: 'map2d-hit', cx: node.x, cy: node.y, r: node.radius + 4, 'data-record': node.id });
      target.addEventListener('click', () => activate(node.id));
      hitLayer.append(target);
      let shape;
      if (node.kind === 'practice') shape = make('rect', { class: 'map2d-shape', x: -node.radius, y: -node.radius, width: node.radius * 2, height: node.radius * 2, rx: node.radius * .4 });
      else if (node.kind === 'technology') shape = make('polygon', { class: 'map2d-shape', points: Array.from({ length: 6 }, (_, i) => `${Math.cos(i * Math.PI / 3) * node.radius},${Math.sin(i * Math.PI / 3) * node.radius}`).join(' ') });
      else shape = make('circle', { class: 'map2d-shape', r: node.radius });
      const ring = make('circle', { class: 'map2d-focus-ring', r: node.radius + 5, 'aria-hidden': 'true' });
      const labelOwner = make('g', { class: 'map2d-label-owner', transform: `translate(${node.x} ${node.y})` });
      const label = make('text', { class: 'map2d-label', 'data-record': node.id, 'dominant-baseline': 'middle' });
      label.textContent = labels.get(node.id);
      label.addEventListener('click', () => activate(node.id));
      const labelTooltip = make('title');
      labelTooltip.textContent = `${labels.get(node.id)} (${node.kind})`;
      labelOwner.append(label, labelTooltip);
      labelLayer.append(labelOwner);
      const tooltip = make('title');
      tooltip.textContent = `${labels.get(node.id)} (${node.kind})`;
      group.append(ring, shape, tooltip);
      group.addEventListener('click', () => activate(node.id));
      group.addEventListener('focus', () => {
        roving = node.id;
        refreshNodes();
      });
      group.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          activate(node.id);
        }
      });
      groups.set(node.id, { group, target, ring, label });
      nodeLayer.append(group);
    }
    for (const cluster of layout.clusters || []) {
      if (!cluster || ![cluster.x, cluster.y].every(Number.isFinite) || typeof cluster.label !== 'string' || !Number.isInteger(cluster.topicCount) || cluster.topicCount < 0) continue;
      const group = make('g', { class: 'map2d-cluster', 'data-cluster': cluster.id, transform: `translate(${cluster.x} ${cluster.y})` });
      const name = make('text', { class: 'map2d-cluster-name', 'text-anchor': 'middle' });
      name.textContent = cluster.label;
      const count = make('text', { class: 'map2d-cluster-count', 'text-anchor': 'middle' });
      const definitionCount = sourceNodes.filter(node => node.clusterId === cluster.id && node.kind !== 'topic').length;
      count.textContent = cluster.id === 'factory' ? `${definitionCount} definitions` : `${cluster.topicCount} topics`;
      group.dataset.label = cluster.label;
      group.dataset.number = String(clusterLayer.childElementCount + 1);
      group.dataset.top = String(Math.min(cluster.y, ...sourceNodes.filter(node => node.clusterId === cluster.id).map(node => node.y - node.radius)) - cluster.y);
      const keyItem = document.createElement('li');
      const keyNumber = document.createElement('span');
      keyNumber.className = 'map2d-key-number';
      keyNumber.setAttribute('aria-hidden', 'true');
      keyNumber.textContent = group.dataset.number;
      const keyText = document.createElement('span');
      const keyLabel = document.createElement('strong');
      keyLabel.textContent = cluster.label;
      const keyCount = document.createElement('small');
      keyCount.textContent = count.textContent;
      keyText.append(keyLabel, document.createTextNode(' '), keyCount);
      keyItem.append(keyNumber, keyText);
      keyList.append(keyItem);
      group.append(name, count);
      clusterLayer.append(group);
    }
    container.append(svg, compactKey);

    const scale = () => {
      const rect = svg.getBoundingClientRect();
      return Math.max(.01, Math.min((rect.width || layout.width) / box.width, (rect.height || layout.height) / box.height));
    };
    function neighbours() {
      const result = new Set();
      for (const edge of edges) if (families[edge.family]) {
        if (edge.from === selected) result.add(edge.to);
        if (edge.to === selected) result.add(edge.from);
      }
      return result;
    }
    function subjectMatches() {
      if (!subject) return null;
      const seeds = new Set([...subject].map(id => id.startsWith('topic:') ? id : `topic:${id}`).filter(id => records.has(id)));
      const matches = new Set(seeds);
      for (const edge of edges) {
        if (seeds.has(edge.from) && records.get(edge.to).kind !== 'topic') matches.add(edge.to);
        if (seeds.has(edge.to) && records.get(edge.from).kind !== 'topic') matches.add(edge.from);
      }
      return matches;
    }
    function refreshNodes() {
      const width = container.getBoundingClientRect().width;
      const compact = width <= 620;
      container.classList.toggle('map2d-compact', compact);
      container.dataset.keyColumns = width < 330 ? '2' : '3';
      const members = subject ? [...subject].map(id => id.startsWith('topic:') ? id : `topic:${id}`).filter(id => records.has(id)) : [];
      const showSubjects = members.length > 0;
      compactKey.hidden = !compact && !showSubjects;
      container.classList.toggle('map2d-has-key', compact || showSubjects);
      const subjectKey = members.join('|');
      if (subjectKey !== keySubject) {
        keySubject = subjectKey;
        keyDetails.open = false;
        subjectList.replaceChildren();
        for (const id of members) {
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.map2dSubjectRecord = id;
          button.textContent = labels.get(id);
          button.addEventListener('click', () => activate(id, { recenter: true }));
          item.append(button);
          subjectList.append(item);
        }
      }
      keyTitle.textContent = showSubjects ? 'Highlighted articles' : 'Map key';
      subjectList.hidden = !showSubjects;
      keyDetails.hidden = !showSubjects || !compact;
      if (showSubjects && keyList.parentElement !== keyDetails) keyDetails.append(keyList);
      if (!showSubjects && keyList.parentElement !== compactKey) compactKey.append(keyList);
      subjectList.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.map2dSubjectRecord === selected)));
      if (compact || showSubjects) container.style.setProperty('--map2d-key-space', `${Math.ceil(compactKey.getBoundingClientRect().height) + 24}px`);
      const s = scale(), close = neighbours(), matches = subjectMatches();
      const zoom = layout.width / box.width, globalFit = zoom <= 1.15;
      const threshold = globalFit ? 0 : Math.min(sourceNodes.length, Math.round(11 + 12 * Math.max(0, zoom - 1) ** 1.5));
      const clusterIds = new Set((layout.clusters || []).map(cluster => cluster.id));
      for (const node of sourceNodes) {
        const { group, target, ring, label } = groups.get(node.id), chosen = selected === node.id, nearby = close.has(node.id), focused = roving === node.id && document.activeElement === group;
        const match = !matches || matches.has(node.id);
        const hub = node.kind === 'topic' && clusterIds.has(node.topicId || node.id.slice(6));
        const subjectTopic = !compact && !globalFit && node.kind === 'topic' && subject && (subject.has(node.topicId || node.id.slice(6)) || subject.has(node.id));
        group.classList.toggle('is-selected', chosen);
        group.classList.toggle('is-neighbour', nearby);
        group.classList.toggle('is-dimmed', !match && !chosen && !focused);
        label.classList.toggle('is-dimmed', !match && !chosen && !focused);
        label.classList.toggle('is-selected', chosen);
        group.setAttribute('aria-pressed', String(chosen));
        group.dataset.selected = String(chosen);
        group.setAttribute('tabindex', active && node.id === roving ? '0' : '-1');
        group.dataset.subjectMatch = matches ? String(matches.has(node.id)) : 'all';
        target.setAttribute('r', String(chosen || nearby || focused ? Math.max(node.radius + 4, 22 / s) : node.radius + 4));
        ring.setAttribute('r', String(node.radius + 4 / s));
        label.setAttribute('font-size', String((chosen ? 14 : 12) / s));
        const labelX = (compact && node.x > box.x + box.width / 2 ? -1 : 1) * (node.radius + 7 / s);
        label.setAttribute('text-anchor', labelX < 0 ? 'end' : 'start');
        label.setAttribute('x', String(labelX));
        label.setAttribute('y', '0');
        const text = labels.get(node.id);
        const lines = [];
        if (compact) {
          for (const word of text.split(/\s+/)) {
            if (!lines.length || `${lines[lines.length - 1]} ${word}`.length > 20) lines.push(word);
            else lines[lines.length - 1] += ' ' + word;
          }
        } else lines.push(text);
        const textLayout = lines.join('\n');
        if (label.dataset.textLayout !== textLayout) {
          label.dataset.textLayout = textLayout;
          label.replaceChildren(...lines.map(line => { const span = make('tspan'); span.textContent = line; return span; }));
        }
        [...label.children].forEach((span, index) => { span.setAttribute('x', String(labelX)); span.setAttribute('y', String((index - (lines.length - 1) / 2) * 16 / s)); });
        label.style.display = chosen || focused || subjectTopic || (!hub && !globalFit && (nearby || match && node.labelRank <= threshold)) ? '' : 'none';
      }
      for (const cluster of clusterLayer.children) {
        const numbered = compact && zoom < 2.2;
        cluster.firstChild.textContent = numbered ? cluster.dataset.number : cluster.dataset.label;
        cluster.firstChild.setAttribute('font-size', String(14 / s));
        const top = Number(cluster.dataset.top) || 0;
        cluster.firstChild.setAttribute('y', String(top + (numbered ? -20 : -34) / s));
        cluster.lastChild.setAttribute('font-size', String(11 / s));
        cluster.lastChild.setAttribute('y', String(top - 18 / s));
        cluster.lastChild.style.display = numbered ? 'none' : '';
      }
    }
    function refreshEdges() {
      edgeLayer.replaceChildren();
      for (const edge of edges) {
        if (!families[edge.family] || (edge.from !== selected && edge.to !== selected)) continue;
        const from = records.get(edge.from), to = records.get(edge.to), dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
        if (!length) continue;
        const unitX = dx / length, unitY = dy / length;
        const relation = edge.relations.find(item => item && !item.derived) || edge.relations[0];
        const reverse = relation?.to === edge.from;
        const line = make('line', { class: `map2d-edge map2d-edge-${edge.family}`, 'data-family': edge.family, 'data-edge-family': edge.family, x1: from.x + unitX * (from.radius + 3), y1: from.y + unitY * (from.radius + 3), x2: to.x - unitX * (to.radius + 3), y2: to.y - unitY * (to.radius + 3), 'vector-effect': 'non-scaling-stroke', [reverse ? 'marker-start' : 'marker-end']: `url(#${prefix}-${edge.family})` });
        const tooltip = make('title');
        tooltip.textContent = [...new Set(edge.relations.map(item => `${labels.get(item.from) || item.from} → ${item.type.replaceAll('-', ' ')} → ${labels.get(item.to) || item.to}`))].join('\n');
        line.append(tooltip);
        edgeLayer.append(line);
      }
    }
    function render() {
      svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
      svg.dataset.viewbox = `${box.x} ${box.y} ${box.width} ${box.height}`;
      svg.dataset.zoom = String(layout.width / box.width);
      for (const [key, value] of Object.entries(box)) background.setAttribute(key, String(value));
      refreshNodes();
    }
    function activate(id, options) {
      select(id, options);
      if (typeof onSelect === 'function') onSelect(id);
    }
    function select(id, { focus = false, recenter = false } = {}) {
      const canonical = records.has(id) ? id : `topic:${id}`;
      if (!records.has(canonical)) return false;
      selected = roving = canonical;
      if (recenter) {
        const node = records.get(canonical);
        const margin = Math.max(node.radius, 24 / scale());
        if (node.x < box.x + margin || node.x > box.x + box.width - margin || node.y < box.y + margin || node.y > box.y + box.height - margin) {
          box.x = node.x - box.width / 2;
          box.y = node.y - box.height / 2;
        }
      }
      refreshEdges();
      render();
      if (focus && active) groups.get(canonical).group.focus({ preventScroll: true });
      return true;
    }
    function zoom(factor, anchor) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      const next = Math.min(12, Math.max(.65, layout.width / box.width * factor));
      const width = layout.width / next, height = layout.height / next;
      const point = anchor || { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const ratioX = (point.x - box.x) / box.width, ratioY = (point.y - box.y) / box.height;
      box = { x: point.x - ratioX * width, y: point.y - ratioY * height, width, height };
      render();
    }
    function pan(dx, dy) {
      if (![dx, dy].every(Number.isFinite)) return;
      const s = scale();
      box.x += dx / s;
      box.y += dy / s;
      render();
    }
    function reset() {
      box = { x: 0, y: 0, width: layout.width, height: layout.height };
      render();
    }
    svg.addEventListener('keydown', event => {
      if (!active || event.ctrlKey || event.metaKey || event.altKey) return;
      const moves = { ArrowLeft: [-60, 0], ArrowRight: [60, 0], ArrowUp: [0, -60], ArrowDown: [0, 60] };
      if (moves[event.key]) { event.preventDefault(); pan(...moves[event.key]); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.25); }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); zoom(.8); }
      else if (event.key === 'Home') { event.preventDefault(); reset(); }
      else if (event.key === 'Escape' && typeof onEscape === 'function') { event.preventDefault(); event.stopPropagation(); onEscape(); }
    });
    svg.addEventListener('pointerdown', event => {
      if (!active || event.button !== 0 || event.target.closest('.map2d-node, .map2d-hit, .map2d-label')) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      svg.setPointerCapture(event.pointerId);
      svg.classList.add('is-panning');
    });
    svg.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      pan(drag.x - event.clientX, drag.y - event.clientY);
      drag.x = event.clientX;
      drag.y = event.clientY;
    });
    const stopDrag = () => { drag = null; svg.classList.remove('is-panning'); };
    svg.addEventListener('pointerup', stopDrag);
    svg.addEventListener('pointercancel', stopDrag);
    svg.addEventListener('lostpointercapture', stopDrag);
    svg.addEventListener('wheel', event => {
      if (!active || !event.ctrlKey) return;
      event.preventDefault();
      const rect = svg.getBoundingClientRect(), s = scale(), left = rect.left + (rect.width - box.width * s) / 2, top = rect.top + (rect.height - box.height * s) / 2;
      zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .004), { x: box.x + (event.clientX - left) / s, y: box.y + (event.clientY - top) / s });
    }, { passive: false });
    const observer = new ResizeObserver(() => { if (active) render(); });
    observer.observe(container);
    keyDetails.addEventListener('toggle', () => { if (active) render(); });
    refreshEdges();
    render();
    return {
      select,
      setSubject(topicIds) { subject = Array.isArray(topicIds) ? new Set(topicIds.filter(id => typeof id === 'string')) : null; refreshNodes(); },
      setTheme(value) { theme = value === 'dark' ? 'dark' : 'light'; container.dataset.map2dTheme = theme; },
      setActive(value) { active = Boolean(value); svg.dataset.active = String(active); svg.setAttribute('tabindex', active ? '0' : '-1'); svg.setAttribute('aria-hidden', String(!active)); if (!active) stopDrag(); render(); },
      setFamily(family, enabled) { if (!Object.hasOwn(families, family)) return; families[family] = Boolean(enabled); refreshEdges(); refreshNodes(); },
      zoom, reset, pan,
      getState() { return { selected, zoom: layout.width / box.width, viewBox: { ...box }, families: { ...families }, subject: subject ? [...subject] : null }; },
      destroy() { observer.disconnect(); container.replaceChildren(); }
    };
  };
})();
