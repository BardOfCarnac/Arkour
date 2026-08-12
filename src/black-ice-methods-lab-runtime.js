import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#view');
const stage = $('#stage');
const stageMessage = $('#stage-message');
const fpsEl = $('#fps');
const clipSelect = $('#clip');
const noteEl = $('#note');
const bakeProgress = $('#bake-progress');
const bakeBar = $('#bake-bar');

const state = {
  mode: 'live',
  animate: true,
  speed: 1,
  zoom: 1,
  edge: 7,
  rough: 0.30,
  core: 0.78,
  maskSize: 192,
  orbit: 0,
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x010304, 1);

const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
const sourceScene = new THREE.Scene();
sourceScene.background = new THREE.Color(0x000000);
const whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

let model = null;
let mixer = null;
let clips = [];
let activeAction = null;
let modelRadius = 1;
let baseDistance = 5;
let elapsed = 0;
let bakedTime = 0;
let stageAspect = 1;
let maskWidth = 192;
let maskHeight = 192;

function makeTarget(width, height) {
  return new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  });
}
let maskTarget = makeTarget(maskWidth, maskHeight);

const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uMask: { value: maskTarget.texture },
    uResolution: { value: new THREE.Vector2(maskWidth, maskHeight) },
    uEdge: { value: state.edge },
    uRough: { value: state.rough },
    uCore: { value: state.core },
    uTime: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D uMask;
    uniform vec2 uResolution;
    uniform float uEdge;
    uniform float uRough;
    uniform float uCore;
    uniform float uTime;
    uniform float uAspect;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float maskAt(vec2 uv) { return texture2D(uMask, uv).r; }

    void main() {
      vec2 px = 1.0 / uResolution;
      float grain = hash(floor(vUv * vec2(74.0, 101.0)) + floor(uTime * 5.0));
      float radius = max(1.0, uEdge + (grain - 0.5) * uRough * 4.0);
      float inner = maskAt(vUv);
      float outer = inner;

      for (int i = 0; i < 16; i++) {
        float a = 6.2831853 * float(i) / 16.0;
        outer = max(outer, maskAt(vUv + vec2(cos(a), sin(a)) * px * radius));
      }

      float edgeBand = max(0.0, outer - inner * 0.72);
      float chipNoise = hash(floor(vUv * vec2(121.0, 163.0)) + floor(uTime * 8.0));
      float chip = step(0.94 - uRough * 0.16, chipNoise) * edgeBand * uRough;
      outer = max(0.0, outer - chip * 0.82);

      // The centre is deliberately a tonal field, not a second readable animal silhouette.
      vec2 q = vUv - vec2(0.5);
      q.x *= uAspect;
      float coreField = exp(-dot(q, q) * 10.5);
      float darkness = clamp(coreField * uCore, 0.0, 0.90);

      vec3 colour = vec3(1.0 - darkness) * outer;
      colour += vec3(edgeBand * 0.22);
      gl_FragColor = vec4(colour, 1.0);
    }
  `,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));

let proxyGroup = null;
const proxySpheres = [];
const proxyLinks = [];
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpMid = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

const baked = {
  ready: false,
  baking: false,
  textures: [],
  directions: 8,
  frames: 8,
};

function message(text, fade = false) {
  stageMessage.textContent = text;
  stageMessage.classList.toggle('ready', fade);
}

function clearBaked() {
  baked.ready = false;
  baked.textures.forEach((texture) => texture.dispose());
  baked.textures.length = 0;
}

function normaliseModel(root) {
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  let box = new THREE.Box3().setFromObject(root);
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  root.scale.multiplyScalar(2.2 / maxDim);
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  box.getCenter(center);
  root.position.sub(center);
  root.updateMatrixWorld(true);
  const sphere = new THREE.Sphere();
  new THREE.Box3().setFromObject(root).getBoundingSphere(sphere);
  modelRadius = Math.max(0.2, sphere.radius);
  baseDistance = modelRadius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 2.05;
}

function prepareMaskModel(root) {
  root.traverse((object) => {
    if (object.isSkinnedMesh) {
      object.material = whiteMaterial;
      object.frustumCulled = false;
    } else if (object.isMesh) {
      // The source GLB is already stripped, but keep this defensive guard so only the skinned animal becomes ICE.
      object.visible = false;
    }
  });
}

function showFullMesh(visible) {
  if (!model) return;
  model.traverse((object) => {
    if (object.isSkinnedMesh) object.visible = visible;
  });
}

function setClip(index) {
  if (!mixer || !clips.length) return;
  const next = mixer.clipAction(clips[index]);
  if (activeAction && activeAction !== next) activeAction.fadeOut(0.12);
  activeAction = next;
  activeAction.reset().fadeIn(0.12).play();
  bakedTime = 0;
  clearBaked();
}

function buildProxy() {
  if (!model || proxyGroup) return;
  proxyGroup = new THREE.Group();
  sourceScene.add(proxyGroup);
  const bones = [];
  model.traverse((object) => { if (object.isBone) bones.push(object); });
  const sphereGeometry = new THREE.SphereGeometry(1, 8, 6);
  const linkGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);

  for (const bone of bones) {
    const sphere = new THREE.Mesh(sphereGeometry, whiteMaterial);
    sphere.frustumCulled = false;
    proxyGroup.add(sphere);
    proxySpheres.push({ bone, mesh: sphere });
    for (const child of bone.children) {
      if (!child.isBone) continue;
      const link = new THREE.Mesh(linkGeometry, whiteMaterial);
      link.frustumCulled = false;
      proxyGroup.add(link);
      proxyLinks.push({ a: bone, b: child, mesh: link });
    }
  }
  proxyGroup.visible = false;
}

function updateProxy() {
  if (!proxyGroup || !model) return;
  model.updateMatrixWorld(true);
  const base = modelRadius * 0.045;

  for (const item of proxySpheres) {
    item.bone.getWorldPosition(tmpA);
    item.mesh.position.copy(tmpA);
    const name = item.bone.name.toLowerCase();
    let radius = base;
    if (/spine|chest|pelvis|body|root/.test(name)) radius *= 2.05;
    else if (/head|neck/.test(name)) radius *= 1.5;
    else if (/tail/.test(name)) radius *= 0.72;
    else if (/paw|toe|foot/.test(name)) radius *= 0.70;
    item.mesh.scale.setScalar(radius);
  }

  for (const item of proxyLinks) {
    item.a.getWorldPosition(tmpA);
    item.b.getWorldPosition(tmpB);
    const length = tmpA.distanceTo(tmpB);
    if (length < 0.004) {
      item.mesh.visible = false;
      continue;
    }
    item.mesh.visible = true;
    tmpMid.copy(tmpA).add(tmpB).multiplyScalar(0.5);
    item.mesh.position.copy(tmpMid);
    tmpDir.copy(tmpB).sub(tmpA).normalize();
    tmpQuat.setFromUnitVectors(up, tmpDir);
    item.mesh.quaternion.copy(tmpQuat);
    const radius = base * 0.64;
    item.mesh.scale.set(radius, length, radius);
  }
}

function setSourceMode(mode) {
  if (!model) return;
  if (mode === 'proxy') {
    buildProxy();
    showFullMesh(false);
    proxyGroup.visible = true;
  } else {
    if (proxyGroup) proxyGroup.visible = false;
    showFullMesh(true);
  }
}

function rebuildMaskTarget() {
  const rect = stage.getBoundingClientRect();
  stageAspect = Math.max(0.2, rect.width / Math.max(1, rect.height));
  if (stageAspect >= 1) {
    maskWidth = state.maskSize;
    maskHeight = Math.max(48, Math.round(state.maskSize / stageAspect));
  } else {
    maskHeight = state.maskSize;
    maskWidth = Math.max(48, Math.round(state.maskSize * stageAspect));
  }
  maskTarget.dispose();
  maskTarget = makeTarget(maskWidth, maskHeight);
  postMaterial.uniforms.uMask.value = maskTarget.texture;
  postMaterial.uniforms.uResolution.value.set(maskWidth, maskHeight);
  postMaterial.uniforms.uAspect.value = stageAspect;
  clearBaked();
}

function updateCamera() {
  const distance = baseDistance / state.zoom;
  camera.position.set(0, modelRadius * 0.10, distance);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  if (model) model.rotation.y = state.orbit;
}

function resize() {
  const rect = stage.getBoundingClientRect();
  renderer.setSize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)), false);
  camera.aspect = rect.width / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
  rebuildMaskTarget();
  updateCamera();
}
addEventListener('resize', resize);

function renderMask(mode) {
  setSourceMode(mode);
  if (mode === 'proxy') updateProxy();
  renderer.setRenderTarget(maskTarget);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(sourceScene, camera);
  renderer.setRenderTarget(null);
}

function renderPost(texture) {
  postMaterial.uniforms.uMask.value = texture;
  postMaterial.uniforms.uTime.value = elapsed;
  postMaterial.uniforms.uEdge.value = state.edge;
  postMaterial.uniforms.uRough.value = state.rough;
  postMaterial.uniforms.uCore.value = state.core;
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x010304, 1);
  renderer.clear();
  renderer.render(postScene, postCamera);
}

async function bakeC() {
  if (!model || !mixer || !clips.length || baked.baking) return;
  baked.baking = true;
  clearBaked();
  bakeProgress.hidden = false;
  bakeBar.style.width = '0%';
  message('BAKING C…');

  const clip = clips[Number(clipSelect.value || 0)];
  const savedOrbit = state.orbit;
  const savedTime = mixer.time;
  const total = baked.directions * baked.frames;
  const pixels = new Uint8Array(maskWidth * maskHeight * 4);
  setSourceMode('live');

  for (let direction = 0; direction < baked.directions; direction += 1) {
    for (let frame = 0; frame < baked.frames; frame += 1) {
      state.orbit = direction / baked.directions * Math.PI * 2;
      mixer.setTime(clip.duration * (frame / baked.frames));
      model.updateMatrixWorld(true);
      updateCamera();
      renderMask('live');
      renderer.readRenderTargetPixels(maskTarget, 0, 0, maskWidth, maskHeight, pixels);
      const red = new Uint8Array(maskWidth * maskHeight);
      for (let i = 0, j = 0; i < pixels.length; i += 4, j += 1) red[j] = pixels[i];
      const texture = new THREE.DataTexture(red, maskWidth, maskHeight, THREE.RedFormat, THREE.UnsignedByteType);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      baked.textures.push(texture);
      const complete = direction * baked.frames + frame + 1;
      bakeBar.style.width = `${complete / total * 100}%`;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  state.orbit = savedOrbit;
  mixer.setTime(savedTime);
  bakedTime = savedTime;
  updateCamera();
  baked.ready = true;
  baked.baking = false;
  bakeProgress.hidden = true;
  message('C · BAKED READY', true);
}

function currentBakedTexture() {
  if (!baked.ready || !baked.textures.length || !clips.length) return null;
  const angle = ((state.orbit % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const direction = Math.round(angle / (Math.PI * 2) * baked.directions) % baked.directions;
  const clip = clips[Number(clipSelect.value || 0)];
  const frame = Math.floor((bakedTime / Math.max(0.001, clip.duration)) * baked.frames) % baked.frames;
  return baked.textures[direction * baked.frames + frame];
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.method').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  if (mode === 'live') noteEl.textContent = 'A renders the full animated panther mesh into a low-resolution GPU mask each frame.';
  if (mode === 'proxy') noteEl.textContent = 'B keeps the same animation but renders only automatic bone spheres and links into the mask.';
  if (mode === 'baked') {
    noteEl.textContent = 'C samples 8 directions × 8 poses; once baked, playback renders no 3D panther.';
    if (!baked.ready && !baked.baking) bakeC();
  }
}
document.querySelectorAll('.method').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));

function bindRange(id, key, outputId, format = (value) => String(value)) {
  const input = $(`#${id}`);
  const output = $(`#${outputId}`);
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    output.textContent = format(state[key]);
    if (key === 'zoom') updateCamera();
  });
}
bindRange('speed', 'speed', 'speed-out', (value) => value.toFixed(2));
bindRange('zoom', 'zoom', 'zoom-out', (value) => value.toFixed(2));
bindRange('edge', 'edge', 'edge-out', (value) => String(Math.round(value)));
bindRange('rough', 'rough', 'rough-out', (value) => value.toFixed(2));
bindRange('core', 'core', 'core-out', (value) => value.toFixed(2));

