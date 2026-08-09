import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#editor');
const pointName = document.querySelector('#point-name');
const pointCoords = document.querySelector('#point-coords');
const viewChip = document.querySelector('#view-chip');
const depthInput = document.querySelector('#depth');
const depthValue = document.querySelector('#depth-value');
const coreInput = document.querySelector('#core');
const coreValue = document.querySelector('#core-value');
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

const STORAGE_KEY = 'arkour-black-ice-glyph-editor-v1';
const POINT_ORDER = ['arm0','arm1','arm2','arm3','arm4'];
const POINT_LABELS = {
  arm0: 'ARM 1 / CROWN',
  arm1: 'ARM 2 / UPPER RIGHT',
  arm2: 'ARM 3 / LOWER RIGHT',
  arm3: 'ARM 4 / LOWER LEFT',
  arm4: 'ARM 5 / UPPER LEFT',
};

const STARFISH = {
  format: 'arkour-black-ice-glyph',
  version: 1,
  generator: 'five-arm-starfish',
  curve: 0.42,
  core: 0.43,
  fill: 0.12,
  points: {
    arm0: { x: 0, y: -126, z: 0 },
    arm1: { x: 120, y: -39, z: 0 },
    arm2: { x: 74, y: 103, z: 0 },
    arm3: { x: -74, y: 103, z: 0 },
    arm4: { x: -120, y: -39, z: 0 },
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
let state = { ...clone(STARFISH), view: 'orbit' };
let selectedPoint = 'arm0';
let activeDrag = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved?.format === STARFISH.format && saved?.version === 1 && saved?.points) {
      state = { ...clone(STARFISH), ...saved, points: { ...clone(STARFISH.points), ...saved.points } };
    }
  } catch (error) {
    console.warn('Could not load Black ICE glyph state', error);
  }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) { console.warn('Could not save Black ICE glyph state', error); }
}

function toWorld(point) { return new THREE.Vector3(point.x, -point.y, point.z); }
function fromWorld(vector) { return { x: vector.x, y: -vector.y, z: vector.z }; }

function centroid(points = state.points) {
  const center = new THREE.Vector3();
  POINT_ORDER.forEach((key) => center.add(toWorld(points[key])));
  return center.multiplyScalar(1 / POINT_ORDER.length);
}

function generatedAnchors(points = state.points) {
  const center = centroid(points);
  const anchors = [];
  for (let index = 0; index < POINT_ORDER.length; index += 1) {
    const current = toWorld(points[POINT_ORDER[index]]);
    const next = toWorld(points[POINT_ORDER[(index + 1) % POINT_ORDER.length]]);
    anchors.push(current);
    const midpoint = current.clone().add(next).multiplyScalar(0.5);
    const valley = center.clone().lerp(midpoint, clamp(state.core, 0.05, 0.92));
    valley.z = THREE.MathUtils.lerp(center.z, (current.z + next.z) * 0.5, Math.min(0.82, state.core + 0.15));
    anchors.push(valley);
  }
  return anchors;
}

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
camera.position.set(245, 75, 335);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 170;
controls.maxDistance = 760;
controls.target.set(0, 0, 0);

const grid = new THREE.GridHelper(520, 26, 0x1d4b47, 0x0b201f);
grid.rotation.x = Math.PI / 2;
grid.position.z = -95;
scene.add(grid);
const axesMaterial = new THREE.LineBasicMaterial({ color: 0x204e4a, transparent: true, opacity: 0.42 });
function addAxis(a, b) {
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]), axesMaterial));
}
addAxis(new THREE.Vector3(-180,0,0), new THREE.Vector3(180,0,0));
addAxis(new THREE.Vector3(0,-180,0), new THREE.Vector3(0,180,0));
addAxis(new THREE.Vector3(0,0,-150), new THREE.Vector3(0,0,150));

