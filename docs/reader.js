(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const data = window.ATLAS_GUIDE || window.JEV_GUIDE;
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  const byId = new Map(pages.map((page) => [page.id, page]));
  const guideTitle = data?.title || 'Atlas guides';
  const homeId = byId.has(data?.homeId) ? data.homeId : pages[0]?.id;
  const bySource = new Map(pages.map((page) => [new URL(page.source, document.baseURI).href.split('#')[0], page]));
  const article = $('guide-article');
  const dialog = $('diagram-dialog');
  let currentPage = homeId;
  let searchQuery = '';
  let expandedTrigger = null;
  let headingIndex = [];
  const compactOutline = matchMedia('(max-width:1270px)');
  const fitOutline = () => { $('outline-details').open = !compactOutline.matches; };
  fitOutline();
  compactOutline.addEventListener('change', fitOutline);

  function slug(value) {
    return String(value).normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
  }

  function readableText(value) {
    return String(value).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').trim();
  }

  function safeHref(value, pageId) {
    const href = String(value).trim().replace(/^<(.+)>$/, '$1');
    if (!href || /[\u0000-\u0020\u007f\\]/.test(href) || href.startsWith('//')) return null;
    if (href.startsWith('#')) {
      const fragment = href.slice(1);
      const first = fragment.split('/')[0];
      if (byId.has(first)) return href;
      return `#${pageId}/${slug(decodeFragment(fragment))}`;
    }
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(href);
    if (absolute && !/^https?:\/\//i.test(href)) return null;
    if (!absolute && !/^[./a-z\d_-]/i.test(href)) return null;
    try {
      const source = byId.get(pageId)?.source;
      const address = new URL(href, new URL(source || '.', document.baseURI));
      if (!['http:', 'https:', 'file:'].includes(address.protocol)) return null;
      const destination = bySource.get(address.href.split('#')[0]);
      if (destination) return `#${destination.id}${address.hash ? `/${slug(decodeFragment(address.hash.slice(1)))}` : ''}`;
      return address.href;
    } catch { return null; }
  }

  function decodeFragment(value) {
    try { return decodeURIComponent(value); } catch { return value; }
  }

  function inline(value, pageId) {
    const tokens = [];
    let source = String(value).replace(/\u0001/g, '');
    const protect = (markup) => `\u0001${tokens.push(markup) - 1}\u0001`;
    source = source.replace(/`([^`\n]+)`/g, (_, code) => protect(`<code>${escapeHtml(code)}</code>`));
    source = source.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_, label, destination) => {
      const href = safeHref(destination, pageId);
      const safeLabel = escapeHtml(label).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      return protect(href ? `<a href="${escapeHtml(href)}">${safeLabel}</a>` : safeLabel);
    });
    source = escapeHtml(source)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,!?:;)])/g, '$1<em>$2</em>');
    return source.replace(/\u0001(\d+)\u0001/g, (_, index) => tokens[Number(index)] || '');
  }

  const diagrams = {
    'repeatable-trial': {
      title: 'The identical test, in order',
      description: 'Keep an initial downloaded checkpoint before the separate JEV review. Manually enter acceptance between F01 and F02, then retain the updated project. The two simulations and the human session follow these same phases.',
      type: 'flow',
      steps: [
        ['Open a fresh session', 'Check the start page and record the execution ID.', 'human', 'T01'],
        ['Record the initial task', 'Supply the shared brief, scope, reviewer and notes. Leave acceptance empty.', 'human', 'T02 to T04'],
        ['Read and apply a practice', 'Cancel once, then deliberately apply, undo and redo.', 'human', 'T05 to T06'],
        ['Inspect and keep the draft', 'Download the blueprint and reopen its actual ZIP.', '', 'T07 to T08'],
        ['Review F01', 'Check the feature with acceptance missing.', '', 'T09.1'],
        ['Enter acceptance manually', 'Add the agreed examples to the Atlas Brief.', 'human', 'T09.2'],
        ['Review F02 and the other cards', 'Check completed answers, boundaries, intent and conflicts.', '', 'T09.3 to T09.9'],
        ['Keep the updated project', 'Download and reopen the final draft. Explain the human handoff.', 'human', 'T10'],
      ],
    },
    'decision-flow': {
      title: 'From your description to starting files',
      description: 'The local server sends selected text to JEV. Checked choices become a reviewable draft. Your confirmed project decisions become compiler input.',
      type: 'decision',
      steps: [
        ['Brief and local server', 'Describe the work. Explicitly send the displayed text through the local server.', 'human', 'Input'],
        ['JEV judgments', 'Assess intent, context coverage and the designated practice.', '', 'Judgment'],
        ['Response validation', 'Check that the response meets the expected contract.', 'code', 'Code check'],
        ['Code policy', 'Apply the documented relevance rules.', 'code', 'Code decision'],
        ['Reviewable proposal', 'Show known stages, template defaults and optional questions.', '', 'Proposal'],
        ['User acceptance', 'Confirm answer wording, change the workflow or defer details. Create the draft.', 'human', 'Human decision'],
        ['Deterministic compiler', 'Build the artifacts from accepted input.', 'code', 'Code action'],
        ['Downloadable pack', 'Export the project and its artifacts for review.', '', 'Output'],
      ],
    },
    'practice-policy': {
      title: 'Practice policy tested in the synthetic pilot',
      description: 'Code combines JEV boundary and need judgments in this order. A wrong model judgment can still produce a wrong policy result.',
      type: 'policy',
    },
    'trial-flow': {
      title: 'Planned people trial alongside Atlas',
      description: 'Run an Atlas task and a separate JEV review. Bring the findings together through human review, then inspect the exported project and record the local result.',
      type: 'trial',
      steps: [
        ['Review corrections', 'Compare the separate review with the actual project.', 'human', 'Review'],
        ['Download the project', 'Export the manually reviewed Atlas result.', '', 'Export'],
        ['Reopen and inspect', 'Check that the project and artifacts retain the decisions.', 'code', 'Verification'],
        ['Record the result', 'Save observations, evidence, and unresolved questions locally.', 'human', 'Evidence'],
      ],
    },
  };

  function flowCards(steps) {
    return `<ol class="flow-cards">${steps.map(([title, description, kind, label], index) => `<li class="${kind ? `flow-${kind}` : ''}"><span class="flow-step">${index + 1}. ${escapeHtml(label)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></li>`).join('')}</ol>`;
  }

  function diagramCore(id) {
    const definition = diagrams[id];
    if (!definition) return '';
    let body;
    if (definition.type === 'policy') {
      body = `<ol class="policy-cards"><li><span class="flow-step">1. Check the boundary</span><strong>Boundary rejected?</strong><p>Evaluate the documented boundary judgment first.</p><div class="policy-output">If yes, assign<code>not-relevant</code></div><span class="policy-otherwise">Otherwise, continue to check 2.</span></li><li><span class="flow-step">2. Check the need</span><strong>Need established?</strong><p>Use the reviewed evidence for the project’s need.</p><div class="policy-output">If yes, assign<code>relevant</code></div><span class="policy-otherwise">Otherwise, continue to check 3.</span></li><li><span class="flow-step">3. Preserve uncertainty</span><strong>Insufficient evidence</strong><p>The prior checks did not establish a usable selection.</p><div class="policy-output">Assign<code>insufficient-context</code></div><span class="policy-otherwise">Review the missing context before proceeding.</span></li></ol>`;
    } else if (definition.type === 'trial') {
      body = `<div class="trial-lanes"><section class="trial-lane"><h3>Atlas task</h3><p>Work through one bounded project task manually. Preserve the brief, selections, and artifacts for comparison.</p></section><section class="trial-lane"><h3>Separate JEV review</h3><p>Run an agreed, comparable suggestion task as a separate advisory review. Preserve its judgments and the participant's review notes.</p></section></div><div class="trial-steps">${flowCards(definition.steps)}</div>`;
    } else {
      body = flowCards(definition.steps);
    }
    return `<div class="diagram-core">${body}<div class="diagram-legend"><span><i class="legend-dot" aria-hidden="true"></i>Input, judgment, or artifact</span><span><i class="legend-dot human" aria-hidden="true"></i>Human review</span><span><i class="legend-dot code" aria-hidden="true"></i>Code or verification</span></div></div>`;
  }

  function diagramMarkup(id) {
    const definition = diagrams[id];
    if (!definition) return `<p>${escapeHtml(`Unknown diagram: ${id}`)}</p>`;
    const fitted = matchMedia('(max-width: 620px)').matches;
    return `<figure class="guide-diagram" data-diagram="${id}"><figcaption>${escapeHtml(definition.title)}</figcaption><p class="diagram-description">${escapeHtml(definition.description)}</p><div class="diagram-toolbar"><span class="diagram-hint">Read the numbered steps. Scroll or expand for a larger view.</span><div class="diagram-actions"><button type="button" data-diagram-fit aria-pressed="${fitted}">Fit width</button><button type="button" data-diagram-expand>Expand diagram</button></div></div><div class="diagram-viewport${fitted ? ' is-fitted' : ''}" tabindex="0" role="region" aria-label="${escapeHtml(definition.title)}">${diagramCore(id)}</div></figure>`;
  }

  function tableCells(line) {
    const cells = [];
    let cell = '';
    let inCode = false;
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    for (let index = 0; index < trimmed.length; index++) {
      const character = trimmed[index];
      if (character === '\\' && trimmed[index + 1] === '|') { cell += '|'; index++; }
      else if (character === '`') { inCode = !inCode; cell += character; }
      else if (character === '|' && !inCode) { cells.push(cell.trim()); cell = ''; }
      else cell += character;
    }
    cells.push(cell.trim());
    return cells;
  }

  function isTableDivider(line) {
    return Boolean(line?.includes('|') && tableCells(line).every((cell) => /^:?-{3,}:?$/.test(cell)));
  }

  function listItem(line) {
    return line.match(/^\s*([-*+] |\d+[.)] )(.+)$/);
  }

  function blockStart(lines, index) {
    const line = lines[index] || '';
    return /^\s*(?:#{1,6}\s|```|~~~|>|\[\[(?:diagram|details):|\[\[\/details\]\]|<details>|<summary>|<\/details>|(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(line) || Boolean(listItem(line)) || isTableDivider(lines[index + 1]);
  }

  function renderMarkdown(markdown, pageId) {
    const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    const usedIds = new Map();
    const headings = [];
    let detailsDepth = 0;
    let hasTitle = false;

    for (let index = 0; index < lines.length;) {
      const line = lines[index];
      if (!line.trim()) { index++; continue; }

      const fence = line.match(/^\s*(```+|~~~+)\s*([^\s]*)\s*$/);
      if (fence) {
        const code = [];
        index++;
        while (index < lines.length && !lines[index].trim().startsWith(fence[1])) code.push(lines[index++]);
        if (index < lines.length) index++;
        output.push(`<div class="code-block"><div class="code-label"><span>${escapeHtml(fence[2] || 'Code')}</span><button type="button" class="copy-code" aria-label="Copy code">Copy</button></div><pre tabindex="0"><code>${escapeHtml(code.join('\n'))}</code></pre></div>`);
        continue;
      }

      const diagram = line.trim().match(/^\[\[diagram:([a-z-]+)\]\]$/);
      if (diagram) { output.push(diagramMarkup(diagram[1])); index++; continue; }
      const details = line.trim().match(/^\[\[details:(.+)\]\]$/);
      if (details || line.trim() === '<details>') {
        let title = details ? details[1].trim() : 'More detail';
        if (!details && lines[index + 1]?.trim().match(/^<summary>(.*?)<\/summary>$/)) title = lines[++index].trim().match(/^<summary>(.*?)<\/summary>$/)[1];
        output.push(`<details class="guide-details"><summary>${inline(title, pageId)}</summary>`);
        detailsDepth++;
        index++;
        continue;
      }
      if (['[[/details]]', '</details>'].includes(line.trim()) && detailsDepth) { output.push('</details>'); detailsDepth--; index++; continue; }

      const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        let level = heading[1].length;
        const text = readableText(heading[2]);
        if (level === 1 && !hasTitle) {
          output.push(`<header class="intro"><p class="overline">${escapeHtml(byId.get(pageId)?.group || guideTitle)}</p><h1 id="page-title">${inline(heading[2], pageId)}</h1></header>`);
          hasTitle = true;
        } else {
          if (level === 1) level = 2;
          const base = slug(text);
          const count = usedIds.get(base) || 0;
          usedIds.set(base, count + 1);
          const id = count ? `${base}-${count + 1}` : base;
          headings.push({ id, text, level });
          output.push(`<h${level} id="${id}" tabindex="-1"><a class="heading-link" href="#${pageId}/${id}">${inline(heading[2], pageId)}</a></h${level}>`);
        }
        index++;
        continue;
      }

      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { output.push('<hr>'); index++; continue; }

      if (line.trim().startsWith('>')) {
        const quoted = [];
        while (index < lines.length && lines[index].trim().startsWith('>')) quoted.push(lines[index++].replace(/^\s*>\s?/, ''));
        output.push(`<aside class="callout">${quoted.join('\n').split(/\n\s*\n/).map((paragraph) => `<p>${inline(paragraph.replace(/\n/g, ' '), pageId)}</p>`).join('')}</aside>`);
        continue;
      }

      if (isTableDivider(lines[index + 1])) {
        const headers = tableCells(line);
        const alignments = tableCells(lines[index + 1]).map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
        const rows = [];
        index += 2;
        while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(tableCells(lines[index++]));
        output.push(`<div class="table-wrap" tabindex="0" role="region" aria-label="${escapeHtml(headers.map(readableText).join(', '))} table"><table><thead><tr>${headers.map((cell, column) => `<th scope="col" style="text-align:${alignments[column] || 'left'}">${inline(cell, pageId)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, column) => `<td style="text-align:${alignments[column] || 'left'}">${inline(row[column] || '', pageId)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }

      const item = listItem(line);
      if (item) {
        const ordered = /^\d/.test(item[1]);
        const tag = ordered ? 'ol' : 'ul';
        const start = ordered ? parseInt(item[1], 10) : 1;
        const items = [];
        while (index < lines.length) {
          const candidate = listItem(lines[index]);
          if (!candidate || /^\d/.test(candidate[1]) !== ordered) break;
          let text = candidate[2];
          index++;
          while (index < lines.length && /^\s{2,}\S/.test(lines[index]) && !blockStart(lines, index)) text += ` ${lines[index++].trim()}`;
          items.push(`<li>${inline(text, pageId)}</li>`);
          if (!lines[index]?.trim() && listItem(lines[index + 1] || '')) index++;
        }
        output.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items.join('')}</${tag}>`);
        continue;
      }

      const paragraph = [line.trim()];
      index++;
      while (index < lines.length && lines[index].trim() && !blockStart(lines, index)) paragraph.push(lines[index++].trim());
      output.push(`<p>${inline(paragraph.join(' '), pageId)}</p>`);
    }
    while (detailsDepth > 0) { output.push('</details>'); detailsDepth--; }
    return { html: output.join('\n'), headings };
  }

  function startPath() {
    const path = Array.isArray(data?.startPath) ? data.startPath.filter((step) => byId.has(step.id)) : [];
    return path.length ? `<nav class="start-path" aria-label="Recommended reading path"><p>A useful first path</p><ol>${path.map((step, index) => `<li><a href="#${escapeHtml(step.id)}"><small>${String(index + 1).padStart(2, '0')} · ${escapeHtml(step.label)}</small><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.description)}</span></a></li>`).join('')}</ol></nav>` : '';
  }

  function renderNav() {
    const groups = new Map();
    const query = searchQuery.toLocaleLowerCase().trim();
    let count = 0;
    for (const page of pages) {
      const titleMatch = `${page.title} ${page.description}`.toLocaleLowerCase().includes(query);
      const bodyMatch = page.markdown.toLocaleLowerCase().includes(query);
      if (query && !titleMatch && !bodyMatch) continue;
      count++;
      const result = query && !titleMatch ? '<span class="search-match">Match in page content</span>' : '';
      const link = `<a href="#${page.id}"${page.id === currentPage ? ' aria-current="page"' : ''}>${escapeHtml(page.title)}${result}</a>`;
      groups.set(page.group, (groups.get(page.group) || '') + link);
    }
    $('guide-nav').innerHTML = [...groups].map(([group, links]) => `<div class="nav-group"><p>${escapeHtml(group)}</p>${links}</div>`).join('');
    $('search-status').textContent = query ? `${count} ${count === 1 ? 'page' : 'pages'} found${count ? '' : '. Try a broader term.'}` : '';
  }

  function setMenu(open, restoreFocus = false) {
    document.body.dataset.menuOpen = String(open);
    $('menu-toggle').setAttribute('aria-expanded', String(open));
    if (restoreFocus) $('menu-toggle').focus();
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('theme-toggle').setAttribute('aria-checked', String(theme === 'dark'));
  }

  let initialTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  setTheme(initialTheme);
  $('theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('menu-toggle').addEventListener('click', () => setMenu(document.body.dataset.menuOpen !== 'true'));
  $('guide-search').addEventListener('input', (event) => { searchQuery = event.target.value; renderNav(); });

  function closeDiagram() {
    if (dialog.open) dialog.close();
  }

  function setDiagramFit(viewport, button) {
    const fitted = !viewport.classList.contains('is-fitted');
    viewport.classList.toggle('is-fitted', fitted);
    button.setAttribute('aria-pressed', String(fitted));
  }

  $('dialog-fit').addEventListener('click', () => setDiagramFit($('dialog-viewport'), $('dialog-fit')));
  $('dialog-close').addEventListener('click', closeDiagram);
  dialog.addEventListener('close', () => {
    if (expandedTrigger?.isConnected) expandedTrigger.focus({ preventScroll: true });
    expandedTrigger = null;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDiagram();
  });

  article.addEventListener('click', async (event) => {
    const expand = event.target.closest('[data-diagram-expand]');
    const fit = event.target.closest('[data-diagram-fit]');
    const copy = event.target.closest('.copy-code');
    if (fit) { setDiagramFit(fit.closest('figure').querySelector('.diagram-viewport'), fit); return; }
    if (expand) {
      const id = expand.closest('figure').dataset.diagram;
      const definition = diagrams[id];
      if (!definition || typeof dialog.showModal !== 'function') return;
      expandedTrigger = expand;
      $('diagram-dialog-title').textContent = definition.title;
      $('dialog-description').textContent = definition.description;
      $('dialog-viewport').innerHTML = diagramCore(id);
      $('dialog-viewport').classList.remove('is-fitted');
      $('dialog-viewport').setAttribute('aria-label', `${definition.title}, expanded view`);
      $('dialog-fit').setAttribute('aria-pressed', 'false');
      dialog.showModal();
      $('dialog-close').focus();
      return;
    }
    if (copy) {
      const text = copy.closest('.code-block').querySelector('code').textContent;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copied';
        $('guide-announcement').textContent = 'Code copied.';
        setTimeout(() => { if (copy.isConnected) copy.textContent = 'Copy'; }, 1800);
      } catch {
        copy.textContent = 'Select code';
        const code = copy.closest('.code-block').querySelector('code');
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
        code.closest('pre').focus();
        $('guide-announcement').textContent = 'Code selected. Use your browser’s copy command.';
      }
    }
  });

  function parseRoute() {
    const value = location.hash.slice(1);
    const [pageId, ...anchorParts] = value.split('/');
    const known = byId.has(pageId);
    return { pageId: known ? pageId : homeId, anchor: known ? decodeFragment(anchorParts.join('/')) : '', invalidPage: value && !known ? decodeFragment(pageId) : '' };
  }

  function focusDestination(anchor, shouldFocus) {
    let target = anchor ? document.getElementById(anchor) : $('page-title');
    if (!target || !article.contains(target)) target = $('page-title');
    let parent = target?.parentElement;
    while (parent && parent !== article) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
    if (shouldFocus && target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
    if (anchor || shouldFocus) target?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function renderRoute(shouldFocus = false) {
    const { pageId, anchor, invalidPage } = parseRoute();
    const page = byId.get(pageId);
    if (!page) return;
    closeDiagram();
    if (pageId !== currentPage || !article.dataset.rendered || article.dataset.invalidPage !== invalidPage) {
      currentPage = pageId;
      const rendered = renderMarkdown(page.markdown, pageId);
      article.innerHTML = rendered.html;
      article.dataset.rendered = 'true';
      article.dataset.invalidPage = invalidPage;
      headingIndex = rendered.headings;
      const firstParagraph = article.querySelector('.intro + p');
      if (firstParagraph) { firstParagraph.classList.add('lede'); article.querySelector('.intro').append(firstParagraph); }
      if (pageId === homeId) {
        const status = article.querySelector('.intro + p');
        if (status?.textContent.startsWith('Current status:')) status.classList.add('callout');
        (status || article.querySelector('.intro'))?.insertAdjacentHTML('afterend', startPath());
      }
      if (invalidPage) article.querySelector('.intro')?.insertAdjacentHTML('afterend', `<aside class="callout route-warning" role="status"><p>The page “${escapeHtml(invalidPage)}” is not in this guide. Choose a page from the menu or <a href="#${escapeHtml(homeId)}">start here</a>.</p></aside>`);
      const title = $('page-title')?.textContent || page.title;
      document.title = `${title} · ${guideTitle}`;
      $('breadcrumbs').innerHTML = `<a href="#${escapeHtml(homeId)}">${escapeHtml(guideTitle)}</a><span aria-hidden="true">/</span><span>${escapeHtml(page.title)}</span>`;
      $('source-link').href = page.source;
      $('source-link').setAttribute('download', page.source.split('/').pop());
      $('source-link').setAttribute('aria-label', `Download ${page.title} as Markdown`);
      $('page-toc').innerHTML = headingIndex.filter((heading) => heading.level === 2).map((heading) => `<a href="#${pageId}/${heading.id}">${escapeHtml(heading.text)}</a>`).join('');
      $('page-outline').hidden = !headingIndex.some((heading) => heading.level === 2);
      const index = pages.indexOf(page);
      const previous = pages[index - 1];
      const next = pages[index + 1];
      $('page-pagination').innerHTML = `${previous ? `<a href="#${previous.id}"><small>← Previous</small><strong>${escapeHtml(previous.title)}</strong></a>` : ''}${next ? `<a href="#${next.id}"><small>Next →</small><strong>${escapeHtml(next.title)}</strong></a>` : ''}`;
      renderNav();
    }
    setMenu(false);
    focusDestination(anchor, shouldFocus);
    $('guide-announcement').textContent = `${page.title} page.`;
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.classList.contains('skip-link')) {
      event.preventDefault();
      closeDiagram();
      $('guide-main').focus({ preventScroll: true });
      $('guide-main').scrollIntoView({ block: 'start', behavior: 'instant' });
      return;
    }
    if (link.getAttribute('href')?.startsWith('#') && link.getAttribute('href') === location.hash && byId.has(location.hash.slice(1).split('/')[0])) {
      event.preventDefault();
      renderRoute(true);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (dialog.open) return;
    const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (event.key === '/' && !editing) {
      event.preventDefault();
      if (matchMedia('(max-width: 920px)').matches) setMenu(true);
      $('guide-search').focus();
    }
    if (event.key === 'Escape') {
      if (searchQuery) { searchQuery = ''; $('guide-search').value = ''; renderNav(); }
      else if (document.body.dataset.menuOpen === 'true') setMenu(false, true);
    }
  });
  window.addEventListener('hashchange', () => renderRoute(true));
  window.addEventListener('beforeprint', () => document.querySelectorAll('.guide-details').forEach((details) => { details.dataset.printOpen = String(details.open); details.open = true; }));
  window.addEventListener('afterprint', () => document.querySelectorAll('.guide-details').forEach((details) => { details.open = details.dataset.printOpen === 'true'; delete details.dataset.printOpen; }));

  if (pages.length) renderRoute(false);
})();
