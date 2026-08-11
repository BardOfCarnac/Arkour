import * as THREE from 'three';
import { objectIntersectsKeepout, type SpatialKeepout } from '../run/keepout';
import type { RunWorld, Vec3 } from '../run/types';

const CELL = 18;
const CLAIM_PADDING = 5;

export interface MacrostructureProxyResult {
  group: THREE.Group;
  claims: THREE.Box3[];
}

interface ProxyMaterials {
  shell: THREE.MeshStandardMaterial;
  secondary: THREE.MeshStandardMaterial;
  conductor: THREE.MeshStandardMaterial;
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
  parent: THREE.Group,
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

function createMaterials(): ProxyMaterials {
  return {
    shell: new THREE.MeshStandardMaterial({ color: 0x121c20, roughness: 0.78, metalness: 0.42 }),
    secondary: new THREE.MeshStandardMaterial({ color: 0x344247, roughness: 0.64, metalness: 0.56 }),
    conductor: new THREE.MeshStandardMaterial({ color: 0x6f4b38, roughness: 0.42, metalness: 0.76 }),
  };
}

function buildVerticalStack(origin: THREE.Vector3, materials: ProxyMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arkour-macro-proxy:vertical-stack';

  addBox(group, new THREE.Vector3(28, 118, 28), origin, materials.shell);
  addBox(group, new THREE.Vector3(52, 20, 42), origin.clone().add(new THREE.Vector3(12, 28, -4)), materials.secondary);
  addBox(group, new THREE.Vector3(44, 17, 34), origin.clone().add(new THREE.Vector3(-11, -18, 8)), materials.secondary);
  addBox(group, new THREE.Vector3(62, 8, 16), origin.clone().add(new THREE.Vector3(0, 51, 3)), materials.conductor);
  addBox(group, new THREE.Vector3(12, 74, 10), origin.clone().add(new THREE.Vector3(24, -13, -12)), materials.conductor);

  return group;
}

function buildOpenFrame(origin: THREE.Vector3, materials: ProxyMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arkour-macro-proxy:open-frame';

  const halfWidth = 39;
  const halfHeight = 48;
  for (const side of [-1, 1] as const) {
    addBox(
      group,
      new THREE.Vector3(9, halfHeight * 2, 24),
      origin.clone().add(new THREE.Vector3(side * halfWidth, 0, 0)),
      materials.shell,
    );
  }
  for (const vertical of [-1, 1] as const) {
    addBox(
      group,
      new THREE.Vector3(halfWidth * 2 + 9, 9, 24),
      origin.clone().add(new THREE.Vector3(0, vertical * halfHeight, 0)),
      vertical > 0 ? materials.secondary : materials.shell,
    );
  }
  addBox(group, new THREE.Vector3(52, 5, 12), origin.clone().add(new THREE.Vector3(0, 13, -14)), materials.conductor, Math.PI / 3);
  addBox(group, new THREE.Vector3(46, 5, 12), origin.clone().add(new THREE.Vector3(0, -17, 14)), materials.conductor, -Math.PI / 3);

  return group;
}

function buildBridgeMass(origin: THREE.Vector3, materials: ProxyMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arkour-macro-proxy:bridge-mass';

  addBox(group, new THREE.Vector3(34, 84, 34), origin.clone().add(new THREE.Vector3(-48, -10, 0)), materials.shell);
  addBox(group, new THREE.Vector3(34, 98, 34), origin.clone().add(new THREE.Vector3(48, 7, 0)), materials.shell);
  addBox(group, new THREE.Vector3(114, 13, 28), origin.clone().add(new THREE.Vector3(0, 26, 0)), materials.secondary);
  addBox(group, new THREE.Vector3(92, 6, 11), origin.clone().add(new THREE.Vector3(0, 38, -13)), materials.conductor);
  addBox(group, new THREE.Vector3(54, 19, 18), origin.clone().add(new THREE.Vector3(22, -31, 8)), materials.secondary);

  return group;
}

function proxyClearsKeepout(proxy: THREE.Group, keepout: SpatialKeepout): boolean {
  let clear = true;
  proxy.traverse((object) => {
    if (!clear || !(object instanceof THREE.Mesh)) return;
    if (objectIntersectsKeepout(object, keepout)) clear = false;
  });
  return clear;
}

function admitProxy(
  root: THREE.Group,
  claims: THREE.Box3[],
  builder: (origin: THREE.Vector3) => THREE.Group,
  origins: readonly THREE.Vector3[],
  keepout: SpatialKeepout,
): boolean {
  for (const origin of origins) {
    const proxy = builder(snapPosition(origin));
    if (!proxyClearsKeepout(proxy, keepout)) continue;

    proxy.updateWorldMatrix(true, true);
    const claim = new THREE.Box3().setFromObject(proxy).expandByScalar(CLAIM_PADDING);
    root.add(proxy);
    claims.push(claim);
    return true;
  }
  return false;
}

/**
 * First macroarchitecture integration seam.
 *
 * These are intentionally crude world-space proxies, not final buildings. Each
 * accepted proxy claims a large volume before the ordinary lattice is populated,
 * proving that future authored/circuit/code-derived macrostructures can own space
 * without becoming route-local scenery. Every solid member must independently
 * clear the same route/camera keep-out used by the rest of Arkour.
 */
export function addMacrostructureProxies(
  scene: THREE.Scene,
  world: RunWorld,
  keepout: SpatialKeepout,
): MacrostructureProxyResult {
  const bounds = routeBounds(world);
  const centre = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const materials = createMaterials();
  const group = new THREE.Group();
  const claims: THREE.Box3[] = [];
  group.name = 'arkour-macrostructure-proxies';

  const xReach = Math.max(42, size.x * 0.34);
  const zReach = Math.max(42, size.z * 0.34);

  admitProxy(
    group,
    claims,
    (origin) => buildVerticalStack(origin, materials),
    [
      centre.clone().add(new THREE.Vector3(xReach, 0, -zReach * 0.35)),
      centre.clone().add(new THREE.Vector3(xReach + CELL, -CELL, zReach * 0.3)),
      centre.clone().add(new THREE.Vector3(xReach + CELL * 2, CELL, 0)),
    ],
    keepout,
  );

  admitProxy(
    group,
    claims,
    (origin) => buildOpenFrame(origin, materials),
    [
      centre.clone().add(new THREE.Vector3(-xReach, -CELL, zReach * 0.3)),
      centre.clone().add(new THREE.Vector3(-xReach - CELL, CELL, -zReach * 0.25)),
      centre.clone().add(new THREE.Vector3(-xReach - CELL * 2, 0, zReach * 0.65)),
    ],
    keepout,
  );

  admitProxy(
    group,
    claims,
    (origin) => buildBridgeMass(origin, materials),
    [
      centre.clone().add(new THREE.Vector3(0, size.y * 0.12, zReach)),
      centre.clone().add(new THREE.Vector3(CELL, -CELL, zReach + CELL)),
      centre.clone().add(new THREE.Vector3(-CELL, CELL, zReach + CELL * 2)),
    ],
    keepout,
  );

  scene.add(group);
  return { group, claims };
}
