(() => {
  'use strict';
  const {nodes,sources}=window.TOPIC_DATA,byId=new Map(nodes.map(n=>[n.id,n])),categories=nodes.filter(n=>n.parent==='overview');
  const colors=['#77dfff','#8aaeff','#ffbf75','#b7a1ff','#68ddbd','#ff8fa8','#f0c96d','#78d5ed','#c5b8ff','#8bd8a4'];
  const names=['Workflows','Toolchain','Models & cost','Skills & roles','Requirements','Debt & coverage','Jev','Knowledge','Verification & evidence','Evaluation'];
  const positions=[[-82,49,4],[-109,-4,-9],[-74,-49,9],[-35,14,51],[-37,63,-42],[82,49,4],[109,-4,-9],[74,-49,9],[35,14,51],[37,63,-42]];
  const clusters=new Map((window.TOPIC_DATA.catalog?.clusters||[]).map(cluster=>[cluster.id,cluster]));
  const meta=new Map(categories.map((n,i)=>{const cluster=clusters.get(n.id);return [n.id,{color:cluster?.color||colors[i%10],short:cluster?.short||names[i]||n.title,position:cluster?.position||positions[i%10],index:i}];}));
  function categoryFor(id){let n=byId.get(id);const seen=new Set();while(n&&n.id!=='overview'&&!seen.has(n.id)){seen.add(n.id);if(n.parent==='overview')return n.id;n=byId.get(n.parent);}return null;}
  const colorFor=id=>meta.get(categoryFor(id))?.color||colors[0],children=id=>nodes.filter(n=>n.parent===id),descendants=id=>nodes.filter(n=>n.id!==id&&categoryFor(n.id)===id);
  const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  const topicKinds={concept:'Concept',capability:'Capability',technology:'Technology',practice:'Practice',example:'Worked example',reference:'Reference',procedure:'Procedure'};
  const kindLabel=n=>topicKinds[n.catalog?.kind]||'';
  const availableKinds=Object.keys(topicKinds).filter(kind=>nodes.some(n=>n.catalog?.kind===kind));
  document.querySelectorAll('.topic-filters').forEach(box=>{box.hidden=!availableKinds.length;const filter=box.querySelector('select');availableKinds.forEach(kind=>{const option=el('option','',topicKinds[kind]);option.value=kind;filter.append(option);});});
  // Subjects are reading shortcuts across existing clusters. They never define map homes or inference input.
  const subjects=new Map();
  for(const subject of Array.isArray(window.TOPIC_DATA.catalog?.subjects)?window.TOPIC_DATA.catalog.subjects:[]){
    if(!subject||typeof subject.id!=='string'||!/^[a-z][a-z0-9-]*$/.test(subject.id)||subjects.has(subject.id)||!['title','summary','limits'].every(key=>typeof subject[key]==='string'&&subject[key].trim())||!Array.isArray(subject.nodeIds)||!subject.nodeIds.length||new Set(subject.nodeIds).size!==subject.nodeIds.length||subject.nodeIds.some(id=>typeof id!=='string'||!byId.has(id)||id==='overview'||clusters.has(id)))continue;
    subjects.set(subject.id,{...subject,nodeIds:[...subject.nodeIds]});
  }
  document.body.dataset.subjectNavigation=String(subjects.size>0);
  document.querySelectorAll('.subject-filter').forEach(box=>{box.hidden=!subjects.size;const filter=box.querySelector('select');for(const subject of subjects.values()){const option=el('option','',subject.title);option.value=subject.id;filter.append(option);}});
  const legacyTours={
    study:{name:'Configuration service study',ids:['construct-study','study-baseline','study-quality','study-contract','study-runtime','study-economics','study-experiment','study-decision','study-ticket-wording','study-scenarios']},
    architect:{name:'Architect briefing',ids:['overview','architecture','requirements-workflow','implementation-workflow','curation-workflow','task-contract','toolchain','pilot']},
    engineering:{name:'Engineering delivery',ids:['requirement-status','traceability','impact-skill','implementation-workflow','verification-loops','post-change-checks','qa-packet','eval-metrics']},
    curation:{name:'Country-data curation',ids:['applicability','temporal-scope','wikidata-statements','jev-support','candidate-isolation','provenance','jev-shadow']},
    cost:{name:'Cost control',ids:['routing','model-prices','context-selection','eager-skills','revision-cache','budgets','cost-per-result']}
  };
  const tours=Object.create(null),collections=window.TOPIC_DATA.catalog?.collections;
  for(const collection of Array.isArray(collections)?collections:Object.entries(legacyTours).map(([id,path])=>({id,title:path.name,nodeIds:path.ids}))){
    if(!collection.id||Object.hasOwn(tours,collection.id)||!collection.title||!Array.isArray(collection.nodeIds))continue;
    const ids=[...new Set(collection.nodeIds)].filter(id=>byId.has(id));if(!ids.length)continue;
    tours[collection.id]={name:collection.title,ids};
  }
  $('tour-select').replaceChildren(el('option','','Choose a path…'));$('tour-select').firstElementChild.value='';
  Object.entries(tours).forEach(([id,path])=>{const option=el('option','',path.name);option.value=id;$('tour-select').append(option);});
  const params=new URLSearchParams(location.search),embedded=params.get('embedded')==='1';
  const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)'),initialTheme=['dark','light'].includes(params.get('theme'))?params.get('theme'):(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
  let selected='overview',mode='read',view='map',graph=null,graphPromise=null,map2d=null,mapRecord='topic:overview',tour=null,tourIndex=0,search='',topicKind='all',subjectId='',toastTimer,mapFocus=embedded,rotation=false;
  document.body.dataset.embedded=String(embedded);
  $('knowledge-back').hidden=!embedded;
  if(embedded){
    document.querySelectorAll('.brand,[data-factory-link],#atlas-count,#theme-toggle').forEach(control=>control.hidden=true);
    document.querySelector('.topbar').setAttribute('aria-label','Knowledge map tools');
    document.querySelector('.mode-nav').setAttribute('aria-label','Knowledge map reading and exploration');
  }
  function sendParent(message){if(embedded&&location.origin!=='null')window.parent.postMessage(message,location.origin);}
  function viewCanReceiveFocus(){
    if(!embedded)return true;
    const frame=window.frameElement;
    return Boolean(frame&&frame.getClientRects().length&&!frame.closest('[hidden],[inert]'));
  }
  let lastKnowledgeState='',knowledgeStateScheduled=false;
  function knowledgeState(){return {topicId:selected,mode,mapView:view};}
  function shareKnowledgeState(){
    if(!embedded||knowledgeStateScheduled)return;
    knowledgeStateScheduled=true;
    queueMicrotask(()=>{knowledgeStateScheduled=false;const state=knowledgeState(),key=JSON.stringify(state);if(key===lastKnowledgeState)return;lastKnowledgeState=key;sendParent({type:'workflow-atlas:knowledge-state',...state});});
  }
  let practiceContext=null;
  const readerPractice=el('div','practice-slot');readerPractice.id='reader-practice';readerPractice.hidden=true;document.querySelector('.reader-heading').append(readerPractice);
  const mapActions=el('div','map-selection-actions'),mapPractice=el('div','practice-slot');mapPractice.id='map-practice';mapPractice.hidden=true;$('read-selection').before(mapActions);mapActions.append(mapPractice,$('read-selection'));
  function acceptedPracticeContext(data){
    if(typeof data?.projectName!=='string'||data.projectName.length>200||!Array.isArray(data.actions)||data.actions.length>10)return null;
    const seen=new Set(),actions=[];
    for(const action of data.actions){
      if(!action||typeof action.topicId!=='string'||!byId.has(action.topicId)||seen.has(action.topicId)||typeof action.id!=='string'||!/^[a-z][a-z0-9:-]{1,80}$/.test(action.id)||typeof action.title!=='string'||!action.title.trim()||action.title.length>200||typeof action.reason!=='string'||action.reason.length>2000||typeof action.alreadyApplied!=='boolean')return null;
      seen.add(action.topicId);actions.push({topicId:action.topicId,id:action.id,title:action.title,reason:action.reason,alreadyApplied:action.alreadyApplied});
    }
    return {projectName:data.projectName,actions};
  }
  function renderPracticeLinks(){
    const action=practiceContext?.actions.find(action=>action.topicId===selected);
    for(const [slot,compact] of [[readerPractice,false],[mapPractice,true]]){
      slot.replaceChildren();slot.hidden=!action||(slot===mapPractice&&view==='map'&&mapRecord!==`topic:${selected}`);if(!action)continue;
      const card=el('div','practice-link'+(compact?' practice-link-compact':''));card.setAttribute('role','group');card.setAttribute('aria-label','Guidance for '+(practiceContext.projectName||'the current workflow'));
      card.append(el('span','practice-project','FOR '+(practiceContext.projectName||'THE CURRENT WORKFLOW')),el('strong','practice-title',action.title));
      if(!compact)card.append(el('p','practice-reason',action.reason));
      const button=el('button','practice-review',action.alreadyApplied?'Already included':'Review for my workflow');button.type='button';button.disabled=action.alreadyApplied;button.dataset.practiceRequest=action.id;button.dataset.practiceTopic=action.topicId;
      if(compact)button.title=action.reason;
      card.append(button,el('span','practice-boundary',action.alreadyApplied?'Recorded in your project decisions.':'Preview the changes before adding this practice.'));
      slot.append(card);
    }
  }
  function restorePracticeFocus(data){
    requestAnimationFrame(()=>{
      if(!viewCanReceiveFocus())return;
      const slot=mode==='explore'?mapPractice:readerPractice;
      const button=slot.querySelector('[data-practice-request]');
      if(selected===data.topicId&&button&&!button.disabled&&button.dataset.practiceRequest===data.actionId){button.focus({preventScroll:true});return;}
      (mode==='explore'?(view==='map'?$('map-record-title'):$('read-selection')):mode==='sources'?$('source-title'):$('reader-title')).focus({preventScroll:true});
    });
  }
  $('knowledge-back').addEventListener('click',()=>sendParent({type:'workflow-atlas:close-knowledge'}));
  const expanded=new Set(),readableText=new Map(nodes.map(n=>[n.id,[n.title,n.summary,...n.sections.map(s=>[s.label,s.text,...(s.items||[]),...(s.headers||[]),...(s.rows||[]).flat()].filter(Boolean).join(' ')),...n.refs.map(r=>sources[r]?.[0]||'')].join(' ')]));
  const searchText=new Map(nodes.map(n=>[n.id,[readableText.get(n.id),...(n.catalog?.aliases||[]),...(n.catalog?.domains||[])].join(' ')]));
  const sourceUses=new Map(Object.keys(sources).map(key=>[key,nodes.filter(n=>n.refs.includes(key))])),sourceTypes={guidance:'Documentation & guidance',standards:'Standards & frameworks',research:'Research',code:'Code repository',video:'Video'};
  function sourceType(url){
    const {hostname,pathname}=new URL(url);
    if(hostname==='youtu.be'||/^(?:[^.]+\.)*youtube\.com$/.test(hostname))return 'video';
    if(hostname==='github.com'||hostname==='www.github.com')return 'code';
    if(/^(?:[^.]+\.)*(?:nist\.gov|w3\.org|rfc-editor\.org|ietf\.org)$/.test(hostname)||hostname==='agentskills.io'&&/^\/specification\/?$/.test(pathname))return 'standards';
    if(/^(?:[^.]+\.)*(?:arxiv\.org|acm\.org|doi\.org)$/.test(hostname)||hostname==='research.google'&&/^\/pubs(?:\/|$)/.test(pathname))return 'research';
    return 'guidance';
  }
  function topicButton(n,cls='topic-button',label){const b=el('button',cls,label||n.title);b.type='button';b.dataset.topic=n.id;if(n.id===selected)b.setAttribute('aria-current','page');b.style.setProperty('--node-color',colorFor(n.id));return b;}
  function navChildren(parent){const group=el('div','category-children');children(parent).forEach(n=>{group.append(topicButton(n));if(children(n.id).length)group.append(navChildren(n.id));});return group;}
  function renderNav(){const q=search.toLocaleLowerCase().trim(),subject=subjects.get(subjectId),membership=subject?new Set(subject.nodeIds):null,result=q||topicKind!=='all'||subject?nodes.filter(n=>(!membership||membership.has(n.id))&&(topicKind==='all'||n.catalog?.kind===topicKind)&&(!q||searchText.get(n.id).toLocaleLowerCase().includes(q))).sort((a,b)=>q?Number(b.title.toLocaleLowerCase().includes(q))-Number(a.title.toLocaleLowerCase().includes(q)):subject?subject.nodeIds.indexOf(a.id)-subject.nodeIds.indexOf(b.id):0):null;
    $('nav-heading').textContent=result?q?'Search results':subject?'Subject topics':'Topics by type':'Topic clusters';$('nav-count').textContent=result?`${result.length} found`:categories.length;$('topic-search-count').textContent=result?`${result.length} matching topic${result.length===1?'':'s'}${subject?' · '+subject.title:''}${topicKind==='all'?'':' · '+topicKinds[topicKind]}`:`Browse ${categories.length} clusters or search all ${nodes.length} topics.`;document.querySelectorAll('[data-clear-topics]').forEach(button=>{button.hidden=!result;button.setAttribute('aria-label','Clear topic search and filters');});
    for(const id of ['subject-context','mobile-subject-context']){const box=$(id);box.replaceChildren();box.hidden=!subject;if(subject)box.append(el('p','',subject.summary),el('p','subject-limits','Coverage: '+subject.limits));}
    for(const id of ['topic-search','mobile-search']){$(id).placeholder=subject?'Search in this subject…':'Search all topics…';$(id).setAttribute('aria-label',subject?'Search topics in '+subject.title:'Search all topics');}
    $('topic-search-help').textContent=subject?'Search within this subject. Choose a result to read its guidance, or clear filters to browse all topics.':'Search names, aliases or subject areas. Choose a result to read its guidance, or browse by topic type.';
    for(const target of [$('topic-nav'),$('mobile-nav')]){const scroll=target.scrollTop;target.replaceChildren();
      if(result){if(!result.length)target.append(el('p','empty-search',subject?'No topics match these filters. Clear filters or choose another subject.':'No matching topics. Try another term or choose All types.'));result.forEach(n=>{const b=topicButton(n,'search-result');b.replaceChildren(el('small','',[meta.get(categoryFor(n.id))?.short||'Overview',kindLabel(n)].filter(Boolean).join(' · ')),el('strong','',n.title));const prose=readableText.get(n.id),match=q?prose.toLocaleLowerCase().indexOf(q):-1,text=match>=0?prose:n.summary,start=Math.max(0,match-35);b.append(el('span','result-excerpt',(start?'…':'')+text.slice(start,start+135)+(text.length>start+135?'…':'')),el('span','search-result-action','Read topic →'));b.dataset.openReading='true';b.setAttribute('aria-label',n.title+'. '+(kindLabel(n)?kindLabel(n)+'. ':'')+'Read topic');target.append(b);});}
      else categories.forEach(n=>{const d=el('details','nav-cluster');d.open=expanded.has(n.id)||categoryFor(selected)===n.id;const s=el('summary');s.style.setProperty('--node-color',colorFor(n.id));s.append(el('span','color-dot'),el('span','category-name',meta.get(n.id).short),el('small','category-count',descendants(n.id).length));d.append(s);const group=navChildren(n.id);group.prepend(topicButton(n,'topic-button cluster-overview','Cluster overview'));d.append(group);d.addEventListener('toggle',()=>{if(d.open)expanded.add(n.id);else expanded.delete(n.id);});target.append(d);});target.scrollTop=scroll;
    }document.querySelectorAll('.nav-home,.nav-study,.mobile-shortcuts [data-topic]').forEach(b=>{if(b.dataset.topic===selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  }
  function heading(id,label,box){const h=el('h2','',label);h.id=id;h.tabIndex=-1;box.append(h);const a=el('a','',label);a.href='#'+id;a.dataset.section=id;$('page-toc').append(a);}
  function renderScope(n){
    const details=$('topic-scope'),content=$('topic-scope-content');details.open=false;content.replaceChildren();
    for(const [label,value] of [['Applies when',n.catalog?.applicability],['Limits',n.catalog?.limits]])if(typeof value==='string'&&value.trim())content.append(el('dt','',label),el('dd','',value));
    const sourceStatus=n.catalog?.sourceStatus,reviewText=sourceStatus==='legacy'?'References retained. This catalogue migration did not recheck their claims.':sourceStatus==='reviewed'?`Scoped claims reviewed${n.catalog.reviewedOn?' on '+n.catalog.reviewedOn:''}.${n.catalog.reviewedOn&&Date.now()-Date.parse(n.catalog.reviewedOn)>(window.TOPIC_DATA.catalog?.reviewCycleDays||180)*86400000?' Reviewed more than '+(window.TOPIC_DATA.catalog?.reviewCycleDays||180)+' days ago.':''} Fit for your project remains unverified.`:sourceStatus==='needs-review'?'Illustrative or unreviewed guidance. Confirm fit and supporting evidence.':'';
    if(reviewText)content.append(el('dt','','Source review'),el('dd','',reviewText));
    for(const claim of n.catalog?.claims||[]){
      if(typeof claim.text!=='string'||!claim.text.trim())continue;
      const detail=el('dd','scope-claim');detail.append(el('p','',claim.text));const links=el('div','scope-claim-sources');
      for(const sourceId of claim.sourceRefs||[]){const source=sources[sourceId];if(!source)continue;const link=el('a','',source[0]+' ↗');link.href=source[1];link.target='_blank';link.rel='noopener noreferrer';links.append(link);}
      if(links.childElementCount)detail.append(links);content.append(el('dt','',claim.sectionLabel?'Claim: '+claim.sectionLabel:'Scoped source claim'),detail);
    }
    if(n.catalog?.guidance==='selectable')content.append(el('dt','','Project use'),el('dd','','Available for project review when applicable. Review the proposed changes before adding it to your workflow.'));
    details.hidden=!content.childElementCount;
  }
  function renderHome(){const root=$('quick-start');root.replaceChildren();root.hidden=selected!=='overview';if(root.hidden)return;
    const start=el('section','study-feature');start.append(el('span','overline','START WITH THE PROCESS'),el('h2','','Connect steps, outputs and checks'),el('p','','Learn what happens next when work passes, needs correction or must stop. Use these patterns to guide your own workflow design.'));
    const startActions=el('div','feature-actions');startActions.append(topicButton(byId.get('workflow-patterns'),'primary-button','Read workflow patterns →'),topicButton(byId.get('requirements-workflow'),'text-button','Start with requirements →'));start.append(startActions);root.append(start);
    if(subjects.size){const section=el('section','home-section');section.id='subject-browse';section.append(el('h2','','Browse a subject'),el('p','','Pick a subject, then choose what to read. These groups reuse topics from across the map.'));const choices=el('div','subject-grid');for(const subject of subjects.values()){const button=el('button','subject-card');button.type='button';button.dataset.subject=subject.id;button.append(el('strong','',subject.title),el('span','',subject.summary),el('small','',`${subject.nodeIds.length} topic${subject.nodeIds.length===1?'':'s'} · Browse topics →`));choices.append(button);}section.append(choices);root.append(section);}
    const section=el('section','home-section');section.append(el('span','overline','THE DEVELOPMENT LIFECYCLE'),el('h2','','From requirements to production'),el('p','','Find guidance for each part of delivery. Adapt the checks and examples to your project.'));const lifecycle=el('div','lifecycle');[['requirements-workflow','Requirements'],['architecture-decisions','Architecture'],['work-breakdown','Breakdown'],['implementation-workflow','Development'],['verification-loops','Verification'],['release-operations','Release & operations']].forEach(([id,label],i)=>{const b=topicButton(byId.get(id),'lifecycle-stop',label);b.prepend(el('small','',String(i+1).padStart(2,'0')));lifecycle.append(b);});section.append(lifecycle);root.append(section);
    if(Object.keys(tours).length){const guided=el('section','home-section');guided.append(el('span','overline','CONNECTED READING'),el('h2','','Follow a guided path'));const choices=el('div','guided-path-grid');Object.entries(tours).forEach(([id,path])=>{const button=el('button','guided-path-choice');button.type='button';button.dataset.tour=id;button.append(el('strong','',path.name),el('span','',`${path.ids.length} topics · Start path →`));choices.append(button);});guided.append(choices);root.append(guided);}
    const card=el('section','study-feature');card.append(el('span','overline','A WORKED CASE STUDY'),el('h2','','A decision-ready feasibility study'),el('p','','Use the configuration service example to understand an engineer-run process, assess quality and costs, then recommend what a build phase should do. Adapt the guidance to your own project.'));
    const chips=el('div','feature-tags');['Study, before build','Configuration service','Evidence → decision'].forEach(x=>chips.append(el('span','',x)));card.append(chips);const actions=el('div','feature-actions');actions.append(topicButton(byId.get('construct-study'),'primary-button','Open the ticket study →'));const t=el('button','text-button','Take the guided path →');t.type='button';t.dataset.tour='study';actions.append(t);card.append(actions);root.append(card);
    const path=el('div','study-path');[['study-baseline','01','Baseline'],['study-quality','02','Output quality'],['study-contract','03','Service shape'],['study-economics','04','Economics'],['study-decision','05','Decision']].forEach(([id,num,title])=>{const b=topicButton(byId.get(id),'path-stop');b.replaceChildren(el('span','',num),el('strong','',title));path.append(b);});root.append(path);
    const clusters=el('section','home-section');clusters.append(el('span','overline','EXPLORE THE MAP'),el('h2','','Ten connected topic clusters'));const grid=el('div','cluster-grid');categories.forEach(n=>{const b=topicButton(n,'cluster-card');b.replaceChildren(el('span','cluster-number',String(meta.get(n.id).index+1).padStart(2,'0')),el('strong','',n.title),el('span','',`${descendants(n.id).length} topics · Open cluster →`));grid.append(b);});clusters.append(grid);root.append(clusters);
  }
  function renderReader(){const n=byId.get(selected),cat=categoryFor(selected);$('reader').style.setProperty('--category',colorFor(selected));const chain=[];let p=n;while(p){chain.unshift(p);p=byId.get(p.parent);}const crumbs=$('breadcrumbs');crumbs.replaceChildren();chain.slice(0,-1).forEach(x=>crumbs.append(topicButton(x,'breadcrumb-button',x.id==='overview'?'All topics':meta.get(x.id)?.short||x.title),el('span','','/')));crumbs.append(el('span','breadcrumb-current',selected==='overview'?'Overview':cat===selected?meta.get(cat).short:'Topic'));
    $('reader-kicker').textContent=selected==='overview'?'KNOWLEDGE ATLAS':selected==='construct-study'||n.parent==='construct-study'?'REFERENCE TO CONFIGURATION · WORKED CASE STUDY':n.parent==='overview'?'TOPIC CLUSTER':meta.get(cat)?.short;
    $('reader-title').textContent=n.title;$('reader-summary').textContent=n.summary;const metadata=$('reader-meta');metadata.replaceChildren(el('span','basis-badge',n.basis),el('span','confidence-label','Confidence: '+n.confidence));if(kindLabel(n))metadata.prepend(el('span','topic-kind-badge',kindLabel(n)));if(n.refs.length){const a=el('a','evidence-shortcut',`${n.refs.length} source${n.refs.length===1?'':'s'} ↓`);a.href='#source-evidence';a.dataset.section='source-evidence';metadata.append(a);}renderScope(n);
    $('page-toc').replaceChildren();renderHome();const content=$('reader-content');content.replaceChildren();if(selected==='construct-study'){const path=el('div','study-chapter-links');children(selected).forEach((x,i)=>{const b=topicButton(x,'chapter-link');b.prepend(el('span','',String(i+1).padStart(2,'0')));path.append(b);});content.append(path);}if(selected==='study-contract'){const flow=el('section','study-flow');flow.append(el('span','overline','ILLUSTRATIVE FLOW TO ASSESS'));const steps=el('div','flow-steps');[['study-baseline','Describe / import'],['study-runtime','Generate a draft'],['study-quality','Validate the output'],['study-decision','Accept the artifact']].forEach(([id,label],i)=>{const b=topicButton(byId.get(id),'flow-stop',label);b.prepend(el('small','',String(i+1).padStart(2,'0')+' →'));steps.append(b);});flow.append(steps,el('p','','Saving, applying and executing are separate actions. Accepting a generated artifact does not, by itself, authorize activation.'));content.append(flow);}
    n.sections.forEach((s,i)=>{const box=el('section','content-section');heading('section-'+i,s.label,box);if(s.type==='p')box.append(el('p','',s.text));if(s.type==='code'){const pre=el('pre');pre.append(el('code','',s.text));box.append(pre);}if(s.type==='list'||s.type==='steps'){const list=el(s.type==='steps'?'ol':'ul');s.items.forEach(x=>list.append(el('li','',x)));box.append(list);}if(s.type==='table'){const wrap=el('div','table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',s.label+' table; scroll horizontally if needed');const table=el('table'),head=el('thead'),tr=el('tr');s.headers.forEach(x=>{const th=el('th','',x);th.scope='col';tr.append(th);});head.append(tr);const body=el('tbody');s.rows.forEach(row=>{const r=el('tr');row.forEach((v,j)=>{const cell=el(j?'td':'th','',v);if(!j)cell.scope='row';r.append(cell);});body.append(r);});table.append(head,body);wrap.append(table);box.append(wrap);}content.append(box);});
    const src=$('reader-sources');src.replaceChildren();src.hidden=!n.refs.length;if(n.refs.length){heading('source-evidence','Source evidence',src);src.append(el('p','section-intro','Read the original material behind this topic. Recommendations and project assumptions still need local validation.'));n.refs.forEach(key=>{const [title,url]=sources[key];const a=el('a','source-link');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.append(el('span','source-domain',new URL(url).hostname),el('strong','',title),el('span','source-arrow','↗'));src.append(a);});}
    const rel=$('reader-related');rel.replaceChildren();const connected=[...new Set([...children(selected).map(x=>x.id),...n.related])];rel.hidden=!connected.length;if(connected.length){heading('connected-topics','Connected topics',rel);const links=el('div','related-links');connected.forEach(id=>{if(byId.has(id))links.append(topicButton(byId.get(id),'related-link'));});rel.append(links);}
    const foot=$('reader-next');foot.replaceChildren();const study=tours.study?.ids||[],seq=study.includes(selected)?study:cat?[cat,...descendants(cat).map(x=>x.id)]:[],at=seq.indexOf(selected);if(at>0){const b=topicButton(byId.get(seq[at-1]),'continue-button');b.prepend(el('small','','← Previous topic'));foot.append(b);}if(at>=0&&at<seq.length-1){const b=topicButton(byId.get(seq[at+1]),'continue-button');b.prepend(el('small','','Next topic →'));foot.append(b);}document.title=n.title+' · Workflow Atlas';renderPracticeLinks();
  }
  function renderFlat(){const cat=categoryFor(selected),shown=cat?[byId.get(cat),...descendants(cat)]:categories,root=$('flat-map');root.replaceChildren();root.classList.toggle('cluster-overview',!cat);shown.forEach(n=>{const b=topicButton(n,'map-card');b.replaceChildren(el('span','map-card-category',[n.parent==='overview'?'CLUSTER':meta.get(categoryFor(n.id)).short.toUpperCase(),kindLabel(n)].filter(Boolean).join(' · ')),el('strong','',n.title),el('span','',n.summary));root.append(b);});renderMapIndex();}
  function renderMapIndex(){const list=$('map-topic-list');list.replaceChildren();if(view==='map'){for(const record of mapRecords.values()){const button=el('button','map-list-button',record.title+' · '+mapKindLabel(record));button.type='button';button.dataset.mapRecord=record.ref;list.append(button);}document.querySelector('.map-index summary').textContent=`Browse all ${mapRecords.size} map nodes as a list`;}else{nodes.forEach(n=>list.append(topicButton(n,'map-list-button')));document.querySelector('.map-index summary').textContent=`Browse all ${nodes.length} topics as a list`;}}
  function mapHeading(){const cat=categoryFor(selected),n=byId.get(selected);$('map-eyebrow').textContent=view==='map'?'TOPICS, PRACTICES AND TECHNOLOGIES':cat?'FOCUSED KNOWLEDGE CLUSTER':'TEN CONNECTED KNOWLEDGE CLUSTERS';$('map-title').textContent=view!=='map'&&cat?byId.get(cat).title:'Explore the Knowledge Atlas';$('map-current-title').textContent=n.title;['read-map-topic','read-selection'].forEach(id=>$(id).setAttribute('aria-label','Read topic: '+n.title));$('map-selection-title').textContent=n.title;$('map-selection-summary').textContent=n.summary;$('map-selection-evidence').textContent=`${kindLabel(n)?kindLabel(n)+' · ':''}${n.basis} · Confidence: ${n.confidence} · ${n.refs.length} linked source${n.refs.length===1?'':'s'}`;}
  const mapRecords=new Map(nodes.map(node=>[`topic:${node.id}`,{ref:`topic:${node.id}`,kind:'topic',title:node.title,summary:node.summary,topicId:node.id,sourceRefs:node.refs,reviewedOn:node.catalog?.reviewedOn||'',reviewed:node.catalog?.sourceStatus==='reviewed'}]));
  for(const definition of window.TOPIC_DATA.catalog?.definitions||[]){if(!['practice','technology'].includes(definition.type))continue;mapRecords.set(definition.ref,{...definition,title:definition.label,kind:definition.type,topicId:definition.explainedBy?.replace(/^topic:/,'')||null,reviewed:Boolean(definition.reviewedOn)});}
  const mapKindLabel=record=>record.kind==='topic'?'Guide':record.kind==='practice'?'Practice':'Technology';
  function mapReadingTarget(record){
    if(record.topicId&&byId.has(record.topicId))return {id:record.topicId,label:record.kind==='topic'?'Read topic':'Read explanation'};
    const connected=[...mapNeighbours(record.ref,false).values()].flatMap(item=>item.relations);
    for(const relation of connected){
      const other=relation.from===record.ref?relation.to:relation.to===record.ref?relation.from:null,topic=mapRecords.get(other);
      if(topic?.kind!=='topic')continue;
      if(relation.from===record.ref&&relation.type==='explained-by'||relation.to===record.ref&&relation.type==='explains')return {id:topic.topicId,label:'Read explanation'};
    }
    for(const relation of connected){
      const other=relation.from===record.ref?relation.to:relation.to===record.ref?relation.from:null,topic=mapRecords.get(other);
      if(topic?.kind==='topic'&&(relation.type==='uses-definition'&&relation.to===record.ref||relation.type==='used-by'&&relation.from===record.ref))return {id:topic.topicId,label:'Read related guide'};
    }
    return null;
  }
  function connectionMeaning(relation){
    const forward=relation.from===mapRecord,pairs={
      'browse-under':['In this topic group','Topic in this group'],'browses':['Topic in this group','In this topic group'],
      'part-of':['Part of this item','Contains this item'],'has-part':['Contains this item','Part of this item'],
      'applies-to':['Applies to this item','Guidance that applies here'],'applied-by':['Guidance that applies here','Applies to this item'],
      'requires':['Requires this item','Required by this item'],'required-by':['Required by this item','Requires this item'],
      'explained-by':['Explained by this guide','Explains this item'],'explains':['Explains this item','Explained by this guide'],
      'uses-definition':['Uses this definition','Used by this guide'],'used-by':['Used by this guide','Uses this definition'],
      'provides-capability':['Provides this capability','Capability of this item'],'capability-of':['Capability of this item','Provides this capability'],
      'illustrates':['Illustrates this item','Illustrated by this example'],'illustrated-by':['Illustrated by this example','Illustrates this item'],
      'example-of':['Example of this item','Has this example'],'has-example':['Has this example','Example of this item'],
      'broader-concept':['Has this broader concept','Has this more specific concept'],'narrower-concept':['Has this more specific concept','Has this broader concept']
    };
    if(relation.type==='related-reading')return 'Related reading';
    if(relation.type==='works-with')return 'Works with this item';
    return pairs[relation.type]?.[forward?0:1]||`${forward?'Links to':'Linked from'} this item: ${relation.type.replaceAll('-',' ')}`;
  }
  function mapNeighbours(recordRef,filtered=true){
    const neighbours=new Map();
    for(const edge of mapConnectionEdges()){
      if(!edge||!['structure','applies','reading'].includes(edge.family)||filtered&&!mapFamilyEnabled(edge.family)||edge.from!==recordRef&&edge.to!==recordRef)continue;
      const id=edge.from===recordRef?edge.to:edge.from,other=mapRecords.get(id);
      if(!other||id===recordRef||!Array.isArray(edge.relations))continue;
      const valid=edge.relations.filter(relation=>relation&&typeof relation.type==='string'&&((relation.from===recordRef&&relation.to===id)||(relation.to===recordRef&&relation.from===id)));
      if(!valid.length)continue;
      if(!neighbours.has(id))neighbours.set(id,{record:other,relations:[]});
      const explicit=valid.filter(relation=>!relation.derived);
      neighbours.get(id).relations.push(...(explicit.length?explicit:valid));
    }
    return neighbours;
  }
  function focusMapSelection(){const title=$('map-selected-name');title.scrollIntoView({block:'center',behavior:'instant'});title.focus({preventScroll:true});}
  function focusMapDetails(){const title=$('map-record-title');title.scrollIntoView({block:'start',behavior:'instant'});title.focus({preventScroll:true});}
  function renderMapFinder(){
    const query=$('map-find-search').value.toLocaleLowerCase().trim();
    const terms=query.match(/[\p{L}\p{N}]+/gu)||[];
    const matchesText=value=>{const text=value.toLocaleLowerCase(),words=text.match(/[\p{L}\p{N}]+/gu)||[];return terms.length?terms.every(term=>words.some(word=>term.length<=3?word===term:word.startsWith(term))):text.includes(query);};
    const matches=[...mapRecords.values()].map(record=>{
      const title=record.title.toLocaleLowerCase(),aliases=[...(record.aliases||[]),...(byId.get(record.topicId)?.catalog?.aliases||[])].join(' '),text=[record.title,record.summary,aliases,record.topicId?searchText.get(record.topicId)||'':''].join(' ');
      return {record,score:title===query?3:query&&matchesText(title)?2:query&&matchesText(aliases)?1.5:1,match:!query||matchesText(text)};
    }).filter(item=>item.match).sort((a,b)=>b.score-a.score||a.record.title.localeCompare(b.record.title)||a.record.kind.localeCompare(b.record.kind));
    $('map-find-count').textContent=`${matches.length} of ${mapRecords.size} map items${query?' match':' available'}`;
    const list=$('map-find-results');list.replaceChildren();
    for(const {record} of matches){
      const button=el('button','map-find-result');button.type='button';button.dataset.mapFindRecord=record.ref;
      button.setAttribute('aria-label',`Show ${record.title} on map. ${mapKindLabel(record)}`);
      button.append(el('small','',mapKindLabel(record)),el('strong','',record.title),el('span','',record.summary||(mapReadingTarget(record)?'Catalogue record with a linked guide.':'Catalogue name. No guide is recorded yet.')),el('span','map-find-action','Show on map →'));
      list.append(button);
    }
    if(!matches.length)list.append(el('p','empty-search','No map items match. Try a shorter name or clear the search to browse every item.'));
  }
  function openMapFinder(){renderMapFinder();if(!$('map-find-dialog').open)$('map-find-dialog').showModal();$('map-find-search').focus();}
  function mapFamilyEnabled(family){return Boolean($('map-family-'+family)?.checked);}
  function mapConnectionEdges(){
    const projected=window.TOPIC_DATA.catalog?.layout2d?.edges;
    if(Array.isArray(projected))return projected;
    if(projected!==undefined)return [];
    const recorded=window.TOPIC_DATA.catalog?.edges;
    return (Array.isArray(recorded)?recorded:[]).filter(edge=>edge&&typeof edge.type==='string').map(edge=>({...edge,family:['browse-under','browses','part-of','has-part'].includes(edge.type)?'structure':['applies-to','applied-by','requires','required-by'].includes(edge.type)?'applies':'reading',relations:[edge]}));
  }
  function renderMapRecord(){
    const record=mapRecords.get(mapRecord);if(!record)return;
    $('map-record-kind').textContent=record.kind==='topic'?'READING TOPIC':record.kind==='practice'?'WORKFLOW PRACTICE':'TECHNOLOGY NAME';
    $('map-record-title').textContent=record.title;$('map-record-summary').textContent=record.summary||(mapReadingTarget(record)?'A catalogue record with a linked guide. Open the guide for context.':'A catalogue name. No explanatory guide is recorded yet.');
    const count=(record.sourceRefs||[]).length,review=record.kind==='topic'?(record.reviewed&&record.reviewedOn?'Reviewed '+record.reviewedOn:'No claim review recorded'):(record.reviewedOn?'Record reviewed '+record.reviewedOn:'No record review date');
    $('map-record-evidence').textContent=`${review}. ${count} linked source${count===1?'':'s'}. Source links do not establish correctness.`;
    const sourceLinks=$('map-record-source-links');sourceLinks.replaceChildren();$('map-record-sources').hidden=!count;for(const id of record.sourceRefs||[]){const source=sources[id];if(!source)continue;const link=el('a','',source[0]+' ↗');link.href=source[1];link.target='_blank';link.rel='noopener noreferrer';sourceLinks.append(link);}
    const reading=mapReadingTarget(record);$('map-record-read').hidden=!reading;$('map-record-read').textContent=(reading?.label||'Read topic')+' →';$('map-record-read').setAttribute('aria-label',(reading?.label||'Read topic')+': '+record.title);
    const neighbours=mapNeighbours(mapRecord),allNeighbours=mapNeighbours(mapRecord,false);
    $('map-selected-kind').textContent=mapKindLabel(record)+(record.kind!=='topic'&&!reading?' · No guide recorded':'');$('map-selected-kind').title=$('map-selected-kind').textContent;$('map-selected-name').textContent=record.title;$('map-selected-name').title=record.title;
    $('map-open-details').textContent=`Details and connections (${neighbours.size})`;
    const list=$('map-neighbours');list.replaceChildren();
    for(const {record:other,relations} of [...neighbours.values()].sort((a,b)=>a.record.title.localeCompare(b.record.title))){
      const item=el('li'),button=el('button','map-neighbour');button.type='button';button.dataset.mapRecord=other.ref;
      button.append(el('strong','',other.title),el('span','',mapKindLabel(other)+' · '+[...new Set(relations.map(connectionMeaning))].join('. ')));
      if(relations.some(relation=>relation.status==='needs-review'))button.append(el('span','map-relation-warning','Connection needs review'));
      item.append(button);
      const details=el('details','map-relation-details');details.append(el('summary','','Why connected?'));
      for(const relation of relations){
        const fromRecord=mapRecords.get(relation.from),toRecord=mapRecords.get(relation.to),from=fromRecord?`${fromRecord.title} (${mapKindLabel(fromRecord)})`:relation.from,to=toRecord?`${toRecord.title} (${mapKindLabel(toRecord)})`:relation.to;
        const description=el('div','map-relation-note');description.append(el('p','',`${from} → ${relation.type.replaceAll('-',' ')} → ${to}`),el('p','',relation.status==='needs-review'?'Needs review.':relation.status?`Recorded status: ${relation.status}.`:'No relationship review status recorded.'));
        if(relation.note)description.append(el('p','',relation.note));
        for(const id of Array.isArray(relation.sourceRefs)?relation.sourceRefs:[]){const source=sources[id];if(!source)continue;const link=el('a','',source[0]+' ↗');link.href=source[1];link.target='_blank';link.rel='noopener noreferrer';description.append(link);}
        if(!Array.isArray(relation.sourceRefs)||!relation.sourceRefs.length)description.append(el('p','','No sources recorded for this relationship.'));
        details.append(description);
      }
      item.append(details);list.append(item);
    }
    if(!neighbours.size){
      const item=el('li','map-no-neighbours',allNeighbours.size?'Connections are hidden by the current filters.':record.kind==='topic'?'No connections to other map items are recorded.':'Catalogue name only. No connections to other map items are recorded yet.');
      if(allNeighbours.size){const show=el('button','map-show-connections','Show all connection groups');show.type='button';show.addEventListener('click',()=>{for(const family of ['structure','applies','reading']){$('map-family-'+family).checked=true;map2d?.setFamily(family,true);}renderMapRecord();});item.append(show);}
      list.append(item);
    }
  }
  function syncMapSubject(){
    const choice=$('map-subject'),subject=subjects.get(subjectId);choice.value=subjectId;choice.closest('.map-subject-choice').hidden=!subjects.size;
    $('map-subject-context').textContent=subject?`${subject.title}: ${subject.nodeIds.length} article${subject.nodeIds.length===1?'':'s'} highlighted. ${subject.limits} All nodes remain available.`:'Choose a subject to highlight its articles. All nodes remain available.';
    map2d?.setSubject(subject?.nodeIds||null);
  }
  function selectMapRecord(ref,{focus=false,recenter=false}={}){
    const record=mapRecords.get(ref);if(!record)return;mapRecord=ref;
    if(record.kind==='topic')select(record.topicId,{focus:false,fromMap:true});else{map2d?.select(ref);renderMapRecord();renderPracticeLinks();updateState();$('selection-announcement').textContent='Selected '+record.title;}
    if(recenter)map2d?.select(ref,{recenter:true});
    if(focus)focusMapDetails();
  }
  function ensureMap2D(){
    if(map2d)return map2d;if(document.body.dataset.map2d==='unavailable')return null;
    try{if(typeof window.mountAtlas2D!=='function')throw new Error('Map renderer unavailable');map2d=window.mountAtlas2D({container:$('map-2d'),data:window.TOPIC_DATA,byId,colors:Object.fromEntries([...meta].map(([id,entry])=>[id,entry.color])),onSelect:ref=>selectMapRecord(ref),onEscape:focusMapDetails});if(!map2d)throw new Error('Map layout unavailable');document.body.dataset.map2d='ready';map2d.setTheme(document.body.dataset.theme);map2d.select(mapRecord);syncMapSubject();renderMapRecord();return map2d;}
    catch{document.body.dataset.map2d='unavailable';const button=document.querySelector('[data-view="map"]');button.disabled=true;button.title='This catalogue has no supported 2D layout. Topic cards remain available.';if(view==='map')setView('2d');toast('2D map unavailable. Browse the topic cards or topic list.');return null;}
  }
  for(const subject of subjects.values()){const option=el('option','',subject.title);option.value=subject.id;$('map-subject').append(option);}
  function updateState(){window.ATLAS_STATE={selected,category:categoryFor(selected),mode,view,mapRecord,tour:tour?.name||null,topics:nodes.length,sources:Object.keys(sources).length,embedded,mapFocus,theme:document.body.dataset.theme,rotation,reducedMotion:reducedMotion.matches,topicKind,subjectId};shareKnowledgeState();}
  function clearTopicFilters(){search='';topicKind='all';subjectId='';$('topic-search').value=$('mobile-search').value='';$('topic-kind').value=$('mobile-topic-kind').value='all';$('topic-subject').value=$('mobile-subject').value='';renderNav();syncMapSubject();updateState();}
  function chooseSubject(id,{fromCard=false}={}){subjectId=subjects.has(id)?id:'';if(fromCard){search='';topicKind='all';$('topic-search').value=$('mobile-search').value='';$('topic-kind').value=$('mobile-topic-kind').value='all';}$('topic-subject').value=$('mobile-subject').value=subjectId;renderNav();syncMapSubject();updateState();if(fromCard){if(innerWidth<=1000||mode==='explore'&&mapFocus){if(!$('topics-dialog').open)$('topics-dialog').showModal();$('mobile-subject').focus();}else{$('topic-subject').focus();$('topic-subject').scrollIntoView({block:'nearest'});}}}
  function focusReader(){if(!viewCanReceiveFocus())return;$('reader-title').focus({preventScroll:true});$('reader').scrollIntoView({block:'start',behavior:'instant'});}
  function select(id,options={}){if(!byId.has(id))id='overview';if(tour&&!options.fromTour)exitTour();selected=id;mapRecord=`topic:${id}`;renderNav();renderReader();renderFlat();mapHeading();graph?.select(id);map2d?.select(mapRecord,{recenter:mode==='explore'&&!options.fromMap&&!options.fromHash});renderMapRecord();if(!options.fromHash&&location.hash.slice(1)!==id)history[embedded?'replaceState':'pushState']({topic:id},'', '#'+id);if($('topics-dialog').open)$('topics-dialog').close();if(mode==='sources')setMode('read',false);if(options.focus!==false){if(mode==='read')focusReader();else if(view==='map')focusMapSelection();else $('read-map-topic').focus({preventScroll:true});}$('selection-announcement').textContent='Selected '+byId.get(id).title;updateState();}
  function ensureGraph(){if(graphPromise)return graphPromise;$('map-loading').hidden=false;graphPromise=import('./graph.mjs').then(({mountGraph})=>{graph=mountGraph({container:$('scene-canvas'),labels:$('scene-labels'),stage:$('graph-stage'),nodes,meta,byId,categoryFor,colorFor,onSelect:id=>select(id,{focus:false}),onHover:n=>{$('hover-caption').hidden=!n;if(n)$('hover-caption').textContent=n.title;}});graph.setTheme(document.body.dataset.theme);graph.setRotation(rotation);graph.select(selected,{instant:true});graph.setActive(mode==='explore'&&view==='3d');$('map-loading').hidden=true;document.body.dataset.graph='ready';}).catch(()=>{$('map-loading').hidden=true;document.body.dataset.graph='fallback';document.querySelector('[data-view="3d"]').disabled=true;setView('2d');toast('3D is unavailable here. Browse every topic with the topic cards or topic list.');});return graphPromise;}
  function setView(next){
    if(!['map','2d','3d'].includes(next))return;view=next;document.body.dataset.mapView=view;
    $('scene-canvas').hidden=view!=='3d';$('scene-labels').hidden=view!=='3d';$('flat-map').hidden=view!=='2d';$('map-2d').hidden=view!=='map';$('map-2d-controls').hidden=view!=='map';$('map-record-panel').hidden=view!=='map';$('map-selection-bar').hidden=view!=='map';document.querySelector('.map-selection').hidden=view==='map';document.querySelector('.map-current-topic').hidden=view==='map';$('map-reset').hidden=view!=='map';
    document.querySelector('.map-intro').textContent=view==='map'?'Find an item or select a node. Open its details to read the guidance and connections.':'Choose a node to see its connections. Details and reading links appear below the map.';
    const navigation=view==='map'?$('map2d-navigation'):document.querySelector('.map-actions');for(const id of ['zoom-out','zoom-in','map-reset'])navigation.append($(id));$('overview-button').hidden=view==='map';
    ['rotate-left','rotate-right','map-rotation'].forEach(id=>$(id).hidden=view!=='3d');['zoom-in','zoom-out'].forEach(id=>$(id).hidden=view==='2d');
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));graph?.setActive(mode==='explore'&&view==='3d');map2d?.setActive(mode==='explore'&&view==='map');
    if(view==='map')$('map-record-panel').firstElementChild.append(mapPractice);else mapActions.prepend(mapPractice);renderPracticeLinks();
    $('map-hint').textContent=view==='3d'?'Drag to rotate. Use + / − to zoom. Tab to topic buttons, or browse the full topic list.':view==='map'?'Drag the background to pan. Use + / − or hold Control while scrolling to zoom. Fit map returns to all nodes. Keyboard: arrows pan, Home fits, Enter selects.':'Select a card to explore its cluster. The full topic list is below.';
    document.querySelector('.map-legend').textContent=view==='map'?'Circle: guide. Rounded square: practice. Hexagon: technology. Short guide lines join headings to their groups. Lines show connections involving your selection. Arrows follow recorded directions. Related reading and works with have no arrows. Solid: structure. Dashed: applies. Dotted: reading. Open Why connected? for each meaning, review status and sources. Connections are not executed workflows or proof of correctness.':'Solid lines group topics. Dashed lines connect related topics. These connections do not represent executed workflows or verified evidence.';
    if(mode==='explore'&&view==='3d')ensureGraph();else $('map-loading').hidden=true;
    if(mode==='explore'&&view==='map'){const mounted=ensureMap2D();if(!mounted)return;mounted.setActive(true);}
    mapHeading();syncMapSubject();renderMapRecord();renderMapIndex();updateState();
  }
  function setMapFocus(value){mapFocus=value;document.body.dataset.mapFocus=String(mapFocus);$('map-focus').setAttribute('aria-expanded',String(!mapFocus));$('map-focus').textContent=mapFocus?'Show reading panel ↙':'Focus map ↗';$('reading-layout').hidden=mode==='sources'||mode==='explore'&&mapFocus;updateState();}
  function setRotation(value){rotation=Boolean(value)&&!reducedMotion.matches;graph?.setRotation(rotation);$('map-rotation').textContent=rotation?'Pause rotation':'Start rotation';$('map-rotation').disabled=reducedMotion.matches;$('map-rotation').title=reducedMotion.matches?'Automatic rotation is off because reduced motion is enabled':'Rotation pauses while a topic button has keyboard focus';updateState();}
  function setMode(next,focus=true){mode=next;document.body.dataset.mode=mode;document.querySelectorAll('.mode-nav [data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));$('landscape').hidden=mode!=='explore';$('source-library').hidden=mode!=='sources';$('reading-layout').hidden=mode==='sources'||mode==='explore'&&mapFocus;if(mode==='explore'){setView(view);renderFlat();if(focus)$('landscape').scrollIntoView({block:'start',behavior:'instant'});}else{graph?.setActive(false);map2d?.setActive(false);if(mode==='sources'){renderSources();if(focus){$('source-title').focus({preventScroll:true});$('source-library').scrollIntoView({block:'start',behavior:'instant'});}}else if(focus)focusReader();}updateState();}
  function renderSources(){const q=$('source-search').value.toLocaleLowerCase().trim(),filter=$('source-filter').value,root=$('source-cards');root.replaceChildren();const entries=Object.entries(sources).filter(([,v])=>(filter==='all'||sourceType(v[1])===filter)&&(v[0]+' '+new URL(v[1]).hostname).toLocaleLowerCase().includes(q));$('source-count').textContent=`${entries.length} of ${Object.keys(sources).length} sources`;if(!entries.length)root.append(el('p','empty-search','No matching sources. Try another term or source type.'));entries.forEach(([key,[title,url]])=>{const card=el('article','source-card');card.append(el('span','overline',sourceTypes[sourceType(url)]));const a=el('a','source-card-title',title+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';card.append(a,el('p','source-domain',new URL(url).hostname));const uses=sourceUses.get(key),list=el('div','source-topic-links');list.append(el('small','',`Used in ${uses.length} topic${uses.length===1?'':'s'}`));uses.slice(0,3).forEach(n=>list.append(topicButton(n,'source-topic')));if(uses.length>3){const d=el('details','source-more');d.append(el('summary','',`Show ${uses.length-3} more`));uses.slice(3).forEach(n=>d.append(topicButton(n,'source-topic')));list.append(d);}card.append(list);root.append(card);});}
  function tourOffset(){document.documentElement.style.setProperty('--tour-offset',$('tour-bar').hidden?'0px':($('tour-bar').getBoundingClientRect().height+25)+'px');}
  function showTourStep(){setMode('read',false);select(tour.ids[tourIndex],{fromTour:true});$('tour-bar').hidden=false;$('tour-name').textContent=tour.name;$('tour-step').textContent=`${tourIndex+1} / ${tour.ids.length} · ${byId.get(tour.ids[tourIndex]).title}`;$('tour-previous').disabled=tourIndex===0;$('tour-next').textContent=tourIndex===tour.ids.length-1?'Finish':'Next →';tourOffset();}
  function startTour(key){if(!tours[key])return;tour=tours[key];tourIndex=0;showTourStep();}function exitTour(){const restore=$('tour-bar').contains(document.activeElement);tour=null;$('tour-bar').hidden=true;tourOffset();updateState();if(restore)focusReader();}
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
  document.addEventListener('click',event=>{const b=event.target.closest('[data-topic],[data-tour],[data-section],[data-subject],[data-map-record]');if(!b)return;if(b.dataset.mapRecord)selectMapRecord(b.dataset.mapRecord,{focus:true,recenter:true});else if(b.dataset.topic){if(b.dataset.openReading==='true')setMode('read',false);select(b.dataset.topic);}else if(b.dataset.tour)startTour(b.dataset.tour);else if(b.dataset.subject)chooseSubject(b.dataset.subject,{fromCard:true});else{event.preventDefault();const dest=$(b.dataset.section);dest?.scrollIntoView({block:'start',behavior:'instant'});dest?.focus({preventScroll:true});}});
  document.querySelectorAll('.mode-nav [data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  ['topic-search','mobile-search'].forEach(id=>$(id).addEventListener('input',e=>{search=e.target.value;$('topic-search').value=$('mobile-search').value=search;renderNav();}));
  ['topic-kind','mobile-topic-kind'].forEach(id=>$(id).addEventListener('change',e=>{topicKind=e.target.value;$('topic-kind').value=$('mobile-topic-kind').value=topicKind;renderNav();updateState();}));document.querySelectorAll('[data-clear-topics]').forEach(button=>button.addEventListener('click',()=>{clearTopicFilters();($('topics-dialog').open?$('mobile-search'):$('topic-search')).focus();}));
  ['topic-subject','mobile-subject'].forEach(id=>$(id).addEventListener('change',e=>chooseSubject(e.target.value)));
  $('map-subject').addEventListener('change',e=>chooseSubject(e.target.value));
  ['structure','applies','reading'].forEach(family=>$('map-family-'+family).addEventListener('change',e=>{map2d?.setFamily(family,e.target.checked);renderMapRecord();}));
  $('map-reset').addEventListener('click',()=>map2d?.reset());
  $('map-record-read').addEventListener('click',()=>{const record=mapRecords.get(mapRecord),reading=record&&mapReadingTarget(record);if(reading){setMode('read',false);select(reading.id);}});
  $('map-find').addEventListener('click',openMapFinder);$('close-map-find').addEventListener('click',()=>$('map-find-dialog').close());$('map-find-search').addEventListener('input',renderMapFinder);
  $('map-find-results').addEventListener('click',event=>{const button=event.target.closest('[data-map-find-record]');if(!button)return;$('map-find-dialog').close();selectMapRecord(button.dataset.mapFindRecord,{recenter:true});focusMapSelection();});
  $('map-open-details').addEventListener('click',focusMapDetails);$('map-return').addEventListener('click',focusMapSelection);
  $('map-find-dialog').addEventListener('click',event=>{if(event.target!==event.currentTarget)return;const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.currentTarget.close();});
  $('source-search').addEventListener('input',renderSources);$('source-filter').addEventListener('change',renderSources);
  $('mobile-topics').addEventListener('click',()=>{$('topics-dialog').showModal();$('mobile-search').focus();});$('close-topics').addEventListener('click',()=>$('topics-dialog').close());$('topics-dialog').addEventListener('click',e=>{if(e.target===$('topics-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  $('start-tour').addEventListener('click',()=>{const key=$('tour-select').value;if(key)startTour(key);else $('tour-select').focus();});$('tour-previous').addEventListener('click',()=>{if(tourIndex>0){tourIndex--;showTourStep();}});$('tour-next').addEventListener('click',()=>{if(tourIndex<tour.ids.length-1){tourIndex++;showTourStep();}else{exitTour();toast('Path complete. Explore connected topics or review the sources.');}});$('tour-exit').addEventListener('click',exitTour);
  ['read-map-topic','read-selection'].forEach(id=>$(id).addEventListener('click',()=>setMode('read')));$('overview-button').addEventListener('click',()=>{select('overview',{focus:false});if(view==='map')map2d?.reset();});$('zoom-in').addEventListener('click',()=>view==='map'?map2d?.zoom(1.25):graph?.zoom(.8));$('zoom-out').addEventListener('click',()=>view==='map'?map2d?.zoom(.8):graph?.zoom(1.25));$('rotate-left').addEventListener('click',()=>graph?.rotate(-1));$('rotate-right').addEventListener('click',()=>graph?.rotate(1));$('map-focus').addEventListener('click',()=>setMapFocus(!mapFocus));$('map-rotation').addEventListener('click',()=>setRotation(!rotation));reducedMotion.addEventListener('change',()=>setRotation(false));document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();setMode('read',false);select('overview');});document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();setMode('read',false);focusReader();});
  $('copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);toast('Topic link copied');}catch{toast('Copy this topic’s link from the address bar.');}});
  function setTheme(theme,notify=false){if(!['light','dark'].includes(theme))return;document.body.dataset.theme=theme;$('theme-toggle').setAttribute('aria-checked',String(theme==='dark'));graph?.setTheme(theme);map2d?.setTheme(theme);updateState();if(notify)sendParent({type:'workflow-atlas:theme',theme});}
  $('theme-toggle').addEventListener('click',()=>setTheme(document.body.dataset.theme==='dark'?'light':'dark',true));setTheme(initialTheme);
  window.addEventListener('message',event=>{
    if(!embedded||event.origin!==location.origin||event.source!==window.parent)return;
    const data=event.data;
    if(data?.type==='workflow-atlas:theme'&&['light','dark'].includes(data.theme))setTheme(data.theme);
    if(data?.type==='workflow-atlas:knowledge-open'){
      if(data.topicId!==undefined&&(typeof data.topicId!=='string'||!byId.has(data.topicId)))return;
      if(data.mode!==undefined&&!['read','explore','sources'].includes(data.mode))return;
      if(data.mapView!==undefined&&!['map','2d','3d'].includes(data.mapView))return;
      if(data.focus!==undefined&&typeof data.focus!=='boolean')return;
      const readingChanged=data.topicId!==undefined&&data.topicId!==selected||data.mode!==undefined&&data.mode!==mode;
      if(data.topicId!==undefined&&data.topicId!==selected){select(data.topicId,{fromHash:true,focus:false});if(location.hash.slice(1)!==data.topicId)history.replaceState({topic:data.topicId},'','#'+data.topicId);}
      if(data.mapView!==undefined&&data.mapView!==view)setView(data.mapView);
      if(readingChanged)setMode(data.mode||mode,data.focus===true);
      sendParent({type:'workflow-atlas:knowledge-ready',...knowledgeState()});
    }
    if(data?.type==='workflow-atlas:practice-context'){practiceContext=acceptedPracticeContext(data);renderPracticeLinks();}
    if(data?.type==='workflow-atlas:practice-review-closed')restorePracticeFocus(data);
  });
  document.addEventListener('click',event=>{const button=event.target.closest('[data-practice-request]');if(!button||button.disabled)return;const action=practiceContext?.actions.find(action=>action.topicId===selected&&action.topicId===button.dataset.practiceTopic&&action.id===button.dataset.practiceRequest&&!action.alreadyApplied);if(action)sendParent({type:'workflow-atlas:practice-request',actionId:action.id,topicId:action.topicId});});
  function hashTopic(){let id='overview';try{id=decodeURIComponent(location.hash.slice(1))||id;}catch{}return byId.has(id)?id:'overview';}window.addEventListener('hashchange',()=>select(hashTopic(),{fromHash:true}));window.addEventListener('popstate',()=>{if(hashTopic()!==selected)select(hashTopic(),{fromHash:true});});
  document.addEventListener('keydown',e=>{if($('map-find-dialog').open)return;if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.activeElement.isContentEditable){e.preventDefault();if(mode==='sources')$('source-search').focus();else if(mode==='explore'&&view==='map')openMapFinder();else if(innerWidth<=1000||mode==='explore'&&mapFocus){if(!$('topics-dialog').open)$('topics-dialog').showModal();$('mobile-search').focus();}else $('topic-search').focus();}if(e.key!=='Escape'||$('topics-dialog').open||document.activeElement.tagName==='SELECT')return;if(search||topicKind!=='all'||subjectId){e.preventDefault();clearTopicFilters();return;}if(mode==='sources'&&$('source-search').value){e.preventDefault();$('source-search').value='';renderSources();return;}if(embedded){e.preventDefault();sendParent({type:'workflow-atlas:close-knowledge'});}});
  new ResizeObserver(tourOffset).observe($('tour-bar'));
  $('atlas-count').textContent=`${nodes.length} topics · ${Object.keys(sources).length} sources`;setMapFocus(mapFocus);setRotation(false);setView(view);select(hashTopic(),{fromHash:true,focus:false});setMode(['read','explore','sources'].includes(params.get('view'))?params.get('view'):embedded?'explore':'read',false);
  sendParent({type:'workflow-atlas:knowledge-ready',...knowledgeState()});
})();
