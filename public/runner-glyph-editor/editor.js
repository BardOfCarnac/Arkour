import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#editor');
const pointName = document.querySelector('#point-name');
const pointCoords = document.querySelector('#point-coords');
const poseNote = document.querySelector('#pose-note');
const viewChip = document.querySelector('#view-chip');
const symmetryButton = document.querySelector('#symmetry');
const ghostsButton = document.querySelector('#ghosts');
const morphButton = document.querySelector('#morph');
const curveInput = document.querySelector('#curve');
const fillInput = document.querySelector('#fill');
const depthInput = document.querySelector('#depth');
const depthValue = document.querySelector('#depth-value');
const resetPoseButton = document.querySelector('#reset-pose');
const flattenPoseButton = document.querySelector('#flatten-pose');
const resetAllButton = document.querySelector('#reset-all');
const copyJsonButton = document.querySelector('#copy-json');
const downloadJsonButton = document.querySelector('#download-json');
const poseTabs = Array.from(document.querySelectorAll('.pose-tab'));
const viewButtons = Array.from(document.querySelectorAll('.view-button'));

const STORAGE_KEY_V1 = 'arkour-runner-glyph-editor-v1';
const STORAGE_KEY_V2 = 'arkour-runner-glyph-editor-v2';

const POINT_ORDER = [
  'head', 'neckR', 'handR', 'underarmR', 'flankR',
  'foot', 'flankL', 'underarmL', 'handL', 'neckL',
];

const POINT_LABELS = {
  head: 'HEAD / TOP',
  neckR: 'RIGHT NECK',
  handR: 'RIGHT HAND',
  underarmR: 'RIGHT UNDER-ARM',
  flankR: 'RIGHT FLANK',
  foot: 'FOOT / TIP',
  flankL: 'LEFT FLANK',
  underarmL: 'LEFT UNDER-ARM',
  handL: 'LEFT HAND',
  neckL: 'LEFT NECK',
};

const MIRROR = {
  neckR: 'neckL', handR: 'handL', underarmR: 'underarmL', flankR: 'flankL',
  neckL: 'neckR', handL: 'handR', underarmL: 'underarmR', flankL: 'flankR',
};

const POSE_NOTES = {
  flying: 'streamlined travel silhouette',
  upright: 'neutral / standing silhouette',
  landing: 'compressed impact / bracing silhouette',
};

