import * as THREE from 'three';
import type { NextAcceptanceRuntime } from './runtime';

type RuntimeBridge = {
  camera: THREE.PerspectiveCamera;
  updateCamera(sample: unknown): void;
};

type PointerPoint = {
  x: number;
  y: number;
};

export interface RunnerCameraController {
  resetView(): void;
  destroy(): void;
}

const LOOK_SENSITIVITY = 0.0042;
const PITCH_LIMIT = Math.PI * 0.46;
const LEAN_SCALE = 0.0045;
const LEAN_LIMIT = 0.65;

function centroid(points: ReadonlyMap<number, PointerPoint>): PointerPoint | null {
  if (points.size < 2) return null;
  let x = 0;
  let y = 0;
  let count = 0;
  for (const point of points.values()) {
    x += point.x;
    y += point.y;
    count += 1;
  }
  return count > 0 ? { x: x / count, y: y / count } : null;
}

export function attachRunnerCameraControls(
  runtime: NextAcceptanceRuntime,
  host: HTMLElement,
): RunnerCameraController {
  const bridge = runtime as unknown as RuntimeBridge;
  const originalUpdateCamera = bridge.updateCamera;
  const camera = bridge.camera;
  const pointers = new Map<number, PointerPoint>();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();

  let yaw = 0;
  let pitch = 0;
  let leanRight = 0;
  let leanUp = 0;
  let previousCentroid: PointerPoint | null = null;

  const resetView = (): void => {
    yaw = 0;
    pitch = 0;
    leanRight = 0;
    leanUp = 0;
    previousCentroid = null;
  };

  const apply = (): void => {
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position
      .addScaledVector(right, leanRight)
      .addScaledVector(up, leanUp);

    camera.rotateY(yaw);
    camera.rotateX(pitch);
  };

  bridge.updateCamera = function updateCameraWithPlayerLook(sample: unknown): void {
    originalUpdateCamera.call(runtime, sample);
    apply();
  };

  const refreshCentroid = (): void => {
    previousCentroid = centroid(pointers);
  };

  const pointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    host.setPointerCapture?.(event.pointerId);
    refreshCentroid();
    event.preventDefault();
  };

  const pointerMove = (event: PointerEvent): void => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1) {
      yaw -= (event.clientX - previous.x) * LOOK_SENSITIVITY;
      pitch = THREE.MathUtils.clamp(
        pitch - (event.clientY - previous.y) * LOOK_SENSITIVITY,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
      if (yaw > Math.PI) yaw -= Math.PI * 2;
      if (yaw < -Math.PI) yaw += Math.PI * 2;
      previousCentroid = null;
      event.preventDefault();
      return;
    }

    const nextCentroid = centroid(pointers);
    if (nextCentroid && previousCentroid) {
      leanRight = THREE.MathUtils.clamp(
        leanRight + (nextCentroid.x - previousCentroid.x) * LEAN_SCALE,
        -LEAN_LIMIT,
        LEAN_LIMIT,
      );
      leanUp = THREE.MathUtils.clamp(
        leanUp - (nextCentroid.y - previousCentroid.y) * LEAN_SCALE,
        -LEAN_LIMIT,
        LEAN_LIMIT,
      );
    }
    previousCentroid = nextCentroid;
    event.preventDefault();
  };

  const pointerEnd = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    if (host.hasPointerCapture?.(event.pointerId)) host.releasePointerCapture(event.pointerId);
    refreshCentroid();
  };

  const doubleClick = (event: MouseEvent): void => {
    resetView();
    event.preventDefault();
  };

  const contextMenu = (event: MouseEvent): void => event.preventDefault();

  host.addEventListener('pointerdown', pointerDown);
  host.addEventListener('pointermove', pointerMove);
  host.addEventListener('pointerup', pointerEnd);
  host.addEventListener('pointercancel', pointerEnd);
  host.addEventListener('dblclick', doubleClick);
  host.addEventListener('contextmenu', contextMenu);

  return {
    resetView,
    destroy(): void {
      bridge.updateCamera = originalUpdateCamera;
      host.removeEventListener('pointerdown', pointerDown);
      host.removeEventListener('pointermove', pointerMove);
      host.removeEventListener('pointerup', pointerEnd);
      host.removeEventListener('pointercancel', pointerEnd);
      host.removeEventListener('dblclick', doubleClick);
      host.removeEventListener('contextmenu', contextMenu);
      pointers.clear();
    },
  };
}
