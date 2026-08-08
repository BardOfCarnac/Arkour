import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const POINT_ORDER = ['head','neckR','handR','underarmR','flankR','foot','flankL','underarmL','handL','neckL'];
const STRUCTURE_PAIRS = [['head','foot'],['handL','handR'],['underarmL','underarmR'],['neckL','flankL'],['neckR','flankR']];
const STORAGE_KEY = 'arkour-runner-pose-lab-v1';
const DEFAULT_PARAMS = Object.freeze({ length:1, width:1, depth:1, lean:0, bow:0, twist:0, taper:0, curveOffset:0, mirror:false });
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (n,a,b) => Math.max(a, Math.min(b,n));
const ease = (t) => { const u = clamp(t,0,1); return u*u*(3-2*u); };

const gallery = document.querySelector('#pose-gallery');
const snapshotGallery = document.querySelector('#snapshot-gallery');
const selectedLabel = document.querySelector('#selected-label');
const selectedMeta = document.querySelector('#selected-meta');
const variantReadout = document.querySelector('#variant-readout');
const linkToggle = document.querySelector('#link-toggle');
const ghostToggle = document.querySelector('#ghost-toggle');
const resetButton = document.querySelector('#reset');
const mirrorButton = document.querySelector('#mirror');
const nudgeButton = document.querySelector('#nudge');
const snapshotButton = document.querySelector('#snapshot');
const copyButton = document.querySelector('#copy-json');
const morphTarget = document.querySelector('#morph-target');
const morphInput = document.querySelector('#morph');
const morphOutput = document.querySelector('#morph-output');
const paramInputs = Array.from(document.querySelectorAll('[data-param]'));
const viewButtons = Array.from(document.querySelectorAll('[data-view]'));

let manifest = null;
let sources = {};
let entries = [];
let entriesById = new Map();
let snapshots = [];
let selectedId = null;
let linked = true;
let ghostOriginal = true;
let globalParams = clone(DEFAULT_PARAMS);
let perPoseParams = {};
let morphTargetId = '';
let morphAmount = 0;

function paramsFor(id) {
  if (linked) return globalParams;
  if (!perPoseParams[id]) perPoseParams[id] = clone(DEFAULT_PARAMS);
  return perPoseParams[id];
}

function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ snapshots, linked, ghostOriginal, globalParams, perPoseParams }));
  } catch (error) { console.warn('Pose Lab autosave failed', error); }
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    snapshots = Array.isArray(saved.snapshots) ? saved.snapshots : [];
    linked = saved.linked ?? linked;
    ghostOriginal = saved.ghostOriginal ?? ghostOriginal;
    globalParams = { ...clone(DEFAULT_PARAMS), ...(saved.globalParams || {}) };
    perPoseParams = saved.perPoseParams || {};
  } catch (error) { console.warn('Pose Lab autosave could not be read', error); }
}

function mirroredPose(pose) {
  const result = {};
  for (const key of POINT_ORDER) {
    const p = pose[key];
    result[key] = { x:-p.x, y:p.y, z:p.z };
  }
  return result;
}

function buildEntry(definition) {
  const source = sources[definition.source];
  if (!source) throw new Error(`Missing source ${definition.source}`);
  let pose = clone(source.poses[definition.sourcePose]);
  if (definition.derive === 'mirror-x') pose = mirroredPose(pose);
  return {
    ...definition,
    curve: source.curve,
    pose,
    sourceLabel: definition.derive ? `${definition.source} · ${definition.derive}` : `${definition.source} · ${definition.sourcePose}`,
  };
}

function blendPose(a,b,t) {
  const u = ease(t); const result = {};
  for (const key of POINT_ORDER) {
    result[key] = {
      x: a[key].x + (b[key].x-a[key].x)*u,
      y: a[key].y + (b[key].y-a[key].y)*u,
      z: a[key].z + (b[key].z-a[key].z)*u,
    };
  }
  return result;
}

