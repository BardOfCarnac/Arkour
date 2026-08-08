const sourceCanvas = document.querySelector('#viewport');
const canvas = document.querySelector('#spectator-viewport');
const ctx = canvas?.getContext('2d');
const viewButton = document.querySelector('#view-mode');
const scrubInput = document.querySelector('#scrub');
const runnerPhaseEl = document.querySelector('#runner-phase');

if (!sourceCanvas || !canvas || !ctx || !viewButton || !scrubInput) {
  throw new Error('Runner view prototype is missing required DOM elements');
}

const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => V(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);
const magnitude = (a) => Math.hypot(a.x, a.y, a.z);
const normal = (a) => {
  const length = magnitude(a) || 1;
  return mul(a, 1 / length);
};
const lerp = (a, b, t) => V(
  a.x + (b.x - a.x) * t,
  a.y + (b.y - a.y) * t,
  a.z + (b.z - a.z) * t,
);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const ease = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

const COLORS = {
  background: '#030506',
  route: '#ff3d52',
  routeDim: 'rgba(255,61,82,.34)',
  runner: '#eafffb',
  runnerGlow: 'rgba(85,241,220,.46)',
  runnerFill: 'rgba(85,241,220,.13)',
  runnerStructure: 'rgba(85,241,220,.27)',
  edge: 'rgba(85,241,220,.58)',
  edgeDim: 'rgba(85,241,220,.24)',
  danger: 'rgba(255,61,82,.65)',
  face: 'rgba(3,8,10,.985)',
  dangerFace: 'rgba(16,5,8,.985)',
  grid: 'rgba(112,145,142,.18)',
};

const GLYPH_POINT_ORDER = [
  'head', 'neckR', 'handR', 'underarmR', 'flankR',
  'foot', 'flankL', 'underarmL', 'handL', 'neckL',
];
const GLYPH_STRUCTURE_PAIRS = [
  ['head', 'foot'],
  ['handL', 'handR'],
  ['underarmL', 'underarmR'],
  ['neckL', 'flankL'],
  ['neckR', 'flankR'],
];
const GLYPH_SCALE = 0.0092;
const GLYPH_BANK_ID = 'runner-pose-bank-v1';
const ROUTE_RUN_SECONDS = 27;
const DEMO_HEAD_FIRST_TARGETS = new Set(['hellhound', 'efreet']);
const DEMO_DRAMATIC_LANDING_TARGETS = new Set(['hellhound', 'efreet']);
let runnerPoseBank = null;
let runnerGlyphSources = null;
let runnerResolvedPoses = null;
let finalLandingReachedAt = null;

async function loadRunnerPoseBank() {
  const bankUrl = new URL('../runner-glyph/runner-pose-bank-v1.json', location.href);
  const bankResponse = await fetch(bankUrl);
  if (!bankResponse.ok) throw new Error(`Runner pose bank returned ${bankResponse.status}`);
  const bank = await bankResponse.json();
  if (bank?.format !== 'arkour-runner-pose-bank' || bank?.version !== 1 || !bank?.poses || !bank?.sources) {
    throw new Error('Runner pose bank is not arkour-runner-pose-bank v1');
  }

  const loadedSources = await Promise.all(Object.entries(bank.sources).map(async ([sourceId, sourcePath]) => {
    const sourceUrl = new URL(sourcePath, bankUrl);
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`${sourceId} returned ${response.status}`);
    const definition = await response.json();
    if (definition?.format !== 'arkour-runner-glyph' || definition?.version !== 2 || !definition?.poses) {
      throw new Error(`${sourceId} is not an arkour-runner-glyph v2 definition`);
    }
    return [sourceId, definition];
  }));

  const sources = Object.fromEntries(loadedSources);
  const resolved = {};
  for (const [poseName, descriptor] of Object.entries(bank.poses)) {
    const source = sources[descriptor.source];
    const pose = source?.poses?.[descriptor.sourcePose];
    if (!source || !pose) throw new Error(`Could not resolve pose ${poseName}`);
    resolved[poseName] = {
      pose,
      curve: Number(source.curve) || 0,
      orientation: descriptor.orientation,
      source: descriptor.source,
      sourcePose: descriptor.sourcePose,
    };
  }

  runnerPoseBank = bank;
  runnerGlyphSources = sources;
  runnerResolvedPoses = resolved;
}

