import * as THREE from 'three';
import type { RuntimeRoute } from './route';
import { RUN_CAMERA_PROFILE } from './camera-profile';
import type { CameraObstacleField } from './camera-obstacles';
import { createRouteFrame, sampleRouteFrameAtDistance } from './route-frame';

const CAMERA_FORWARD = new THREE.Vector3(0, 0, -1);
const WORLD_VIEW_OFFSET = new THREE.Vector3(0, 0, 1);
const LOOK_AHEAD_DISTANCE = 11;
const POSITION_RESPONSE = 9;
const ROTATION_RESPONSE = 7;

/**
 * Deterministic route-following camera.
 *
 * Scenery is already generated around a reserved route/camera corridor, so the
 * camera should not continually dodge between collision candidates. The route is
 * the authority: transit follows one smooth target line, while position and gaze
 * are damped so the occasional authored direction change reads as one broad turn
 * rather than a sequence of snaps.
 *
 * The obstacle field remains in the constructor for API compatibility with the
 * runtime, but normal camera motion deliberately does not react to individual
 * scenery objects. If scenery reaches this path, the scenery admission/keep-out
 * pass is the layer that should be fixed.
 */
export class CameraRig {
  private readonly frame = createRouteFrame();
  private readonly lookPoint = new THREE.Vector3();
  private readonly aheadTangent = new THREE.Vector3();
  private readonly travelDirection = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredQuaternion = new THREE.Quaternion();
  private initialized = false;

  constructor(_obstacles: CameraObstacleField) {}

  update(
    camera: THREE.PerspectiveCamera,
    route: RuntimeRoute,
    distance: number,
    dt: number,
    held: boolean,
    elapsed: number,
  ): void {
    sampleRouteFrameAtDistance(route, distance, this.frame);

    const lookDistance = Math.min(route.length, distance + LOOK_AHEAD_DISTANCE);
    route.pointAtDistance(lookDistance, this.lookPoint);
    route.tangentAtDistance(lookDistance, this.aheadTangent);

    // Blend the current direction with a short look-ahead tangent. Straight runs
    // remain mathematically straight; a real route bend starts turning the view
    // before the exact segment boundary instead of changing direction in one frame.
    this.travelDirection.copy(this.frame.forward)
      .lerp(this.aheadTangent, 0.38)
      .normalize();

    this.desiredPosition.copy(this.frame.position)
      .addScaledVector(this.travelDirection, -RUN_CAMERA_PROFILE.trailDistance)
      .addScaledVector(WORLD_VIEW_OFFSET, RUN_CAMERA_PROFILE.upOffset);

    // Holding movement may still breathe gently around the route. It is applied
    // continuously rather than by changing camera modes or candidate positions.
    if (held) {
      const holdRight = Math.sin(elapsed * 0.8) * RUN_CAMERA_PROFILE.holdRightAmplitude;
      const holdUp = Math.cos(elapsed * 0.55) * RUN_CAMERA_PROFILE.holdUpAmplitude;
      this.desiredPosition
        .addScaledVector(this.frame.right, holdRight)
        .addScaledVector(this.frame.up, holdUp);
    }

    this.desiredQuaternion.setFromUnitVectors(CAMERA_FORWARD, this.travelDirection);

    if (!this.initialized) {
      camera.position.copy(this.desiredPosition);
      camera.quaternion.copy(this.desiredQuaternion);
      this.initialized = true;
      return;
    }

    const positionAlpha = 1 - Math.exp(-dt * POSITION_RESPONSE);
    const rotationAlpha = 1 - Math.exp(-dt * ROTATION_RESPONSE);
    camera.position.lerp(this.desiredPosition, positionAlpha);
    camera.quaternion.slerp(this.desiredQuaternion, rotationAlpha);
  }
}