function deformPose(pose, params) {
  const ys = POINT_ORDER.map((key) => pose[key].y);
  const yMin = Math.min(...ys); const yMax = Math.max(...ys);
  const center = (yMin+yMax)/2; const half = Math.max(1,(yMax-yMin)/2);
  const out = {};
  for (const key of POINT_ORDER) {
    const src = pose[key];
    const ny = clamp((src.y-center)/half,-1,1);
    let x = src.x * params.width;
    let y = center + (src.y-center) * params.length;
    let z = src.z * params.depth;
    const taperScale = Math.max(0.15, 1 + params.taper * (-ny) * 0.72);
    x *= taperScale;
    x += params.lean * ny * 68;
    z += params.bow * (1 - ny*ny);
    const angle = THREE.MathUtils.degToRad(params.twist * ny);
    const ca = Math.cos(angle); const sa = Math.sin(angle);
    const rx = x*ca - z*sa; const rz = x*sa + z*ca;
    x = params.mirror ? -rx : rx;
    z = rz;
    out[key] = { x,y,z };
  }
  return out;
}

function currentVariant(entry, forGallery=false) {
  if (!entry) return null;
  let pose = entry.pose;
  let curve = entry.curve;
  if (!forGallery && morphTargetId && morphAmount > 0) {
    const target = entriesById.get(morphTargetId);
    if (target) {
      pose = blendPose(entry.pose, target.pose, morphAmount);
      curve = entry.curve + (target.curve-entry.curve)*ease(morphAmount);
    }
  }
  const params = paramsFor(entry.id);
  return { pose: deformPose(pose, params), curve: clamp(curve + params.curveOffset, 0, 1), params };
}

function smoothContour(pose, curve, steps=6) {
  const a = POINT_ORDER.map((key)=>pose[key]); const result=[]; const n=a.length; const tension=clamp(curve,0,1);
  for (let i=0;i<n;i+=1) {
    const p0=a[(i-1+n)%n], p1=a[i], p2=a[(i+1)%n], p3=a[(i+2)%n];
    const c1={x:p1.x+(p2.x-p0.x)*tension/6,y:p1.y+(p2.y-p0.y)*tension/6,z:p1.z+(p2.z-p0.z)*tension/6};
    const c2={x:p2.x-(p3.x-p1.x)*tension/6,y:p2.y-(p3.y-p1.y)*tension/6,z:p2.z-(p3.z-p1.z)*tension/6};
    for (let s=0;s<steps;s+=1) {
      const u=s/steps, om=1-u;
      result.push({
        x:p1.x*om**3+c1.x*3*om*om*u+c2.x*3*om*u*u+p2.x*u**3,
        y:p1.y*om**3+c1.y*3*om*om*u+c2.y*3*om*u*u+p2.y*u**3,
        z:p1.z*om**3+c1.z*3*om*om*u+c2.z*3*om*u*u+p2.z*u**3,
      });
    }
  }
  return result;
}