const SAVED_V1 = {
  format: 'arkour-runner-glyph',
  version: 1,
  curve: 0.27,
  poses: {
    flying: {
      head:{x:0,y:-128}, neckR:{x:22.87436356406471,y:-86.32236013381333}, handR:{x:87.82702489554322,y:29.673177444183153}, underarmR:{x:29.042537214698356,y:-14.30286778537706}, flankR:{x:17.255639334787304,y:37.91398758716045}, foot:{x:0,y:124}, flankL:{x:-17.255639334787304,y:37.91398758716045}, underarmL:{x:-29.042537214698356,y:-14.30286778537706}, handL:{x:-87.82702489554322,y:29.673177444183153}, neckL:{x:-22.87436356406471,y:-86.32236013381333},
    },
    upright: {
      head:{x:0,y:-128}, neckR:{x:30.116283313488353,y:-80.42903717667798}, handR:{x:79.93568561820194,y:-49.263867234337965}, underarmR:{x:33.63750313722343,y:-19.47192098687239}, flankR:{x:21.950591796415523,y:25.902237760816604}, foot:{x:0,y:128}, flankL:{x:-21.950591796415523,y:25.902237760816604}, underarmL:{x:-33.63750313722343,y:-19.47192098687239}, handL:{x:-79.93568561820194,y:-49.263867234337965}, neckL:{x:-30.116283313488353,y:-80.42903717667798},
    },
    landing: {
      head:{x:0,y:-80.30417176934833}, neckR:{x:5.14416086647347,y:-50.83706400741872}, handR:{x:87.95189075685178,y:-6.2618116200492295}, underarmR:{x:9.938858856592361,y:-7.785009646064481}, flankR:{x:-10.288548368806289,y:12.092702135627377}, foot:{x:0,y:82.88869315468966}, flankL:{x:-40.85430300780807,y:37.31455037376654}, underarmL:{x:-60.83200680611702,y:0.5555241153477937}, handL:{x:-112,y:-11.181364062469925}, neckL:{x:-36.80901656222392,y:-51.11165178024882},
    },
  },
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

function promotePose(pose) {
  const result = {};
  for (const key of POINT_ORDER) {
    const point = pose[key];
    result[key] = { x: point.x, y: point.y, z: Number(point.z) || 0 };
  }
  return result;
}

function promoteDefinition(definition) {
  return {
    format: 'arkour-runner-glyph',
    version: 2,
    curve: Number(definition?.curve ?? SAVED_V1.curve),
    poses: {
      flying: promotePose(definition.poses.flying),
      upright: promotePose(definition.poses.upright),
      landing: promotePose(definition.poses.landing),
    },
  };
}

const DEFAULT_V2 = promoteDefinition(SAVED_V1);

let state = {
  version: 2,
  pose: 'upright',
  symmetry: false,
  ghosts: true,
  curve: DEFAULT_V2.curve,
  fill: 0.10,
  view: 'orbit',
  poses: deepClone(DEFAULT_V2.poses),
};

let selectedPoint = 'head';
let morphPlaying = false;
let morphStart = 0;
let activeDrag = null;

function normaliseLoaded(raw) {
  if (!raw?.poses) return null;
  if (raw.version === 2) {
    return {
      ...state,
      ...raw,
      version: 2,
      poses: {
        flying: promotePose(raw.poses.flying),
        upright: promotePose(raw.poses.upright),
        landing: promotePose(raw.poses.landing),
      },
    };
  }
  if (raw.version === 1) {
    const promoted = promoteDefinition(raw);
    return {
      ...state,
      pose: raw.pose ?? state.pose,
      symmetry: raw.symmetry ?? state.symmetry,
      ghosts: raw.ghosts ?? state.ghosts,
      curve: raw.curve ?? promoted.curve,
      fill: raw.fill ?? state.fill,
      poses: promoted.poses,
    };
  }
  return null;
}

function loadState() {
  try {
    const savedV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (savedV2) {
      const loaded = normaliseLoaded(JSON.parse(savedV2));
      if (loaded) state = loaded;
      return;
    }
    const savedV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (savedV1) {
      const loaded = normaliseLoaded(JSON.parse(savedV1));
      if (loaded) state = loaded;
    }
  } catch (error) {
    console.warn('Could not load runner glyph editor state', error);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state));
  } catch (error) {
    console.warn('Could not save runner glyph editor state', error);
  }
}

function currentPose() { return state.poses[state.pose]; }

function toWorld(point) { return new THREE.Vector3(point.x, -point.y, point.z); }
function fromWorld(vector) { return { x: vector.x, y: -vector.y, z: vector.z }; }

function smoothContour(pose, curve = state.curve, stepsPerSegment = 7) {
  const anchors = POINT_ORDER.map((key) => toWorld(pose[key]));
  const points = [];
  const t = clamp(curve, 0, 1);
  const n = anchors.length;
  for (let index = 0; index < n; index += 1) {
    const p0 = anchors[(index - 1 + n) % n];
    const p1 = anchors[index];
    const p2 = anchors[(index + 1) % n];
    const p3 = anchors[(index + 2) % n];
    const c1 = p1.clone().add(p2.clone().sub(p0).multiplyScalar(t / 6));
    const c2 = p2.clone().sub(p3.clone().sub(p1).multiplyScalar(t / 6));
    for (let step = 0; step < stepsPerSegment; step += 1) {
      const u = step / stepsPerSegment;
      const om = 1 - u;
      const point = p1.clone().multiplyScalar(om * om * om)
        .add(c1.clone().multiplyScalar(3 * om * om * u))
        .add(c2.clone().multiplyScalar(3 * om * u * u))
        .add(p2.clone().multiplyScalar(u * u * u));
      points.push(point);
    }
  }
  return points;
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x030506, 0.00125);

const camera = new THREE.PerspectiveCamera(38, 1, 1, 1800);
camera.position.set(240, 80, 330);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);
controls.minDistance = 180;
controls.maxDistance = 760;
controls.enablePan = false;

const grid = new THREE.GridHelper(520, 26, 0x1d4b47, 0x0b201f);
grid.rotation.x = Math.PI / 2;
grid.position.z = -92;
scene.add(grid);

