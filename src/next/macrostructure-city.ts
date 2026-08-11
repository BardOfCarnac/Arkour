import * as THREE from 'three';
import { objectIntersectsKeepout, type SpatialKeepout } from '../run/keepout';
import type { RunWorld, Vec3 } from '../run/types';
import { createMachineryMaterials, type MachineryMaterials } from './machinery-kit';

const CELL = 18;
const CLAIM_PADDING = 6;
const DEG60 = Math.PI / 3;

export type MacrostructureArchetype =
  | 'fin-tower'
  | 'memory-canyon'
  | 'bus-viaduct'
  | 'recursive-frame-stack';

export interface MacrostructureClaim {
  archetype: MacrostructureArchetype;
  bounds: THREE.Box3;
}

export interface MacrostructureCityResult {
  group: THREE.Group;
  claims: THREE.Box3[];
  structures: MacrostructureClaim[];
}

interface Candidate {
  archetype: MacrostructureArchetype;
  origins: readonly THREE.Vector3[];
  build: (origin: THREE.Vector3, materials: MachineryMaterials) => THREE.Group;
}

function vector(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2]);
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
  return bounds;
}

function snap(value: number): number {
  return Math.round(value / CELL) * CELL;
}

function snapPosition(position: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(snap(position.x), snap(position.y), snap(position.z));
}

function addBox(
  parent: THREE.Object3D,
  size: THREE.Vector3,
  position: THREE.Vector3,
  material: THREE.Material,
  rotationY = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  mesh.rotation.y = rotationY;
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: THREE.Object3D,
  radius: number,
  length: number,
  position: THREE.Vector3,
  material: THREE.Material,
  axis: 'x' | 'y' | 'z' = 'y',
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8, 1, false), material);
  mesh.position.copy(position);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

function buildFinTower(origin: THREE.Vector3, materials: MachineryMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arkour-macro:fin-tower';

  addBox(group, new THREE.Vector3(24, 142, 26), origin, materials.darkSteel);
  addBox(
    group,
    new THREE.Vector3(12, 126, 9),
    origin.clone().add(new THREE.Vector3(19, -4, -10)),
    materials.copper,
  );

  const finLevels = [-55, -37, -18, 2, 23, 43, 59];
  finLevels.forEach((y, index) => {
    const side = index % 2 === 0 ? 1 : -1;
    const reach = 44 + (index % 3) * 8;
    addBox(
      group,
      new THREE.Vector3(reach, 7, 34),
      origin.clone().add(new THREE.Vector3(side * (reach * 0.28), y, index % 2 === 0 ? -4 : 5)),
      index % 3 === 0 ? materials.agedSteel : materials.steel,
    );
  });

  addBox(
    group,
    new THREE.Vector3(58, 18, 48),
    origin.clone().add(new THREE.Vector3(-12, -28, 7)),
    materials.paintedSteel,
  );
  addCylinder(
    group,
    6,
    74,
    origin.clone().add(new THREE.Vector3(-24, 18, 15)),
    materials.steel,
  );

  return group;
}

function buildMemoryCanyon(origin: THREE.Vector3, materials: MachineryMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arkour-macro:memory-canyon';

  const gap = 38;
  const slabWidth = 28;
  const slabHeight = 114;
  const slabDepth = 76;

  for (const side of [-1, 1] as const) {
    const x = side * (gap * 0.5 + slabWidth * 0.5);
    addBox(
      group,
      new THREE.Vector3(slabWidth, slabHeight, slabDepth),
      origin.clone().add(new THREE.Vector3(x, 0, 0)),
      side > 0 ? materials.darkSteel : materials.paintedSteel,
    );

    for (let row = -3; row <= 3; row += 1) {
      addBox(
        group,
        new THREE.Vector3(7, 8, 58),
        origin.clone().add(new THREE.Vector3(side * (gap * 0.5 - 2), row * 14, 0)),
        row % 2 === 0 ? materials.ceramic : materials.agedSteel,
      );
    }

    addBox(
      group,
      new THREE.Vector3(8, 92, 9),
      origin.clone().add(new THREE.Vector3(side * (gap * 0.5 + 7), 4, -41)),
      materials.copper,
    );
  }

  addBox(
    group,
    new THREE.Vector3(82, 8, 20),
    origin.clone().add(new THREE.Vector3(0, 53, 25)),
    materials.steel,
  );

  return group;
}

function buildBusViaduct(origin: THREE.Vector3, materials: MachineryMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arkour-macro:bus-viaduct';

  const span = 126;
  for (const side of [-1, 1] as const) {
    addBox(
      group,
      new THREE.Vector3(30, 104 + (side > 0 ? 18 : 0), 32),
      origin.clone().add(new THREE.Vector3(side * 56, side > 0 ? 7 : -5, 0)),
      materials.darkSteel,
    );
    addBox(
      group,
      new THREE.Vector3(42, 16, 46),
      origin.clone().add(new THREE.Vector3(side * 55, 34 + side * 5, 0)),
      materials.paintedSteel,
    );
  }

  addBox(
    group,
    new THREE.Vector3(span, 10, 26),
    origin.clone().add(new THREE.Vector3(0, 39, 0)),
    materials.steel,
  );
  addBox(
    group,
    new THREE.Vector3(108, 7, 18),
    origin.clone().add(new THREE.Vector3(0, 53, -15)),
    materials.agedSteel,
    DEG60,
  );
  addBox(
    group,
    new THREE.Vector3(100, 5, 10),
    origin.clone().add(new THREE.Vector3(0, 61, 14)),
    materials.copper,
    -DEG60,
  );

  return group;
}

