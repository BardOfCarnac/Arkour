import * as THREE from 'three';
import type { RunWorld, Vec3 } from '../run/types';

const CELL_X = 18;
const CELL_Z = CELL_X * Math.sqrt(3) / 2;
const LAYER_Y = 18;
const ROUTE_CLEARANCE = 13;
const NODE_CLEARANCE = 21;
const WORLD_MARGIN = 72;

interface Cell {
  key: string;
  q: number;
  r: number;
  layer: number;
  position: THREE.Vector3;
  family: number;
  rotation: number;
  height: number;
}

interface Segment {
  a: THREE.Vector3;
  b: THREE.Vector3;
}

function hash(seed: number, ...values: number[]): number {
  let value = seed >>> 0;
  for (const item of values) {
    value ^= Math.imul((item | 0) ^ 0x9e3779b9, 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  }
  return value >>> 0;
}

function unit(value: number): number {
  return (value >>> 0) / 0xffffffff;
}

function vector(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

function routeSegments(world: RunWorld): Segment[] {
  const result: Segment[] = [];
  for (const route of world.routes) {
    for (const segment of route.segments) {
      if (segment.kind === 'line') {
        result.push({ a: vector(segment.from), b: vector(segment.to) });
      } else {
        // The document compiler currently emits hard line segments. Keep curved
        // routes safe too by reserving the two control legs until the global
        // lattice gets a dedicated curve-distance helper.
        result.push({ a: vector(segment.from), b: vector(segment.control) });
        result.push({ a: vector(segment.control), b: vector(segment.to) });
      }
    }
  }
  return result;
}

function closestPointDistance(point: THREE.Vector3, segment: Segment): number {
  const ab = segment.b.clone().sub(segment.a);
  const lengthSq = Math.max(1e-6, ab.lengthSq());
  const t = THREE.MathUtils.clamp(point.clone().sub(segment.a).dot(ab) / lengthSq, 0, 1);
  const closest = segment.a.clone().addScaledVector(ab, t);
  return point.distanceTo(closest);
}

function distanceToRoutes(point: THREE.Vector3, segments: readonly Segment[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const segment of segments) best = Math.min(best, closestPointDistance(point, segment));
  return best;
}

function encounterPoints(world: RunWorld): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const route of world.routes) {
    // Compiler routes are hard line chains, so cumulative interpolation gives a
    // stable absolute node reservation without importing runtime route classes.
    const legs = route.segments.map((segment) => {
      if (segment.kind === 'line') return { from: vector(segment.from), to: vector(segment.to) };
      return { from: vector(segment.from), to: vector(segment.to) };
    });
    const lengths = legs.map((leg) => leg.from.distanceTo(leg.to));
    const total = Math.max(1e-6, lengths.reduce((sum, length) => sum + length, 0));

    for (const encounter of route.encounters ?? []) {
      let remaining = THREE.MathUtils.clamp(encounter.at, 0, 1) * total;
      let position = legs[legs.length - 1]?.to.clone() ?? new THREE.Vector3();
      for (let index = 0; index < legs.length; index += 1) {
        const leg = legs[index];
        const length = lengths[index] ?? 0;
        if (!leg) continue;
        if (remaining <= length || index === legs.length - 1) {
          const t = length > 1e-6 ? THREE.MathUtils.clamp(remaining / length, 0, 1) : 0;
          position = leg.from.clone().lerp(leg.to, t);
          break;
        }
        remaining -= length;
      }
      points.push(position);
    }
  }
  return points;
}

function routeBounds(world: RunWorld): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const route of world.routes) {
    for (const segment of route.segments) {
      bounds.expandByPoint(vector(segment.from));
      bounds.expandByPoint(vector(segment.to));
      if (segment.kind !== 'line') bounds.expandByPoint(vector(segment.control));
    }
  }
  bounds.expandByScalar(WORLD_MARGIN);
  return bounds;
}

function latticePosition(q: number, r: number, layer: number): THREE.Vector3 {
  return new THREE.Vector3(
    CELL_X * (q + r * 0.5),
    layer * LAYER_Y,
    CELL_Z * r,
  );
}

function key(q: number, r: number, layer: number): string {
  return `${q}:${r}:${layer}`;
}

function createMaterials(): {
  dark: THREE.MeshStandardMaterial;
  edge: THREE.MeshStandardMaterial;
  conductor: THREE.MeshStandardMaterial;
  ceramic: THREE.MeshStandardMaterial;
} {
  return {
    dark: new THREE.MeshStandardMaterial({ color: 0x0b1216, roughness: 0.74, metalness: 0.38 }),
    edge: new THREE.MeshStandardMaterial({ color: 0x1e3037, roughness: 0.58, metalness: 0.5 }),
    conductor: new THREE.MeshStandardMaterial({ color: 0x694a3b, roughness: 0.42, metalness: 0.76 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0x5d686d, roughness: 0.84, metalness: 0.08 }),
  };
}

function addBeam(
  group: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
  material: THREE.Material,
  radius: number,
): void {
  const delta = to.clone().sub(from);
  const length = delta.length();
  if (length < 1e-3) return;
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 6, 1, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  group.add(mesh);
}