loadRunnerPoseBank().catch((error) => {
  console.warn('Could not load Runner Pose Bank v1; using the temporary humanoid fallback', error);
});

const depthByFloor = { 1: -14, 2: -31, 3: -49, 4: -67, 5: -84, 6: -103 };
const centralNodes = [
  { id: 'entry', label: 'ACCESS', position: V(0, 0, 0) },
  { id: 'password', label: 'PASSWORD', position: V(0, depthByFloor[1], 2) },
  { id: 'file', label: 'FILE', position: V(0, depthByFloor[2], 2) },
  { id: 'hellhound', label: 'HELLHOUND', position: V(0, depthByFloor[3], 2) },
  { id: 'centre1', label: 'CONTROL', position: V(0, depthByFloor[4], 2) },
  { id: 'centre2', label: 'CONTROL', position: V(0, depthByFloor[5], 2) },
  { id: 'efreet', label: 'EFREET', position: V(0, depthByFloor[6], 2) },
];

function hardRouteSegments(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.abs(dx) < 0.1 && Math.abs(dz) < 0.1) return [[a, b]];
  const midY = a.y + (b.y - a.y) * 0.44;
  const p1 = V(a.x, midY, a.z);
  const p2 = V(b.x, midY, b.z);
  return [[a, p1], [p1, p2], [p2, b]];
}

const runnerSegments = [];
for (let index = 0; index < centralNodes.length - 1; index += 1) {
  runnerSegments.push(...hardRouteSegments(centralNodes[index].position, centralNodes[index + 1].position));
}

const segmentLengths = runnerSegments.map(([a, b]) => magnitude(sub(b, a)));
const totalRouteLength = segmentLengths.reduce((sum, value) => sum + value, 0);
const nodeDistances = [];
let accumulatedNodeDistance = 0;
nodeDistances.push({ ...centralNodes[0], distance: 0 });
for (let index = 0; index < centralNodes.length - 1; index += 1) {
  const from = centralNodes[index].position;
  const to = centralNodes[index + 1].position;
  const nodeSegments = hardRouteSegments(from, to);
  accumulatedNodeDistance += nodeSegments.reduce((sum, [a, b]) => sum + magnitude(sub(b, a)), 0);
  nodeDistances.push({ ...centralNodes[index + 1], distance: accumulatedNodeDistance });
}

function sampleRunnerPath(progress) {
  const targetDistance = clamp(progress, 0, 1) * totalRouteLength;
  let consumed = 0;
  for (let index = 0; index < runnerSegments.length; index += 1) {
    const segment = runnerSegments[index];
    const length = segmentLengths[index];
    if (targetDistance <= consumed + length || index === runnerSegments.length - 1) {
      const local = length > 0 ? clamp((targetDistance - consumed) / length, 0, 1) : 0;
      return {
        distance: targetDistance,
        position: lerp(segment[0], segment[1], local),
        forward: normal(sub(segment[1], segment[0])),
      };
    }
    consumed += length;
  }
  const last = runnerSegments[runnerSegments.length - 1];
  return { distance: totalRouteLength, position: last[1], forward: normal(sub(last[1], last[0])) };
}