function addFrame(
  group: THREE.Group,
  origin: THREE.Vector3,
  width: number,
  height: number,
  depth: number,
  thickness: number,
  material: THREE.Material,
  rotationY: number,
): void {
  const local = new THREE.Group();
  local.position.copy(origin);
  local.rotation.y = rotationY;
  group.add(local);

  for (const side of [-1, 1] as const) {
    addBox(
      local,
      new THREE.Vector3(thickness, height, depth),
      new THREE.Vector3(side * width * 0.5, 0, 0),
      material,
    );
    addBox(
      local,
      new THREE.Vector3(width + thickness, thickness, depth),
      new THREE.Vector3(0, side * height * 0.5, 0),
      material,
    );
  }
}

function buildRecursiveFrameStack(origin: THREE.Vector3, materials: MachineryMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arkour-macro:recursive-frame-stack';

  const frames = [
    { width: 96, height: 82, depth: 18, y: -36, rotation: 0 },
    { width: 78, height: 70, depth: 16, y: -4, rotation: DEG60 },
    { width: 64, height: 58, depth: 14, y: 29, rotation: -DEG60 },
    { width: 48, height: 46, depth: 12, y: 55, rotation: 0 },
  ];

  frames.forEach((frame, index) => {
    addFrame(
      group,
      origin.clone().add(new THREE.Vector3(index % 2 === 0 ? -7 : 8, frame.y, index * 5 - 8)),
      frame.width,
      frame.height,
      frame.depth,
      7,
      index % 2 === 0 ? materials.darkSteel : materials.steel,
      frame.rotation,
    );
  });

  addCylinder(
    group,
    4,
    124,
    origin.clone().add(new THREE.Vector3(28, 2, -22)),
    materials.copper,
  );
  addCylinder(
    group,
    3.5,
    102,
    origin.clone().add(new THREE.Vector3(-31, -10, 19)),
    materials.agedSteel,
  );

  return group;
}

function structureClearsKeepout(structure: THREE.Group, keepout: SpatialKeepout): boolean {
  let clear = true;
  structure.traverse((object) => {
    if (!clear || !(object instanceof THREE.Mesh)) return;
    if (objectIntersectsKeepout(object, keepout)) clear = false;
  });
  return clear;
}

function admitStructure(
  root: THREE.Group,
  claims: THREE.Box3[],
  structures: MacrostructureClaim[],
  candidate: Candidate,
  materials: MachineryMaterials,
  keepout: SpatialKeepout,
): boolean {
  for (const origin of candidate.origins) {
    const structure = candidate.build(snapPosition(origin), materials);
    if (!structureClearsKeepout(structure, keepout)) continue;

    structure.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(structure).expandByScalar(CLAIM_PADDING);
    root.add(structure);
    claims.push(bounds);
    structures.push({ archetype: candidate.archetype, bounds });
    return true;
  }
  return false;
}

/**
 * Canonical macroarchitecture vocabulary v1.
 *
 * Large structures own shared world-space volumes before the lattice is populated.
 * Their silhouettes may evolve freely, but they never become route-relative city
 * dressing: every solid member is admitted against the same route/camera/hold
 * authority and the accepted structure reserves its full region from lattice infill.
 */
export function addMacrostructureCity(
  scene: THREE.Scene,
  world: RunWorld,
  keepout: SpatialKeepout,
): MacrostructureCityResult {
  const bounds = routeBounds(world);
  const centre = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const materials = createMachineryMaterials();
  const group = new THREE.Group();
  const claims: THREE.Box3[] = [];
  const structures: MacrostructureClaim[] = [];
  group.name = 'arkour-macrostructure-city';

  const xReach = Math.max(54, size.x * 0.38);
  const zReach = Math.max(54, size.z * 0.38);

  const candidates: Candidate[] = [
    {
      archetype: 'fin-tower',
      build: buildFinTower,
      origins: [
        centre.clone().add(new THREE.Vector3(xReach, 0, -zReach * 0.4)),
        centre.clone().add(new THREE.Vector3(xReach + CELL, -CELL, zReach * 0.35)),
        centre.clone().add(new THREE.Vector3(xReach + CELL * 2, CELL, 0)),
      ],
    },
    {
      archetype: 'memory-canyon',
      build: buildMemoryCanyon,
      origins: [
        centre.clone().add(new THREE.Vector3(-xReach, -CELL, zReach * 0.28)),
        centre.clone().add(new THREE.Vector3(-xReach - CELL, CELL, -zReach * 0.3)),
        centre.clone().add(new THREE.Vector3(-xReach - CELL * 2, 0, zReach * 0.62)),
      ],
    },
    {
      archetype: 'bus-viaduct',
      build: buildBusViaduct,
      origins: [
        centre.clone().add(new THREE.Vector3(0, size.y * 0.13, zReach)),
        centre.clone().add(new THREE.Vector3(CELL, -CELL, zReach + CELL)),
        centre.clone().add(new THREE.Vector3(-CELL, CELL, zReach + CELL * 2)),
      ],
    },
    {
      archetype: 'recursive-frame-stack',
      build: buildRecursiveFrameStack,
      origins: [
        centre.clone().add(new THREE.Vector3(-xReach * 0.2, -size.y * 0.18, -zReach)),
        centre.clone().add(new THREE.Vector3(xReach * 0.28, CELL, -zReach - CELL)),
        centre.clone().add(new THREE.Vector3(-xReach * 0.55, -CELL, -zReach - CELL * 2)),
      ],
    },
  ];

  for (const candidate of candidates) {
    admitStructure(group, claims, structures, candidate, materials, keepout);
  }

  scene.add(group);
  return { group, claims, structures };
}