const axisMaterial = new THREE.LineBasicMaterial({ color: 0x204e4a, transparent: true, opacity: 0.45 });
function axisLine(a, b) {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geometry, axisMaterial);
  scene.add(line);
}
axisLine(new THREE.Vector3(-180,0,0), new THREE.Vector3(180,0,0));
axisLine(new THREE.Vector3(0,-180,0), new THREE.Vector3(0,180,0));
axisLine(new THREE.Vector3(0,0,-140), new THREE.Vector3(0,0,140));

const glyphGroup = new THREE.Group();
const ghostGroup = new THREE.Group();
const handleGroup = new THREE.Group();
scene.add(ghostGroup, glyphGroup, handleGroup);

const cyan = 0x55f1dc;
const selectedColor = 0xffffff;

const fillMaterial = new THREE.MeshBasicMaterial({
  color: cyan,
  transparent: true,
  opacity: state.fill,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const outlineMaterial = new THREE.LineBasicMaterial({ color: cyan, transparent: true, opacity: 0.95 });
const structureMaterial = new THREE.LineBasicMaterial({ color: cyan, transparent: true, opacity: 0.28 });

let glyphMesh = null;
let glyphOutline = null;
let glyphStructure = null;
const handleMeshes = new Map();

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material && ![fillMaterial, outlineMaterial, structureMaterial].includes(child.material)) child.material.dispose?.();
  });
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    disposeObject(child);
  }
}

function surfaceGeometry(pose) {
  const contour = smoothContour(pose);
  const contour2 = contour.map((p) => new THREE.Vector2(p.x, p.y));
  const triangles = THREE.ShapeUtils.triangulateShape(contour2, []);
  const positions = new Float32Array(contour.length * 3);
  contour.forEach((p, i) => {
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  });
  const indices = [];
  triangles.forEach((triangle) => indices.push(...triangle));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, contour };
}

function lineLoopGeometry(points) {
  const closed = [...points, points[0]];
  return new THREE.BufferGeometry().setFromPoints(closed);
}

function structureGeometry(pose) {
  const pairs = [
    ['head','foot'], ['handL','handR'], ['underarmL','underarmR'],
    ['neckL','flankL'], ['neckR','flankR'],
  ];
  const points = [];
  for (const [a,b] of pairs) points.push(toWorld(pose[a]), toWorld(pose[b]));
  return new THREE.BufferGeometry().setFromPoints(points);
}

function buildGlyph(pose) {
  clearGroup(glyphGroup);
  const { geometry, contour } = surfaceGeometry(pose);
  fillMaterial.opacity = state.fill;
  glyphMesh = new THREE.Mesh(geometry, fillMaterial);
  glyphOutline = new THREE.Line(lineLoopGeometry(contour), outlineMaterial);
  glyphStructure = new THREE.LineSegments(structureGeometry(pose), structureMaterial);
  glyphGroup.add(glyphMesh, glyphOutline, glyphStructure);
}

function buildGhosts() {
  clearGroup(ghostGroup);
  if (!state.ghosts || morphPlaying) return;
  for (const poseName of ['flying','upright','landing']) {
    if (poseName === state.pose) continue;
    const contour = smoothContour(state.poses[poseName]);
    const material = new THREE.LineBasicMaterial({ color: cyan, transparent: true, opacity: 0.12 });
    const line = new THREE.Line(lineLoopGeometry(contour), material);
    ghostGroup.add(line);
  }
}

function buildHandles(pose) {
  clearGroup(handleGroup);
  handleMeshes.clear();
  if (morphPlaying) return;
  for (const key of POINT_ORDER) {
    const group = new THREE.Group();
    group.userData.pointKey = key;
    const visibleGeometry = new THREE.SphereGeometry(key === selectedPoint ? 4.2 : 3.2, 16, 12);
    const visibleMaterial = new THREE.MeshBasicMaterial({ color: key === selectedPoint ? selectedColor : cyan });
    const visible = new THREE.Mesh(visibleGeometry, visibleMaterial);
    const hitGeometry = new THREE.SphereGeometry(10, 12, 8);
    const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const hit = new THREE.Mesh(hitGeometry, hitMaterial);
    hit.userData.pointKey = key;
    group.position.copy(toWorld(pose[key]));
    group.add(visible, hit);
    handleGroup.add(group);
    handleMeshes.set(key, hit);
  }
}

function renderPose(pose = currentPose()) {
  buildGlyph(pose);
  buildGhosts();
  buildHandles(currentPose());
  updateReadout();
}