function runnerPhase(distance) {
  let nearest = null;
  let nearestDelta = Number.POSITIVE_INFINITY;
  for (let index = 1; index < nodeDistances.length; index += 1) {
    const node = nodeDistances[index];
    const delta = node.distance - distance;
    if (Math.abs(delta) < Math.abs(nearestDelta)) {
      nearest = node;
      nearestDelta = delta;
    }
  }

  if (!nearest) return { phase: 'FLYING', node: null, delta: Number.POSITIVE_INFINITY };
  const absolute = Math.abs(nearestDelta);
  if (absolute < 0.65) return { phase: 'STATIONARY', node: nearest.id, delta: nearestDelta };
  if (nearestDelta > 0 && absolute < 2.1) return { phase: 'ARRIVING', node: nearest.id, delta: nearestDelta };
  if (nearestDelta > 0 && absolute < 7.0) return { phase: 'APPROACHING', node: nearest.id, delta: nearestDelta };
  if (nearestDelta < 0 && absolute < 4.0) return { phase: 'DEPARTING', node: nearest.id, delta: nearestDelta };
  return { phase: 'FLYING', node: nearestDelta > 0 ? nearest.id : null, delta: nearestDelta };
}

function traversalLeg(distance) {
  const clamped = clamp(distance, 0, totalRouteLength);
  for (let index = 0; index < nodeDistances.length - 1; index += 1) {
    const start = nodeDistances[index];
    const end = nodeDistances[index + 1];
    if (clamped <= end.distance + 1e-6 || index === nodeDistances.length - 2) {
      return {
        index,
        start,
        end,
        length: end.distance - start.distance,
        elapsed: Math.max(0, clamped - start.distance),
        remaining: Math.max(0, end.distance - clamped),
      };
    }
  }
  return null;
}

const blocks = [];
const addBlock = (center, size, danger = false) => blocks.push({ center, size, danger });

function buildSpectatorWorld() {
  blocks.length = 0;
  for (const node of centralNodes.slice(1)) {
    const y = node.position.y;
    const hot = node.id === 'hellhound' || node.id === 'centre1' || node.id === 'centre2' || node.id === 'efreet';
    const span = node.id === 'hellhound' ? 17 : node.id === 'efreet' ? 15.5 : node.id === 'file' ? 14 : 13;
    const width = node.id === 'hellhound' ? 12 : node.id === 'efreet' ? 10 : node.id === 'file' ? 9 : 8;
    const height = node.id === 'hellhound' || node.id === 'efreet' ? 14 : 11;
    const depth = node.id === 'hellhound' ? 17 : node.id === 'efreet' ? 16 : 13;
    addBlock(V(-span, y, 2), V(width, height, depth), hot);
    addBlock(V(span, y, 2), V(width, height, depth), hot);
  }

  const levels = [-21, -37, -55, -72, -89, -103];
  levels.forEach((y, index) => {
    const spread = 23 + (index % 2) * 4;
    addBlock(V(-spread, y, 10 - (index % 3) * 6), V(11, 16 + (index % 3) * 4, 12));
    addBlock(V(spread, y, -7 + (index % 3) * 6), V(11, 18 + ((index + 1) % 3) * 4, 12));
  });

  for (const [y, z] of [[-19, 12], [-39, 11], [-62, 12], [-87, 11]]) {
    addBlock(V(-20, y, z), V(18, 1.6, 5));
    addBlock(V(20, y, z), V(18, 1.6, 5));
  }
}
buildSpectatorWorld();

