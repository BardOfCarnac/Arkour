import * as THREE from 'three';
import { RUN_CAMERA_PROFILE } from './camera-profile';
import type { RuntimeRoute } from './route';
import { createRouteFrame, sampleRouteFrameAtDistance } from './route-frame';
import { RUN_ROUTE_PROFILE } from './route-profile';

interface KeepoutCorridor {
  points: readonly THREE.Vector3[];
  segments: readonly (readonly [THREE.Vector3, THREE.Vector3])[];
  clearance: number;
}

/**
 * An exact presentation path supplied by a renderer/presentation layer.
 *
 * `camera` is the sampled camera position. When matching `look` samples are
 * supplied, the keep-out also reserves the sight line between camera and target,
 * preventing large opaque scenery from sitting directly in the intended view.
 */
export interface PresentationKeepoutPath {
  camera: readonly THREE.Vector3[];
  look?: readonly THREE.Vector3[];
  clearance?: number;
}

/**
 * Geometric authority used by scenery generation.
 *
 * The route corridor is deliberately independent from the presentation camera:
 * all valid routes reserve space, including branches the runner may never take.
 * The camera corridor is then added as a second, presentation-specific keep-out.
 */
export interface SpatialKeepout {
  route: KeepoutCorridor;
  camera: KeepoutCorridor;
}

function appendSegments(
  points: THREE.Vector3[],
  segments: Array<readonly [THREE.Vector3, THREE.Vector3]>,
  routePoints: readonly THREE.Vector3[],
): void {
  points.push(...routePoints);
  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const from = routePoints[index];
    const to = routePoints[index + 1];
    if (from && to) segments.push([from, to]);
  }
}

function sampleRouteCorridor(routes: Map<string, RuntimeRoute>): KeepoutCorridor {
  const points: THREE.Vector3[] = [];
  const segments: Array<readonly [THREE.Vector3, THREE.Vector3]> = [];

  for (const route of routes.values()) {
    const routePoints: THREE.Vector3[] = [];
    const samples = Math.max(2, Math.ceil(route.length / RUN_ROUTE_PROFILE.corridorSampleStep));
    for (let index = 0; index <= samples; index += 1) {
      routePoints.push(route.pointAtDistance(route.length * (index / samples)).clone());
    }
    appendSegments(points, segments, routePoints);
  }

  return {
    points,
    segments,
    clearance: RUN_ROUTE_PROFILE.sceneryClearance,
  };
}

function sampleDefaultCameraCorridor(routes: Map<string, RuntimeRoute>): KeepoutCorridor {
  const points: THREE.Vector3[] = [];
  const segments: Array<readonly [THREE.Vector3, THREE.Vector3]> = [];
  const frame = createRouteFrame();

  for (const route of routes.values()) {
    const routePoints: THREE.Vector3[] = [];
    const samples = Math.max(2, Math.ceil(route.length / RUN_CAMERA_PROFILE.corridorSampleStep));
    for (let index = 0; index <= samples; index += 1) {
      const distance = route.length * (index / samples);
      sampleRouteFrameAtDistance(route, distance, frame);
      routePoints.push(
        frame.position.clone()
          .addScaledVector(frame.forward, -RUN_CAMERA_PROFILE.trailDistance)
          .addScaledVector(frame.up, RUN_CAMERA_PROFILE.upOffset),
      );
    }
    appendSegments(points, segments, routePoints);
  }

  return {
    points,
    segments,
    clearance: RUN_CAMERA_PROFILE.sceneryClearance
      + Math.hypot(RUN_CAMERA_PROFILE.holdRightAmplitude, RUN_CAMERA_PROFILE.holdUpAmplitude),
  };
}

