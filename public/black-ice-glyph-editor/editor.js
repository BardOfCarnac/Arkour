import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#editor');
const pointName = document.querySelector('#point-name');
const pointCoords = document.querySelector('#point-coords');
const viewChip = document.querySelector('#view-chip');
const heightInput = document.querySelector('#height');
const heightValue = document.querySelector('#height-value');
const curveInput = document.querySelector('#curve');
const curveValue = document.querySelector('#curve-value');
const fillInput = document.querySelector('#fill');
const fillValue = document.querySelector('#fill-value');
const flattenButton = document.querySelector('#flatten');
const resetButton = document.querySelector('#reset');
const copyButton = document.querySelector('#copy-json');
const downloadButton = document.querySelector('#download-json');
const viewButtons = Array.from(document.querySelectorAll('.view-button'));
const toolsOpen = document.querySelector('#tools-open');
const toolsClose = document.querySelector('#tools-close');
const toolsDrawer = document.querySelector('#tools-drawer');
const drawerBackdrop = document.querySelector('#drawer-backdrop');

const STORAGE_KEY_V1 = 'arkour-black-ice-glyph-editor-v1';
const STORAGE_KEY_V2 = 'arkour-black-ice-glyph-editor-v2';

const CONTOUR_ORDER = [
  'frontTip', 'frontRightPit', 'rightFrontTip', 'rightRearPit', 'rearRightTip',
  'rearPit', 'rearLeftTip', 'leftRearPit', 'leftFrontTip', 'frontLeftPit',
];
const INTERNAL_ORDER = ['core', 'innerFront', 'innerRear'];
const POINT_ORDER = [...CONTOUR_ORDER, ...INTERNAL_ORDER];
const TIP_KEYS = new Set(['frontTip', 'rightFrontTip', 'rearRightTip', 'rearLeftTip', 'leftFrontTip']);
const PIT_KEYS = new Set(['frontRightPit', 'rightRearPit', 'rearPit', 'leftRearPit', 'frontLeftPit']);

const POINT_LABELS = {
  frontTip: 'FRONT TIP',
  frontRightPit: 'FRONT-RIGHT PIT',
  rightFrontTip: 'RIGHT-FRONT TIP',
  rightRearPit: 'RIGHT-REAR PIT',
  rearRightTip: 'REAR-RIGHT TIP',
  rearPit: 'REAR PIT',
  rearLeftTip: 'REAR-LEFT TIP',
  leftRearPit: 'LEFT-REAR PIT',
  leftFrontTip: 'LEFT-FRONT TIP',
  frontLeftPit: 'FRONT-LEFT PIT',
  core: 'CORE',
  innerFront: 'INNER FRONT',
  innerRear: 'INNER REAR',
};

const STRUCTURE_PAIRS = [
  ['core', 'innerFront'], ['core', 'innerRear'],
  ['innerFront', 'frontTip'], ['innerRear', 'rearPit'],
  ['core', 'frontRightPit'], ['core', 'rightRearPit'],
  ['core', 'leftRearPit'], ['core', 'frontLeftPit'],
];

const STARFISH_V2 = {
  format: 'arkour-black-ice-glyph',
  version: 2,
  rig: 'starfish-13',
  curve: 0.36,
  fill: 0.12,
  points: {
    frontTip: { x: 0, y: 0, z: -126 },
    frontRightPit: { x: 30, y: 0, z: -46 },
    rightFrontTip: { x: 120, y: 0, z: -38 },
    rightRearPit: { x: 44, y: 0, z: 22 },
    rearRightTip: { x: 76, y: 0, z: 106 },
    rearPit: { x: 0, y: 0, z: 52 },
    rearLeftTip: { x: -76, y: 0, z: 106 },
    leftRearPit: { x: -44, y: 0, z: 22 },
    leftFrontTip: { x: -120, y: 0, z: -38 },
    frontLeftPit: { x: -30, y: 0, z: -46 },
    core: { x: 0, y: 0, z: 0 },
    innerFront: { x: 0, y: 0, z: -40 },
    innerRear: { x: 0, y: 0, z: 30 },
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;

let state = { ...clone(STARFISH_V2), view: 'top' };
let selectedPoint = 'frontTip';
let activeDrag = null;

function pointKind(key) {
  if (TIP_KEYS.has(key)) return 'tip';
  if (PIT_KEYS.has(key)) return 'pit';
  return 'internal';
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}
function average(points) {
  const out = { x: 0, y: 0, z: 0 };
  for (const point of points) {
    out.x += point.x; out.y += point.y; out.z += point.z;
  }
  const n = Math.max(1, points.length);
  out.x /= n; out.y /= n; out.z /= n;
  return out;
}
function lerpPoint(a, b, t) {
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) };
}

