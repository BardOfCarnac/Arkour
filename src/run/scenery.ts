import * as THREE from 'three';
import type { RuntimeRoute } from './route';
import { createRouteFrame, sampleRouteFrameAtDistance } from './route-frame';
import type {
  AperturePiece,
  CanyonPiece,
  DecorativeRoutePiece,
  FieldPiece,
  InterchangePiece,
  MassPiece,
  OverpassPiece,
  RouteAnchor,
  SceneMaterial,
  ScenePiece,
  ScenePlan,
  SpinePiece,
} from './scene-plan';
import type { Vec3 } from './types';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

interface Palette {
  dark: THREE.MeshStandardMaterial;
  edge: THREE.MeshStandardMaterial;
  ghost: THREE.MeshBasicMaterial;
}

interface Pose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

function createPalette(): Palette {
  return {
    dark: new THREE.MeshStandardMaterial({ color: 0x11181d, roughness: 0.72, metalness: 0.42 }),
    edge: new THREE.MeshStandardMaterial({ color: 0x22313a, roughness: 0.58, metalness: 0.5 }),
    ghost: new THREE.MeshBasicMaterial({ color: 0x426a82, transparent: true, opacity: 0.34 }),
  };
}

function materialFor(palette: Palette, material: SceneMaterial | undefined): THREE.Material {
  return palette[material ?? 'dark'];
}

function routeDistance(route: RuntimeRoute, anchor: RouteAnchor): number {
  if (anchor.distance !== undefined) {
    return THREE.MathUtils.clamp(anchor.distance, 0, route.length);
  }
  return THREE.MathUtils.clamp(anchor.at, 0, 1) * route.length;
}

function poseFor(
  routes: Map<string, RuntimeRoute>,
  anchor: RouteAnchor,
  rotation: Vec3 | undefined,
): Pose {
  const route = routes.get(anchor.routeId);
  if (!route) throw new Error(`Unknown scenery route: ${anchor.routeId}`);

  const frame = createRouteFrame();
  sampleRouteFrameAtDistance(route, routeDistance(route, anchor), frame);

  const localOffset = new THREE.Vector3(anchor.right ?? 0, anchor.up ?? 0, anchor.forward ?? 0);
  localOffset.applyQuaternion(frame.quaternion);

  const quaternion = frame.quaternion.clone();
  if (rotation) {
    const localRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ'),
    );
    quaternion.multiply(localRotation);
  }

  return {
    position: frame.position.clone().add(localOffset),
    quaternion,
  };
}

function applyPose(object: THREE.Object3D, pose: Pose): void {
  object.position.copy(pose.position);
  object.quaternion.copy(pose.quaternion);
}

function addBox(
  parent: THREE.Object3D,
  size: Vec3,
  material: THREE.Material,
  position: Vec3 = [0, 0, 0],
  rotation: Vec3 = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.scale.set(size[0], size[1], size[2]);
  parent.add(mesh);
  return mesh;
}

function addAperture(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  piece: AperturePiece,
  palette: Palette,
): void {
  const group = new THREE.Group();
  applyPose(group, poseFor(routes, piece.anchor, piece.rotation));
  const material = materialFor(palette, piece.material);
  const [openingWidth, openingHeight] = piece.opening;
  const outerWidth = openingWidth + piece.member * 2;
  const outerHeight = openingHeight + piece.member * 2;

  addBox(group, [piece.member, outerHeight, piece.depth], material, [-(openingWidth + piece.member) / 2, 0, 0]);
  addBox(group, [piece.member, outerHeight, piece.depth], material, [(openingWidth + piece.member) / 2, 0, 0]);
  addBox(group, [outerWidth, piece.member, piece.depth], material, [0, (openingHeight + piece.member) / 2, 0]);
  addBox(group, [outerWidth, piece.member, piece.depth], material, [0, -(openingHeight + piece.member) / 2, 0]);
  scene.add(group);
}

function addMassLike(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  piece: MassPiece | SpinePiece,
  palette: Palette,
): void {
  const mesh = new THREE.Mesh(UNIT_BOX, materialFor(palette, piece.material));
  applyPose(mesh, poseFor(routes, piece.anchor, piece.rotation));
  mesh.scale.set(piece.size[0], piece.size[1], piece.size[2]);
  scene.add(mesh);
}

function addOverpass(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  piece: OverpassPiece,
  palette: Palette,
): void {
  const mesh = new THREE.Mesh(UNIT_BOX, materialFor(palette, piece.material));
  applyPose(mesh, poseFor(routes, piece.anchor, piece.rotation));
  mesh.scale.set(piece.width, piece.height, piece.depth);
  scene.add(mesh);
}

