const svg = document.querySelector('#editor');
const ghostLayer = document.querySelector('#ghost-layer');
const glyphFill = document.querySelector('#glyph-fill');
const glyphOutline = document.querySelector('#glyph-outline');
const glyphSpine = document.querySelector('#glyph-spine');
const handleLayer = document.querySelector('#handle-layer');
const pointName = document.querySelector('#point-name');
const pointCoords = document.querySelector('#point-coords');
const poseNote = document.querySelector('#pose-note');
const symmetryButton = document.querySelector('#symmetry');
const ghostsButton = document.querySelector('#ghosts');
const morphButton = document.querySelector('#morph');
const curveInput = document.querySelector('#curve');
const fillInput = document.querySelector('#fill');
const resetPoseButton = document.querySelector('#reset-pose');
const resetAllButton = document.querySelector('#reset-all');
const copyJsonButton = document.querySelector('#copy-json');
const downloadSvgButton = document.querySelector('#download-svg');
const poseTabs = Array.from(document.querySelectorAll('.pose-tab'));

const STORAGE_KEY = 'arkour-runner-glyph-editor-v1';
const SVG_NS = 'http://www.w3.org/2000/svg';

const POINT_ORDER = [
  'head',
  'neckR',
  'handR',
  'underarmR',
  'flankR',
  'foot',
  'flankL',
  'underarmL',
  'handL',
  'neckL',
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
  neckR: 'neckL',
  handR: 'handL',
  underarmR: 'underarmL',
  flankR: 'flankL',
  neckL: 'neckR',
  handL: 'handR',
  underarmL: 'underarmR',
  flankL: 'flankR',
};

const POSE_NOTES = {
  flying: 'streamlined travel silhouette',
  upright: 'neutral / standing silhouette',
  landing: 'compressed impact / bracing silhouette',
};

const DEFAULTS = {
  flying: {
    head: { x: 0, y: -116 },
    neckR: { x: 8, y: -100 },
    handR: { x: 42, y: -80 },
    underarmR: { x: 31, y: -55 },
    flankR: { x: 18, y: 26 },
    foot: { x: 0, y: 124 },
    flankL: { x: -18, y: 26 },
    underarmL: { x: -31, y: -55 },
    handL: { x: -42, y: -80 },
    neckL: { x: -8, y: -100 },
  },
  upright: {
    head: { x: 0, y: -112 },
    neckR: { x: 13, y: -96 },
    handR: { x: 77, y: -73 },
    underarmR: { x: 53, y: -43 },
    flankR: { x: 28, y: 35 },
    foot: { x: 0, y: 112 },
    flankL: { x: -28, y: 35 },
    underarmL: { x: -53, y: -43 },
    handL: { x: -77, y: -73 },
    neckL: { x: -13, y: -96 },
  },
  landing: {
    head: { x: 0, y: -88 },
    neckR: { x: 14, y: -73 },
    handR: { x: 91, y: -48 },
    underarmR: { x: 58, y: -19 },
    flankR: { x: 39, y: 46 },
    foot: { x: 0, y: 89 },
    flankL: { x: -39, y: 46 },
    underarmL: { x: -58, y: -19 },
    handL: { x: -91, y: -48 },
    neckL: { x: -14, y: -73 },
  },
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

let state = {
  version: 1,
  pose: 'upright',
  symmetry: true,
  ghosts: true,
  curve: 0.68,
  fill: 0.10,
  poses: deepClone(DEFAULTS),
};

let selectedPoint = 'head';
let draggingPoint = null;
let morphPlaying = false;
let morphStart = 0;
let morphFrame = null;

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (parsed?.version !== 1 || !parsed.poses) return;
    state = {
      ...state,
      ...parsed,
      poses: {
        flying: { ...deepClone(DEFAULTS.flying), ...parsed.poses.flying },
        upright: { ...deepClone(DEFAULTS.upright), ...parsed.poses.upright },
        landing: { ...deepClone(DEFAULTS.landing), ...parsed.poses.landing },
      },
    };
  } catch (error) {
    console.warn('Could not load runner glyph editor state', error);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Could not save runner glyph editor state', error);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function currentPose() {
  return state.poses[state.pose];
}

function orderedPoints(pose) {
  return POINT_ORDER.map((key) => pose[key]);
}

