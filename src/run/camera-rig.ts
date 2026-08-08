import * as THREE from 'three';
import type { RuntimeRoute } from './route';
import { RUN_CAMERA_PROFILE } from './camera-profile';
import {
  cameraCollisionPenalty,
  cameraPointIsBlocked,
  cameraSegmentIsClear,
  type CameraObstacleField,
} from './camera-obstacles';
import { createRouteFrame, sampleRouteFrameAtDistance } from './route-frame';

interface SafeCameraCandidate {
  right: number;
  up: number;
  trail: number;
  bias: number;
  ignoreHold?: boolean;
}

const SAFE_CAMERA_CANDIDATES: readonly SafeCameraCandidate[] = [
  { right: 0, up: 1.65, trail: 4.2, bias: 0 },
  { right: 0, up: 0.85, trail: 4.2, bias: 0.12 },
  { right: 0, up: 2.45, trail: 4.2, bias: 0.18 },
  { right: 0.9, up: 1.65, trail: 4.2, bias: 0.28 },
  { right: -0.9, up: 1.65, trail: 4.2, bias: 0.28 },
  { right: 0.95, up: 0.7, trail: 4.2, bias: 0.42 },
  { right: -0.95, up: 0.7, trail: 4.2, bias: 0.42 },
  { right: 0.95, up: 2.55, trail: 4.2, bias: 0.48 },
  { right: -0.95, up: 2.55, trail: 4.2, bias: 0.48 },
  { right: 0, up: 1.65, trail: 3.25, bias: 0.62 },
  { right: 1.45, up: 1.4, trail: 3.45, bias: 0.78 },
  { right: -1.45, up: 1.4, trail: 3.45, bias: 0.78 },
  { right: 0, up: 3.1, trail: 3.15, bias: 0.92 },
  { right: 0, up: -0.25, trail: 3.0, bias: 1.05 },
  { right: 0, up: 0, trail: 0, bias: 12, ignoreHold: true },
];

export class CameraRig {
  private readonly frame = createRouteFrame();
  private readonly lookPoint = new THREE.Vector3();
  private readonly aheadTangent = new THREE.Vector3();
  private readonly candidatePosition = new THREE.Vector3();
  private readonly safePosition = new THREE.Vector3();
  private readonly proposedPosition = new THREE.Vector3();
  private readonly turn = new THREE.Vector3();
  private roll = 0;
  private initialized = false;
  private selectedCandidateIndex = 0;

  constructor(private readonly obstacles: CameraObstacleField) {}

  update(
    camera: THREE.PerspectiveCamera,
    route: RuntimeRoute,
    distance: number,
    dt: number,
    held: boolean,
    elapsed: number,
  ): void {
    sampleRouteFrameAtDistance(route, distance, this.frame);

    const lookDistance = Math.min(route.length, distance + 9);
    route.pointAtDistance(lookDistance, this.lookPoint);
    route.tangentAtDistance(lookDistance, this.aheadTangent);

    this.chooseSafePosition(camera, held, elapsed);

    if (!this.initialized) {
      camera.position.copy(this.safePosition);
      this.initialized = true;
    } else {
      const smoothing = 1 - Math.exp(-dt * 7.5);
      this.proposedPosition.copy(camera.position).lerp(this.safePosition, smoothing);

      if (
        cameraPointIsBlocked(camera.position, this.obstacles)
        || !cameraSegmentIsClear(camera.position, this.proposedPosition, this.obstacles)
      ) {
        camera.position.copy(this.safePosition);
      } else {
        camera.position.copy(this.proposedPosition);
      }
    }

    camera.lookAt(this.lookPoint);

    this.turn.crossVectors(this.frame.forward, this.aheadTangent);
    const targetRoll = THREE.MathUtils.clamp(this.turn.dot(this.frame.up) * 2.2, -0.28, 0.28);
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, 1 - Math.exp(-dt * 4.5));
    camera.rotateZ(this.roll);
  }

  private chooseSafePosition(
    camera: THREE.PerspectiveCamera,
    held: boolean,
    elapsed: number,
  ): void {
    const holdRight = held
      ? Math.sin(elapsed * 0.8) * RUN_CAMERA_PROFILE.holdRightAmplitude
      : 0;
    const holdUp = held
      ? Math.cos(elapsed * 0.55) * RUN_CAMERA_PROFILE.holdUpAmplitude
      : 0;

    let bestScore = Number.POSITIVE_INFINITY;
    let bestIndex = 0;

    SAFE_CAMERA_CANDIDATES.forEach((candidate, index) => {
      const right = candidate.right + (candidate.ignoreHold ? 0 : holdRight);
      const up = candidate.up + (candidate.ignoreHold ? 0 : holdUp);

      this.candidatePosition.copy(this.frame.position)
        .addScaledVector(this.frame.right, right)
        .addScaledVector(this.frame.up, up)
        .addScaledVector(this.frame.forward, -candidate.trail);

      let score = cameraCollisionPenalty(this.candidatePosition, this.obstacles)
        + candidate.bias;

      if (this.initialized) {
        score += this.candidatePosition.distanceTo(camera.position) * 0.025;
        if (index !== this.selectedCandidateIndex) score += 0.16;
      }

      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
        this.safePosition.copy(this.candidatePosition);
      }
    });

    this.selectedCandidateIndex = bestIndex;
  }
}