function migrateV1(saved) {
  if (!saved?.points) return null;
  const oldToNew = {
    arm0: 'frontTip',
    arm1: 'rightFrontTip',
    arm2: 'rearRightTip',
    arm3: 'rearLeftTip',
    arm4: 'leftFrontTip',
  };
  const points = clone(STARFISH_V2.points);
  for (const [oldKey, newKey] of Object.entries(oldToNew)) {
    const oldPoint = saved.points[oldKey];
    if (!oldPoint) continue;
    points[newKey] = {
      x: Number(oldPoint.x) || 0,
      y: Number(oldPoint.z) || 0,
      z: Number(oldPoint.y) || 0,
    };
  }
  const tips = ['frontTip', 'rightFrontTip', 'rearRightTip', 'rearLeftTip', 'leftFrontTip'].map((key) => points[key]);
  const center = average(tips);
  const pitSpecs = [
    ['frontRightPit', 'frontTip', 'rightFrontTip'],
    ['rightRearPit', 'rightFrontTip', 'rearRightTip'],
    ['rearPit', 'rearRightTip', 'rearLeftTip'],
    ['leftRearPit', 'rearLeftTip', 'leftFrontTip'],
    ['frontLeftPit', 'leftFrontTip', 'frontTip'],
  ];
  for (const [pitKey, aKey, bKey] of pitSpecs) {
    const edgeMid = midpoint(points[aKey], points[bKey]);
    points[pitKey] = lerpPoint(center, edgeMid, 0.44);
  }
  points.core = center;
  points.innerFront = lerpPoint(center, points.frontTip, 0.31);
  points.innerRear = lerpPoint(center, points.rearPit, 0.57);
  return {
    ...clone(STARFISH_V2),
    curve: Number(saved.curve ?? STARFISH_V2.curve),
    fill: Number(saved.fill ?? STARFISH_V2.fill),
    points,
    view: 'top',
  };
}

function normaliseV2(saved) {
  if (saved?.format !== STARFISH_V2.format || saved?.version !== 2 || !saved?.points) return null;
  return {
    ...clone(STARFISH_V2),
    ...saved,
    version: 2,
    rig: 'starfish-13',
    points: { ...clone(STARFISH_V2.points), ...saved.points },
    view: saved.view || 'top',
  };
}

function loadState() {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const loaded = normaliseV2(JSON.parse(rawV2));
      if (loaded) { state = loaded; return; }
    }
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const migrated = migrateV1(JSON.parse(rawV1));
      if (migrated) state = migrated;
    }
  } catch (error) {
    console.warn('Could not load Black ICE glyph state', error);
  }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state)); }
  catch (error) { console.warn('Could not save Black ICE glyph state', error); }
}

function toWorld(point) { return new THREE.Vector3(point.x, point.y, point.z); }
function fromWorld(vector) { return { x: vector.x, y: vector.y, z: vector.z }; }

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
camera.position.set(0, 390, 0.001);
camera.up.set(0, 0, -1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 170;
controls.maxDistance = 760;
controls.target.set(0, 0, 0);
controls.enabled = false;

const grid = new THREE.GridHelper(520, 26, 0x1d4b47, 0x0b201f);
grid.position.y = -1.5;
scene.add(grid);
const axesMaterial = new THREE.LineBasicMaterial({ color: 0x204e4a, transparent: true, opacity: 0.42 });
function addAxis(a, b) {
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), axesMaterial));
}
addAxis(new THREE.Vector3(-180, 0, 0), new THREE.Vector3(180, 0, 0));
addAxis(new THREE.Vector3(0, -100, 0), new THREE.Vector3(0, 100, 0));
addAxis(new THREE.Vector3(0, 0, -180), new THREE.Vector3(0, 0, 180));

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
function lineLoopGeometry(points) {
  return new THREE.BufferGeometry().setFromPoints([...points, points[0]]);
}
function surfaceGeometry(contour) {
  const shape2 = contour.map((p) => new THREE.Vector2(p.x, p.z));
  const triangles = THREE.ShapeUtils.triangulateShape(shape2, []);
  const positions = new Float32Array(contour.length * 3);
  contour.forEach((p, index) => {
    positions[index * 3] = p.x;
    positions[index * 3 + 1] = p.y;
    positions[index * 3 + 2] = p.z;
  });
  const indices = [];
  triangles.forEach((triangle) => indices.push(...triangle));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
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
  if (kind === 'internal') return 3.8;
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
  viewChip.textContent = state.view.toUpperCase();
  viewButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
}
function renderEditor() { buildGlyph(); buildHandles(); updateUi(); }

function resize() {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  camera.aspect = rect.width / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function snapView(view) {
  state.view = view;
  const distance = 390;
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
    camera.position.set(245, 210, 335);
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
  state.points[key] = {
    x: clamp(point.x, -175, 175),
    y: clamp(point.y, -150, 150),
    z: clamp(point.z, -175, 175),
  };
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
canvas.addEventListener('lostpointercapture', () => { activeDrag = null; controls.enabled = state.view === 'orbit'; });

heightInput.addEventListener('input', () => {
  const next = clone(state.points[selectedPoint]);
  next.y = Number(heightInput.value);
  setPoint(selectedPoint, next);
});
curveInput.addEventListener('input', () => { state.curve = Number(curveInput.value); saveState(); renderEditor(); });
fillInput.addEventListener('input', () => { state.fill = Number(fillInput.value); saveState(); renderEditor(); });
flattenButton.addEventListener('click', () => {
  POINT_ORDER.forEach((key) => { state.points[key].y = 0; });
  saveState(); renderEditor();
});
resetButton.addEventListener('click', () => {
  state = { ...clone(STARFISH_V2), view: 'top' };
  selectedPoint = 'frontTip';
  saveState();
  snapView('top');
  renderEditor();
});

function exportDefinition() {
  return {
    format: STARFISH_V2.format,
    version: 2,
    rig: STARFISH_V2.rig,
    coordinateSystem: { groundPlane: 'xz', heightAxis: 'y', frontAxis: '-z' },
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
    setTimeout(() => { copyButton.textContent = 'COPY JSON V2'; }, 900);
  } catch (error) {
    console.warn('Could not copy Black ICE glyph', error);
  }
});
downloadButton.addEventListener('click', () => {
  const blob = new Blob([`${JSON.stringify(exportDefinition(), null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'arkour-black-ice-starfish-v2.json';
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
addEventListener('keydown', (event) => { if (event.key === 'Escape') setDrawer(false); });

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
