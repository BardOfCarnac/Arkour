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

function buildSegments(points: readonly THREE.Vector3[]): readonly (readonly [THREE.Vector3, THREE.Vector3])[] {
  const segments: Array<readonly [THREE.Vector3, THREE.Vector3]> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (from && to) segments.push([from, to]);
  }
  return segments;
}

function sampleRouteCorridor(routes: Map<string, RuntimeRoute>): KeepoutCorridor {
  const points: THREE.Vector3[] = [];

  for (const route of routes.values()) {
    const samples = Math.max(2, Math.ceil(route.length / RUN_ROUTE_PROFILE.corridorSampleStep));
    for (let index = 0; index <= samples; index += 1) {
      points.push(route.pointAtDistance(route.length * (index / samples)).clone());
    }
  }

  return {
    points,
    segments: buildSegments(points),
    clearance: RUN_ROUTE_PROFILE.sceneryClearance,
  };
}

function sampleCameraCorridor(routes: Map<string, RuntimeRoute>): KeepoutCorridor {
  const points: THREE.Vector3[] = [];
  const frame = createRouteFrame();

  for (const route of routes.values()) {
    const samples = Math.max(2, Math.ceil(route.length / RUN_CAMERA_PROFILE.corridorSampleStep));
    for (let index = 0; index <= samples; index += 1) {
      const distance = route.length * (index / samples);
      sampleRouteFrameAtDistance(route, distance, frame);
      points.push(
        frame.position.clone()
          .addScaledVector(frame.forward, -RUN_CAMERA_PROFILE.trailDistance)
          .addScaledVector(frame.up, RUN_CAMERA_PROFILE.upOffset),
      );
    }
  }

  return {
    points,
    segments: buildSegments(points),
    clearance: RUN_CAMERA_PROFILE.sceneryClearance
      + Math.hypot(RUN_CAMERA_PROFILE.holdRightAmplitude, RUN_CAMERA_PROFILE.holdUpAmplitude),
  };
}

export function createSpatialKeepout(routes: Map<string, RuntimeRoute>): SpatialKeepout {
  return {
    route: sampleRouteCorridor(routes),
    camera: sampleCameraCorridor(routes),
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