let width = 0;
let height = 0;
let dpr = 1;
function resize() {
  width = innerWidth;
  height = innerHeight;
  dpr = Math.min(width < 760 ? 1.1 : 1.45, devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

const camera = { pos: V(), target: V(), f: V(), r: V(), u: V(), focal: 1 };
function updateSpectatorCamera(runner, progress) {
  const orbit = progress * Math.PI * 1.35;
  const side = V(Math.cos(orbit) * 15, 8.5, 14 + Math.sin(orbit) * 8);
  camera.pos = add(runner.position, side);
  camera.target = add(runner.position, mul(runner.forward, 3.2));
  camera.f = normal(sub(camera.target, camera.pos));
  let right = cross(camera.f, V(0, 1, 0));
  if (magnitude(right) < 0.05) right = cross(camera.f, V(0, 0, 1));
  camera.r = normal(right);
  camera.u = normal(cross(camera.r, camera.f));
  camera.focal = Math.min(width, height) * 0.98;
}

function project(point) {
  const q = sub(point, camera.pos);
  const x = dot(q, camera.r);
  const y = dot(q, camera.u);
  const z = dot(q, camera.f);
  if (z < 0.3 || z > 130) return null;
  return {
    x: width / 2 + x * camera.focal / z,
    y: height / 2 - y * camera.focal / z,
    z,
    scale: camera.focal / z,
  };
}

const commands = [];
function line3(a, b, color, lineWidth = 1, alpha = 1) {
  const pa = project(a);
  const pb = project(b);
  if (!pa || !pb) return;
  commands.push({ type: 'line', pa, pb, color, lineWidth, alpha, depth: (pa.z + pb.z) / 2 });
}
function face3(points, fill, stroke, alpha = 1, lineWidth = 0.5) {
  const projected = points.map(project);
  if (projected.some((point) => !point)) return;
  commands.push({
    type: 'face',
    points: projected,
    fill,
    stroke,
    lineWidth,
    alpha,
    depth: projected.reduce((sum, point) => sum + point.z, 0) / projected.length,
  });
}

const BOX_EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const BOX_FACES = [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]];
function drawBlock(item) {
  const c = item.center;
  const s = item.size;
  const sx = s.x / 2;
  const sy = s.y / 2;
  const sz = s.z / 2;
  const points = [
    V(c.x-sx,c.y-sy,c.z-sz), V(c.x+sx,c.y-sy,c.z-sz), V(c.x+sx,c.y+sy,c.z-sz), V(c.x-sx,c.y+sy,c.z-sz),
    V(c.x-sx,c.y-sy,c.z+sz), V(c.x+sx,c.y-sy,c.z+sz), V(c.x+sx,c.y+sy,c.z+sz), V(c.x-sx,c.y+sy,c.z+sz),
  ];
  const edge = item.danger ? COLORS.danger : COLORS.edge;
  const fill = item.danger ? COLORS.dangerFace : COLORS.face;
  for (const face of BOX_FACES) face3(face.map((index) => points[index]), fill, edge, 1);
  for (const edgePair of BOX_EDGES) line3(points[edgePair[0]], points[edgePair[1]], edge, item.danger ? 1.1 : 0.8, 0.9);
}

function drawGround() {
  for (let x = -45; x <= 45; x += 5) line3(V(x, 0, -24), V(x, 0, 45), COLORS.grid, 0.7, 0.7);
  for (let z = -24; z <= 45; z += 5) line3(V(-45, 0, z), V(45, 0, z), COLORS.grid, 0.7, 0.7);
}

function drawRoute() {
  for (const [a, b] of runnerSegments) {
    line3(a, b, COLORS.routeDim, 4.6, 0.24);
    line3(a, b, COLORS.route, 1.8, 0.94);
  }
}

function runnerBasis(forward) {
  let right = cross(forward, V(0, 0, 1));
  if (magnitude(right) < 0.05) right = cross(forward, V(1, 0, 0));
  right = normal(right);
  const front = normal(cross(right, forward));
  return { right, front };
}

function blendGlyphPose(a, b, t) {
  const u = ease(t);
  const pose = {};
  for (const key of GLYPH_POINT_ORDER) {
    pose[key] = {
      x: a[key].x + (b[key].x - a[key].x) * u,
      y: a[key].y + (b[key].y - a[key].y) * u,
      z: a[key].z + (b[key].z - a[key].z) * u,
    };
  }
  return pose;
}

function transitionById(id) {
  return runnerPoseBank?.transitions?.find((transition) => transition.id === id) ?? null;
}

function transitionDistance(id, fallbackMs) {
  const durationMs = Number(transitionById(id)?.durationMs ?? fallbackMs);
  return totalRouteLength * (durationMs / (ROUTE_RUN_SECONDS * 1000));
}

function poseState(name, options = {}) {
  const resolved = runnerResolvedPoses?.[name];
  if (!resolved) return null;
  const orientationDegrees = options.orientationDegrees ?? (resolved.orientation === 'head-first' ? 180 : 0);
  return {
    pose: resolved.pose,
    curve: resolved.curve,
    label: options.label ?? name.toUpperCase(),
    primaryPose: name,
    transition: options.transition ?? null,
    orientationDegrees,
    weights: { [name]: 1 },
  };
}

function blendPoseState(fromName, toName, t, options = {}) {
  const from = runnerResolvedPoses?.[fromName];
  const to = runnerResolvedPoses?.[toName];
  if (!from || !to) return null;
  const u = ease(t);
  const fromAngle = options.fromAngle ?? (from.orientation === 'head-first' ? 180 : 0);
  const toAngle = options.toAngle ?? (to.orientation === 'head-first' ? 180 : 0);
  return {
    pose: blendGlyphPose(from.pose, to.pose, t),
    curve: from.curve + (to.curve - from.curve) * u,
    label: options.label ?? `${fromName.toUpperCase()}→${toName.toUpperCase()}`,
    primaryPose: u < 0.5 ? fromName : toName,
    transition: options.transition ?? null,
    orientationDegrees: fromAngle + (toAngle - fromAngle) * u,
    weights: { [fromName]: 1 - u, [toName]: u },
  };
}

function postLandingState(nodeId, elapsedDistance) {
  if (!nodeId || nodeId === 'entry') return null;
  const dramatic = DEMO_DRAMATIC_LANDING_TARGETS.has(nodeId);
  const absorbDistance = transitionDistance('impact_absorb', 120);
  const settleDistance = transitionDistance('settle_to_neutral', 240);

  if (dramatic) {
    if (elapsedDistance < absorbDistance) {
      return blendPoseState('landing_impact', 'landing_recovery', elapsedDistance / absorbDistance, {
        transition: 'impact_absorb',
        label: 'IMPACT→RECOVERY',
      });
    }
    if (elapsedDistance < absorbDistance + settleDistance) {
      return blendPoseState('landing_recovery', 'neutral_base', (elapsedDistance - absorbDistance) / settleDistance, {
        transition: 'settle_to_neutral',
        label: 'RECOVERY→NEUTRAL',
      });
    }
    return null;
  }

  if (elapsedDistance < settleDistance) {
    return blendPoseState('landing_recovery', 'neutral_base', elapsedDistance / settleDistance, {
      transition: 'settle_to_neutral',
      label: 'RECOVERY→NEUTRAL',
    });
  }
  return null;
}

function postLandingDistance(nodeId) {
  if (!nodeId || nodeId === 'entry') return 0;
  const settleDistance = transitionDistance('settle_to_neutral', 240);
  if (!DEMO_DRAMATIC_LANDING_TARGETS.has(nodeId)) return settleDistance;
  return transitionDistance('impact_absorb', 120) + settleDistance;
}

function runnerGlyphPose(distance, progress, now = performance.now()) {
  if (!runnerPoseBank || !runnerResolvedPoses) return null;

  if (progress >= 0.999999) {
    if (finalLandingReachedAt === null) finalLandingReachedAt = now;
    const elapsedMs = Math.max(0, now - finalLandingReachedAt);
    const absorbMs = Number(transitionById('impact_absorb')?.durationMs ?? 120);
    const settleMs = Number(transitionById('settle_to_neutral')?.durationMs ?? 240);
    if (elapsedMs < absorbMs) {
      return blendPoseState('landing_impact', 'landing_recovery', elapsedMs / absorbMs, {
        transition: 'impact_absorb',
        label: 'IMPACT→RECOVERY',
      });
    }
    if (elapsedMs < absorbMs + settleMs) {
      return blendPoseState('landing_recovery', 'neutral_base', (elapsedMs - absorbMs) / settleMs, {
        transition: 'settle_to_neutral',
        label: 'RECOVERY→NEUTRAL',
      });
    }
    return poseState('neutral_base', { label: 'NEUTRAL BASE' });
  }
  finalLandingReachedAt = null;

  const leg = traversalLeg(distance);
  if (!leg) return poseState('neutral_base', { label: 'NEUTRAL BASE' });

  const postState = postLandingState(leg.start.id, leg.elapsed);
  if (postState) return postState;

  const departureStart = postLandingDistance(leg.start.id);
  const neutralVariationDistance = transitionDistance('neutral_variation', 520);
  const departDistance = transitionDistance('depart_default', 300);
  const departureElapsed = Math.max(0, leg.elapsed - departureStart);

  if (departureElapsed < neutralVariationDistance) {
    return blendPoseState('neutral_base', 'neutral_fall', departureElapsed / neutralVariationDistance, {
      transition: 'neutral_variation',
      label: 'NEUTRAL→FALL',
    });
  }
  if (departureElapsed < neutralVariationDistance + departDistance) {
    return blendPoseState('neutral_fall', 'travel_feet_first', (departureElapsed - neutralVariationDistance) / departDistance, {
      transition: 'depart_default',
      label: 'FALL→FEET-FIRST',
    });
  }

  const dramatic = DEMO_DRAMATIC_LANDING_TARGETS.has(leg.end.id);
  const landingTransition = dramatic ? 'land_dramatic' : 'land_standard';
  const landingDistance = transitionDistance(landingTransition, dramatic ? 80 : 160);
  const headFirst = DEMO_HEAD_FIRST_TARGETS.has(leg.end.id);
  const flipDistance = transitionDistance('enter_head_first', 420);

  if (leg.remaining <= landingDistance) {
    const targetPose = dramatic ? 'landing_impact' : 'landing_recovery';
    return blendPoseState('travel_feet_first', targetPose, (landingDistance - leg.remaining) / landingDistance, {
      transition: landingTransition,
      label: dramatic ? 'FEET-FIRST→IMPACT' : 'FEET-FIRST→RECOVERY',
      fromAngle: 0,
      toAngle: 0,
    });
  }

  if (headFirst && leg.remaining <= landingDistance + flipDistance) {
    const t = (landingDistance + flipDistance - leg.remaining) / flipDistance;
    return blendPoseState('travel_head_first', 'travel_feet_first', t, {
      transition: 'exit_head_first',
      label: 'FLIP→FEET-FIRST',
      fromAngle: 180,
      toAngle: 360,
    });
  }

  if (headFirst) {
    const enterFlipStart = departureStart + neutralVariationDistance + departDistance;
    const enterFlipElapsed = Math.max(0, leg.elapsed - enterFlipStart);
    if (enterFlipElapsed < flipDistance) {
      return blendPoseState('travel_feet_first', 'travel_head_first', enterFlipElapsed / flipDistance, {
        transition: 'enter_head_first',
        label: 'FLIP→HEAD-FIRST',
        fromAngle: 0,
        toAngle: 180,
      });
    }
    return poseState('travel_head_first', { label: 'HEAD-FIRST DIVE', orientationDegrees: 180 });
  }

  return poseState('travel_feet_first', { label: 'FEET-FIRST FALL' });
}

function smoothGlyphContour(pose, curve, stepsPerSegment = 5) {
  const anchors = GLYPH_POINT_ORDER.map((key) => pose[key]);
  const points = [];
  const tension = clamp(curve, 0, 1);
  const count = anchors.length;
  for (let index = 0; index < count; index += 1) {
    const p0 = anchors[(index - 1 + count) % count];
    const p1 = anchors[index];
    const p2 = anchors[(index + 1) % count];
    const p3 = anchors[(index + 2) % count];
    const c1 = {
      x: p1.x + ((p2.x - p0.x) * tension) / 6,
      y: p1.y + ((p2.y - p0.y) * tension) / 6,
      z: p1.z + ((p2.z - p0.z) * tension) / 6,
    };
    const c2 = {
      x: p2.x - ((p3.x - p1.x) * tension) / 6,
      y: p2.y - ((p3.y - p1.y) * tension) / 6,
      z: p2.z - ((p3.z - p1.z) * tension) / 6,
    };
    for (let step = 0; step < stepsPerSegment; step += 1) {
      const u = step / stepsPerSegment;
      const om = 1 - u;
      points.push({
        x: p1.x * om * om * om + c1.x * 3 * om * om * u + c2.x * 3 * om * u * u + p2.x * u * u * u,
        y: p1.y * om * om * om + c1.y * 3 * om * om * u + c2.y * 3 * om * u * u + p2.y * u * u * u,
        z: p1.z * om * om * om + c1.z * 3 * om * om * u + c2.z * 3 * om * u * u + p2.z * u * u * u,
      });
    }
  }
  return points;
}

function rotateGlyphLocal(local, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: local.x,
    y: local.y * cosine - local.z * sine,
    z: local.y * sine + local.z * cosine,
  };
}

