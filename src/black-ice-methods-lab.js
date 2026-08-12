import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadGzipBase64Parts } from './black-ice-gzip-loader.js';

const canvas=document.querySelector('#view');
const stage=document.querySelector('#stage');
const stageMessage=document.querySelector('#stage-message');
const fpsEl=document.querySelector('#fps');
const clipSelect=document.querySelector('#clip');
const noteEl=document.querySelector('#note');
const bakeProgress=document.querySelector('#bake-progress');
const bakeBar=document.querySelector('#bake-bar');

const state={mode:'live',animate:true,speed:1,zoom:1,edge:7,rough:.30,core:.78,maskSize:192,orbit:0};
let stageAspect=1,maskWidth=192,maskHeight=192;

const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.setClearColor(0x010304,1);

const camera=new THREE.PerspectiveCamera(34,1,.01,100);
const sourceScene=new THREE.Scene();
sourceScene.background=new THREE.Color(0x000000);
const whiteMaterial=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});

let model=null,mixer=null,clips=[],activeAction=null,modelRadius=1,baseDistance=5,elapsed=0,bakedTime=0;
let maskTarget=createMaskTarget(192,192);

const postScene=new THREE.Scene();
const postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const postMaterial=new THREE.ShaderMaterial({
  uniforms:{
    uMask:{value:maskTarget.texture},
    uResolution:{value:new THREE.Vector2(maskWidth,maskHeight)},
    uEdge:{value:state.edge},uRough:{value:state.rough},uCore:{value:state.core},
    uTime:{value:0},uAspect:{value:1},
  },
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader:`
    precision highp float;
    uniform sampler2D uMask;
    uniform vec2 uResolution;
    uniform float uEdge,uRough,uCore,uTime,uAspect;
    varying vec2 vUv;
    float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float m(vec2 uv){return texture2D(uMask,uv).r;}
    void main(){
      vec2 px=1.0/uResolution;
      float grain=hash(floor(vUv*vec2(74.,101.))+floor(uTime*5.));
      float wobble=(grain-.5)*uRough*4.;
      float r=max(1.,uEdge+wobble);
      float inner=m(vUv),outer=inner;
      for(int i=0;i<16;i++){
        float a=6.2831853*float(i)/16.;
        outer=max(outer,m(vUv+vec2(cos(a),sin(a))*px*r));
      }
      float edge=max(0.,outer-inner*.72);
      float chipNoise=hash(floor(vUv*vec2(121.,163.))+floor(uTime*8.));
      float chip=step(.94-uRough*.16,chipNoise)*edge*uRough;
      outer=max(0.,outer-chip*.82);

      vec2 q=vUv-.5;
      q.x*=uAspect;
      float coreField=exp(-dot(q,q)*10.5);
      float darkness=clamp(coreField*uCore,0.,.9);
      vec3 colour=vec3(1.-darkness)*outer;
      colour+=vec3(edge*.22);
      gl_FragColor=vec4(colour,1.);
    }`
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMaterial));

let proxyGroup=null;
const proxySpheres=[],proxyLinks=[];
const tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3(),tmpMid=new THREE.Vector3(),tmpDir=new THREE.Vector3(),tmpQuat=new THREE.Quaternion();
const up=new THREE.Vector3(0,1,0);

const baked={ready:false,baking:false,textures:[],directions:8,frames:8,clipIndex:-1,width:0,height:0};

