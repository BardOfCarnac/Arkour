import * as THREE from 'three';
import type { RuntimeRoute } from './route';
import { RUN_CAMERA_PROFILE } from './camera-profile';
import { createRouteFrame, sampleRouteFrameAtDistance } from './route-frame';

export class CameraRig {
  private readonly frame = createRouteFrame();
  private readonly lookPoint = new THREE.Vector3();
  private readonly aheadTangent = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly holdOffset = new THREE.Vector3();
  private readonly turn = new THREE.Vector3();
  private roll = 0;
  private initialized = false;

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

    this.desiredPosition.copy(this.frame.position)
      .addScaledVector(this.frame.forward, -RUN_CAMERA_PROFILE.trailDistance)
      .addScaledVector(this.frame.up, RUN_CAMERA_PROFILE.upOffset);

    if (held) {
      this.holdOffset.copy(this.frame.right)
        .multiplyScalar(Math.sin(elapsed * 0.8) * RUN_CAMERA_PROFILE.holdRightAmplitude);
      this.holdOffset.addScaledVector(
        this.frame.up,
        Math.cos(elapsed * 0.55) * RUN_CAMERA_PROFILE.holdUpAmplitude,
      );
      this.desiredPosition.add(this.holdOffset);
    }

    if (!this.initialized) {
      camera.position.copy(this.desiredPosition);
      this.initialized = true;
    } else {
      const smoothing = 1 - Math.exp(-dt * 7.5);
      camera.position.lerp(this.desiredPosition, smoothing);
    }
    camera.lookAt(this.lookPoint);

    this.turn.crossVectors(this.frame.forward, this.aheadTangent);
    const targetRoll = THREE.MathUtils.clamp(this.turn.dot(this.frame.up) * 2.2, -0.28, 0.28);
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, 1 - Math.exp(-dt * 4.5));
    camera.rotateZ(this.roll);
  }
}