function glyphPointToWorld(local, runner, basis, orientationDegrees = 0) {
  const rotated = rotateGlyphLocal(local, orientationDegrees);
  return add(
    runner.position,
    add(
      mul(basis.right, rotated.x * GLYPH_SCALE),
      add(
        mul(runner.forward, rotated.y * GLYPH_SCALE),
        mul(basis.front, rotated.z * GLYPH_SCALE),
      ),
    ),
  );
}

function drawGlyphRunner(runner, glyphState, phase) {
  const basis = runnerBasis(runner.forward);
  const pose = glyphState.pose;
  const contour = smoothGlyphContour(pose, glyphState.curve)
    .map((point) => glyphPointToWorld(point, runner, basis, glyphState.orientationDegrees));

  face3(contour, COLORS.runnerFill, COLORS.runnerGlow, 0.92, 0.8);

  for (let index = 0; index < contour.length; index += 1) {
    const next = (index + 1) % contour.length;
    line3(contour[index], contour[next], COLORS.runnerGlow, phase === 'STATIONARY' ? 5.2 : 4.2, 0.28);
    line3(contour[index], contour[next], COLORS.runner, 1.45, 0.99);
  }

  for (const [aKey, bKey] of GLYPH_STRUCTURE_PAIRS) {
    const a = glyphPointToWorld(pose[aKey], runner, basis, glyphState.orientationDegrees);
    const b = glyphPointToWorld(pose[bKey], runner, basis, glyphState.orientationDegrees);
    line3(a, b, COLORS.runnerStructure, 0.9, 0.82);
  }
}

