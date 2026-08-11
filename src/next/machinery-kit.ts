import * as THREE from 'three';

export const MACHINERY_FAMILY_COUNT = 8;

export interface MachineryMaterials {
  darkSteel: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  agedSteel: THREE.MeshStandardMaterial;
  paintedSteel: THREE.MeshStandardMaterial;
  ceramic: THREE.MeshStandardMaterial;
  copper: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
}

export interface MachineryAssemblySpec {
  family: number;
  width: number;
  depth: number;
  height: number;
  seed: number;
}

function hash(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function unit(seed: number, salt: number): number {
  return hash(seed, salt) / 0xffffffff;
}

export function createMachineryMaterials(): MachineryMaterials {
  return {
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x0b1216, roughness: 0.82, metalness: 0.34 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x27343a, roughness: 0.62, metalness: 0.55 }),
    agedSteel: new THREE.MeshStandardMaterial({ color: 0x4a5354, roughness: 0.72, metalness: 0.38 }),
    paintedSteel: new THREE.MeshStandardMaterial({ color: 0x243336, roughness: 0.8, metalness: 0.28 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xa8a291, roughness: 0.92, metalness: 0.03 }),
    copper: new THREE.MeshStandardMaterial({ color: 0x6a4938, roughness: 0.48, metalness: 0.72 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x101416, roughness: 0.96, metalness: 0.02 }),
  };
}

function addBox(
  parent: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: THREE.Object3D,
  radius: number,
  length: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  axis: 'x' | 'y' | 'z' = 'y',
  segments = 8,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, segments, 1, false),
    material,
  );
  mesh.position.set(x, y, z);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

function addTorus(
  parent: THREE.Object3D,
  radius: number,
  tube: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 16), material);
  mesh.position.set(x, y, z);
  mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

function buildThermalExchanger(
  group: THREE.Group,
  spec: MachineryAssemblySpec,
  materials: MachineryMaterials,
): void {
  const { width: w, depth: d, height: h, seed } = spec;
  addBox(group, w * 0.58, h * 0.72, d * 0.58, 0, 0, 0, materials.darkSteel);

  const fins = 4 + (hash(seed, 1) % 3);
  for (let index = 0; index < fins; index += 1) {
    const y = THREE.MathUtils.lerp(-h * 0.27, h * 0.27, fins === 1 ? 0.5 : index / (fins - 1));
    addBox(group, w * 0.88, 0.48, d * 0.68, 0, y, 0, materials.agedSteel);
  }

  addCylinder(group, Math.max(0.42, d * 0.075), w * 0.72, 0, h * 0.34, 0, materials.copper, 'x');
  addBox(group, w * 0.22, h * 0.18, d * 0.22, w * 0.34, -h * 0.22, d * 0.24, materials.paintedSteel);
}

function buildTransformer(
  group: THREE.Group,
  spec: MachineryAssemblySpec,
  materials: MachineryMaterials,
): void {
  const { width: w, depth: d, height: h, seed } = spec;
  const bodyHeight = h * 0.48;
  addBox(group, w * 0.68, bodyHeight, d * 0.66, 0, -h * 0.1, 0, materials.paintedSteel);
  addBox(group, w * 0.78, h * 0.09, d * 0.72, 0, bodyHeight * 0.4, 0, materials.steel);

  const bushings = 3 + (hash(seed, 2) % 2);
  for (let index = 0; index < bushings; index += 1) {
    const x = (index - (bushings - 1) / 2) * (w * 0.17);
    addCylinder(group, Math.max(0.42, w * 0.035), h * 0.22, x, h * 0.3, 0, materials.ceramic, 'y', 8);
    addCylinder(group, Math.max(0.24, w * 0.018), h * 0.055, x, h * 0.435, 0, materials.copper, 'y', 8);
  }

  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      const z = (index - 1) * d * 0.18;
      addBox(group, 0.5, h * 0.34, d * 0.12, side * w * 0.39, -h * 0.08, z, materials.agedSteel);
    }
  }
}

