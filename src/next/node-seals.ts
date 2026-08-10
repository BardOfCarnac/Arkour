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
const LEVEL_HALF_SPAN = 72;
const SEAL_DEPTH = 10;
const APERTURE_MARGIN = 0.35;

interface AttachmentTarget {
  id: number;
  position: THREE.Vector3;
}

interface DirectionCandidate {
  target: AttachmentTarget;
  score: number;
}

interface SealMaterials {
  backing: THREE.MeshStandardMaterial;
  plate: THREE.MeshStandardMaterial;
  plateInset: THREE.MeshStandardMaterial;
  conductor: THREE.MeshStandardMaterial;
  brace: THREE.MeshStandardMaterial;
}

function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
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

/** Collect centres from machinery that actually survived world generation. */
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
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
  return mesh;
}

/**
 * Password is a level boundary, not an object that merely happens to look wide.
 * These four dark backing masses span the entire local level envelope and leave
 * one aperture. They intentionally bypass generic scenery keep-out: occupying
 * the cross-section is the gameplay contract of a blocker.
 */
function addFullLevelBacking(
  group: THREE.Group,
  centre: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  openingWidth: number,
  materials: SealMaterials,
): { innerSide: number; innerVertical: number } {
  const innerSide = openingWidth * 0.5 + APERTURE_MARGIN;
  const innerVertical = OPENING_HEIGHT * 0.5 + APERTURE_MARGIN;
  const sideWidth = LEVEL_HALF_SPAN - innerSide;
  const capHeight = LEVEL_HALF_SPAN - innerVertical;

  const backing = [
    createPanel(
      centre, right, up, forward,
      -(LEVEL_HALF_SPAN + innerSide) * 0.5, 0, 0,
      sideWidth, LEVEL_HALF_SPAN * 2, SEAL_DEPTH,
      materials.backing,
    ),
    createPanel(
      centre, right, up, forward,
      (LEVEL_HALF_SPAN + innerSide) * 0.5, 0, 0,
      sideWidth, LEVEL_HALF_SPAN * 2, SEAL_DEPTH,
      materials.backing,
    ),
    createPanel(
      centre, right, up, forward,
      0, (LEVEL_HALF_SPAN + innerVertical) * 0.5, 0,
      innerSide * 2, capHeight, SEAL_DEPTH,
      materials.backing,
    ),
    createPanel(
      centre, right, up, forward,
      0, -(LEVEL_HALF_SPAN + innerVertical) * 0.5, 0,
      innerSide * 2, capHeight, SEAL_DEPTH,
      materials.backing,
    ),
  ];

  for (const panel of backing) {
    panel.userData.noWireAccent = true;
    group.add(panel);
  }

  return { innerSide, innerVertical };
}

function addFacadeRegion(
  group: THREE.Group,
  centre: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  columns: number,
  rows: number,
  seed: number,
  materials: SealMaterials,
): void {
  const cellWidth = (xMax - xMin) / columns;
  const cellHeight = (yMax - yMin) / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const h = hashString(`${seed}:${row}:${column}:${xMin}:${yMin}`);
      // The dark backing remains continuous; missing facade cassettes create
      // visual depth without creating a physical bypass.
      if (h % 7 === 0) continue;

      const insetX = 0.55 + ((h >>> 5) % 5) * 0.08;
      const insetY = 0.55 + ((h >>> 9) % 5) * 0.08;
      const width = Math.max(1.2, cellWidth - insetX * 2);
      const height = Math.max(1.2, cellHeight - insetY * 2);
      const depth = 2.6 + ((h >>> 13) % 7) * 0.48;
      const localRight = xMin + cellWidth * (column + 0.5);
      const localUp = yMin + cellHeight * (row + 0.5);
      const localForward = -(SEAL_DEPTH * 0.5 + depth * 0.5 - 0.4) - ((h >>> 19) % 3) * 0.32;
      const material = h % 5 === 0
        ? materials.plateInset
        : h % 3 === 0
          ? materials.conductor
          : materials.plate;

      group.add(createPanel(
        centre,
        right,
        up,
        forward,
        localRight,
        localUp,
        localForward,
        width,
        height,
        depth,
        material,
      ));
    }
  }
}

/**
 * Break the approach face into machinery cassettes. The facade may have gaps,
 * steps and different depths because the continuous level backing behind it is
 * the actual seal.
 */
