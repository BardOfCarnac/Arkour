import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#editor');
const pointName = $('#point-name');
const pointCoords = $('#point-coords');
const viewChip = $('#view-chip');
const heightInput = $('#height');
const heightValue = $('#height-value');
const curveInput = $('#curve');
const curveValue = $('#curve-value');
const fillInput = $('#fill');
const fillValue = $('#fill-value');
const symmetryButton = $('#symmetry');
const flattenButton = $('#flatten');
const resetButton = $('#reset');
const copyButton = $('#copy-json');
const downloadButton = $('#download-json');
const toolsOpen = $('#tools-open');
const toolsClose = $('#tools-close');
const toolsDrawer = $('#tools-drawer');
const drawerBackdrop = $('#drawer-backdrop');
const viewButtons = Array.from(document.querySelectorAll('.view-button'));

const STORAGE_KEY = 'arkour-black-ice-quadruped-editor-v1';

const CONTOUR_ORDER = [
  'nose', 'rightEar', 'rightNeckPit', 'rightFore', 'rightWaistPit', 'rightHind',
  'tail', 'leftHind', 'leftWaistPit', 'leftFore', 'leftNeckPit', 'leftEar',
];
const INTERNAL_ORDER = ['chest', 'core', 'pelvis'];
const POINT_ORDER = [...CONTOUR_ORDER, ...INTERNAL_ORDER];
const TIP_KEYS = new Set(['nose', 'rightEar', 'rightFore', 'rightHind', 'tail', 'leftHind', 'leftFore', 'leftEar']);
const PIT_KEYS = new Set(['rightNeckPit', 'rightWaistPit', 'leftWaistPit', 'leftNeckPit']);
const CENTRELINE_KEYS = new Set(['nose', 'tail', 'chest', 'core', 'pelvis']);
const MIRROR = {
  rightEar: 'leftEar', leftEar: 'rightEar',
  rightNeckPit: 'leftNeckPit', leftNeckPit: 'rightNeckPit',
  rightFore: 'leftFore', leftFore: 'rightFore',
  rightWaistPit: 'leftWaistPit', leftWaistPit: 'rightWaistPit',
  rightHind: 'leftHind', leftHind: 'rightHind',
};
const RIGHT_PAIR_KEYS = ['rightEar', 'rightNeckPit', 'rightFore', 'rightWaistPit', 'rightHind'];

const POINT_LABELS = {
  nose: 'NOSE / FRONT',
  rightEar: 'RIGHT EAR',
  rightNeckPit: 'RIGHT NECK PIT',
  rightFore: 'RIGHT FORE / SHOULDER',
  rightWaistPit: 'RIGHT WAIST PIT',
  rightHind: 'RIGHT HIND / HAUNCH',
  tail: 'TAIL / REAR',
  leftHind: 'LEFT HIND / HAUNCH',
  leftWaistPit: 'LEFT WAIST PIT',
  leftFore: 'LEFT FORE / SHOULDER',
  leftNeckPit: 'LEFT NECK PIT',
  leftEar: 'LEFT EAR',
  chest: 'CHEST',
  core: 'CORE',
  pelvis: 'PELVIS',
};

const STRUCTURE_PAIRS = [
  ['chest', 'core'], ['core', 'pelvis'],
  ['chest', 'nose'], ['pelvis', 'tail'],
  ['chest', 'rightNeckPit'], ['chest', 'leftNeckPit'],
  ['core', 'rightFore'], ['core', 'leftFore'],
  ['core', 'rightWaistPit'], ['core', 'leftWaistPit'],
  ['pelvis', 'rightHind'], ['pelvis', 'leftHind'],
];

const SURFACE_EDGE_ANCHORS = [
  'chest', 'chest', 'chest',
  'core',
  'pelvis', 'pelvis', 'pelvis', 'pelvis',
  'core',
  'chest', 'chest', 'chest',
];