function createMaskTarget(w,h){
  return new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,depthBuffer:true,stencilBuffer:false});
}
function setStageMessage(text,fade=false){
  stageMessage.textContent=text;
  stageMessage.classList.toggle('ready',fade);
}
function setModelMaskVisible(visible){
  if(!model)return;
  model.traverse(o=>{if(o.isSkinnedMesh)o.visible=visible;else if(o.isMesh)o.visible=false;});
}
function normaliseModel(root){
  const box=new THREE.Box3().setFromObject(root);
  const size=new THREE.Vector3(),center=new THREE.Vector3();
  box.getSize(size);box.getCenter(center);
  const maxDim=Math.max(size.x,size.y,size.z)||1;
  root.scale.multiplyScalar(2.2/maxDim);
  root.updateMatrixWorld(true);
  const scaledBox=new THREE.Box3().setFromObject(root);
  scaledBox.getCenter(center);
  root.position.sub(center);
  root.updateMatrixWorld(true);
  const sphere=new THREE.Sphere();
  new THREE.Box3().setFromObject(root).getBoundingSphere(sphere);
  modelRadius=Math.max(.2,sphere.radius);
  baseDistance=modelRadius/Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*2.05;
}
function prepareMaterials(root){
  root.traverse(o=>{
    if(o.isSkinnedMesh){o.material=whiteMaterial;o.frustumCulled=false;}
    else if(o.isMesh)o.visible=false;
  });
}
function clearBaked(){
  baked.ready=false;baked.clipIndex=-1;
  baked.textures.forEach(t=>t.dispose());
  baked.textures.length=0;
}
function setClip(index){
  if(!mixer||!clips.length)return;
  const next=mixer.clipAction(clips[index]);
  if(activeAction&&activeAction!==next)activeAction.fadeOut(.12);
  activeAction=next;activeAction.reset().fadeIn(.12).play();
  bakedTime=0;clearBaked();
}
function buildProxy(){
  if(!model||proxyGroup)return;
  proxyGroup=new THREE.Group();
  sourceScene.add(proxyGroup);
  const bones=[];
  model.traverse(o=>{if(o.isBone)bones.push(o);});
  const sphereGeo=new THREE.SphereGeometry(1,8,6);
  const linkGeo=new THREE.CylinderGeometry(1,1,1,8,1,false);
  for(const bone of bones){
    const sphere=new THREE.Mesh(sphereGeo,whiteMaterial);sphere.frustumCulled=false;proxyGroup.add(sphere);
    proxySpheres.push({bone,mesh:sphere});
    for(const child of bone.children){
      if(!child.isBone)continue;
      const link=new THREE.Mesh(linkGeo,whiteMaterial);link.frustumCulled=false;proxyGroup.add(link);
      proxyLinks.push({a:bone,b:child,mesh:link});
    }
  }
  proxyGroup.visible=false;
}
function updateProxy(){
  if(!proxyGroup||!model)return;
  model.updateMatrixWorld(true);
  const base=modelRadius*.045;
  for(const item of proxySpheres){
    item.bone.getWorldPosition(tmpA);item.mesh.position.copy(tmpA);
    const n=item.bone.name.toLowerCase();
    let r=base;
    if(/spine|chest|pelvis|body|root/.test(n))r*=2.05;
    else if(/head|neck/.test(n))r*=1.5;
    else if(/tail/.test(n))r*=.72;
    else if(/paw|toe|foot/.test(n))r*=.7;
    item.mesh.scale.setScalar(r);
  }
  for(const item of proxyLinks){
    item.a.getWorldPosition(tmpA);item.b.getWorldPosition(tmpB);
    const len=tmpA.distanceTo(tmpB);
    if(len<.004){item.mesh.visible=false;continue;}
    item.mesh.visible=true;
    tmpMid.copy(tmpA).add(tmpB).multiplyScalar(.5);item.mesh.position.copy(tmpMid);
    tmpDir.copy(tmpB).sub(tmpA).normalize();
    tmpQuat.setFromUnitVectors(up,tmpDir);item.mesh.quaternion.copy(tmpQuat);
    const r=base*.64;item.mesh.scale.set(r,len,r);
  }
}
function setSourceMode(mode){
  if(!model)return;
  if(mode==='proxy'){
    buildProxy();setModelMaskVisible(false);proxyGroup.visible=true;
  }else{
    if(proxyGroup)proxyGroup.visible=false;setModelMaskVisible(true);
  }
}
function rebuildMaskTarget(){
  const rect=stage.getBoundingClientRect();
  stageAspect=Math.max(.2,rect.width/Math.max(1,rect.height));
  if(stageAspect>=1){maskWidth=state.maskSize;maskHeight=Math.max(48,Math.round(state.maskSize/stageAspect));}
  else{maskHeight=state.maskSize;maskWidth=Math.max(48,Math.round(state.maskSize*stageAspect));}
  maskTarget.dispose();maskTarget=createMaskTarget(maskWidth,maskHeight);
  postMaterial.uniforms.uMask.value=maskTarget.texture;
  postMaterial.uniforms.uResolution.value.set(maskWidth,maskHeight);
  postMaterial.uniforms.uAspect.value=stageAspect;
  clearBaked();
}
function updateCamera(){
  const distance=baseDistance/state.zoom;
  camera.position.set(0,modelRadius*.10,distance);
  camera.lookAt(0,0,0);
  camera.updateProjectionMatrix();
  if(model)model.rotation.y=state.orbit;
}
function resize(){
  const rect=stage.getBoundingClientRect();
  renderer.setSize(Math.max(1,Math.round(rect.width)),Math.max(1,Math.round(rect.height)),false);
  camera.aspect=rect.width/Math.max(1,rect.height);camera.updateProjectionMatrix();
  rebuildMaskTarget();updateCamera();
}
addEventListener('resize',resize);

