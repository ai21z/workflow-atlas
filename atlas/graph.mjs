import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

export function mountGraph({container,labels,stage,nodes,meta,byId,categoryFor,colorFor,onSelect,onHover}) {
  const motionQuery=window.matchMedia('(prefers-reduced-motion:reduce)');
  let reduced=motionQuery.matches,rotation=false,theme='light';
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(48,1,.1,2000);
  camera.position.set(0,22,390);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=!reduced;controls.dampingFactor=.09;controls.enablePan=false;
  controls.autoRotate=false;controls.autoRotateSpeed=.45;
  controls.minDistance=65;controls.maxDistance=950;controls.rotateSpeed=.65;controls.zoomSpeed=.7;
  controls.target.set(0,8,0);
  renderer.domElement.style.cursor='grab';
  const positions=new Map([['overview',new THREE.Vector3(0,4,0)]]);
  for(const [id,m] of meta) {
    const hub=new THREE.Vector3(...m.position);positions.set(id,hub);
    const leaves=nodes.filter(n=>n.id!==id&&categoryFor(n.id)===id),count=leaves.length;
    leaves.forEach((n,i)=>{
      const phi=(i+1)*2.3999632297;
      const y=1-2*((i+.5)/count),r=Math.sqrt(1-y*y);
      positions.set(n.id,hub.clone().add(new THREE.Vector3(Math.cos(phi)*r*28,y*27,Math.sin(phi)*r*22)));
    });
  }
  const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;
  const ctx=glowCanvas.getContext('2d');const grad=ctx.createRadialGradient(64,64,0,64,64,64);
  grad.addColorStop(0,'rgba(255,255,255,.85)');grad.addColorStop(.2,'rgba(255,255,255,.3)');grad.addColorStop(.55,'rgba(255,255,255,.06)');grad.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const glowTexture=new THREE.CanvasTexture(glowCanvas);
  const sphere=new THREE.SphereGeometry(1,20,14);
  const marks=new Map(),hitObjects=[],lines=[],labelMap=new Map();
  let selected='overview',hovered=null,tween=null,visible=true,active=true,frameId;
  for(const n of nodes) {
    const hub=n.parent==='overview',core=n.id==='overview',color=new THREE.Color(colorFor(n.id));
    const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1});
    const mesh=new THREE.Mesh(sphere,material);mesh.scale.setScalar(core?5.5:hub?4:1.75);mesh.position.copy(positions.get(n.id));mesh.userData.topic=n.id;scene.add(mesh);hitObjects.push(mesh);
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,opacity:core?.8:hub?.65:.4,depthWrite:false,blending:THREE.AdditiveBlending}));
    const size=core?36:hub?30:11;glow.scale.set(size,size,1);glow.position.copy(mesh.position);scene.add(glow);
    marks.set(n.id,{mesh,glow,baseSize:mesh.scale.x});
    const button=document.createElement('button');button.type='button';button.className='graph-label'+(hub?' hub':'');button.textContent=hub?meta.get(n.id).short:core?'Atlas overview':n.title;button.setAttribute('aria-label',n.title);button.dataset.graphTopic=n.id;button.style.setProperty('--node-color',colorFor(n.id));button.hidden=true;button.addEventListener('click',()=>onSelect(n.id));labels.append(button);labelMap.set(n.id,button);
  }
  function lineBetween(a,b,category,related=false) {
    const start=positions.get(a),end=positions.get(b);if(!start||!end)return null;
    const mid=start.clone().lerp(end,.5);mid.z+=related?22:5;
    const curve=new THREE.QuadraticBezierCurve3(start,mid,end);
    const geometry=new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
    const material=related?new THREE.LineDashedMaterial({color:theme==='light'?0x38658b:0xbfe4ff,transparent:true,opacity:.75,dashSize:3,gapSize:2}):new THREE.LineBasicMaterial({color:colorFor(category),transparent:true,opacity:.2});
    const line=new THREE.Line(geometry,material);if(related)line.computeLineDistances();scene.add(line);return {line,a,b,category,related};
  }
  for(const n of nodes)if(n.parent){const item=lineBetween(n.parent,n.id,categoryFor(n.id));if(item)lines.push(item);}
  const relatedLines=[];
  const halo=new THREE.Mesh(new THREE.TorusGeometry(1,.08,8,64),new THREE.MeshBasicMaterial({color:0xe6f5ff,transparent:true,opacity:.85}));scene.add(halo);
  function overviewDistance(){return 111/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.min(camera.aspect,1)+20;}
  function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(selected==='overview'&&!tween)camera.position.set(0,22,overviewDistance());}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);resize();
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
  function pick(event){const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(hitObjects,false);return hits.find(x=>x.object.material.opacity>.25)?.object.userData.topic||null;}
  renderer.domElement.addEventListener('pointerdown',event=>{down={x:event.clientX,y:event.clientY,time:performance.now()};tween=null;});
  renderer.domElement.addEventListener('pointerup',event=>{if(down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<6&&performance.now()-down.time<600){const id=pick(event);if(id)onSelect(id);}down=null;});
  renderer.domElement.addEventListener('pointercancel',()=>{down=null;});
  renderer.domElement.addEventListener('pointermove',event=>{if(down)return;const id=pick(event);if(id!==hovered){hovered=id;onHover(id?byId.get(id):null);renderer.domElement.style.cursor=id?'pointer':'grab';}});
  renderer.domElement.addEventListener('pointerleave',()=>{hovered=null;onHover(null);});
  controls.addEventListener('start',()=>{tween=null;});
  function clearInertia(){const position=camera.position.clone(),target=controls.target.clone();controls.enableDamping=false;controls.autoRotate=false;controls.update(0);camera.position.copy(position);controls.target.copy(target);controls.update(0);}
  function motionChanged(){reduced=motionQuery.matches;rotation=false;tween=null;clearInertia();controls.enableDamping=!reduced;}
  motionQuery.addEventListener('change',motionChanged);
  labels.addEventListener('focusin',()=>{tween=null;clearInertia();refreshLabels();});
  labels.addEventListener('focusout',()=>{controls.enableDamping=!reduced;});
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;},{threshold:0});observer.observe(stage);
  function refreshLabels() {
    const w=stage.clientWidth,h=stage.clientHeight,cat=categoryFor(selected),related=selected==='overview'?[]:byId.get(selected).related;
    const focused=labels.contains(document.activeElement)?document.activeElement.dataset.graphTopic:null,candidates=[];
    const push=id=>{if(!candidates.includes(id))candidates.push(id);};
    if(focused)push(focused);if(selected!=='overview')push(selected);if(hovered)push(hovered);if(cat)push(cat);
    if(cat)nodes.filter(n=>n.id!==cat&&categoryFor(n.id)===cat).forEach(n=>push(n.id));
    related.forEach(id=>push(id));meta.forEach((_,id)=>push(id));
    if(selected==='overview')push('overview');
    const occupied=[],shown=new Set();
    for(const id of candidates) {
      const pos=positions.get(id).clone().project(camera);if((pos.z>1||pos.z< -1)&&id!==focused)continue;
      const x=(pos.x+1)*w/2,y=(1-pos.y)*h/2;
      const button=labelMap.get(id);button.hidden=false;button.classList.toggle('is-selected',id===selected);button.setAttribute('aria-pressed',String(id===selected));
      const bw=button.offsetWidth,bh=button.offsetHeight;
      const attempts=[{x,y:y-10},{x,y:y+bh+13},{x:x+bw/2+12,y:y+bh/2},{x:x-bw/2-12,y:y+bh/2}];
      let placement=null;
      for(const a of attempts){const r={left:a.x-bw/2,right:a.x+bw/2,top:a.y-bh,bottom:a.y};if(r.left<10||r.right>w-10||r.top<8||r.bottom>h-12)continue;if(occupied.some(o=>r.left<o.right+7&&r.right>o.left-7&&r.top<o.bottom+6&&r.bottom>o.top-6))continue;placement=a;occupied.push(r);break;}
      if(!placement&&id===focused){placement={x:Math.max(bw/2+10,Math.min(w-bw/2-10,x)),y:Math.max(bh+8,Math.min(h-12,y))};occupied.push({left:placement.x-bw/2,right:placement.x+bw/2,top:placement.y-bh,bottom:placement.y});}
      if(placement){button.style.left=placement.x+'px';button.style.top=placement.y+'px';shown.add(id);}else button.hidden=true;
    }
    labelMap.forEach((button,id)=>{if(!shown.has(id)&&id!==focused)button.hidden=true;});
  }
  function select(id,{instant=false}={}) {
    selected=id;const cat=categoryFor(id),related=new Set(byId.get(id).related);
    marks.forEach((m,key)=>{const same=!cat||categoryFor(key)===cat;const chosen=key===id;const strong=same||related.has(key)||key==='overview';m.mesh.material.opacity=strong?1:.27;m.glow.material.opacity=chosen?.95:same?.48:.09;m.mesh.scale.setScalar(m.baseSize*(chosen?1.2:1));});
    lines.forEach(x=>{x.line.material.opacity=!cat?(theme==='light'?.42:.23):x.category===cat?(theme==='light'?.65:.48):.075;});
    relatedLines.splice(0).forEach(x=>{scene.remove(x.line);x.line.geometry.dispose();x.line.material.dispose();});
    if(id!=='overview')byId.get(id).related.forEach(other=>{const item=lineBetween(id,other,cat,true);if(item)relatedLines.push(item);});
    halo.position.copy(positions.get(id));halo.scale.setScalar(marks.get(id).baseSize*1.65);
    const target=id==='overview'?new THREE.Vector3(0,8,0):positions.get(cat||id).clone();
    const distance=id==='overview'?overviewDistance():145/Math.min(camera.aspect,1);
    const end=target.clone().add(new THREE.Vector3(0,id==='overview'?14:9,distance));
    if(reduced||instant||labels.contains(document.activeElement)){clearInertia();camera.position.copy(end);controls.target.copy(target);controls.update(0);controls.enableDamping=!reduced&&!labels.contains(document.activeElement);tween=null;}
    else tween={from:camera.position.clone(),to:end,fromTarget:controls.target.clone(),toTarget:target,start:performance.now(),duration:650};
    refreshLabels();
  }
  let previousFrame=performance.now();
  function animate(now) {
    frameId=requestAnimationFrame(animate);const delta=Math.min(.05,(now-previousFrame)/1000);previousFrame=now;if(!active||!visible||document.hidden)return;
    if(tween){const t=Math.min(1,(now-tween.start)/tween.duration),e=t*t*(3-2*t);camera.position.lerpVectors(tween.from,tween.to,e);controls.target.lerpVectors(tween.fromTarget,tween.toTarget,e);if(t===1)tween=null;}
    controls.autoRotate=rotation&&!reduced&&!labels.contains(document.activeElement)&&!hovered&&!down&&!tween;
    controls.update(delta);halo.quaternion.copy(camera.quaternion);renderer.render(scene,camera);refreshLabels();
  }
  frameId=requestAnimationFrame(animate);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();document.querySelector('[data-view="2d"]').click();document.querySelector('[data-view="3d"]').disabled=true;document.body.dataset.graph='context-lost';});
  window.addEventListener('pagehide',event=>{if(event.persisted)return;cancelAnimationFrame(frameId);motionQuery.removeEventListener('change',motionChanged);controls.dispose();renderer.dispose();observer.disconnect();resizeObserver.disconnect();sphere.dispose();glowTexture.dispose();marks.forEach(m=>{m.mesh.material.dispose();m.glow.material.dispose();});[...lines,...relatedLines].forEach(x=>{x.line.geometry.dispose();x.line.material.dispose();});halo.geometry.dispose();halo.material.dispose();});
  return {
    select,
    setActive(value){active=value;},
    setRotation(value){rotation=Boolean(value)&&!reduced;if(!rotation){clearInertia();controls.enableDamping=!reduced&&!labels.contains(document.activeElement);}},
    setTheme(value){theme=value==='dark'?'dark':'light';marks.forEach((m,id)=>{m.mesh.material.color.set(colorFor(id));if(theme==='light')m.mesh.material.color.multiplyScalar(.58);});halo.material.color.set(theme==='light'?0x213e5e:0xe6f5ff);lines.forEach(x=>{x.line.material.color.set(colorFor(x.category));if(theme==='light')x.line.material.color.multiplyScalar(.62);x.line.material.opacity=categoryFor(selected)?x.category===categoryFor(selected)?(theme==='light'?.65:.48):.075:theme==='light'?.42:.23;});relatedLines.forEach(x=>x.line.material.color.set(theme==='light'?0x38658b:0xbfe4ff));},
    rotate(direction){tween=null;clearInertia();const offset=camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),direction*.22);camera.position.copy(controls.target).add(offset);controls.update(0);controls.enableDamping=!reduced;refreshLabels();},
    zoom(factor){tween=null;clearInertia();const offset=camera.position.clone().sub(controls.target);offset.multiplyScalar(factor);offset.clampLength(controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(offset);controls.update(0);controls.enableDamping=!reduced;refreshLabels();}
  };
}