const QUADRUPED = {
  format: 'arkour-black-ice-glyph',
  version: 2,
  rig: 'quadruped-15',
  symmetry: true,
  curve: 0.34,
  fill: 0.12,
  points: {
    nose: { x: 0, y: 0, z: -138 },
    rightEar: { x: 34, y: 0, z: -106 },
    rightNeckPit: { x: 27, y: 0, z: -63 },
    rightFore: { x: 76, y: 0, z: -29 },
    rightWaistPit: { x: 33, y: 0, z: 19 },
    rightHind: { x: 66, y: 0, z: 78 },
    tail: { x: 0, y: 0, z: 128 },
    leftHind: { x: -66, y: 0, z: 78 },
    leftWaistPit: { x: -33, y: 0, z: 19 },
    leftFore: { x: -76, y: 0, z: -29 },
    leftNeckPit: { x: -27, y: 0, z: -63 },
    leftEar: { x: -34, y: 0, z: -106 },
    chest: { x: 0, y: 0, z: -46 },
    core: { x: 0, y: 0, z: 8 },
    pelvis: { x: 0, y: 0, z: 61 },
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
let state = { ...clone(QUADRUPED), view: 'top' };
let selectedPoint = 'nose';
let activeDrag = null;

function pointKind(key) {
  if (PIT_KEYS.has(key)) return 'pit';
  if (INTERNAL_ORDER.includes(key)) return 'internal';
  if (TIP_KEYS.has(key)) return 'tip';
  return 'tip';
}

function symmetrisePoints(points) {
  for (const rightKey of RIGHT_PAIR_KEYS) {
    const leftKey = MIRROR[rightKey];
    const right = points[rightKey];
    const left = points[leftKey];
    const x = (Math.abs(right.x) + Math.abs(left.x)) / 2;
    const y = (right.y + left.y) / 2;
    const z = (right.z + left.z) / 2;
    points[rightKey] = { x, y, z };
    points[leftKey] = { x: -x, y, z };
  }
  for (const key of CENTRELINE_KEYS) points[key].x = 0;
  return points;
}

function normalise(saved) {
  if (saved?.format !== QUADRUPED.format || saved?.version !== 2 || saved?.rig !== QUADRUPED.rig || !saved?.points) return null;
  const symmetry = saved.symmetry ?? true;
  const points = { ...clone(QUADRUPED.points), ...saved.points };
  if (symmetry) symmetrisePoints(points);
  return {
    ...clone(QUADRUPED),
    ...saved,
    version: 2,
    rig: QUADRUPED.rig,
    symmetry,
    points,
    view: saved.view || 'top',
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const loaded = normalise(JSON.parse(raw));
    if (loaded) state = loaded;
  } catch (error) {
    console.warn('Could not load quadruped glyph state', error);
  }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) { console.warn('Could not save quadruped glyph state', error); }
}

const toWorld = (point) => new THREE.Vector3(point.x, point.y, point.z);
const fromWorld = (vector) => ({ x: vector.x, y: vector.y, z: vector.z });

function smoothClosed(points, curve = state.curve, stepsPerSegment = 6) {
  const result = [];
  const tension = clamp(curve, 0, 1);
  const count = points.length;
  for (let index = 0; index < count; index += 1) {
    const p0 = points[(index - 1 + count) % count];
    const p1 = points[index];
    const p2 = points[(index + 1) % count];
    const p3 = points[(index + 2) % count];
    const c1 = p1.clone().add(p2.clone().sub(p0).multiplyScalar(tension / 6));
    const c2 = p2.clone().sub(p3.clone().sub(p1).multiplyScalar(tension / 6));
    for (let step = 0; step < stepsPerSegment; step += 1) {
      const t = step / stepsPerSegment;
      const om = 1 - t;
      result.push(
        p1.clone().multiplyScalar(om ** 3)
          .add(c1.clone().multiplyScalar(3 * om * om * t))
          .add(c2.clone().multiplyScalar(3 * om * t * t))
          .add(p2.clone().multiplyScalar(t ** 3)),
      );
    }
  }
  return result;
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x030506, 0.0014);
const camera = new THREE.PerspectiveCamera(38, 1, 1, 1800);
camera.position.set(0, 400, 0.001);
camera.up.set(0, 0, -1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 170;
controls.maxDistance = 780;
controls.target.set(0, 0, 0);
controls.enabled = false;

const grid = new THREE.GridHelper(540, 27, 0x1d4b47, 0x0b201f);
grid.position.y = -1.5;
scene.add(grid);
const axesMaterial = new THREE.LineBasicMaterial({ color: 0x204e4a, transparent: true, opacity: 0.42 });
function addAxis(a, b) { scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), axesMaterial)); }
addAxis(new THREE.Vector3(-190, 0, 0), new THREE.Vector3(190, 0, 0));
addAxis(new THREE.Vector3(0, -110, 0), new THREE.Vector3(0, 110, 0));
addAxis(new THREE.Vector3(0, 0, -190), new THREE.Vector3(0, 0, 190));

const glyphGroup = new THREE.Group();
const handleGroup = new THREE.Group();
scene.add(glyphGroup, handleGroup);
const cyan = 0x55f1dc;
const pitColor = 0x7da7a2;
const internalColor = 0xffcf73;
const fillMaterial = new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: state.fill, side: THREE.DoubleSide, depthWrite: false });
const outlineMaterial = new THREE.LineBasicMaterial({ color: cyan, transparent: true, opacity: 0.97 });
const structureMaterial = new THREE.LineBasicMaterial({ color: internalColor, transparent: true, opacity: 0.34 });
const handleMeshes = new Map();

function disposeGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse((node) => {
      node.geometry?.dispose?.();
      if (node.material && ![fillMaterial, outlineMaterial, structureMaterial].includes(node.material)) node.material.dispose?.();
    });
  }
}

const lineLoopGeometry = (points) => new THREE.BufferGeometry().setFromPoints([...points, points[0]]);

function surfaceGeometry(contour) {
  const edgeCount = CONTOUR_ORDER.length;
  const stepsPerEdge = Math.max(1, Math.floor(contour.length / edgeCount));
  const positions = [];
  const pushTriangle = (a, b, c) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  for (let edge = 0; edge < edgeCount; edge += 1) {
    const anchorKey = SURFACE_EDGE_ANCHORS[edge];
    const anchor = toWorld(state.points[anchorKey]);
    const start = edge * stepsPerEdge;

    for (let step = 0; step < stepsPerEdge; step += 1) {
      const a = contour[start + step];
      const b = step === stepsPerEdge - 1
        ? contour[((edge + 1) % edgeCount) * stepsPerEdge]
        : contour[start + step + 1];
      pushTriangle(anchor, a, b);
    }

    const nextAnchorKey = SURFACE_EDGE_ANCHORS[(edge + 1) % edgeCount];
    if (nextAnchorKey !== anchorKey) {
      const sharedContourPoint = toWorld(state.points[CONTOUR_ORDER[(edge + 1) % edgeCount]]);
      pushTriangle(anchor, sharedContourPoint, toWorld(state.points[nextAnchorKey]));
    }
  }

  pushTriangle(toWorld(state.points.chest), toWorld(state.points.core), toWorld(state.points.pelvis));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function structureGeometry() {
  const points = [];
  for (const [a, b] of STRUCTURE_PAIRS) points.push(toWorld(state.points[a]), toWorld(state.points[b]));
  return new THREE.BufferGeometry().setFromPoints(points);
}

function buildGlyph() {
  disposeGroup(glyphGroup);
  const contour = smoothClosed(CONTOUR_ORDER.map((key) => toWorld(state.points[key])));
  fillMaterial.opacity = state.fill;
  glyphGroup.add(
    new THREE.Mesh(surfaceGeometry(contour), fillMaterial),
    new THREE.Line(lineLoopGeometry(contour), outlineMaterial),
    new THREE.LineSegments(structureGeometry(), structureMaterial),
  );
}

function handleColor(key) {
  if (key === selectedPoint) return 0xffffff;
  const kind = pointKind(key);
  if (kind === 'pit') return pitColor;
  if (kind === 'internal') return internalColor;
  return cyan;
}

function handleRadius(key) {
  if (key === selectedPoint) return 4.7;
  const kind = pointKind(key);
  if (kind === 'pit') return 3.0;
  if (kind === 'internal') return 3.9;
  return 3.6;
}

function buildHandles() {
  disposeGroup(handleGroup);
  handleMeshes.clear();
  for (const key of POINT_ORDER) {
    const group = new THREE.Group();
    const visible = new THREE.Mesh(
      new THREE.SphereGeometry(handleRadius(key), 16, 12),
      new THREE.MeshBasicMaterial({ color: handleColor(key) }),
    );
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(11, 12, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hit.userData.pointKey = key;
    group.position.copy(toWorld(state.points[key]));
    group.add(visible, hit);
    handleGroup.add(group);
    handleMeshes.set(key, hit);
  }
}

function updateUi() {
  const point = state.points[selectedPoint];
  pointName.textContent = POINT_LABELS[selectedPoint];
  pointCoords.textContent = `X ${Math.round(point.x)} · Y ${Math.round(point.y)} · Z ${Math.round(point.z)}`;
  heightInput.value = String(clamp(point.y, -150, 150));
  heightValue.textContent = String(Math.round(point.y));
  curveInput.value = String(state.curve);
  curveValue.textContent = Number(state.curve).toFixed(2);
  fillInput.value = String(state.fill);
  fillValue.textContent = Number(state.fill).toFixed(2);
  symmetryButton.classList.toggle('active', state.symmetry);
  symmetryButton.setAttribute('aria-pressed', state.symmetry ? 'true' : 'false');
  symmetryButton.textContent = `SYMMETRY: ${state.symmetry ? 'ON' : 'OFF'}`;
  viewChip.textContent = state.view.toUpperCase();
  viewButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
}

function renderEditor() {
  buildGlyph();
  buildHandles();
  updateUi();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  camera.aspect = rect.width / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function snapView(view) {
  state.view = view;
  const distance = 400;
  if (view === 'front') {
    camera.up.set(0, 1, 0);
    camera.position.set(0, 0, distance);
  } else if (view === 'side') {
    camera.up.set(0, 1, 0);
    camera.position.set(distance, 0, 0);
  } else if (view === 'top') {
    camera.up.set(0, 0, -1);
    camera.position.set(0, distance, 0.001);
  } else {
    camera.up.set(0, 1, 0);
    camera.position.set(255, 220, 350);
  }
  controls.target.set(0, 0, 0);
  controls.enabled = view === 'orbit';
  controls.update();
  saveState();
  updateUi();
}
viewButtons.forEach((button) => button.addEventListener('click', () => snapView(button.dataset.view)));

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
  return raycaster.intersectObjects(Array.from(handleMeshes.values()), false)[0]?.object?.userData?.pointKey ?? null;
}

function configureDragPlane(key) {
  const world = toWorld(state.points[key]);
  if (state.view === 'front') dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), world);
  else if (state.view === 'side') dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(1, 0, 0), world);
  else if (state.view === 'top') dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), world);
  else {
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    dragPlane.setFromNormalAndCoplanarPoint(normal, world);
  }
}