const glyphGroup = new THREE.Group();
const handleGroup = new THREE.Group();
scene.add(glyphGroup, handleGroup);
const cyan = 0x55f1dc;
const fillMaterial = new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: state.fill, side: THREE.DoubleSide, depthWrite: false });
const outlineMaterial = new THREE.LineBasicMaterial({ color: cyan, transparent: true, opacity: 0.97 });
const structureMaterial = new THREE.LineBasicMaterial({ color: cyan, transparent: true, opacity: 0.28 });
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
  const shape2 = contour.map((p) => new THREE.Vector2(p.x, p.y));
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
  const center = centroid();
  const points = [];
  POINT_ORDER.forEach((key) => points.push(center.clone(), toWorld(state.points[key])));
  return new THREE.BufferGeometry().setFromPoints(points);
}

function buildGlyph() {
  disposeGroup(glyphGroup);
  const contour = smoothClosed(generatedAnchors());
  fillMaterial.opacity = state.fill;
  glyphGroup.add(
    new THREE.Mesh(surfaceGeometry(contour), fillMaterial),
    new THREE.Line(lineLoopGeometry(contour), outlineMaterial),
    new THREE.LineSegments(structureGeometry(), structureMaterial),
  );
}

function buildHandles() {
  disposeGroup(handleGroup);
  handleMeshes.clear();
  for (const key of POINT_ORDER) {
    const group = new THREE.Group();
    const visible = new THREE.Mesh(
      new THREE.SphereGeometry(key === selectedPoint ? 4.6 : 3.5, 16, 12),
      new THREE.MeshBasicMaterial({ color: key === selectedPoint ? 0xffffff : cyan }),
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
  depthInput.value = String(clamp(point.z, -150, 150));
  depthValue.textContent = String(Math.round(point.z));
  coreInput.value = String(state.core);
  coreValue.textContent = Number(state.core).toFixed(2);
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
  if (view === 'front') camera.position.set(0,0,distance);
  else if (view === 'side') camera.position.set(distance,0,0);
  else if (view === 'top') camera.position.set(0,distance,0.001);
  controls.target.set(0,0,0);
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
  state.points[key] = {
    x: clamp(point.x, -165, 165),
    y: clamp(point.y, -165, 165),
    z: clamp(point.z, -150, 150),
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

depthInput.addEventListener('input', () => {
  const next = clone(state.points[selectedPoint]);
  next.z = Number(depthInput.value);
  setPoint(selectedPoint, next);
});
coreInput.addEventListener('input', () => { state.core = Number(coreInput.value); saveState(); renderEditor(); });
curveInput.addEventListener('input', () => { state.curve = Number(curveInput.value); saveState(); renderEditor(); });
fillInput.addEventListener('input', () => { state.fill = Number(fillInput.value); saveState(); renderEditor(); });
flattenButton.addEventListener('click', () => {
  POINT_ORDER.forEach((key) => { state.points[key].z = 0; });
  saveState(); renderEditor();
});
resetButton.addEventListener('click', () => {
  const view = state.view;
  state = { ...clone(STARFISH), view };
  selectedPoint = 'arm0';
  saveState(); renderEditor();
});

function exportDefinition() {
  return {
    format: STARFISH.format,
    version: 1,
    generator: STARFISH.generator,
    curve: state.curve,
    core: state.core,
    fill: state.fill,
    points: clone(state.points),
  };
}
async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed'; textarea.style.opacity = '0';
  document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove();
}
copyButton.addEventListener('click', async () => {
  try {
    await copyText(JSON.stringify(exportDefinition(), null, 2));
    copyButton.textContent = 'COPIED'; setTimeout(() => { copyButton.textContent = 'COPY JSON'; }, 900);
  } catch (error) { console.warn('Could not copy Black ICE glyph', error); }
});
downloadButton.addEventListener('click', () => {
  const blob = new Blob([`${JSON.stringify(exportDefinition(), null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'arkour-black-ice-starfish-v1.json';
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 500);
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
if (state.view !== 'orbit') snapView(state.view);
function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
