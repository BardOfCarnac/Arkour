const canvas = document.querySelector('#viewport');
const ctx = canvas.getContext('2d');
const playButton = document.querySelector('#play');
const resetButton = document.querySelector('#reset');
const clearanceButton = document.querySelector('#clearance');
const densityInput = document.querySelector('#density');
const scrubInput = document.querySelector('#scrub');
const stageEl = document.querySelector('#stage');
const progressEl = document.querySelector('#progress');

const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const length = (a) => Math.hypot(a.x, a.y, a.z) || 1;
const normal = (a) => mul(a, 1 / length(a));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const COLORS = {
  cyan: '#55f1dc',
  cyanEdge: 'rgba(85,241,220,.58)',
  cyanDim: 'rgba(62,148,140,.34)',
  cyanFaint: 'rgba(51,111,107,.22)',
  red: '#ff3d52',
  redDim: 'rgba(255,61,82,.48)',
  dark: 'rgba(3,7,9,.985)',
  dark2: 'rgba(5,11,13,.97)',
  grey: 'rgba(112,145,142,.22)',
};

let W = 0;
let H = 0;
let DPR = 1;
function resize() {
  W = innerWidth;
  H = innerHeight;
  DPR = Math.min(W < 760 ? 1.1 : 1.45, devicePixelRatio || 1);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Logical graph. The graph determines connectivity, not literal underground scale.
// ---------------------------------------------------------------------------
const topology = [
  { id: 'password', label: 'PASSWORD', sub: 'DV8', floor: 1, lane: 0 },
  { id: 'file', label: 'FILE', sub: 'DV6', floor: 2, lane: 0 },
  { id: 'hellhound', label: 'HELLHOUND', sub: 'BRANCH JUNCTION', floor: 3, lane: 0 },
  { id: 'left1', label: 'CONTROL NODE', sub: 'DV6', floor: 4, lane: -1 },
  { id: 'centre1', label: 'CONTROL NODE', sub: 'DV6', floor: 4, lane: 0 },
  { id: 'right1', label: 'CONTROL NODE', sub: 'DV6', floor: 4, lane: 1 },
  { id: 'left2', label: 'CONTROL NODE', sub: 'DV6', floor: 5, lane: -1 },
  { id: 'centre2', label: 'CONTROL NODE', sub: 'DV6', floor: 5, lane: 0 },
  { id: 'right2', label: 'CONTROL NODE', sub: 'DV6', floor: 5, lane: 1 },
  { id: 'efreet', label: 'EFREET', sub: 'CORE', floor: 6, lane: 0 },
];
const byId = Object.fromEntries(topology.map((node) => [node.id, node]));
const edges = [
  ['password', 'file'], ['file', 'hellhound'],
  ['hellhound', 'left1'], ['hellhound', 'centre1'], ['hellhound', 'right1'],
  ['left1', 'left2'], ['centre1', 'centre2'], ['right1', 'right2'],
  ['centre2', 'efreet'],
];

const depthByFloor = { 1: -14, 2: -31, 3: -49, 4: -67, 5: -84, 6: -103 };
const undergroundPosition = (node) => V(node.lane * 19, depthByFloor[node.floor], node.lane === 0 ? 2 : 4);
const surfacePosition = (node) => V(15 + node.lane * 5.2, 2.2 + (node.floor - 1) * 4.1, 7);

function hardRouteSegments(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.abs(dx) < 0.1 && Math.abs(dz) < 0.1) return [[a, b]];
  const midY = a.y + (b.y - a.y) * 0.44;
  const p1 = V(a.x, midY, a.z);
  const p2 = V(b.x, midY, b.z);
  return [[a, p1], [p1, p2], [p2, b]];
}

const redRouteSegments = [];
redRouteSegments.push(...hardRouteSegments(V(0, 0, 0), undergroundPosition(byId.password)));
for (const [fromId, toId] of edges) {
  redRouteSegments.push(...hardRouteSegments(undergroundPosition(byId[fromId]), undergroundPosition(byId[toId])));
}