function drawFallbackRunner(runner, phase) {
  const { right, front } = runnerBasis(runner.forward);
  const p = runner.position;
  const arriving = phase === 'ARRIVING' || phase === 'STATIONARY';
  const bodyForward = arriving ? mul(runner.forward, 0.72) : runner.forward;

  const head = add(add(p, mul(bodyForward, 0.58)), mul(front, arriving ? 0.22 : 0));
  const neck = add(p, mul(bodyForward, 0.22));
  const hips = add(p, mul(bodyForward, -0.72));
  const leftShoulder = add(neck, mul(right, -0.46));
  const rightShoulder = add(neck, mul(right, 0.46));
  const armReach = arriving ? 0.56 : 0.82;
  const leftHand = add(add(p, mul(bodyForward, arriving ? 0.22 : -0.02)), mul(right, -armReach));
  const rightHand = add(add(p, mul(bodyForward, arriving ? 0.22 : -0.02)), mul(right, armReach));
  const leftHip = add(hips, mul(right, -0.24));
  const rightHip = add(hips, mul(right, 0.24));
  const legReach = arriving ? 1.08 : 1.52;
  const leftFoot = add(add(p, mul(bodyForward, -legReach)), mul(right, -0.32));
  const rightFoot = add(add(p, mul(bodyForward, -legReach)), mul(right, 0.32));

  const glowWidth = phase === 'STATIONARY' ? 4.6 : 3.5;
  const bones = [
    [head, neck], [leftShoulder, rightShoulder], [neck, hips],
    [leftShoulder, leftHand], [rightShoulder, rightHand],
    [leftHip, rightHip], [leftHip, leftFoot], [rightHip, rightFoot],
  ];
  for (const [a, b] of bones) line3(a, b, COLORS.runnerGlow, glowWidth, 0.36);
  for (const [a, b] of bones) line3(a, b, COLORS.runner, 1.35, 0.98);
}