function addCellMachine(
  group: THREE.Group,
  cell: Cell,
  materials: ReturnType<typeof createMaterials>,
  seed: number,
): void {
  const h = hash(seed, cell.q, cell.r, cell.layer, 17);
  const width = 5.5 + unit(hash(h, 1)) * 7.5;
  const depth = 5.5 + unit(hash(h, 2)) * 7.5;
  const local = new THREE.Group();
  local.position.copy(cell.position);
  local.rotation.y = cell.rotation;

  if (cell.family === 0) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, cell.height, depth),
      materials.dark,
    );
    body.position.y = (unit(hash(h, 3)) - 0.5) * 4;
    local.add(body);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.35, 1.1, depth * 0.72),
      materials.edge,
    );
    cap.position.y = body.position.y + cell.height * 0.34;
    local.add(cap);
  } else if (cell.family === 1) {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.38, width * 0.46, cell.height, 8, 1, false),
      materials.dark,
    );
    local.add(shaft);
    for (const offset of [-0.28, 0, 0.28]) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(width * 1.5, 0.9, depth * 0.5),
        materials.ceramic,
      );
      fin.position.y = offset * cell.height;
      local.add(fin);
    }
  } else {
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.72, cell.height * 0.78, depth * 0.72),
      materials.edge,
    );
    local.add(core);
    const plateCount = 3 + (h % 3);
    for (let index = 0; index < plateCount; index += 1) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(width * 1.55, 1.05, depth * 0.38),
        index % 2 === 0 ? materials.dark : materials.conductor,
      );
      plate.position.y = (index - (plateCount - 1) / 2) * 3.1;
      plate.position.x = ((index % 2) * 2 - 1) * width * 0.18;
      local.add(plate);
    }
  }

  group.add(local);
}

/**
 * Builds one global lattice volume shared by every branch. Occupancy is chosen
 * in absolute world space, not route-relative space. Routes and encounter zones
 * carve corridors out of the volume; neighbouring occupied cells are connected
 * into machinery so the result reads as one interlinked megastructure rather
 * than independent props hugging each rail.
 */
export function addLatticeVolumeCity(
  scene: THREE.Scene,
  world: RunWorld,
  options: { seed?: number; density?: number } = {},
): THREE.Group {
  const seed = options.seed ?? 4712;
  const density = THREE.MathUtils.clamp(options.density ?? 0.34, 0.12, 0.6);
  const segments = routeSegments(world);
  const encounters = encounterPoints(world);
  const bounds = routeBounds(world);
  const materials = createMaterials();
  const group = new THREE.Group();
  group.name = 'arkour-global-lattice-volume';

  const minLayer = Math.floor(bounds.min.y / LAYER_Y);
  const maxLayer = Math.ceil(bounds.max.y / LAYER_Y);
  const rMin = Math.floor(bounds.min.z / CELL_Z) - 1;
  const rMax = Math.ceil(bounds.max.z / CELL_Z) + 1;
  const cells = new Map<string, Cell>();

  for (let layer = minLayer; layer <= maxLayer; layer += 1) {
    for (let r = rMin; r <= rMax; r += 1) {
      const qMin = Math.floor(bounds.min.x / CELL_X - r * 0.5) - 1;
      const qMax = Math.ceil(bounds.max.x / CELL_X - r * 0.5) + 1;
      for (let q = qMin; q <= qMax; q += 1) {
        const position = latticePosition(q, r, layer);
        if (!bounds.containsPoint(position)) continue;
        if (distanceToRoutes(position, segments) < ROUTE_CLEARANCE) continue;
        if (encounters.some((point) => point.distanceTo(position) < NODE_CLEARANCE)) continue;

        const h = hash(seed, q, r, layer);
        if (unit(h) > density) continue;
        const family = hash(h, 4) % 3;
        const rotation = (hash(h, 5) % 3) * Math.PI / 3;
        const height = 8 + unit(hash(h, 6)) * 22;
        const cell: Cell = { key: key(q, r, layer), q, r, layer, position, family, rotation, height };
        cells.set(cell.key, cell);
      }
    }
  }

  for (const cell of cells.values()) addCellMachine(group, cell, materials, seed);

  const neighbors = [
    [1, 0, 0],
    [0, 1, 0],
    [-1, 1, 0],
    [0, 0, 1],
  ] as const;
  for (const cell of cells.values()) {
    for (const [dq, dr, dl] of neighbors) {
      const neighbor = cells.get(key(cell.q + dq, cell.r + dr, cell.layer + dl));
      if (!neighbor) continue;
      const midpoint = cell.position.clone().add(neighbor.position).multiplyScalar(0.5);
      if (distanceToRoutes(midpoint, segments) < ROUTE_CLEARANCE * 0.9) continue;
      const vertical = dl !== 0;
      addBeam(
        group,
        cell.position,
        neighbor.position,
        vertical ? materials.conductor : materials.edge,
        vertical ? 0.55 : 0.7,
      );
    }
  }

  scene.add(group);
  return group;
}
