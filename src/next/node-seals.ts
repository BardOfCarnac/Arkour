import * as THREE from 'three';
import { objectIntersectsKeepout, type SpatialKeepout } from '../run/keepout';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import type { RuntimeRoute } from '../run/route';
import type {
  AttachmentDirection,
  EncounterInteractionPlan,
  NodeAttachmentSpec,
} from '../run/scene-plan';
import type { EncounterSpec, RunWorld } from '../run/types';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const OPENING_HEIGHT = 11.5;
const BULKHEAD_DEPTH = 2.6;

interface AttachmentTarget {
  id: number;
  position: THREE.Vector3;
}

interface DirectionCandidate {
  target: AttachmentTarget;
  score: number;
}

interface SealMaterials {
  primary: THREE.MeshStandardMaterial;
  conductor: THREE.MeshStandardMaterial;
  brace: THREE.MeshStandardMaterial;
}

function createBeam(
  from: THREE.Vector3,
  to: THREE.Vector3,
  material: THREE.Material,
  radius: number,
): THREE.Mesh | undefined {
  const delta = to.clone().sub(from);
  const length = delta.length();
  if (length < 0.8) return undefined;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 7, 1, false),
    material,
  );
  beam.position.copy(from).add(to).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(Y_AXIS, delta.normalize());
  return beam;
}

function addAdmittedBeam(
  group: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
  material: THREE.Material,
  radius: number,
  keepout: SpatialKeepout,
): boolean {
  const beam = createBeam(from, to, material, radius);
  if (!beam || objectIntersectsKeepout(beam, keepout)) return false;
  group.add(beam);
  return true;
}

/** Collects centres from the structures that actually survived generation. */
export function collectAttachmentTargets(
  ...roots: THREE.Object3D[]
): AttachmentTarget[] {
  const targets: AttachmentTarget[] = [];
  const box = new THREE.Box3();
  const centre = new THREE.Vector3();
  const seen = new Set<string>();
  let id = 0;

  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      box.setFromObject(object);
      if (box.isEmpty()) return;
      box.getCenter(centre);
      const key = `${Math.round(centre.x * 2)}:${Math.round(centre.y * 2)}:${Math.round(centre.z * 2)}`;
      if (seen.has(key)) return;
      seen.add(key);
      targets.push({ id: id++, position: centre.clone() });
    });
  }

  return targets;
}

function directionVector(
  direction: AttachmentDirection,
  right: THREE.Vector3,
  up: THREE.Vector3,
): THREE.Vector3 {
  switch (direction) {
    case 'left': return right.clone().multiplyScalar(-1);
    case 'right': return right.clone();
    case 'up': return up.clone();
    case 'down': return up.clone().multiplyScalar(-1);
  }
}

function directionalComponents(
  delta: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
): { right: number; up: number; forward: number } {
  return {
    right: delta.dot(right),
    up: delta.dot(up),
    forward: delta.dot(forward),
  };
}

function candidateForDirection(
  direction: AttachmentDirection,
  origin: THREE.Vector3,
  target: AttachmentTarget,
  spec: NodeAttachmentSpec,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
): DirectionCandidate | undefined {
  const delta = target.position.clone().sub(origin);
  const distance = delta.length();
  if (distance < spec.minReach || distance > spec.maxReach * 1.35) return undefined;

  const local = directionalComponents(delta, right, up, forward);
  if (Math.abs(local.forward) > spec.forwardSearch * 1.15) return undefined;

  const axial = direction === 'left' ? -local.right
    : direction === 'right' ? local.right
      : direction === 'up' ? local.up
        : -local.up;
  if (axial < spec.minReach) return undefined;

  const cross = direction === 'left' || direction === 'right'
    ? Math.abs(local.up)
    : Math.abs(local.right);

  // Prefer actual machinery clearly in the requested hemisphere, while allowing
  // diagonal lattice structures to serve two visually adjacent regions.
  if (cross > axial * 1.45 + 8) return undefined;

  return {
    target,
    score: axial + cross * 0.34 + Math.abs(local.forward) * 0.48,
  };
}

function selectTargets(
  directions: readonly AttachmentDirection[],
  origin: THREE.Vector3,
  targets: readonly AttachmentTarget[],
  spec: NodeAttachmentSpec,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
): Map<AttachmentDirection, AttachmentTarget> {
  const selected = new Map<AttachmentDirection, AttachmentTarget>();
  const used = new Set<number>();

  for (const direction of directions) {
    const candidates = targets
      .map((target) => candidateForDirection(direction, origin, target, spec, right, up, forward))
      .filter((candidate): candidate is DirectionCandidate => candidate !== undefined)
      .sort((a, b) => a.score - b.score);

    const choice = candidates.find((candidate) => !used.has(candidate.target.id)) ?? candidates[0];
    if (!choice) continue;
    selected.set(direction, choice.target);
    used.add(choice.target.id);
  }

  return selected;
}

function anchorForDirection(
  direction: AttachmentDirection,
  centre: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  openingWidth: number,
): THREE.Vector3 {
  const side = openingWidth * 0.5 + 3.1;
  const vertical = OPENING_HEIGHT * 0.5 + 3.1;
  switch (direction) {
    case 'left': return centre.clone().addScaledVector(right, -side);
    case 'right': return centre.clone().addScaledVector(right, side);
    case 'up': return centre.clone().addScaledVector(up, vertical);
    case 'down': return centre.clone().addScaledVector(up, -vertical);
  }
}