$('#mask-size').addEventListener('change', (event) => {
  state.maskSize = Number(event.target.value);
  rebuildMaskTarget();
});
$('#animate').addEventListener('click', (event) => {
  state.animate = !state.animate;
  event.currentTarget.classList.toggle('active', state.animate);
  event.currentTarget.textContent = `ANIMATE: ${state.animate ? 'ON' : 'OFF'}`;
});
$('#bake').addEventListener('click', bakeC);
$('#reset').addEventListener('click', () => {
  state.orbit = 0;
  state.zoom = 1;
  $('#zoom').value = '1';
  $('#zoom-out').textContent = '1.00';
  updateCamera();
});
clipSelect.addEventListener('change', () => setClip(Number(clipSelect.value)));

let primaryPointer = null;
let lastX = 0;
let pinchDistance = null;
const touches = new Map();
stage.addEventListener('pointerdown', (event) => {
  stage.setPointerCapture?.(event.pointerId);
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touches.size === 1) {
    primaryPointer = event.pointerId;
    lastX = event.clientX;
  }
});
stage.addEventListener('pointermove', (event) => {
  if (!touches.has(event.pointerId)) return;
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touches.size === 1 && event.pointerId === primaryPointer) {
    const dx = event.clientX - lastX;
    lastX = event.clientX;
    state.orbit += dx * 0.012;
    updateCamera();
  } else if (touches.size === 2) {
    const [a, b] = Array.from(touches.values());
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDistance != null) {
      state.zoom = THREE.MathUtils.clamp(state.zoom * (distance / pinchDistance), 0.55, 2.2);
      $('#zoom').value = String(state.zoom);
      $('#zoom-out').textContent = state.zoom.toFixed(2);
      updateCamera();
    }
    pinchDistance = distance;
  }
});
function endPointer(event) {
  touches.delete(event.pointerId);
  if (touches.size < 2) pinchDistance = null;
  if (event.pointerId === primaryPointer) primaryPointer = null;
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('wheel', (event) => {
  event.preventDefault();
  state.zoom = THREE.MathUtils.clamp(state.zoom * Math.exp(-event.deltaY * 0.001), 0.55, 2.2);
  $('#zoom').value = String(state.zoom);
  $('#zoom-out').textContent = state.zoom.toFixed(2);
  updateCamera();
}, { passive: false });

const loader = new GLTFLoader();
const PANTHER_PARTS = 24;
async function loadPantherBuffer() {
  const urls = Array.from({ length: PANTHER_PARTS }, (_, index) => `../assets/black-ice/panther-mask.b64.${String(index).padStart(2, '0')}`);
  const chunks = await Promise.all(urls.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Panther source part failed: ${response.status} ${url}`);
    return (await response.text()).trim();
  }));
  const binary = atob(chunks.join(''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function acceptPanther(gltf) {
  model = gltf.scene;
  normaliseModel(model);
  prepareMaskModel(model);
  sourceScene.add(model);
  clips = gltf.animations || [];
  mixer = new THREE.AnimationMixer(model);
  clipSelect.innerHTML = '';
  clips.forEach((clip, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = clip.name || `Clip ${index + 1}`;
    clipSelect.appendChild(option);
  });
  let preferred = clips.findIndex((clip) => /stealth/i.test(clip.name));
  if (preferred < 0) preferred = clips.findIndex((clip) => /walk/i.test(clip.name));
  if (preferred < 0) preferred = 0;
  clipSelect.value = String(preferred);
  if (clips.length) setClip(preferred);
  resize();
  updateCamera();
  message('READY', true);
}

message('LOADING PANTHER…');
loadPantherBuffer()
  .then((buffer) => loader.parse(buffer, '', acceptPanther, (error) => {
    console.error(error);
    message('PANTHER PARSE FAILED');
  }))
  .catch((error) => {
    console.error(error);
    message('PANTHER LOAD FAILED');
  });

const clock = new THREE.Clock();
let fpsFrames = 0;
let fpsTime = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (model) {
    if (state.mode === 'baked' && baked.ready) {
      if (state.animate) bakedTime += dt * state.speed;
      const texture = currentBakedTexture();
      if (texture) renderPost(texture);
    } else {
      if (mixer && state.animate) mixer.update(dt * state.speed);
      renderMask(state.mode === 'proxy' ? 'proxy' : 'live');
      renderPost(maskTarget.texture);
    }
  } else {
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x010304, 1);
    renderer.clear();
  }

  fpsFrames += 1;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fpsEl.textContent = String(Math.round(fpsFrames / fpsTime));
    fpsFrames = 0;
    fpsTime = 0;
  }
}
resize();
frame();
