import * as THREE from 'three';
import type { RuntimeRoute } from './route';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_UP = new THREE.Vector3(0, 0, 1);

export interface RouteFrame {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export function createRouteFrame(): RouteFrame {
  return {
    position: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };
}

export function sampleRouteFrameAtDistance(
  route: RuntimeRoute,
  distance: number,
  target: RouteFrame,
): RouteFrame {
  route.pointAtDistance(distance, target.position);
  route.tangentAtDistance(distance, target.forward);

  const referenceUp = Math.abs(target.forward.dot(WORLD_UP)) > 0.96 ? FALLBACK_UP : WORLD_UP;
  target.right.crossVectors(referenceUp, target.forward).normalize();
  target.up.crossVectors(target.forward, target.right).normalize();

  const basis = new THREE.Matrix4().makeBasis(target.right, target.up, target.forward);
  target.quaternion.setFromRotationMatrix(basis);
  return target;
}