function projectThumb(point) {
  const yaw=-0.58, pitch=0.18;
  const x1=point.x*Math.cos(yaw)-point.z*Math.sin(yaw);
  const z1=point.x*Math.sin(yaw)+point.z*Math.cos(yaw);
  const y1=point.y*Math.cos(pitch)-z1*Math.sin(pitch);
  return {x:x1,y:y1};
}
function drawThumb(canvas, entry, variantOverride=null) {
  const dpr=Math.min(devicePixelRatio||1,2); const rect=canvas.getBoundingClientRect();
  const w=Math.max(1,rect.width), h=Math.max(1,rect.height); canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
  const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  const variant=variantOverride || currentVariant(entry,true); if (!variant) return;
  const points=smoothContour(variant.pose,variant.curve,5).map(projectThumb);
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y); const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min((w-24)/Math.max(1,maxX-minX),(h-20)/Math.max(1,maxY-minY));
  const ox=w/2-(minX+maxX)/2*scale, oy=h/2-(minY+maxY)/2*scale;
  ctx.beginPath(); points.forEach((p,i)=>{const x=ox+p.x*scale,y=oy+p.y*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.closePath();
  ctx.fillStyle='rgba(85,241,220,.09)'; ctx.strokeStyle='#55f1dc'; ctx.lineWidth=1.15; ctx.fill(); ctx.stroke();
  ctx.strokeStyle='rgba(85,241,220,.25)'; ctx.lineWidth=.7;
  for (const [a,b] of STRUCTURE_PAIRS) {
    const pa=projectThumb(variant.pose[a]), pb=projectThumb(variant.pose[b]);
    ctx.beginPath(); ctx.moveTo(ox+pa.x*scale,oy+pa.y*scale); ctx.lineTo(ox+pb.x*scale,oy+pb.y*scale); ctx.stroke();
  }
}

function makeCard(entry, status=entry.status) {
  const button=document.createElement('button'); button.type='button'; button.className='pose-card'; button.dataset.id=entry.id; button.dataset.status=status || '';
  const canvas=document.createElement('canvas'); canvas.setAttribute('aria-hidden','true');
  const copy=document.createElement('span'); copy.className='card-copy';
  const title=document.createElement('strong'); title.textContent=entry.label;
  const meta=document.createElement('small'); meta.textContent=entry.sourceLabel || entry.family || 'snapshot';
  copy.append(title,meta); button.append(canvas,copy);
  button.addEventListener('click',()=>selectEntry(entry.id));
  return {button,canvas};
}

function rebuildGallery() {
  gallery.replaceChildren();
  for (const entry of entries) {
    const card=makeCard(entry); gallery.append(card.button); drawThumb(card.canvas,entry);
  }
  snapshotGallery.replaceChildren();
  for (const shot of snapshots) {
    const entry={...shot, status:'snapshot'}; const card=makeCard(entry,'snapshot'); snapshotGallery.append(card.button);
    drawThumb(card.canvas,entry,{pose:entry.pose,curve:entry.curve,params:DEFAULT_PARAMS});
  }
  markSelected();
}
function redrawThumbs() {
  for (const card of gallery.querySelectorAll('.pose-card')) {
    const entry=entriesById.get(card.dataset.id); if (entry) drawThumb(card.querySelector('canvas'),entry);
  }
}
function markSelected() {
  document.querySelectorAll('.pose-card').forEach((card)=>card.classList.toggle('selected',card.dataset.id===selectedId));
}

const canvas=document.querySelector('#lab-view');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true}); renderer.setPixelRatio(Math.min(devicePixelRatio||1,2)); renderer.setClearColor(0x000000,0);
const scene=new THREE.Scene(); scene.fog=new THREE.FogExp2(0x030506,.0017);
const camera=new THREE.PerspectiveCamera(38,1,1,1800); camera.position.set(250,70,340);
const controls=new OrbitControls(camera,canvas); controls.enableDamping=true; controls.enablePan=false; controls.target.set(0,0,0); controls.minDistance=180; controls.maxDistance=780;
const grid=new THREE.GridHelper(520,26,0x1d4b47,0x0b201f); grid.rotation.x=Math.PI/2; grid.position.z=-110; scene.add(grid);
const currentGroup=new THREE.Group(), ghostGroup=new THREE.Group(); scene.add(ghostGroup,currentGroup);

