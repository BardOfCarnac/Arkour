import * as THREE from 'three';
import { RUN_CAMERA_PROFILE } from './camera-profile';

export interface CameraObstacleField {
  readonly boxes: readonly THREE.Box3[];
}

function materialIsSolid(material: THREE.Material | THREE.Material[]): boolean {
  const materials = Array.isArray(material) ? material : [material];
  return materials.some((candidate) => !candidate.transparent || candidate.opacity > 0.5);
}

export function collectCameraObstacles(root: THREE.Object3D): CameraObstacleField {
  const boxes: THREE.Box3[] = [];
  const instanceMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();

  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !materialIsSolid(object.material)) return;

    const geometry = object.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const localBounds = geometry.boundingBox;
    if (!localBounds) return;

    if (object instanceof THREE.InstancedMesh) {
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, instanceMatrix);
        worldMatrix.multiplyMatrices(object.matrixWorld, instanceMatrix);
        boxes.push(localBounds.clone().applyMatrix4(worldMatrix));
      }
      return;
    }

    boxes.push(localBounds.clone().applyMatrix4(object.matrixWorld));
  });

  return { boxes };
}

export function cameraCollisionPenalty(
  point: THREE.Vector3,
  field: CameraObstacleField,
): number {
  let penalty = 0;

  for (const box of field.boxes) {
    const distance = box.distanceToPoint(point);
    if (distance < RUN_CAMERA_PROFILE.collisionPadding) {
      penalty += 100_000
        + (RUN_CAMERA_PROFILE.collisionPadding - distance) * 10_000;
      continue;
    }

    if (distance < RUN_CAMERA_PROFILE.nearClearance) {
      penalty += (RUN_CAMERA_PROFILE.nearClearance - distance) * 18;
    }
  }

  return penalty;
}

export function cameraPointIsBlocked(
  point: THREE.Vector3,
  field: CameraObstacleField,
): boolean {
  return field.boxes.some(
    (box) => box.distanceToPoint(point) < RUN_CAMERA_PROFILE.collisionPadding,
  );
}

export function cameraSegmentIsClear(
  from: THREE.Vector3,
  to: THREE.Vector3,
  field: CameraObstacleField,
): boolean {
  const distance = from.distanceTo(to);
  const step = Math.max(0.18, RUN_CAMERA_PROFILE.collisionPadding * 0.5);
  const samples = Math.max(1, Math.ceil(distance / step));
  const point = new THREE.Vector3();

  for (let index = 1; index <= samples; index += 1) {
    point.lerpVectors(from, to, index / samples);
    if (cameraPointIsBlocked(point, field)) return false;
  }

  return true;
}