function renderMask(mode){
  setSourceMode(mode);
  if(mode==='proxy')updateProxy();
  renderer.setRenderTarget(maskTarget);
  renderer.setClearColor(0x000000,1);renderer.clear();renderer.render(sourceScene,camera);
  renderer.setRenderTarget(null);
}
function renderPost(texture){
  postMaterial.uniforms.uMask.value=texture;
  postMaterial.uniforms.uTime.value=elapsed;
  postMaterial.uniforms.uEdge.value=state.edge;
  postMaterial.uniforms.uRough.value=state.rough;
  postMaterial.uniforms.uCore.value=state.core;
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x010304,1);renderer.clear();renderer.render(postScene,postCamera);
}
async function bakeMethodC(){
  if(!model||!mixer||!clips.length||baked.baking)return;
  baked.baking=true;baked.ready=false;bakeProgress.hidden=false;bakeBar.style.width='0%';setStageMessage('BAKING C…');
  const clipIndex=Number(clipSelect.value||0),clip=clips[clipIndex],savedOrbit=state.orbit,savedMixerTime=mixer.time,total=baked.directions*baked.frames;
  const pixels=new Uint8Array(maskWidth*maskHeight*4);
  clearBaked();setSourceMode('live');
  baked.width=maskWidth;baked.height=maskHeight;
  for(let d=0;d<baked.directions;d++){
    for(let f=0;f<baked.frames;f++){
      state.orbit=d/baked.directions*Math.PI*2;
      mixer.setTime(clip.duration*(f/baked.frames));
      model.updateMatrixWorld(true);updateCamera();renderMask('live');
      renderer.readRenderTargetPixels(maskTarget,0,0,maskWidth,maskHeight,pixels);
      const red=new Uint8Array(maskWidth*maskHeight);
      for(let i=0,j=0;i<pixels.length;i+=4,j++)red[j]=pixels[i];
      const tex=new THREE.DataTexture(red,maskWidth,maskHeight,THREE.RedFormat,THREE.UnsignedByteType);
      tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;
      baked.textures.push(tex);
      const done=d*baked.frames+f+1;bakeBar.style.width=`${done/total*100}%`;
      await new Promise(r=>requestAnimationFrame(r));
    }
  }
  state.orbit=savedOrbit;mixer.setTime(savedMixerTime);updateCamera();
  baked.ready=true;baked.baking=false;baked.clipIndex=clipIndex;bakedTime=savedMixerTime;
  bakeProgress.hidden=true;setStageMessage('C · BAKED READY',true);
}
function bakedTexture(){
  if(!baked.ready||!baked.textures.length||!clips.length)return null;
  const angle=((state.orbit%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  const d=Math.round(angle/(Math.PI*2)*baked.directions)%baked.directions;
  const clip=clips[Number(clipSelect.value||0)];
  const f=Math.floor((bakedTime/Math.max(.001,clip.duration))*baked.frames)%baked.frames;
  return baked.textures[d*baked.frames+f];
}
function setMode(mode){
  state.mode=mode;
  document.querySelectorAll('.method').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  if(mode==='live')noteEl.textContent='A renders the full skinned panther into a low-resolution GPU mask every frame.';
  if(mode==='proxy')noteEl.textContent='B keeps the source animation bones but renders only automatic spheres and bone links into the mask.';
  if(mode==='baked'){
    noteEl.textContent='C samples 8 directions × 8 frames; playback then uses no 3D mesh render.';
    if(!baked.ready&&!baked.baking)bakeMethodC();
  }
}
document.querySelectorAll('.method').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));

function bindRange(id,key,outId,format=v=>String(v)){
  const input=document.querySelector(`#${id}`),out=document.querySelector(`#${outId}`);
  input.addEventListener('input',()=>{state[key]=Number(input.value);out.textContent=format(state[key]);if(key==='zoom')updateCamera();});
}
bindRange('speed','speed','speed-out',v=>v.toFixed(2));
bindRange('zoom','zoom','zoom-out',v=>v.toFixed(2));
bindRange('edge','edge','edge-out',v=>String(Math.round(v)));
bindRange('rough','rough','rough-out',v=>v.toFixed(2));
bindRange('core','core','core-out',v=>v.toFixed(2));
document.querySelector('#mask-size').addEventListener('change',e=>{state.maskSize=Number(e.target.value);rebuildMaskTarget();});
document.querySelector('#animate').addEventListener('click',e=>{state.animate=!state.animate;e.currentTarget.classList.toggle('active',state.animate);e.currentTarget.textContent=`ANIMATE: ${state.animate?'ON':'OFF'}`;});
document.querySelector('#bake').addEventListener('click',bakeMethodC);
document.querySelector('#reset').addEventListener('click',()=>{state.orbit=0;state.zoom=1;document.querySelector('#zoom').value='1';document.querySelector('#zoom-out').textContent='1.00';updateCamera();});
clipSelect.addEventListener('change',()=>setClip(Number(clipSelect.value)));