function buildSwitchgear(
  group: THREE.Group,
  spec: MachineryAssemblySpec,
  materials: MachineryMaterials,
): void {
  const { width: w, depth: d, height: h } = spec;
  addBox(group, w * 0.82, h * 0.8, d * 0.56, 0, 0, 0, materials.darkSteel);

  const bayWidth = w * 0.22;
  for (let index = 0; index < 3; index += 1) {
    const x = (index - 1) * w * 0.25;
    addBox(group, bayWidth, h * 0.56, 0.38, x, -h * 0.05, d * 0.3, materials.steel);
    addBox(group, bayWidth * 0.7, h * 0.09, 0.16, x, h * 0.13, d * 0.5, materials.agedSteel);
  }

  addBox(group, w * 0.88, h * 0.12, d * 0.38, 0, h * 0.42, -d * 0.04, materials.paintedSteel);
  addBox(group, w * 0.1, h * 0.62, d * 0.16, -w * 0.47, -h * 0.03, 0, materials.copper);
}

function buildCapacitorBank(
  group: THREE.Group,
  spec: MachineryAssemblySpec,
  materials: MachineryMaterials,
): void {
  const { width: w, depth: d, height: h, seed } = spec;
  addBox(group, w * 0.78, h * 0.08, d * 0.72, 0, -h * 0.36, 0, materials.steel);

  const radius = Math.max(0.75, Math.min(w, d) * 0.11);
  const canHeight = h * (0.48 + unit(seed, 3) * 0.08);
  for (const x of [-w * 0.2, w * 0.2]) {
    for (const z of [-d * 0.18, d * 0.18]) {
      addCylinder(group, radius, canHeight, x, -h * 0.05, z, materials.agedSteel, 'y', 10);
      addCylinder(group, radius * 0.38, h * 0.07, x, canHeight * 0.28, z, materials.ceramic, 'y', 8);
    }
  }

  addBox(group, w * 0.62, h * 0.055, 0.38, 0, h * 0.31, 0, materials.copper);
  addBox(group, 0.4, h * 0.62, d * 0.65, -w * 0.34, -h * 0.06, 0, materials.darkSteel);
  addBox(group, 0.4, h * 0.62, d * 0.65, w * 0.34, -h * 0.06, 0, materials.darkSteel);
}

function buildRotaryMachine(
  group: THREE.Group,
  spec: MachineryAssemblySpec,
  materials: MachineryMaterials,
): void {
  const { width: w, depth: d, height: h } = spec;
  const radius = Math.max(1.2, Math.min(h, d) * 0.28);
  addCylinder(group, radius, w * 0.68, 0, 0, 0, materials.steel, 'x', 12);
  addCylinder(group, radius * 1.04, w * 0.08, -w * 0.37, 0, 0, materials.agedSteel, 'x', 12);
  addCylinder(group, radius * 1.04, w * 0.08, w * 0.37, 0, 0, materials.agedSteel, 'x', 12);

  addBox(group, w * 0.18, h * 0.18, d * 0.28, -w * 0.2, radius + h * 0.08, 0, materials.paintedSteel);
  addBox(group, w * 0.18, h * 0.18, d * 0.28, w * 0.2, radius + h * 0.08, 0, materials.paintedSteel);
  addBox(group, w * 0.18, h * 0.16, d * 0.48, -w * 0.23, -radius - h * 0.05, 0, materials.darkSteel);
  addBox(group, w * 0.18, h * 0.16, d * 0.48, w * 0.23, -radius - h * 0.05, 0, materials.darkSteel);
}

