import * as THREE from 'three';
import type { RunWorld, Vec3 } from '../run/types';
import {
  MACHINERY_FAMILY_COUNT,
  addMachineryAssembly,
  createMachineryMaterials,
  type MachineryMaterials,
} from './machinery-kit';

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
  materials: MachineryMaterials,
  seed: number,
): void {
  const h = hash(seed, cell.q, cell.r, cell.layer, 17);
  const width = 6.2 + unit(hash(h, 1)) * 6.1;
  const depth = 6.2 + unit(hash(h, 2)) * 6.1;
  const local = new THREE.Group();
  local.position.copy(cell.position);
  local.position.y += (unit(hash(h, 3)) - 0.5) * 2.4;
  local.rotation.y = cell.rotation;
  local.name = `arkour-lattice-cell:${cell.q}:${cell.r}:${cell.layer}`;

  addMachineryAssembly(
    local,
    {
      family: cell.family,
      width,
      depth,
      height: cell.height,
      seed: h,
    },
    materials,
  );

  group.add(local);
}

/**
 * Builds one global lattice volume shared by every branch. Occupancy is chosen
 * in absolute world space, not route-relative space. Routes and encounter zones
 * carve corridors out of the volume; occupied cells are now assembled from a
 * sober industrial component vocabulary instead of generic box/shaft props.
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
  const materials = createMachineryMaterials();
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
        const family = hash(h, 4) % MACHINERY_FAMILY_COUNT;
        const rotation = (hash(h, 5) % 3) * Math.PI / 3;
        const height = 9 + unit(hash(h, 6)) * 20;
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
        vertical ? materials.copper : materials.steel,
        vertical ? 0.52 : 0.66,
      );
    }
  }

  scene.add(group);
  return group;
}