function updateReadout() {
  const point = currentPose()[selectedPoint];
  pointName.textContent = POINT_LABELS[selectedPoint];
  pointCoords.textContent = `X ${Math.round(point.x)} · Y ${Math.round(point.y)} · Z ${Math.round(point.z)}`;
  depthInput.value = String(clamp(point.z, -120, 120));
  depthValue.textContent = String(Math.round(point.z));
}

function updateUi() {
  poseTabs.forEach((button) => {
    const selected = button.dataset.pose === state.pose;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  viewButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
  viewChip.textContent = state.view.toUpperCase();
  symmetryButton.classList.toggle('active', state.symmetry);
  symmetryButton.setAttribute('aria-pressed', state.symmetry ? 'true' : 'false');
  symmetryButton.textContent = `SYMMETRY: ${state.symmetry ? 'ON' : 'OFF'}`;
  ghostsButton.classList.toggle('active', state.ghosts);
  ghostsButton.setAttribute('aria-pressed', state.ghosts ? 'true' : 'false');
  ghostsButton.textContent = `GHOST POSES: ${state.ghosts ? 'ON' : 'OFF'}`;
  curveInput.value = String(state.curve);
  fillInput.value = String(state.fill);
  poseNote.textContent = POSE_NOTES[state.pose];
  updateReadout();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function snapView(view) {
  state.view = view;
  const distance = 390;
  if (view === 'front') camera.position.set(0, 0, distance);
  else if (view === 'side') camera.position.set(distance, 0, 0);
  else if (view === 'top') camera.position.set(0, distance, 0.001);
  controls.target.set(0, 0, 0);
  controls.update();
  controls.enabled = view === 'orbit';
  saveState();
  updateUi();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const dragOffset = new THREE.Vector3();
const dragIntersection = new THREE.Vector3();

function pointerNdc(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickPoint(event) {
  pointerNdc(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(Array.from(handleMeshes.values()), false);
  return hits[0]?.object?.userData?.pointKey ?? null;
}

function configureDragPlane(key) {
  const world = toWorld(currentPose()[key]);
  if (state.view === 'front') dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,0,1), world);
  else if (state.view === 'side') dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(1,0,0), world);
  else if (state.view === 'top') dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,1,0), world);
  else {
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    dragPlane.setFromNormalAndCoplanarPoint(normal, world);
  }
}

function setPoint(key, point) {
  const pose = currentPose();
  const next = {
    x: key === 'head' || key === 'foot' ? 0 : clamp(point.x, -145, 145),
    y: clamp(point.y, -145, 145),
    z: clamp(point.z, -140, 140),
  };
  pose[key] = next;
  if (state.symmetry && MIRROR[key]) {
    pose[MIRROR[key]] = { x: -next.x, y: next.y, z: next.z };
  }
  saveState();
  renderPose();
}

canvas.addEventListener('pointerdown', (event) => {
  if (morphPlaying) return;
  const key = pickPoint(event);
  if (!key) return;
  event.preventDefault();
  selectedPoint = key;
  configureDragPlane(key);
  pointerNdc(event);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.ray.intersectPlane(dragPlane, dragIntersection);
  if (!hit) return;
  dragOffset.copy(toWorld(currentPose()[key])).sub(dragIntersection);
  activeDrag = { key, pointerId: event.pointerId };
  controls.enabled = false;
  canvas.setPointerCapture?.(event.pointerId);
  renderPose();
});

canvas.addEventListener('pointermove', (event) => {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId || morphPlaying) return;
  event.preventDefault();
  pointerNdc(event);
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(dragPlane, dragIntersection)) return;
  const world = dragIntersection.clone().add(dragOffset);
  setPoint(activeDrag.key, fromWorld(world));
});