function smoothClosedPath(points, tension = 0.68) {
  if (!points.length) return '';
  const n = points.length;
  const t = clamp(tension, 0, 1);
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let index = 0; index < n; index += 1) {
    const p0 = points[(index - 1 + n) % n];
    const p1 = points[index];
    const p2 = points[(index + 1) % n];
    const p3 = points[(index + 2) % n];
    const c1 = {
      x: p1.x + ((p2.x - p0.x) * t) / 6,
      y: p1.y + ((p2.y - p0.y) * t) / 6,
    };
    const c2 = {
      x: p2.x - ((p3.x - p1.x) * t) / 6,
      y: p2.y - ((p3.y - p1.y) * t) / 6,
    };
    d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return `${d} Z`;
}

function spinePath(pose) {
  const { head, foot, handL, handR, underarmL, underarmR } = pose;
  return [
    `M ${head.x} ${head.y} L ${foot.x} ${foot.y}`,
    `M ${handL.x} ${handL.y} L ${handR.x} ${handR.y}`,
    `M ${underarmL.x} ${underarmL.y} L ${underarmR.x} ${underarmR.y}`,
  ].join(' ');
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function renderGhosts() {
  ghostLayer.replaceChildren();
  if (!state.ghosts || morphPlaying) return;

  for (const poseName of ['flying', 'upright', 'landing']) {
    if (poseName === state.pose) continue;
    const path = createSvgElement('path', {
      class: 'ghost-path',
      d: smoothClosedPath(orderedPoints(state.poses[poseName]), state.curve),
    });
    ghostLayer.appendChild(path);
  }
}

function renderHandles(pose) {
  handleLayer.replaceChildren();
  if (morphPlaying) return;

  for (const key of POINT_ORDER) {
    const point = pose[key];
    const group = createSvgElement('g', {
      class: `handle-group${selectedPoint === key ? ' selected' : ''}`,
      'data-point': key,
    });
    const hit = createSvgElement('circle', { class: 'handle-hit', cx: point.x, cy: point.y, r: 15 });
    const ring = createSvgElement('circle', { class: 'handle-ring', cx: point.x, cy: point.y, r: 5.4 });
    const dot = createSvgElement('circle', { class: 'handle-dot', cx: point.x, cy: point.y, r: 1.8 });
    const label = createSvgElement('text', {
      class: 'handle-label',
      x: point.x + (point.x >= 0 ? 9 : -9),
      y: point.y - 8,
      'text-anchor': point.x >= 0 ? 'start' : 'end',
    });
    label.textContent = POINT_LABELS[key];
    group.append(hit, ring, dot, label);
    group.addEventListener('pointerdown', onHandlePointerDown);
    handleLayer.appendChild(group);
  }
}

function renderPose(pose = currentPose()) {
  const path = smoothClosedPath(orderedPoints(pose), state.curve);
  glyphFill.setAttribute('d', path);
  glyphOutline.setAttribute('d', path);
  glyphSpine.setAttribute('d', spinePath(pose));
  glyphFill.style.fill = `rgba(85, 241, 220, ${state.fill})`;
  renderGhosts();
  renderHandles(currentPose());
  updateReadout();
}

function updateReadout() {
  const point = currentPose()[selectedPoint];
  pointName.textContent = POINT_LABELS[selectedPoint];
  pointCoords.textContent = `${Math.round(point.x)}, ${Math.round(point.y)}`;
}

function updateUi() {
  poseTabs.forEach((button) => {
    const selected = button.dataset.pose === state.pose;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  symmetryButton.classList.toggle('active', state.symmetry);
  symmetryButton.setAttribute('aria-pressed', state.symmetry ? 'true' : 'false');
  symmetryButton.textContent = `SYMMETRY: ${state.symmetry ? 'ON' : 'OFF'}`;
  ghostsButton.classList.toggle('active', state.ghosts);
  ghostsButton.setAttribute('aria-pressed', state.ghosts ? 'true' : 'false');
  ghostsButton.textContent = `GHOST POSES: ${state.ghosts ? 'ON' : 'OFF'}`;
  curveInput.value = String(state.curve);
  fillInput.value = String(state.fill);
  poseNote.textContent = POSE_NOTES[state.pose];
}

function screenToSvg(clientX, clientY) {
  const point = new DOMPoint(clientX, clientY);
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const local = point.matrixTransform(matrix.inverse());
  return {
    x: clamp(local.x, -112, 112),
    y: clamp(local.y, -128, 128),
  };
}

function setPoint(key, position) {
  const pose = currentPose();
  if (key === 'head' || key === 'foot') {
    pose[key] = { x: 0, y: position.y };
  } else {
    pose[key] = { x: position.x, y: position.y };
    if (state.symmetry && MIRROR[key]) {
      pose[MIRROR[key]] = { x: -position.x, y: position.y };
    }
  }
  saveState();
  renderPose();
}

function onHandlePointerDown(event) {
  if (morphPlaying) return;
  event.preventDefault();
  const group = event.currentTarget;
  const key = group.dataset.point;
  if (!key) return;
  selectedPoint = key;
  draggingPoint = key;
  svg.setPointerCapture?.(event.pointerId);
  setPoint(key, screenToSvg(event.clientX, event.clientY));
}

svg.addEventListener('pointermove', (event) => {
  if (!draggingPoint || morphPlaying) return;
  event.preventDefault();
  setPoint(draggingPoint, screenToSvg(event.clientX, event.clientY));
});

function endDrag(event) {
  if (!draggingPoint) return;
  draggingPoint = null;
  if (event?.pointerId !== undefined && svg.hasPointerCapture?.(event.pointerId)) {
    svg.releasePointerCapture(event.pointerId);
  }
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);
svg.addEventListener('lostpointercapture', () => { draggingPoint = null; });

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

resetPoseButton.addEventListener('click', () => {
  stopMorph();
  state.poses[state.pose] = deepClone(DEFAULTS[state.pose]);
  saveState();
  renderPose();
});

resetAllButton.addEventListener('click', () => {
  stopMorph();
  state.poses = deepClone(DEFAULTS);
  state.pose = 'upright';
  state.symmetry = true;
  state.ghosts = true;
  state.curve = 0.68;
  state.fill = 0.10;
  selectedPoint = 'head';
  saveState();
  updateUi();
  renderPose();
});

function mix(a, b, t) {
  return a + (b - a) * t;
}

function ease(t) {
  return t * t * (3 - 2 * t);
}

function blendPose(a, b, t) {
  const result = {};
  const u = ease(clamp(t, 0, 1));
  for (const key of POINT_ORDER) {
    result[key] = {
      x: mix(a[key].x, b[key].x, u),
      y: mix(a[key].y, b[key].y, u),
    };
  }
  return result;
}

function morphPoseAt(timeSeconds) {
  const sequence = ['flying', 'upright', 'landing', 'upright'];
  const duration = 1.45;
  const total = sequence.length * duration;
  const local = timeSeconds % total;
  const index = Math.floor(local / duration);
  const next = (index + 1) % sequence.length;
  const t = (local % duration) / duration;
  return blendPose(state.poses[sequence[index]], state.poses[sequence[next]], t);
}

function morphLoop(now) {
  if (!morphPlaying) return;
  const seconds = (now - morphStart) / 1000;
  renderPose(morphPoseAt(seconds));
  morphFrame = requestAnimationFrame(morphLoop);
}

function startMorph() {
  if (morphPlaying) return;
  morphPlaying = true;
  morphStart = performance.now();
  morphButton.classList.add('active');
  morphButton.setAttribute('aria-pressed', 'true');
  morphButton.textContent = 'STOP MORPH';
  renderGhosts();
  handleLayer.replaceChildren();
  morphFrame = requestAnimationFrame(morphLoop);
}

function stopMorph() {
  if (!morphPlaying) return;
  morphPlaying = false;
  if (morphFrame !== null) cancelAnimationFrame(morphFrame);
  morphFrame = null;
  morphButton.classList.remove('active');
  morphButton.setAttribute('aria-pressed', 'false');
  morphButton.textContent = 'PLAY MORPH';
  renderPose();
}

morphButton.addEventListener('click', () => {
  if (morphPlaying) stopMorph();
  else startMorph();
});

function exportDefinition() {
  return {
    format: 'arkour-runner-glyph',
    version: 1,
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
    setTimeout(() => { copyJsonButton.textContent = 'COPY JSON'; }, 1400);
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

downloadSvgButton.addEventListener('click', () => {
  stopMorph();
  const pose = currentPose();
  const d = smoothClosedPath(orderedPoints(pose), state.curve);
  const spine = spinePath(pose);
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-120 -140 240 280">\n  <path d="${d}" fill="rgba(85,241,220,${state.fill})" stroke="#55f1dc" stroke-width="2.2" stroke-linejoin="round"/>\n  <path d="${spine}" fill="none" stroke="rgba(85,241,220,.36)" stroke-width="1" stroke-dasharray="5 5"/>\n</svg>\n`;
  download(`arkour-runner-${state.pose}.svg`, svgText, 'image/svg+xml');
});

loadState();
updateUi();
renderPose();