// ---------------------------------------------------------------------------
// Camera presentation. It curves around the hard route rather than tracing it.
// ---------------------------------------------------------------------------
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return V(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  );
}
function spline(points, t) {
  t = clamp(t, 0, 0.999999);
  const n = points.length - 1;
  const scaled = t * n;
  const i = Math.floor(scaled);
  const u = scaled - i;
  return catmull(
    points[Math.max(0, i - 1)],
    points[i],
    points[Math.min(n, i + 1)],
    points[Math.min(n, i + 2)],
    u,
  );
}

const cameraPoints = [
  V(-36, 2.4, -12), V(-25, 2.25, -9), V(-14, 2.1, -5), V(-5, 1.9, -1),
  V(-1.2, 1.6, 0), V(1.8, -5, 4.5), V(-2.2, -15, 5.5), V(2.4, -27, 4.0),
  V(-2.6, -40, -4.2), V(2.4, -52, 3.8), V(-2.8, -67, 5.2), V(2.8, -82, -4.2),
  V(-2.0, -95, 3.6), V(-0.3, -103, 1.2),
];
const lookPoints = [
  V(-19, 2.2, 2), V(-8, 2.1, 1), V(-1, 1.5, 0), V(0, -5, 0), V(0, -15, 2),
  V(0, -29, 2), V(0, -44, 2), V(0, -58, 2), V(0, -72, 2), V(0, -87, 2), V(0, -103, 2),
];

const cameraSafetySegments = [];
{
  let previous = spline(cameraPoints, 0);
  for (let i = 1; i <= 112; i += 1) {
    const next = spline(cameraPoints, i / 112);
    cameraSafetySegments.push([previous, next]);
    previous = next;
  }
}

// ---------------------------------------------------------------------------
// Route-first keep-out geometry.
// Every opaque block is rejected before it reaches the renderer if its AABB
// overlaps the expanded red-route envelope or the sampled camera envelope.
// ---------------------------------------------------------------------------
function segmentHitsExpandedBox(a, b, center, size, margin) {
  const min = V(center.x - size.x / 2 - margin, center.y - size.y / 2 - margin, center.z - size.z / 2 - margin);
  const max = V(center.x + size.x / 2 + margin, center.y + size.y / 2 + margin, center.z + size.z / 2 + margin);
  const d = sub(b, a);
  let t0 = 0;
  let t1 = 1;
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(d[axis]) < 1e-9) {
      if (a[axis] < min[axis] || a[axis] > max[axis]) return false;
      continue;
    }
    let u0 = (min[axis] - a[axis]) / d[axis];
    let u1 = (max[axis] - a[axis]) / d[axis];
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0);
    t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}