function drawRunner(runner, status, glyphState) {
  if (glyphState && runnerResolvedPoses) drawGlyphRunner(runner, glyphState, status.phase);
  else drawFallbackRunner(runner, status.phase);
}

function renderCommands() {
  commands.sort((a, b) => b.depth - a.depth);
  for (const command of commands) {
    if (command.type === 'face') {
      ctx.save();
      ctx.globalAlpha = command.alpha;
      ctx.fillStyle = command.fill;
      ctx.strokeStyle = command.stroke;
      ctx.lineWidth = command.lineWidth ?? 0.5;
      ctx.beginPath();
      ctx.moveTo(command.points[0].x, command.points[0].y);
      for (let index = 1; index < command.points.length; index += 1) {
        ctx.lineTo(command.points[index].x, command.points[index].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (command.type === 'line') {
      ctx.save();
      ctx.globalAlpha = command.alpha;
      ctx.strokeStyle = command.color;
      ctx.lineWidth = command.lineWidth;
      ctx.beginPath();
      ctx.moveTo(command.pa.x, command.pa.y);
      ctx.lineTo(command.pb.x, command.pb.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.16,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,.68)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

let viewMode = 'runner';
function setViewMode(mode) {
  viewMode = mode;
  const spectator = mode === 'spectator';
  document.body.classList.toggle('spectator-view', spectator);
  viewButton.textContent = spectator ? 'VIEW: SPECTATOR' : 'VIEW: RUNNER';
  viewButton.setAttribute('aria-pressed', spectator ? 'true' : 'false');
}

viewButton.addEventListener('click', () => {
  setViewMode(viewMode === 'runner' ? 'spectator' : 'runner');
});

addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'v') viewButton.click();
});

function frame(now = performance.now()) {
  const progress = clamp(Number(scrubInput.value) || 0, 0, 1);
  const runner = sampleRunnerPath(progress);
  const status = runnerPhase(runner.distance);
  const glyphState = runnerGlyphPose(runner.distance, progress, now);
  const leg = traversalLeg(runner.distance);

  window.ArkourRunSnapshot = {
    version: 1,
    viewMode,
    progress,
    routeId: 'central-demo-route',
    phase: status.phase,
    nodeId: status.node,
    runner: {
      position: { ...runner.position },
      forward: { ...runner.forward },
      glyph: glyphState ? {
        bank: GLYPH_BANK_ID,
        pose: glyphState.primaryPose,
        presentation: glyphState.label,
        transition: glyphState.transition,
        weights: { ...glyphState.weights },
        orientationDegrees: glyphState.orientationDegrees,
        curve: glyphState.curve,
        axes: { x: 'body-right', y: 'head-to-foot/travel', z: 'body-front' },
        demoSelection: leg ? {
          targetNode: leg.end.id,
          headFirst: DEMO_HEAD_FIRST_TARGETS.has(leg.end.id),
          dramaticLanding: DEMO_DRAMATIC_LANDING_TARGETS.has(leg.end.id),
        } : null,
      } : null,
    },
  };

  if (runnerPhaseEl) {
    runnerPhaseEl.textContent = glyphState
      ? `RUNNER: ${status.phase} · ${glyphState.label}`
      : `RUNNER: ${status.phase}`;
  }

  if (viewMode === 'spectator') {
    updateSpectatorCamera(runner, progress);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    const background = ctx.createRadialGradient(width * 0.5, height * 0.42, 0, width * 0.5, height * 0.42, Math.max(width, height) * 0.7);
    background.addColorStop(0, 'rgba(19,34,36,.34)');
    background.addColorStop(1, 'rgba(3,5,6,0)');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    commands.length = 0;
    drawGround();
    for (const block of blocks) drawBlock(block);
    drawRoute();
    drawRunner(runner, status, glyphState);
    renderCommands();
    drawVignette();
  }

  requestAnimationFrame(frame);
}

setViewMode('runner');
requestAnimationFrame(frame);
