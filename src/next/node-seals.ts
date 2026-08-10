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
const PANEL_DEPTH = 3.4;
const PANEL_OVERLAP = 0.9;

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
  plate: THREE.MeshStandardMaterial;
  plateInset: THREE.MeshStandardMaterial;
}

interface SealEnvelope {
  left: number;
  right: number;
  up: number;
  down: number;
  innerSide: number;
  innerVertical: number;
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

function axialExtent(
  direction: AttachmentDirection,
  centre: THREE.Vector3,
  selected: ReadonlyMap<AttachmentDirection, AttachmentTarget>,
  spec: NodeAttachmentSpec,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  minimum: number,
): number {
  const target = selected.get(direction);
  if (!target) return minimum + 7;
  const local = directionalComponents(target.position.clone().sub(centre), right, up, forward);
  const axial = direction === 'left' ? -local.right
    : direction === 'right' ? local.right
      : direction === 'up' ? local.up
        : -local.up;
  return THREE.MathUtils.clamp(axial - 1.5, minimum + 4.5, spec.maxReach * 0.92);
}

function createSealEnvelope(
  centre: THREE.Vector3,
  openingWidth: number,
  selected: ReadonlyMap<AttachmentDirection, AttachmentTarget>,
  spec: NodeAttachmentSpec,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
): SealEnvelope {
  const innerSide = openingWidth * 0.5 + 2.45;
  const innerVertical = OPENING_HEIGHT * 0.5 + 2.45;
  return {
    innerSide,
    innerVertical,
    left: axialExtent('left', centre, selected, spec, right, up, forward, innerSide),
    right: axialExtent('right', centre, selected, spec, right, up, forward, innerSide),
    up: axialExtent('up', centre, selected, spec, right, up, forward, innerVertical),
    down: axialExtent('down', centre, selected, spec, right, up, forward, innerVertical),
  };
}

function createPanel(
  centre: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  localRight: number,
  localUp: number,
  localForward: number,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.copy(centre)
    .addScaledVector(right, localRight)
    .addScaledVector(up, localUp)
    .addScaledVector(forward, localForward);
  const basis = new THREE.Matrix4().makeBasis(right, up, forward);
  mesh.quaternion.setFromRotationMatrix(basis);
  return mesh;
}

/**
 * The blocker body is an aperture-aware exception to generic route keep-out.
 * Each panel is defined explicitly outside the passable opening, so together
 * they close the cross-section while the central aperture remains untouched.
 * Staggered fore/aft depths keep it reading as interlocking machinery rather
 * than a single flat room wall.
 */
function addSealedCrossSection(
  group: THREE.Group,
  centre: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  envelope: SealEnvelope,
  materials: SealMaterials,
): void {
  const fullHeight = envelope.up + envelope.down;
  const centreY = (envelope.up - envelope.down) * 0.5;
  const leftWidth = envelope.left - envelope.innerSide + PANEL_OVERLAP;
  const rightWidth = envelope.right - envelope.innerSide + PANEL_OVERLAP;
  const topHeight = envelope.up - envelope.innerVertical + PANEL_OVERLAP;
  const bottomHeight = envelope.down - envelope.innerVertical + PANEL_OVERLAP;
  const centreWidth = envelope.innerSide * 2 + PANEL_OVERLAP * 2;

  const panels = [
    createPanel(
      centre,
      right,
      up,
      forward,
      -(envelope.left + envelope.innerSide) * 0.5,
      centreY,
      -0.62,
      leftWidth,
      fullHeight,
      PANEL_DEPTH,
      materials.plate,
    ),
    createPanel(
      centre,
      right,
      up,
      forward,
      (envelope.right + envelope.innerSide) * 0.5,
      centreY,
      0.48,
      rightWidth,
      fullHeight,
      PANEL_DEPTH,
      materials.plateInset,
    ),
    createPanel(
      centre,
      right,
      up,
      forward,
      0,
      (envelope.up + envelope.innerVertical) * 0.5,
      -0.12,
      centreWidth,
      topHeight,
      PANEL_DEPTH + 0.7,
      materials.plateInset,
    ),
    createPanel(
      centre,
      right,
      up,
      forward,
      0,
      -(envelope.down + envelope.innerVertical) * 0.5,
      0.78,
      centreWidth,
      bottomHeight,
      PANEL_DEPTH + 0.5,
      materials.plate,
    ),
  ];

  for (const panel of panels) {
    panel.castShadow = false;
    panel.receiveShadow = false;
    group.add(panel);
  }

  // Broad backing ribs overlap the four stepped seams. They are offset behind
  // the front faces, so a visible seam never becomes a plausible bypass.
  const seamDepth = -PANEL_DEPTH * 0.78;
  const verticalRibHeight = Math.max(3, fullHeight - 2.4);
  const horizontalRibWidth = Math.max(3, envelope.left + envelope.right - 2.4);
  group.add(
    createPanel(
      centre,
      right,
      up,
      forward,
      -envelope.innerSide + 0.25,
      centreY,
      seamDepth,
      1.25,
      verticalRibHeight,
      1.15,
      materials.conductor,
    ),
    createPanel(
      centre,
      right,
      up,
      forward,
      envelope.innerSide - 0.25,
      centreY,
      seamDepth - 0.18,
      1.25,
      verticalRibHeight,
      1.15,
      materials.conductor,
    ),
    createPanel(
      centre,
      right,
      up,
      forward,
      (envelope.right - envelope.left) * 0.5,
      envelope.innerVertical - 0.25,
      seamDepth - 0.34,
      horizontalRibWidth,
      1.15,
      1.05,
      materials.brace,
    ),
    createPanel(
      centre,
      right,
      up,
      forward,
      (envelope.right - envelope.left) * 0.5,
      -envelope.innerVertical + 0.25,
      seamDepth - 0.52,
      horizontalRibWidth,
      1.15,
      1.05,
      materials.brace,
    ),
  );
}

function outerAnchorForDirection(
  direction: AttachmentDirection,
  centre: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  envelope: SealEnvelope,
): THREE.Vector3 {
  switch (direction) {
    case 'left': return centre.clone().addScaledVector(right, -envelope.left);
    case 'right': return centre.clone().addScaledVector(right, envelope.right);
    case 'up': return centre.clone().addScaledVector(up, envelope.up);
    case 'down': return centre.clone().addScaledVector(up, -envelope.down);
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
  if (anchor.distanceTo(target) < 2.5) return;
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
 * them. The blocker itself now closes the cross-section around the aperture;
 * lattice/chassis fans then carry that bulkhead outward into real machinery.
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
    plate: new THREE.MeshStandardMaterial({ color: 0x0d171b, roughness: 0.7, metalness: 0.52 }),
    plateInset: new THREE.MeshStandardMaterial({ color: 0x17272d, roughness: 0.6, metalness: 0.62 }),
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
      const envelope = createSealEnvelope(
        centre,
        openingWidth,
        selected,
        spec,
        frame.right,
        frame.up,
        frame.forward,
      );

      addSealedCrossSection(
        group,
        centre,
        frame.right,
        frame.up,
        frame.forward,
        envelope,
        materials,
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
        const anchor = outerAnchorForDirection(direction, centre, frame.right, frame.up, envelope);
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