function setPoint(key, point) {
  const next = {
    x: clamp(point.x, -185, 185),
    y: clamp(point.y, -150, 150),
    z: clamp(point.z, -185, 185),
  };
  if (state.symmetry && CENTRELINE_KEYS.has(key)) next.x = 0;
  state.points[key] = next;
  if (state.symmetry && MIRROR[key]) {
    state.points[MIRROR[key]] = { x: -next.x, y: next.y, z: next.z };
  }
  saveState();
  renderEditor();
}

canvas.addEventListener('pointerdown', (event) => {
  const key = pickPoint(event);
  if (!key) return;
  event.preventDefault();
  selectedPoint = key;
  configureDragPlane(key);
  pointerNdc(event);
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(dragPlane, dragIntersection)) return;
  dragOffset.copy(toWorld(state.points[key])).sub(dragIntersection);
  activeDrag = { key, pointerId: event.pointerId };
  controls.enabled = false;
  canvas.setPointerCapture?.(event.pointerId);
  renderEditor();
});

canvas.addEventListener('pointermove', (event) => {
  if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  pointerNdc(event);
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(dragPlane, dragIntersection)) return;
  setPoint(activeDrag.key, fromWorld(dragIntersection.clone().add(dragOffset)));
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

heightInput.addEventListener('input', () => {
  const next = clone(state.points[selectedPoint]);
  next.y = Number(heightInput.value);
  setPoint(selectedPoint, next);
});
curveInput.addEventListener('input', () => {
  state.curve = Number(curveInput.value);
  saveState();
  renderEditor();
});
fillInput.addEventListener('input', () => {
  state.fill = Number(fillInput.value);
  saveState();
  renderEditor();
});
symmetryButton.addEventListener('click', () => {
  state.symmetry = !state.symmetry;
  if (state.symmetry) symmetrisePoints(state.points);
  saveState();
  renderEditor();
});
flattenButton.addEventListener('click', () => {
  POINT_ORDER.forEach((key) => { state.points[key].y = 0; });
  saveState();
  renderEditor();
});
resetButton.addEventListener('click', () => {
  state = { ...clone(QUADRUPED), view: 'top' };
  selectedPoint = 'nose';
  saveState();
  snapView('top');
  renderEditor();
});

function exportDefinition() {
  return {
    format: QUADRUPED.format,
    version: 2,
    rig: QUADRUPED.rig,
    coordinateSystem: { groundPlane: 'xz', heightAxis: 'y', frontAxis: '-z' },
    symmetry: state.symmetry,
    curve: state.curve,
    fill: state.fill,
    points: clone(state.points),
  };
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

copyButton.addEventListener('click', async () => {
  try {
    await copyText(JSON.stringify(exportDefinition(), null, 2));
    copyButton.textContent = 'COPIED';
    setTimeout(() => { copyButton.textContent = 'COPY JSON'; }, 900);
  } catch (error) {
    console.warn('Could not copy quadruped glyph', error);
  }
});

downloadButton.addEventListener('click', () => {
  const blob = new Blob([`${JSON.stringify(exportDefinition(), null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'arkour-black-ice-quadruped-v1.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
});

function setDrawer(open) {
  toolsDrawer.classList.toggle('open', open);
  toolsDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  drawerBackdrop.hidden = !open;
}
toolsOpen.addEventListener('click', () => setDrawer(true));
toolsClose.addEventListener('click', () => setDrawer(false));
drawerBackdrop.addEventListener('click', () => setDrawer(false));
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setDrawer(false);
});

loadState();
resize();
renderEditor();
snapView(state.view || 'top');

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