function addMachineryFacade(
  group: THREE.Group,
  centre: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  innerSide: number,
  innerVertical: number,
  encounterId: string,
  materials: SealMaterials,
): void {
  const seed = hashString(encounterId);
  addFacadeRegion(
    group, centre, right, up, forward,
    -LEVEL_HALF_SPAN, -innerSide, -LEVEL_HALF_SPAN, LEVEL_HALF_SPAN,
    3, 6, seed ^ 0x13579, materials,
  );
  addFacadeRegion(
    group, centre, right, up, forward,
    innerSide, LEVEL_HALF_SPAN, -LEVEL_HALF_SPAN, LEVEL_HALF_SPAN,
    3, 6, seed ^ 0x24680, materials,
  );
  addFacadeRegion(
    group, centre, right, up, forward,
    -innerSide, innerSide, innerVertical, LEVEL_HALF_SPAN,
    2, 4, seed ^ 0xabcde, materials,
  );
  addFacadeRegion(
    group, centre, right, up, forward,
    -innerSide, innerSide, -LEVEL_HALF_SPAN, -innerVertical,
    2, 4, seed ^ 0x54321, materials,
  );

  // A thick collar makes the controlled aperture legible inside the much larger
  // level seal without turning the entire boundary into a simple square frame.
  const collarOffset = SEAL_DEPTH * 0.5 + 2.1;
  const left = centre.clone().addScaledVector(right, -innerSide - 0.9).addScaledVector(forward, -collarOffset);
  const rightPoint = centre.clone().addScaledVector(right, innerSide + 0.9).addScaledVector(forward, -collarOffset);
  const top = centre.clone().addScaledVector(up, innerVertical + 0.9).addScaledVector(forward, -collarOffset);
  const bottom = centre.clone().addScaledVector(up, -innerVertical - 0.9).addScaledVector(forward, -collarOffset);
  const topLeft = left.clone().addScaledVector(up, innerVertical + 0.9);
  const bottomLeft = left.clone().addScaledVector(up, -innerVertical - 0.9);
  const topRight = rightPoint.clone().addScaledVector(up, innerVertical + 0.9);
  const bottomRight = rightPoint.clone().addScaledVector(up, -innerVertical - 0.9);
  const collarRadius = 0.78;

  for (const [a, b] of [
    [topLeft, topRight],
    [bottomLeft, bottomRight],
    [topLeft, bottomLeft],
    [topRight, bottomRight],
  ] as const) {
    const beam = createBeam(a, b, materials.brace, collarRadius);
    if (beam) group.add(beam);
  }
}

function tetherAnchor(
  direction: AttachmentDirection,
  centre: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  innerSide: number,
  innerVertical: number,
): THREE.Vector3 {
  const approach = -(SEAL_DEPTH * 0.5 + 4.2);
  const anchor = centre.clone().addScaledVector(forward, approach);
  switch (direction) {
    case 'left': return anchor.addScaledVector(right, -(innerSide + 7));
    case 'right': return anchor.addScaledVector(right, innerSide + 7);
    case 'up': return anchor.addScaledVector(up, innerVertical + 7);
    case 'down': return anchor.addScaledVector(up, -(innerVertical + 7));
  }
}

function addDecorativeTethers(
  group: THREE.Group,
  centre: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  innerSide: number,
  innerVertical: number,
  spec: NodeAttachmentSpec,
  targets: readonly AttachmentTarget[],
  materials: SealMaterials,
  keepout: SpatialKeepout,
): void {
  const selected = selectTargets(spec.directions, centre, targets, spec, right, up, forward);
  for (const direction of spec.directions) {
    const target = selected.get(direction);
    if (!target) continue;
    const start = tetherAnchor(direction, centre, right, up, forward, innerSide, innerVertical);
    const elbow = start.clone().lerp(target.position, 0.48).addScaledVector(forward, -5.5);
    addAdmittedBeam(group, start, elbow, materials.brace, 0.42, keepout);
    addAdmittedBeam(group, elbow, target.position, materials.conductor, 0.34, keepout);
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
 * Password rule: the entire local level is a sealed boundary. Nearby lattice
 * machinery may decorate and brace that boundary, but can never determine
 * whether it blocks progression. The moving Password shutter is the sole route
 * through the single controlled aperture.
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
  group.name = 'arkour-password-level-seals';
  const materials: SealMaterials = {
    backing: new THREE.MeshStandardMaterial({ color: 0x05090b, roughness: 0.94, metalness: 0.16 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x202e33, roughness: 0.58, metalness: 0.58 }),
    plateInset: new THREE.MeshStandardMaterial({ color: 0x334248, roughness: 0.68, metalness: 0.42 }),
    conductor: new THREE.MeshStandardMaterial({ color: 0x6f4c39, roughness: 0.4, metalness: 0.78 }),
    brace: new THREE.MeshStandardMaterial({ color: 0x111d21, roughness: 0.7, metalness: 0.5 }),
  };
  const frame = createRouteFrame();

  for (const routeSpec of world.routes) {
    const route = routes.get(routeSpec.id);
    if (!route) continue;

    for (const encounter of routeSpec.encounters ?? []) {
      const interaction = interactions[encounter.id];
      if (encounter.type !== 'password' || !interaction?.blocker) continue;

      sampleRouteFrameAtDistance(route, encounter.at * route.length, frame);
      const centre = frame.position.clone();
      const openingWidth = openingWidthFor(world, encounter);
      const aperture = addFullLevelBacking(
        group,
        centre,
        frame.right,
        frame.up,
        frame.forward,
        openingWidth,
        materials,
      );

      addMachineryFacade(
        group,
        centre,
        frame.right,
        frame.up,
        frame.forward,
        aperture.innerSide,
        aperture.innerVertical,
        encounter.id,
        materials,
      );

      if (interaction.attachments) {
        addDecorativeTethers(
          group,
          centre,
          frame.right,
          frame.up,
          frame.forward,
          aperture.innerSide,
          aperture.innerVertical,
          interaction.attachments,
          targets,
          materials,
          keepout,
        );
      }
    }
  }

  scene.add(group);
  return group;
}