function endDrag(event) {
  if (!activeDrag) return;
  if (event?.pointerId !== undefined && event.pointerId !== activeDrag.pointerId) return;
  const pointerId = activeDrag.pointerId;
  activeDrag = null;
  controls.enabled = state.view === 'orbit';
  if (canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('lostpointercapture', () => {
  activeDrag = null;
  controls.enabled = state.view === 'orbit';
});

poseTabs.forEach((button) => {
  button.addEventListener('click', () => {
    stopMorph();
    state.pose = button.dataset.pose;
    selectedPoint = 'head';
    saveState();
    updateUi();
    renderPose();
  });
});

viewButtons.forEach((button) => button.addEventListener('click', () => snapView(button.dataset.view)));

symmetryButton.addEventListener('click', () => {
  state.symmetry = !state.symmetry;
  saveState();
  updateUi();
});

ghostsButton.addEventListener('click', () => {
  state.ghosts = !state.ghosts;
  saveState();
  updateUi();
  renderPose();
});

curveInput.addEventListener('input', () => {
  state.curve = Number(curveInput.value);
  saveState();
  renderPose();
});

fillInput.addEventListener('input', () => {
  state.fill = Number(fillInput.value);
  saveState();
  renderPose();
});

depthInput.addEventListener('input', () => {
  if (morphPlaying) return;
  const point = deepClone(currentPose()[selectedPoint]);
  point.z = Number(depthInput.value);
  setPoint(selectedPoint, point);
});

resetPoseButton.addEventListener('click', () => {
  stopMorph();
  state.poses[state.pose] = deepClone(DEFAULT_V2.poses[state.pose]);
  saveState();
  renderPose();
});

flattenPoseButton.addEventListener('click', () => {
  stopMorph();
  for (const key of POINT_ORDER) currentPose()[key].z = 0;
  saveState();
  renderPose();
});

resetAllButton.addEventListener('click', () => {
  stopMorph();
  state.poses = deepClone(DEFAULT_V2.poses);
  state.pose = 'upright';
  state.symmetry = false;
  state.ghosts = true;
  state.curve = DEFAULT_V2.curve;
  state.fill = 0.10;
  selectedPoint = 'head';
  saveState();
  updateUi();
  renderPose();
});

function blendPose(a, b, t) {
  const result = {};
  const u = ease(clamp(t, 0, 1));
  for (const key of POINT_ORDER) {
    result[key] = {
      x: mix(a[key].x, b[key].x, u),
      y: mix(a[key].y, b[key].y, u),
      z: mix(a[key].z, b[key].z, u),
    };
  }
  return result;
}

function morphPoseAt(timeSeconds) {
  const sequence = ['flying', 'upright', 'landing', 'upright'];
  const duration = 1.45;
  const local = timeSeconds % (sequence.length * duration);
  const index = Math.floor(local / duration);
  const next = (index + 1) % sequence.length;
  return blendPose(state.poses[sequence[index]], state.poses[sequence[next]], (local % duration) / duration);
}

function startMorph() {
  if (morphPlaying) return;
  morphPlaying = true;
  morphStart = performance.now();
  morphButton.classList.add('active');
  morphButton.setAttribute('aria-pressed', 'true');
  morphButton.textContent = 'STOP MORPH';
  controls.enabled = state.view === 'orbit';
  buildGhosts();
  buildHandles(currentPose());
}

function stopMorph() {
  if (!morphPlaying) return;
  morphPlaying = false;
  morphButton.classList.remove('active');
  morphButton.setAttribute('aria-pressed', 'false');
  morphButton.textContent = 'PLAY MORPH';
  renderPose();
}

morphButton.addEventListener('click', () => morphPlaying ? stopMorph() : startMorph());

function exportDefinition() {
  return {
    format: 'arkour-runner-glyph',
    version: 2,
    curve: state.curve,
    poses: deepClone(state.poses),
  };
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

copyJsonButton.addEventListener('click', async () => {
  try {
    await copyText(JSON.stringify(exportDefinition(), null, 2));
    const previous = copyJsonButton.textContent;
    copyJsonButton.textContent = 'COPIED';
    setTimeout(() => { copyJsonButton.textContent = previous; }, 1100);
  } catch (error) {
    console.warn('Could not copy glyph JSON', error);
    copyJsonButton.textContent = 'COPY FAILED';
    setTimeout(() => { copyJsonButton.textContent = 'COPY JSON V2'; }, 1400);
  }
});

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

downloadJsonButton.addEventListener('click', () => {
  download('arkour-runner-glyph-v2.json', `${JSON.stringify(exportDefinition(), null, 2)}\n`, 'application/json');
});

loadState();
resize();
updateUi();
renderPose();
if (state.view !== 'orbit') snapView(state.view);

function animate(now) {
  if (morphPlaying) renderPose(morphPoseAt((now - morphStart) / 1000));
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