function disposeGroup(group) { while(group.children.length){const c=group.children.pop();c.geometry?.dispose();if(c.material&&!Array.isArray(c.material))c.material.dispose?.();} }
function contourGeometry(points) { const pts=points.map(p=>new THREE.Vector3(p.x,-p.y,p.z)); pts.push(pts[0].clone()); return new THREE.BufferGeometry().setFromPoints(pts); }
function structureGeometry(pose) { const pts=[]; for(const [a,b] of STRUCTURE_PAIRS){pts.push(new THREE.Vector3(pose[a].x,-pose[a].y,pose[a].z),new THREE.Vector3(pose[b].x,-pose[b].y,pose[b].z));} return new THREE.BufferGeometry().setFromPoints(pts); }
function surfaceGeometry(basePose,variantPose,curve) {
  const base=smoothContour(basePose,curve,6), variant=smoothContour(variantPose,curve,6);
  const triangles=THREE.ShapeUtils.triangulateShape(base.map(p=>new THREE.Vector2(p.x,-p.y)),[]);
  const positions=new Float32Array(variant.length*3); variant.forEach((p,i)=>{positions[i*3]=p.x;positions[i*3+1]=-p.y;positions[i*3+2]=p.z;});
  const indices=[]; triangles.forEach(t=>indices.push(...t)); const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function renderMain() {
  const entry=entriesById.get(selectedId); if(!entry)return;
  const variant=currentVariant(entry,false); disposeGroup(currentGroup); disposeGroup(ghostGroup);
  const ghostContour=smoothContour(entry.pose,entry.curve,6);
  if(ghostOriginal){
    const mat=new THREE.LineBasicMaterial({color:0x55f1dc,transparent:true,opacity:.16}); ghostGroup.add(new THREE.Line(contourGeometry(ghostContour),mat));
  }
  const fill=new THREE.MeshBasicMaterial({color:0x55f1dc,transparent:true,opacity:.11,side:THREE.DoubleSide,depthWrite:false});
  const lineMat=new THREE.LineBasicMaterial({color:0xeafffb,transparent:true,opacity:.96});
  const structMat=new THREE.LineBasicMaterial({color:0x55f1dc,transparent:true,opacity:.32});
  currentGroup.add(new THREE.Mesh(surfaceGeometry(entry.pose,variant.pose,variant.curve),fill));
  currentGroup.add(new THREE.Line(contourGeometry(smoothContour(variant.pose,variant.curve,6)),lineMat));
  currentGroup.add(new THREE.LineSegments(structureGeometry(variant.pose),structMat));
  selectedLabel.textContent=entry.label;
  selectedMeta.textContent=`${entry.sourceLabel || entry.family} · curve ${variant.curve.toFixed(2)}`;
  const active=[]; const p=variant.params;
  for(const key of ['length','width','depth','lean','bow','twist','taper','curveOffset']) if(Math.abs(p[key]-DEFAULT_PARAMS[key])>.001) active.push(key);
  if(p.mirror)active.push('mirror'); if(morphTargetId&&morphAmount>0)active.push(`morph ${Math.round(morphAmount*100)}%`);
  variantReadout.textContent=active.length?active.join(' · ').toUpperCase():'ORIGINAL';
}
function resize3d(){const r=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();}
function animate(){resize3d();controls.update();renderer.render(scene,camera);requestAnimationFrame(animate);} requestAnimationFrame(animate);

function populateMorphTargets(){morphTarget.innerHTML='<option value="">NONE</option>';for(const entry of entries){if(entry.id===selectedId)continue;const o=document.createElement('option');o.value=entry.id;o.textContent=entry.label;morphTarget.append(o);}morphTarget.value=morphTargetId;}
function selectEntry(id){if(!entriesById.has(id))return;selectedId=id;morphTargetId='';morphAmount=0;morphInput.value='0';morphOutput.textContent='0%';populateMorphTargets();syncControls();markSelected();renderMain();}
function syncControls(){const p=paramsFor(selectedId);for(const input of paramInputs){const key=input.dataset.param;input.value=String(p[key]);updateOutput(key,p[key]);}mirrorButton.classList.toggle('active',!!p.mirror);linkToggle.classList.toggle('active',linked);linkToggle.textContent=`LINK DEFORMERS: ${linked?'ON':'OFF'}`;ghostToggle.classList.toggle('active',ghostOriginal);ghostToggle.textContent=`ORIGINAL GHOST: ${ghostOriginal?'ON':'OFF'}`;}
function updateOutput(key,value){const out=document.querySelector(`[data-output="${key}"]`);if(!out)return;if(key==='twist')out.textContent=`${Math.round(value)}°`;else if(key==='bow')out.textContent=String(Math.round(value));else out.textContent=Number(value).toFixed(2);}
function onParamsChanged(){saveLocal();syncControls();renderMain();redrawThumbs();}
paramInputs.forEach(input=>input.addEventListener('input',()=>{const key=input.dataset.param;paramsFor(selectedId)[key]=Number(input.value);updateOutput(key,Number(input.value));onParamsChanged();}));

linkToggle.addEventListener('click',()=>{
  const current=clone(paramsFor(selectedId)); linked=!linked;
  if(linked)globalParams=current; else perPoseParams[selectedId]=current;
  onParamsChanged();
});
ghostToggle.addEventListener('click',()=>{ghostOriginal=!ghostOriginal;saveLocal();syncControls();renderMain();});
resetButton.addEventListener('click',()=>{if(linked)globalParams=clone(DEFAULT_PARAMS);else perPoseParams[selectedId]=clone(DEFAULT_PARAMS);morphTargetId='';morphAmount=0;morphInput.value='0';morphOutput.textContent='0%';populateMorphTargets();onParamsChanged();});
mirrorButton.addEventListener('click',()=>{paramsFor(selectedId).mirror=!paramsFor(selectedId).mirror;onParamsChanged();});
nudgeButton.addEventListener('click',()=>{const p=paramsFor(selectedId);p.length=clamp(p.length+(Math.random()-.5)*.18,.55,1.6);p.width=clamp(p.width+(Math.random()-.5)*.18,.55,1.6);p.depth=clamp(p.depth+(Math.random()-.5)*.22,.25,2);p.lean=clamp(p.lean+(Math.random()-.5)*.22,-1,1);p.bow=clamp(p.bow+(Math.random()-.5)*28,-90,90);p.twist=clamp(p.twist+(Math.random()-.5)*34,-150,150);onParamsChanged();});
morphTarget.addEventListener('change',()=>{morphTargetId=morphTarget.value;renderMain();});
morphInput.addEventListener('input',()=>{morphAmount=Number(morphInput.value);morphOutput.textContent=`${Math.round(morphAmount*100)}%`;renderMain();});

snapshotButton.addEventListener('click',()=>{
  const entry=entriesById.get(selectedId);const variant=currentVariant(entry,false);const id=`snapshot-${Date.now()}`;
  const shot={id,label:`SNAP ${snapshots.length+1} · ${entry.label}`,family:'snapshot',sourceLabel:'local snapshot',pose:clone(variant.pose),curve:variant.curve,status:'snapshot'};
  snapshots.push(shot);entriesById.set(id,shot);saveLocal();rebuildGallery();
});
copyButton.addEventListener('click',async()=>{
  const entry=entriesById.get(selectedId);const variant=currentVariant(entry,false);
  const payload={format:'arkour-runner-pose-variant',version:1,name:entry.label,sourcePose:entry.id,curve:variant.curve,morphTarget:morphTargetId||null,morphAmount,parameters:clone(variant.params),pose:variant.pose};
  try{await navigator.clipboard.writeText(JSON.stringify(payload,null,2));copyButton.textContent='COPIED';setTimeout(()=>copyButton.textContent='COPY VARIANT JSON',900);}catch(error){console.warn('Clipboard copy failed',error);}
});

viewButtons.forEach(button=>button.addEventListener('click',()=>{const view=button.dataset.view,d=390;if(view==='front')camera.position.set(0,0,d);else if(view==='side')camera.position.set(d,0,0);else if(view==='top')camera.position.set(0,d,.001);controls.target.set(0,0,0);controls.enabled=view==='orbit';controls.update();viewButtons.forEach(b=>b.classList.toggle('active',b===button));}));

async function load(){
  loadLocal();
  const manifestResponse=await fetch('./pose-lab-manifest-v1.json');if(!manifestResponse.ok)throw new Error(`Manifest ${manifestResponse.status}`);manifest=await manifestResponse.json();
  const pairs=await Promise.all(Object.entries(manifest.sources).map(async([key,url])=>{const r=await fetch(url);if(!r.ok)throw new Error(`${key} ${r.status}`);return[key,await r.json()];}));sources=Object.fromEntries(pairs);
  entries=manifest.entries.map(buildEntry);entriesById=new Map(entries.map(e=>[e.id,e]));for(const s of snapshots)entriesById.set(s.id,s);
  selectedId=entries[0].id;rebuildGallery();populateMorphTargets();syncControls();renderMain();
  addEventListener('resize',()=>{redrawThumbs();resize3d();});
}
load().catch(error=>{console.error(error);selectedLabel.textContent='POSE LAB FAILED TO LOAD';selectedMeta.textContent=String(error.message||error);});