function presentationCameraCorridor(paths: readonly PresentationKeepoutPath[]): KeepoutCorridor {
  const points: THREE.Vector3[] = [];
  const segments: Array<readonly [THREE.Vector3, THREE.Vector3]> = [];
  let clearance: number = RUN_CAMERA_PROFILE.sceneryClearance;

  for (const path of paths) {
    if (path.camera.length === 0) continue;
    clearance = Math.max(clearance, path.clearance ?? RUN_CAMERA_PROFILE.sceneryClearance);
    appendSegments(points, segments, path.camera);

    if (!path.look) continue;
    const count = Math.min(path.camera.length, path.look.length);
    for (let index = 0; index < count; index += 1) {
      const camera = path.camera[index];
      const look = path.look[index];
      if (!camera || !look) continue;
      // Reserve the actual viewing ray as well as the camera's travelled path.
      // This prevents an admitted slab/bridge from being collision-safe yet
      // completely blocking the authored shot.
      segments.push([camera, look]);
      points.push(look);
    }
  }

  return { points, segments, clearance };
}

export function createSpatialKeepout(
  routes: Map<string, RuntimeRoute>,
  presentationPaths: readonly PresentationKeepoutPath[] = [],
): SpatialKeepout {
  return {
    route: sampleRouteCorridor(routes),
    camera: presentationPaths.length > 0
      ? presentationCameraCorridor(presentationPaths)
      : sampleDefaultCameraCorridor(routes),
  };
}

function segmentIntersectsExpandedBox(
  from: THREE.Vector3,
  to: THREE.Vector3,
  box: THREE.Box3,
  clearance: number,
): boolean {
  const minX = box.min.x - clearance;
  const minY = box.min.y - clearance;
  const minZ = box.min.z - clearance;
  const maxX = box.max.x + clearance;
  const maxY = box.max.y + clearance;
  const maxZ = box.max.z + clearance;

  let tMin = 0;
  let tMax = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;

  const testAxis = (origin: number, delta: number, min: number, max: number): boolean => {
    if (Math.abs(delta) < 1e-9) return origin >= min && origin <= max;
    let a = (min - origin) / delta;
    let b = (max - origin) / delta;
    if (a > b) [a, b] = [b, a];
    tMin = Math.max(tMin, a);
    tMax = Math.min(tMax, b);
    return tMin <= tMax;
  };

  return testAxis(from.x, dx, minX, maxX)
    && testAxis(from.y, dy, minY, maxY)
    && testAxis(from.z, dz, minZ, maxZ);
}

function boxIntersectsCorridor(box: THREE.Box3, corridor: KeepoutCorridor): boolean {
  for (const [from, to] of corridor.segments) {
    if (segmentIntersectsExpandedBox(from, to, box, corridor.clearance)) return true;
  }
  return false;
}

export function boxIntersectsKeepout(box: THREE.Box3, keepout: SpatialKeepout): boolean {
  return boxIntersectsCorridor(box, keepout.route) || boxIntersectsCorridor(box, keepout.camera);
}

export function objectIntersectsKeepout(object: THREE.Object3D, keepout: SpatialKeepout): boolean {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  return boxIntersectsKeepout(box, keepout);
}

function torusIntersectsCorridor(
  mesh: THREE.Mesh,
  radius: number,
  tube: number,
  corridor: KeepoutCorridor,
): boolean {
  mesh.updateWorldMatrix(true, true);
  const inverse = mesh.matrixWorld.clone().invert();
  const point = new THREE.Vector3();

  // The corridor has already been sampled more tightly than its own clearance.
  // Testing those samples against the torus centreline preserves the intentional
  // central aperture without the false positive produced by a torus AABB.
  for (const worldPoint of corridor.points) {
    point.copy(worldPoint).applyMatrix4(inverse);
    const radial = Math.hypot(point.x, point.y);
    const distanceToCenterline = Math.hypot(radial - radius, point.z);
    if (distanceToCenterline < tube + corridor.clearance) return true;
  }
  return false;
}

export function torusIntersectsKeepout(
  mesh: THREE.Mesh,
  radius: number,
  tube: number,
  keepout: SpatialKeepout,
): boolean {
  return torusIntersectsCorridor(mesh, radius, tube, keepout.route)
    || torusIntersectsCorridor(mesh, radius, tube, keepout.camera);
}