function buildCableManifold(
  group: THREE.Group,
  spec: MachineryAssemblySpec,
  materials: MachineryMaterials,
): void {
  const { width: w, depth: d, height: h } = spec;
  addBox(group, w * 0.5, h * 0.64, d * 0.5, 0, 0, 0, materials.darkSteel);

  for (let index = 0; index < 3; index += 1) {
    const y = (index - 1) * h * 0.18;
    addBox(group, w * 0.88, h * 0.065, d * 0.09, 0, y, d * 0.29, materials.copper);
    addBox(group, w * 0.08, h * 0.11, d * 0.16, -w * 0.3, y, d * 0.24, materials.ceramic);
    addBox(group, w * 0.08, h * 0.11, d * 0.16, w * 0.3, y, d * 0.24, materials.ceramic);
  }

  addBox(group, w * 0.2, h * 0.26, d * 0.2, 0, h * 0.34, -d * 0.05, materials.paintedSteel);
  addCylinder(group, Math.max(0.38, d * 0.05), h * 0.56, -w * 0.36, 0, -d * 0.17, materials.rubber, 'y', 8);
  addCylinder(group, Math.max(0.38, d * 0.05), h * 0.56, w * 0.36, 0, -d * 0.17, materials.rubber, 'y', 8);
}

function buildRelayRack(
  group: THREE.Group,
  spec: MachineryAssemblySpec,
  materials: MachineryMaterials,
): void {
  const { width: w, depth: d, height: h } = spec;
  addBox(group, w * 0.72, h * 0.86, d * 0.46, 0, 0, 0, materials.darkSteel);

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      const x = (column - 0.5) * w * 0.28;
      const y = (row - 1) * h * 0.22;
      addBox(group, w * 0.22, h * 0.14, 0.32, x, y, d * 0.25, materials.steel);
    }
  }

  addBox(group, w * 0.08, h * 0.72, d * 0.13, 0, 0, d * 0.31, materials.copper);
  addBox(group, w * 0.82, h * 0.08, d * 0.28, 0, h * 0.47, 0, materials.paintedSteel);
  addBox(group, w * 0.12, h * 0.66, d * 0.14, w * 0.43, -h * 0.03, -d * 0.08, materials.rubber);
}

function buildReactorCoil(
  group: THREE.Group,
  spec: MachineryAssemblySpec,
  materials: MachineryMaterials,
): void {
  const { width: w, depth: d, height: h } = spec;
  const radius = Math.max(1.4, Math.min(w, d) * 0.22);
  addCylinder(group, radius * 0.34, h * 0.68, 0, 0, 0, materials.darkSteel, 'y', 10);

  const rings = 3;
  for (let index = 0; index < rings; index += 1) {
    const y = (index - 1) * h * 0.2;
    addTorus(group, radius, Math.max(0.28, radius * 0.13), 0, y, 0, materials.copper);
  }

  addBox(group, w * 0.5, h * 0.1, d * 0.5, 0, -h * 0.4, 0, materials.steel);
  addBox(group, w * 0.12, h * 0.58, d * 0.12, -w * 0.32, 0, 0, materials.ceramic);
  addBox(group, w * 0.12, h * 0.58, d * 0.12, w * 0.32, 0, 0, materials.ceramic);
}

const BUILDERS = [
  buildThermalExchanger,
  buildTransformer,
  buildSwitchgear,
  buildCapacitorBank,
  buildRotaryMachine,
  buildCableManifold,
  buildRelayRack,
  buildReactorCoil,
] as const;

const FAMILY_NAMES = [
  'thermal-exchanger',
  'transformer',
  'switchgear',
  'capacitor-bank',
  'rotary-machine',
  'cable-manifold',
  'relay-rack',
  'reactor-coil',
] as const;

/** Build one grounded, low-poly industrial assembly from the shared kit. */
export function addMachineryAssembly(
  parent: THREE.Object3D,
  spec: MachineryAssemblySpec,
  materials: MachineryMaterials,
): THREE.Group {
  const family = ((spec.family % MACHINERY_FAMILY_COUNT) + MACHINERY_FAMILY_COUNT) % MACHINERY_FAMILY_COUNT;
  const group = new THREE.Group();
  group.name = `arkour-machine:${FAMILY_NAMES[family]}`;
  BUILDERS[family](group, spec, materials);
  parent.add(group);
  return group;
}