function addFan(
  group: THREE.Group,
  direction: AttachmentDirection,
  anchor: THREE.Vector3,
  target: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  spec: NodeAttachmentSpec,
  materials: SealMaterials,
  keepout: SpatialKeepout,
): void {
  const outward = directionVector(direction, right, up);
  const tangent = direction === 'left' || direction === 'right' ? up : right;
  const strands = Math.max(2, spec.strands);
  const nearPoints: THREE.Vector3[] = [];
  const farPoints: THREE.Vector3[] = [];

  for (let index = 0; index < strands; index += 1) {
    const centred = index - (strands - 1) / 2;
    const tangentOffset = centred * 1.35;
    const forwardOffset = centred * 0.48;
    const start = anchor.clone()
      .addScaledVector(tangent, tangentOffset)
      .addScaledVector(forward, forwardOffset);
    const end = target.clone()
      .addScaledVector(tangent, tangentOffset * 0.45)
      .addScaledVector(forward, forwardOffset * 0.55);
    const elbow = start.clone().lerp(end, 0.48)
      .addScaledVector(outward, 3.4 + Math.abs(centred) * 0.7);

    const material = index === Math.floor(strands / 2) ? materials.primary : materials.conductor;
    const radius = index === Math.floor(strands / 2) ? spec.radius * 1.18 : spec.radius * 0.72;
    addAdmittedBeam(group, start, elbow, material, radius, keepout);
    addAdmittedBeam(group, elbow, end, material, radius, keepout);
    nearPoints.push(start, elbow);
    farPoints.push(end);
  }

  // Cross-bracing makes each radial attachment read as a structural bulkhead
  // sector rather than a decorative cable bundle, while leaving irregular holes
  // and machinery depth instead of reconstructing a flat room wall.
  for (let index = 0; index < nearPoints.length - 2; index += 2) {
    const a = nearPoints[index];
    const b = nearPoints[index + 2];
    if (a && b) addAdmittedBeam(group, a, b, materials.brace, spec.radius * 0.62, keepout);
  }
  for (let index = 0; index < farPoints.length - 1; index += 1) {
    const a = farPoints[index];
    const b = farPoints[index + 1];
    if (a && b) addAdmittedBeam(group, a, b, materials.brace, spec.radius * 0.58, keepout);
  }
}

function addLocalCollar(
  group: THREE.Group,
  centre: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  openingWidth: number,
  materials: SealMaterials,
  keepout: SpatialKeepout,
): void {
  const side = openingWidth * 0.5 + 3.1;
  const vertical = OPENING_HEIGHT * 0.5 + 3.1;
  const depth = BULKHEAD_DEPTH * 0.5;
  const corners = [
    centre.clone().addScaledVector(right, -side).addScaledVector(up, vertical),
    centre.clone().addScaledVector(right, side).addScaledVector(up, vertical),
    centre.clone().addScaledVector(right, side).addScaledVector(up, -vertical),
    centre.clone().addScaledVector(right, -side).addScaledVector(up, -vertical),
  ];

  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    if (!a || !b) continue;
    // Split the collar fore/aft so it reads as thick machinery around the gate.
    for (const z of [-depth, depth]) {
      addAdmittedBeam(
        group,
        a.clone().addScaledVector(forward, z),
        b.clone().addScaledVector(forward, z),
        materials.primary,
        0.52,
        keepout,
      );
    }
  }
}

function openingWidthFor(world: RunWorld, encounter: EncounterSpec): number {
  const junction = world.junctions.find((candidate) => (
    candidate.incomingRoute === encounter.routeId
    && candidate.at >= encounter.at - 0.08
    && candidate.at <= encounter.at + 0.12
    && candidate.exits.length > 1
  ));
  return junction ? 15 : 13;
}

/**
 * Grows blocker forms into the structures that were actually generated around
 * them. Passwords become irregular radial bulkheads tied into lattice/city and
 * chassis machinery, while the central aperture remains protected by spatial
 * admission and is still the only authored continuation route.
 */
export function addLatticeNodeSeals(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  world: RunWorld,
  interactions: Readonly<Record<string, EncounterInteractionPlan>>,
  targets: readonly AttachmentTarget[],
  keepout: SpatialKeepout,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arkour-lattice-node-seals';
  const materials: SealMaterials = {
    primary: new THREE.MeshStandardMaterial({ color: 0x27383e, roughness: 0.52, metalness: 0.64 }),
    conductor: new THREE.MeshStandardMaterial({ color: 0x75503b, roughness: 0.38, metalness: 0.8 }),
    brace: new THREE.MeshStandardMaterial({ color: 0x121f24, roughness: 0.66, metalness: 0.54 }),
  };
  const frame = createRouteFrame();

  for (const routeSpec of world.routes) {
    const route = routes.get(routeSpec.id);
    if (!route) continue;

    for (const encounter of routeSpec.encounters ?? []) {
      const interaction = interactions[encounter.id];
      const spec = interaction?.attachments;
      if (!interaction?.blocker || !spec) continue;

      sampleRouteFrameAtDistance(route, encounter.at * route.length, frame);
      const centre = frame.position.clone();
      const openingWidth = openingWidthFor(world, encounter);
      const selected = selectTargets(
        spec.directions,
        centre,
        targets,
        spec,
        frame.right,
        frame.up,
        frame.forward,
      );

      addLocalCollar(
        group,
        centre,
        frame.right,
        frame.up,
        frame.forward,
        openingWidth,
        materials,
        keepout,
      );

      for (const direction of spec.directions) {
        const target = selected.get(direction);
        if (!target) continue;
        const anchor = anchorForDirection(direction, centre, frame.right, frame.up, openingWidth);
        addFan(
          group,
          direction,
          anchor,
          target.position,
          frame.right,
          frame.up,
          frame.forward,
          spec,
          materials,
          keepout,
        );
      }
    }
  }

  scene.add(group);
  return group;
}