let pointerId=null,lastX=0,pinchDistance=null;
const touches=new Map();
stage.addEventListener('pointerdown',e=>{stage.setPointerCapture?.(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===1){pointerId=e.pointerId;lastX=e.clientX;}});
stage.addEventListener('pointermove',e=>{
  if(!touches.has(e.pointerId))return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(touches.size===1&&e.pointerId===pointerId){const dx=e.clientX-lastX;lastX=e.clientX;state.orbit+=dx*.012;updateCamera();}
  else if(touches.size===2){
    const [a,b]=Array.from(touches.values()),dist=Math.hypot(a.x-b.x,a.y-b.y);
    if(pinchDistance!=null){state.zoom=THREE.MathUtils.clamp(state.zoom*(dist/pinchDistance),.55,2.2);document.querySelector('#zoom').value=String(state.zoom);document.querySelector('#zoom-out').textContent=state.zoom.toFixed(2);updateCamera();}
    pinchDistance=dist;
  }
});
function endPointer(e){touches.delete(e.pointerId);if(touches.size<2)pinchDistance=null;if(e.pointerId===pointerId)pointerId=null;}
stage.addEventListener('pointerup',endPointer);stage.addEventListener('pointercancel',endPointer);
stage.addEventListener('wheel',e=>{e.preventDefault();state.zoom=THREE.MathUtils.clamp(state.zoom*Math.exp(-e.deltaY*.001),.55,2.2);document.querySelector('#zoom').value=String(state.zoom);document.querySelector('#zoom-out').textContent=state.zoom.toFixed(2);updateCamera();},{passive:false});

const loader=new GLTFLoader();
const PANTHER_GZIP_PARTS=4;
async function loadPantherBuffer(){
  const urls=Array.from({length:PANTHER_GZIP_PARTS},(_,i)=>`../assets/black-ice/panther-mask.gz.b64.${String(i).padStart(2,'0')}`);
  return loadGzipBase64Parts(urls);
}
function acceptPanther(gltf){
  model=gltf.scene;normaliseModel(model);prepareMaterials(model);sourceScene.add(model);
  clips=gltf.animations||[];mixer=new THREE.AnimationMixer(model);clipSelect.innerHTML='';
  clips.forEach((clip,index)=>{const o=document.createElement('option');o.value=String(index);o.textContent=clip.name||`Clip ${index+1}`;clipSelect.appendChild(o);});
  let preferred=clips.findIndex(c=>/stealth/i.test(c.name));if(preferred<0)preferred=clips.findIndex(c=>/walk/i.test(c.name));if(preferred<0)preferred=0;
  clipSelect.value=String(preferred);if(clips.length)setClip(preferred);
  updateCamera();resize();setStageMessage('READY',true);
}
setStageMessage('LOADING PANTHER…');
loadPantherBuffer()
  .then(buffer=>loader.parse(buffer,'',acceptPanther,error=>{console.error(error);setStageMessage('PANTHER PARSE FAILED');}))
  .catch(error=>{console.error(error);setStageMessage('PANTHER LOAD FAILED');});

const clock=new THREE.Clock();let fpsFrames=0,fpsTime=0;
function frame(){
  requestAnimationFrame(frame);
  const dt=Math.min(clock.getDelta(),.05);elapsed+=dt;
  if(model){
    if(state.mode==='baked'&&baked.ready){
      if(state.animate)bakedTime+=dt*state.speed;
      const tex=bakedTexture();if(tex)renderPost(tex);
    }else{
      if(mixer&&state.animate)mixer.update(dt*state.speed);
      renderMask(state.mode==='proxy'?'proxy':'live');renderPost(maskTarget.texture);
    }
  }else{renderer.setRenderTarget(null);renderer.setClearColor(0x010304,1);renderer.clear();}
  fpsFrames++;fpsTime+=dt;if(fpsTime>=.5){fpsEl.textContent=String(Math.round(fpsFrames/fpsTime));fpsFrames=0;fpsTime=0;}
}
resize();frame();