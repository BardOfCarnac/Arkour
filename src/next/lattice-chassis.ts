import * as THREE from 'three';
import { objectIntersectsKeepout, type SpatialKeepout } from '../run/keepout';
import type { RouteSpec, RunWorld, Vec3 } from '../run/types';

const CELL_X = 18;
const CELL_Z = CELL_X * Math.sqrt(3) / 2;
const LAYER_Y = 18;
const BUS_CLEARANCE = 27;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const HEX_AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0.5, 0, Math.sqrt(3) / 2),
  new THREE.Vector3(-0.5, 0, Math.sqrt(3) / 2),
] as const;

function vector([x, y, z]: Vec3): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function snapHex(point: THREE.Vector3): THREE.Vector3 {
  const rawR = point.z / CELL_Z;
  const r = Math.round(rawR);
  const q = Math.round(point.x / CELL_X - r * 0.5);
  const layer = Math.round(point.y / LAYER_Y);
  return new THREE.Vector3(
    CELL_X * (q + r * 0.5),
    layer * LAYER_Y,
    CELL_Z * r,
  );
}

function createBeam(
  from: THREE.Vector3,
  to: THREE.Vector3,
  material: THREE.Material,
  radius: number,
): THREE.Mesh | undefined {
  const delta = to.clone().sub(from);
  const length = delta.length();
  if (length < 1) return undefined;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 7, 1, false),
    material,
  );
  beam.position.copy(from).add(to).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(Y_AXIS, delta.normalize());
  return beam;
}

function addAdmittedBeam(
  parent: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
  material: THREE.Material,
  radius: number,
  keepout: SpatialKeepout,
  trimTowardEnd = false,
): boolean {
  const tryBeam = (candidateTo: THREE.Vector3): boolean => {
    const beam = createBeam(from, candidateTo, material, radius);
    if (!beam) return false;
    if (objectIntersectsKeepout(beam, keepout)) return false;
    parent.add(beam);
    return true;
  };

  if (tryBeam(to)) return true;
  if (!trimTowardEnd) return false;

  // Standoffs deliberately aim back toward the route. If the final part would
  // invade the Runner/camera/hold reservation, shorten the structural tie rather
  // than admitting an illegal brace or deleting the useful outer section.
  for (const fraction of [0.86, 0.72, 0.58, 0.44]) {
    if (tryBeam(from.clone().lerp(to, fraction))) return true;
  }
  return false;
}

function routeEndpoints(route: RouteSpec): { from: THREE.Vector3; to: THREE.Vector3 }[] {
  return route.segments.map((segment) => ({
    from: vector(segment.from),
    to: vector(segment.to),
  }));
}

function addRouteBus(
  group: THREE.Group,
  route: RouteSpec,
  routeIndex: number,
  materials: { bus: THREE.Material; conductor: THREE.Material; brace: THREE.Material },
  keepout: SpatialKeepout,
): void {
  const segments = routeEndpoints(route);
  segments.forEach((segment, index) => {
    const h = hashString(`${route.id}:${routeIndex}:${index}`);
    if ((h & 3) === 0) return;

    const axis = HEX_AXES[h % HEX_AXES.length] ?? HEX_AXES[0];
    const side = (h & 8) === 0 ? -1 : 1;
    const clearance = BUS_CLEARANCE + ((h >>> 5) % 4) * 4.5;
    const offset = axis.clone().multiplyScalar(clearance * side);

    const busFrom = snapHex(segment.from.clone().add(offset));
    const busTo = snapHex(segment.to.clone().add(offset));

    addAdmittedBeam(group, busFrom, busTo, materials.bus, 0.9, keepout);

    if ((h & 2) !== 0) {
      const lift = ((h & 16) === 0 ? -1 : 1) * LAYER_Y * 0.34;
      addAdmittedBeam(
        group,
        busFrom.clone().add(new THREE.Vector3(0, lift, 0)),
        busTo.clone().add(new THREE.Vector3(0, lift, 0)),
        materials.conductor,
        0.38,
        keepout,
      );
    }

    const tieTo = ((h & 4) === 0 ? segment.from : segment.to);
    const tieFrom = ((h & 4) === 0 ? busFrom : busTo);
    if (tieFrom.distanceTo(tieTo) > 12) {
      const halfway = tieFrom.clone().lerp(tieTo, 0.58);
      const displaced = halfway.clone().add(axis.clone().multiplyScalar(side * 5));
      addAdmittedBeam(group, tieFrom, displaced, materials.brace, 0.5, keepout);
      addAdmittedBeam(group, displaced, tieTo, materials.brace, 0.44, keepout, true);
    }
  });
}

function addJunctionWeb(
  group: THREE.Group,
  world: RunWorld,
  materials: { bus: THREE.Material; conductor: THREE.Material; brace: THREE.Material },
  keepout: SpatialKeepout,
): void {
  for (const junction of world.junctions) {
    if (junction.exits.length < 2) continue;
    const exitRoutes = junction.exits
      .map((exit) => world.routes.find((route) => route.id === exit.routeId))
      .filter((route): route is RouteSpec => route !== undefined);
    if (exitRoutes.length < 2) continue;

    const anchors: THREE.Vector3[] = [];
    for (let index = 0; index < exitRoutes.length; index += 1) {
      const route = exitRoutes[index];
      const first = route.segments[0];
      if (!first) continue;
      const from = vector(first.from);
      const to = vector(first.to);
      const probe = from.clone().lerp(to, 0.34);
      const axis = HEX_AXES[index % HEX_AXES.length] ?? HEX_AXES[0];
      const side = index % 2 === 0 ? 1 : -1;
      anchors.push(snapHex(probe.add(axis.clone().multiplyScalar(BUS_CLEARANCE * 1.22 * side))));
    }

    for (let index = 0; index < anchors.length - 1; index += 1) {
      const a = anchors[index];
      const b = anchors[index + 1];
      if (!a || !b) continue;
      addAdmittedBeam(group, a, b, materials.bus, 1.05, keepout);
      const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, LAYER_Y * 0.52, 0));
      addAdmittedBeam(group, a, mid, materials.brace, 0.5, keepout);
      addAdmittedBeam(group, mid, b, materials.brace, 0.5, keepout);
    }
  }
}

/**
 * Sparse structural connective tissue in shared world space. Every proposed
 * beam now goes through the same spatial admission authority as ordinary
 * scenery. Unsafe branch trusses are vetoed; route-facing standoffs may be
 * shortened to preserve their outer structural read without entering the
 * Runner, camera, or physical-hold corridor.
 */
export function addSparseLatticeChassis(
  scene: THREE.Scene,
  world: RunWorld,
  keepout: SpatialKeepout,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arkour-sparse-lattice-chassis';

  const materials = {
    bus: new THREE.MeshStandardMaterial({ color: 0x223940, roughness: 0.48, metalness: 0.68 }),
    conductor: new THREE.MeshStandardMaterial({ color: 0x79513b, roughness: 0.36, metalness: 0.82 }),
    brace: new THREE.MeshStandardMaterial({ color: 0x17272d, roughness: 0.64, metalness: 0.55 }),
  };

  world.routes.forEach((route, index) => addRouteBus(group, route, index, materials, keepout));
  addJunctionWeb(group, world, materials, keepout);

  scene.add(group);
  return group;
}