function addCanyon(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  piece: CanyonPiece,
  palette: Palette,
): void {
  const group = new THREE.Group();
  applyPose(group, poseFor(routes, piece.anchor, piece.rotation));
  const material = materialFor(palette, piece.material);
  const offset = piece.gap / 2 + piece.wallThickness / 2;
  const size: Vec3 = [piece.wallThickness, piece.height, piece.length];

  addBox(group, size, material, [-offset, 0, 0]);
  addBox(group, size, material, [offset, 0, 0]);
  scene.add(group);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(random: () => number, min: number, max: number): number {
  return min + (max - min) * random();
}

function addField(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  piece: FieldPiece,
  palette: Palette,
): void {
  const group = new THREE.Group();
  applyPose(group, poseFor(routes, piece.anchor, piece.rotation));

  const mesh = new THREE.InstancedMesh(UNIT_BOX, materialFor(palette, piece.material), piece.count);
  const random = seededRandom(piece.seed);
  const instance = new THREE.Object3D();

  for (let index = 0; index < piece.count; index += 1) {
    let x = randomBetween(random, -piece.spread[0] / 2, piece.spread[0] / 2);
    let y = randomBetween(random, -piece.spread[1] / 2, piece.spread[1] / 2);
    const z = randomBetween(random, -piece.spread[2] / 2, piece.spread[2] / 2);

    if (Math.hypot(x, y) < piece.keepoutRadius) {
      x += (x < 0 ? -1 : 1) * piece.keepoutRadius;
      y += (y < 0 ? -1 : 1) * piece.keepoutRadius * 0.35;
    }

    instance.position.set(x, y, z);
    instance.rotation.set(
      randomBetween(random, -0.25, 0.25),
      randomBetween(random, -0.45, 0.45),
      randomBetween(random, -0.25, 0.25),
    );
    instance.scale.set(
      randomBetween(random, piece.minSize[0], piece.maxSize[0]),
      randomBetween(random, piece.minSize[1], piece.maxSize[1]),
      randomBetween(random, piece.minSize[2], piece.maxSize[2]),
    );
    instance.updateMatrix();
    mesh.setMatrixAt(index, instance.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  scene.add(group);
}

function addInterchange(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  piece: InterchangePiece,
  palette: Palette,
): void {
  const group = new THREE.Group();
  applyPose(group, poseFor(routes, piece.anchor, piece.rotation));
  const material = materialFor(palette, piece.material);

  addBox(group, [piece.span, 1.5, 3.2], material, [0, 7, -6], [0, 0.18, 0.08]);
  addBox(group, [piece.span * 0.82, 1.3, 3], material, [1, -6, 5], [0, -0.28, -0.06]);
  addBox(group, [piece.span * 0.68, 1.1, 2.6], material, [-2, 14, 13], [0.08, 0.46, 0.03]);

  const supportY = -piece.supportHeight / 2 + 4;
  addBox(group, [2.2, piece.supportHeight, 2.2], material, [-piece.span * 0.34, supportY, 0]);
  addBox(group, [2.2, piece.supportHeight, 2.2], material, [piece.span * 0.34, supportY, 0]);
  scene.add(group);
}

function addDecorativeRoute(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  piece: DecorativeRoutePiece,
  palette: Palette,
): void {
  const group = new THREE.Group();
  applyPose(group, poseFor(routes, piece.anchor, piece.rotation));

  const points = piece.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.25);
  const geometry = new THREE.TubeGeometry(curve, Math.max(24, points.length * 16), piece.radius, 6, false);
  const mesh = new THREE.Mesh(geometry, materialFor(palette, piece.material ?? 'ghost'));
  group.add(mesh);
  scene.add(group);
}

function addPiece(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  piece: ScenePiece,
  palette: Palette,
): void {
  switch (piece.kind) {
    case 'aperture':
      addAperture(scene, routes, piece, palette);
      break;
    case 'mass':
    case 'spine':
      addMassLike(scene, routes, piece, palette);
      break;
    case 'overpass':
      addOverpass(scene, routes, piece, palette);
      break;
    case 'canyon':
      addCanyon(scene, routes, piece, palette);
      break;
    case 'field':
      addField(scene, routes, piece, palette);
      break;
    case 'interchange':
      addInterchange(scene, routes, piece, palette);
      break;
    case 'decorative-route':
      addDecorativeRoute(scene, routes, piece, palette);
      break;
  }
}

export function addScenePlan(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  plan: ScenePlan,
): void {
  const palette = createPalette();

  if (plan.lighting) {
    const ambient = new THREE.HemisphereLight(
      plan.lighting.hemisphere.sky,
      plan.lighting.hemisphere.ground,
      plan.lighting.hemisphere.intensity,
    );
    const key = new THREE.DirectionalLight(plan.lighting.key.color, plan.lighting.key.intensity);
    key.position.set(...plan.lighting.key.position);
    scene.add(ambient, key);
  }

  for (const piece of plan.pieces) addPiece(scene, routes, piece, palette);
}
