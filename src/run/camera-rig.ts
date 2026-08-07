import * as THREE from 'three';
import type { RuntimeRoute } from './route';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  private readonly point = new THREE.Vector3();
  private readonly lookPoint = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly aheadTangent = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly holdOffset = new THREE.Vector3();
  private readonly turn = new THREE.Vector3();
  private roll = 0;

  update(
    camera: THREE.PerspectiveCamera,
    route: RuntimeRoute,
    distance: number,
    dt: number,
    held: boolean,
    elapsed: number,
  ): void {
    route.pointAtDistance(distance, this.point);
    route.tangentAtDistance(distance, this.tangent);

    const lookDistance = Math.min(route.length, distance + 9);
    route.pointAtDistance(lookDistance, this.lookPoint);
    route.tangentAtDistance(lookDistance, this.aheadTangent);

    this.right.crossVectors(this.tangent, WORLD_UP);
    if (this.right.lengthSq() < 0.001) this.right.set(1, 0, 0);
    this.right.normalize();
    this.up.crossVectors(this.right, this.tangent).normalize();

    this.desiredPosition.copy(this.point)
      .addScaledVector(this.tangent, -4.2)
      .addScaledVector(this.up, 1.65);

    if (held) {
      this.holdOffset.copy(this.right).multiplyScalar(Math.sin(elapsed * 0.8) * 0.8);
      this.holdOffset.addScaledVector(this.up, Math.cos(elapsed * 0.55) * 0.28);
      this.desiredPosition.add(this.holdOffset);
    }

    const smoothing = 1 - Math.exp(-dt * 7.5);
    camera.position.lerp(this.desiredPosition, smoothing);
    camera.lookAt(this.lookPoint);

    this.turn.crossVectors(this.tangent, this.aheadTangent);
    const targetRoll = THREE.MathUtils.clamp(this.turn.dot(this.up) * 2.2, -0.28, 0.28);
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, 1 - Math.exp(-dt * 4.5));
    camera.rotateZ(this.roll);
  }
}