function safeBlock(center, size, routeMargin = 3.1, cameraMargin = 2.8) {
  for (const segment of redRouteSegments) {
    if (segmentHitsExpandedBox(segment[0], segment[1], center, size, routeMargin)) return false;
  }
  for (const segment of cameraSafetySegments) {
    if (segmentHitsExpandedBox(segment[0], segment[1], center, size, cameraMargin)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// World generation. Nodes are major components with real apertures; the city
// is secondary mass packed into remaining space.
// ---------------------------------------------------------------------------
let blocks = [];
let worldLabels = [];
const block = (center, size, material = 'city', force = false) => {
  if (!force && !safeBlock(center, size)) return false;
  blocks.push({ center, size, material });
  return true;
};
const label = (position, text, subtext = '', hot = false) => worldLabels.push({ position, text, subtext, hot });

function addFlanks(y, z, span = 13, width = 8.5, height = 11, depth = 13, material = 'node') {
  block(V(-span, y, z), V(width, height, depth), material);
  block(V(span, y, z), V(width, height, depth), material);
}

function buildNodes() {
  for (const node of topology) {
    const p = undergroundPosition(node);
    const hot = ['hellhound', 'centre1', 'centre2', 'efreet'].includes(node.id);
    const material = hot ? 'danger' : 'node';

    if (node.lane !== 0) {
      const side = Math.sign(node.lane);
      const x = p.x + side * 6;
      block(V(x, p.y, p.z), V(15, 10, 13), material);
      block(V(x - side * 6, p.y + 3.5, p.z - 1), V(5, 2.2, 8), material);
      label(V(x, p.y + 0.8, p.z), node.label, node.sub, hot);
      continue;
    }

    if (node.id === 'hellhound') {
      addFlanks(p.y, p.z, 17, 12, 14, 17, material);
      block(V(-9.5, p.y + 6.5, p.z), V(6.2, 2.6, 12), material);
      block(V(9.5, p.y + 6.5, p.z), V(6.2, 2.6, 12), material);
      block(V(-11, p.y - 5.0, p.z + 2), V(7, 3, 10), material);
      block(V(11, p.y - 5.0, p.z + 2), V(7, 3, 10), material);
    } else if (node.id === 'efreet') {
      addFlanks(p.y, p.z, 15.5, 10, 14, 16, material);
      block(V(-8.5, p.y + 7, p.z), V(6, 2.6, 12), material);
      block(V(8.5, p.y + 7, p.z), V(6, 2.6, 12), material);
    } else {
      addFlanks(p.y, p.z, node.id === 'file' ? 14 : 13, node.id === 'file' ? 9 : 8, 11, 13, material);
      block(V(-9, p.y + 3.6, p.z - 1), V(6.2, 2.2, 7), material);
      block(V(9, p.y + 3.6, p.z - 1), V(6.2, 2.2, 7), material);
    }
    label(V(0, p.y + 1, p.z), node.label, node.sub, hot);
  }
}

function random(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return Math.abs(x - Math.floor(x));
}

function buildCity(density) {
  // Continuous canyon walls in stacked districts.
  const levels = [-21, -37, -55, -72, -89, -103];
  levels.forEach((y, i) => {
    const spread = 23 + (i % 2) * 4;
    if (random(50 + i) <= density) block(V(-spread, y, 11 - (i % 3) * 7), V(12, 17 + (i % 3) * 4, 13), 'city');
    if (random(80 + i) <= density) block(V(spread, y, -8 + (i % 3) * 7), V(12, 19 + ((i + 1) % 3) * 4, 13), 'city');
    if (density > 0.65) {
      block(V(-spread - 11, y - 3, -5), V(8, 12, 9), 'city');
      block(V(spread + 11, y + 2, 8), V(8, 13, 9), 'city');
    }
  });

  // Pinch points are flanking masses, never slabs across the reserved route.
  for (const [y, gap] of [[-41, 11.5], [-74, 10.8], [-91, 11.5]]) {
    if (density < 0.35 && y !== -41) continue;
    block(V(-gap - 5.5, y, 2), V(10, 15, 11), 'city');
    block(V(gap + 5.5, y, 2), V(10, 15, 11), 'city');
  }

  // Heavy cantilever decks: two halves with a permanent fly-through slot.
  const decks = [
    [-19, 12], [-28, -10], [-39, 11], [-52, -11], [-62, 12], [-76, -10], [-87, 11], [-97, -9],
  ];
  decks.forEach(([y, z], i) => {
    if (random(160 + i) > density) return;
    block(V(-20, y, z), V(18, 1.6, 5), 'deck');
    block(V(20, y, z), V(18, 1.6, 5), 'deck');
  });

  // Hanging shelves / kiosks make the canyon feel occupied rather than decorative.
  const shelves = [
    [-15, -25, 8], [15, -34, -8], [-15, -47, -7], [15, -58, 10],
    [-15, -68, 9], [15, -80, -10], [-15, -91, -6], [15, -100, 9],
  ];
  shelves.forEach(([x, y, z], i) => {
    if (random(230 + i) > density) return;
    block(V(x, y, z), V(9 + (i % 2) * 2, 1.4, 6), 'deck');
    block(V(x + (x < 0 ? -2 : 2), y + 2.2, z), V(3.3, 3.2, 3.4), 'city');
  });
}

function rebuildWorld() {
  blocks = [];
  worldLabels = [];
  buildNodes();
  buildCity(Number(densityInput.value));
}
rebuildWorld();
densityInput.addEventListener('input', rebuildWorld);

// ---------------------------------------------------------------------------
// Lightweight painter renderer. Solid faces make underground objects opaque;
// wire edges are a surface treatment rather than transparency.
// ---------------------------------------------------------------------------
const camera = { pos: V(), target: V(), f: V(), r: V(), u: V(), focal: 1 };
let leanX = 0;
let leanY = 0;
function updateCamera(t) {
  camera.pos = spline(cameraPoints, t);
  camera.target = spline(lookPoints, clamp(t * 1.07 + 0.03, 0, 1));
  camera.target = add(camera.target, V(leanX * 3.4, leanY * 2.2, -leanX));
  camera.f = normal(sub(camera.target, camera.pos));
  let right = cross(camera.f, V(0, 1, 0));
  if (length(right) < 0.05) right = cross(camera.f, V(0, 0, 1));
  camera.r = normal(right);
  camera.u = normal(cross(camera.r, camera.f));
  camera.focal = Math.min(W, H) * 0.98;
}

function project(p) {
  const q = sub(p, camera.pos);
  const x = dot(q, camera.r);
  const y = dot(q, camera.u);
  const z = dot(q, camera.f);
  if (z < 0.35 || z > 118) return null;
  return { x: W / 2 + x * camera.focal / z, y: H / 2 - y * camera.focal / z, z, s: camera.focal / z };
}

let commands = [];
let projectedLabels = [];
function line3(a, b, color, width = 1, alpha = 1) {
  const pa = project(a);
  const pb = project(b);
  if (!pa || !pb) return;
  commands.push({ type: 'line', pa, pb, color, width, alpha, depth: (pa.z + pb.z) / 2 });
}
function face3(points, fill, stroke, alpha = 1) {
  const projected = points.map(project);
  if (projected.some((p) => !p)) return;
  commands.push({ type: 'face', points: projected, fill, stroke, alpha, depth: projected.reduce((s, p) => s + p.z, 0) / projected.length });
}
function point3(p, color, radius = 1.2, alpha = 0.8) {
  const q = project(p);
  if (!q) return;
  commands.push({ type: 'point', q, color, radius, alpha, depth: q.z });
}

const BOX_EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const BOX_FACES = [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]];
function drawSolidBlock(item) {
  const { center: c, size: s, material } = item;
  const sx = s.x / 2, sy = s.y / 2, sz = s.z / 2;
  const p = [
    V(c.x-sx,c.y-sy,c.z-sz), V(c.x+sx,c.y-sy,c.z-sz), V(c.x+sx,c.y+sy,c.z-sz), V(c.x-sx,c.y+sy,c.z-sz),
    V(c.x-sx,c.y-sy,c.z+sz), V(c.x+sx,c.y-sy,c.z+sz), V(c.x+sx,c.y+sy,c.z+sz), V(c.x-sx,c.y+sy,c.z+sz),
  ];
  const danger = material === 'danger';
  const edge = danger ? 'rgba(255,61,82,.68)' : material === 'deck' ? 'rgba(85,241,220,.40)' : COLORS.cyanEdge;
  const fill = danger ? 'rgba(16,5,8,.99)' : material === 'city' ? 'rgba(3,8,10,.995)' : 'rgba(4,9,11,.995)';
  for (const f of BOX_FACES) face3(f.map((i) => p[i]), fill, edge, 1);
  for (const e of BOX_EDGES) line3(p[e[0]], p[e[1]], edge, danger ? 1.15 : 0.85, 0.9);

  // Sparse face ribs give the hard objects a wireframe language without making them transparent.
  if (s.y > 7) {
    const frontZ = c.z - sz - 0.02;
    line3(V(c.x, c.y-sy, frontZ), V(c.x, c.y+sy, frontZ), danger ? COLORS.redDim : COLORS.cyanFaint, 0.65, 0.72);
  }
}

function ring3(center, radius, color, alpha = 0.55) {
  let previous = null;
  for (let i = 0; i <= 20; i += 1) {
    const a = Math.PI * 2 * i / 20;
    const p = V(center.x + Math.cos(a) * radius, center.y, center.z + Math.sin(a) * radius);
    if (previous) line3(previous, p, color, 0.8, alpha);
    previous = p;
  }
}

function drawGround() {
  for (let x = -50; x <= 50; x += 5) line3(V(x, 0, -25), V(x, 0, 60), COLORS.grey, 0.7, 0.6);
  for (let z = -25; z <= 60; z += 5) line3(V(-50, 0, z), V(50, 0, z), COLORS.grey, 0.7, 0.6);
  ring3(V(0, 0.03, 0), 3.8, COLORS.cyan, 0.72);
  ring3(V(0, 0.04, 0), 2.6, COLORS.red, 0.8);
}

function drawSurfaceMirror() {
  // Deliberately schematic: graph shape above the surface, not underground scale.
  for (const node of topology) {
    const c = surfacePosition(node);
    const s = V(node.id === 'hellhound' ? 4.8 : 3.8, 2.7, 3.8);
    const sx = s.x/2, sy=s.y/2, sz=s.z/2;
    const p = [
      V(c.x-sx,c.y-sy,c.z-sz),V(c.x+sx,c.y-sy,c.z-sz),V(c.x+sx,c.y+sy,c.z-sz),V(c.x-sx,c.y+sy,c.z-sz),
      V(c.x-sx,c.y-sy,c.z+sz),V(c.x+sx,c.y-sy,c.z+sz),V(c.x+sx,c.y+sy,c.z+sz),V(c.x-sx,c.y+sy,c.z+sz),
    ];
    for (const e of BOX_EDGES) line3(p[e[0]], p[e[1]], COLORS.cyanEdge, 0.9, 0.72);
  }
  for (const [fromId, toId] of edges) line3(surfacePosition(byId[fromId]), surfacePosition(byId[toId]), COLORS.cyan, 1, 0.55);
}

function drawRoute(showClearance) {
  for (const [a, b] of redRouteSegments) {
    line3(a, b, COLORS.red, 2.25, 0.98);
    if (showClearance) {
      line3(add(a,V(3.1,0,0)),add(b,V(3.1,0,0)),'rgba(255,255,255,.38)',0.75,0.55);
      line3(add(a,V(-3.1,0,0)),add(b,V(-3.1,0,0)),'rgba(255,255,255,.38)',0.75,0.55);
      line3(add(a,V(0,0,3.1)),add(b,V(0,0,3.1)),'rgba(255,255,255,.23)',0.65,0.42);
      line3(add(a,V(0,0,-3.1)),add(b,V(0,0,-3.1)),'rgba(255,255,255,.23)',0.65,0.42);
    }
  }
}

function drawTraffic(time) {
  const lanes = [
    { x: -14, z: 13, a: -13, b: -101 }, { x: 15, z: -12, a: -18, b: -98 },
    { x: -27, z: -4, a: -25, b: -92 }, { x: 28, z: 8, a: -20, b: -100 },
  ];
  lanes.forEach((lane, i) => {
    line3(V(lane.x,lane.a,lane.z),V(lane.x,lane.b,lane.z),COLORS.cyanFaint,0.6,0.55);
    for (let k = 0; k < 2; k += 1) {
      const u = (time * (0.024 + i * 0.004 + k * 0.006) + random(i * 20 + k)) % 1;
      point3(V(lane.x, lane.a + (lane.b-lane.a) * u, lane.z), k === 1 && i % 2 ? COLORS.red : COLORS.cyan, 1.1, 0.78);
    }
  });
}

function projectWorldLabels() {
  projectedLabels = [];
  for (const item of worldLabels) {
    const q = project(item.position);
    if (q && q.z < 75) projectedLabels.push({ ...item, q });
  }
}

function renderCommands() {
  commands.sort((a, b) => b.depth - a.depth);
  for (const command of commands) {
    if (command.type === 'face') {
      ctx.save();
      ctx.globalAlpha = command.alpha;
      ctx.fillStyle = command.fill;
      ctx.strokeStyle = command.stroke;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(command.points[0].x, command.points[0].y);
      for (let i = 1; i < command.points.length; i += 1) ctx.lineTo(command.points[i].x, command.points[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (command.type === 'line') {
      ctx.save();
      ctx.globalAlpha = command.alpha;
      ctx.strokeStyle = command.color;
      ctx.lineWidth = command.width;
      ctx.beginPath();
      ctx.moveTo(command.pa.x, command.pa.y);
      ctx.lineTo(command.pb.x, command.pb.y);
      ctx.stroke();
      ctx.restore();
    } else if (command.type === 'point') {
      ctx.save();
      ctx.globalAlpha = command.alpha;
      ctx.fillStyle = command.color;
      const r = clamp(command.radius * command.q.s * 0.22, 0.7, 3);
      ctx.beginPath();
      ctx.arc(command.q.x, command.q.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function renderLabels() {
  for (const item of projectedLabels.sort((a,b) => b.q.z - a.q.z)) {
    const scale = clamp(21 / item.q.z, 0.4, 1.15);
    const fontSize = clamp(12 * scale, 7, 13);
    ctx.save();
    ctx.translate(item.q.x, item.q.y);
    ctx.globalAlpha = clamp(1 - item.q.z / 120, 0.32, 0.9);
    ctx.font = `${fontSize}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = Math.max(72, ctx.measureText(item.text).width + 18);
    const height = item.subtext ? 29 : 20;
    ctx.fillStyle = 'rgba(3,8,10,.82)';
    ctx.strokeStyle = item.hot ? COLORS.red : COLORS.cyanEdge;
    ctx.lineWidth = 1;
    ctx.fillRect(-width/2,-height/2,width,height);
    ctx.strokeRect(-width/2,-height/2,width,height);
    ctx.fillStyle = '#dcfffa';
    ctx.fillText(item.text, 0, item.subtext ? -5 : 0);
    if (item.subtext) {
      ctx.font = `${Math.max(6,fontSize*.68)}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
      ctx.fillStyle = item.hot ? '#ff98a5' : '#84aaa5';
      ctx.fillText(item.subtext, 0, 7);
    }
    ctx.restore();
  }
}

function vignette() {
  const gradient = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.2,W/2,H/2,Math.max(W,H)*0.72);
  gradient.addColorStop(0,'rgba(0,0,0,0)');
  gradient.addColorStop(1,'rgba(0,0,0,.66)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,W,H);
}

function stageFor(t) {
  if (t < 0.17) return 'SURFACE APPROACH';
  if (t < 0.28) return 'ACCESS POINT';
  if (t < 0.39) return 'PASSWORD // DV8';
  if (t < 0.49) return 'FILE // SERVICE DECK';
  if (t < 0.61) return 'HELLHOUND // JUNCTION';
  if (t < 0.75) return 'CONTROL WARD // BRANCH CITY';
  if (t < 0.89) return 'UTILITY STACK // DV6';
  return 'EFREET // CORE';
}

let timeline = 0;
let playing = true;
let showClearance = false;
let previousTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - previousTime) / 1000);
  previousTime = now;
  if (playing) timeline += dt / 27;
  if (timeline >= 1) {
    timeline = 1;
    playing = false;
    playButton.textContent = 'REPLAY';
  }

  scrubInput.value = String(timeline);
  stageEl.textContent = stageFor(timeline);
  progressEl.style.width = `${timeline * 100}%`;
  updateCamera(timeline);

  ctx.clearRect(0, 0, W, H);
  const background = ctx.createLinearGradient(0,0,0,H);
  background.addColorStop(0,'rgba(8,15,17,.42)');
  background.addColorStop(0.55,'rgba(3,7,8,.18)');
  background.addColorStop(1,'rgba(1,3,4,.58)');
  ctx.fillStyle = background;
  ctx.fillRect(0,0,W,H);

  commands = [];
  drawGround();
  drawSurfaceMirror();
  for (const item of blocks) drawSolidBlock(item);
  drawTraffic(now / 1000);
  drawRoute(showClearance);
  projectWorldLabels();
  renderCommands();
  renderLabels();
  vignette();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

playButton.addEventListener('click', () => {
  if (timeline >= 1) {
    timeline = 0;
    playing = true;
    playButton.textContent = 'PAUSE';
    return;
  }
  playing = !playing;
  playButton.textContent = playing ? 'PAUSE' : 'RUN';
});
resetButton.addEventListener('click', () => {
  timeline = 0;
  playing = true;
  playButton.textContent = 'PAUSE';
});
clearanceButton.addEventListener('click', () => {
  showClearance = !showClearance;
  clearanceButton.textContent = showClearance ? 'HIDE CLEARANCE' : 'SHOW CLEARANCE';
});
scrubInput.addEventListener('input', () => {
  timeline = Number(scrubInput.value);
  playing = false;
  playButton.textContent = 'RUN';
});
addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    playButton.click();
  }
  if (event.key.toLowerCase() === 'r') resetButton.click();
});
addEventListener('pointermove', (event) => {
  const x = (event.clientX / W - 0.5) * 2;
  const y = (event.clientY / H - 0.5) * 2;
  leanX += (x - leanX) * 0.12;
  leanY += (-y - leanY) * 0.12;
}, { passive: true });
