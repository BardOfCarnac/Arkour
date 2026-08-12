import * as THREE from 'three';
import type { RunWorld, Vec3 } from '../run/types';
import type { NextAcceptanceRuntime } from './runtime';

const LEGACY_FLOOR_DROP_METRES = 36;
const ENTRY_POINT = new THREE.Vector3(0, 8, 0);

/**
 * Avatar-relative metric scale experiment.
 *
 * One world unit is treated as one metre. The logical graph is compiled with the
 * existing 60-degree route grammar, then expanded uniformly away from the access
 * point so a 36 m logical floor becomes a 350 m physical floor while preserving
 * every route angle and branch relationship.
 */
export const AVATAR_SCALE = {
  metresPerWorldUnit: 1,
  runnerHeightMetres: 1.83,
  currentRunnerReferenceHeightMetres: 2.6392491152883277,
  nominalFloorDropMetres: 350,
  worldExpansion: 350 / LEGACY_FLOOR_DROP_METRES,
  runnerScaleFactor: 0.6933790332255467,
  cameraFarMetres: 6000,
  undergroundFogDensity: 0.00135,
  latticeDensity: 0.004,
} as const;

function scalePoint([x, y, z]: Vec3): Vec3 {
  const factor = AVATAR_SCALE.worldExpansion;
  return [
    ENTRY_POINT.x + (x - ENTRY_POINT.x) * factor,
    ENTRY_POINT.y + (y - ENTRY_POINT.y) * factor,
    ENTRY_POINT.z + (z - ENTRY_POINT.z) * factor,
  ];
}

export function applyAvatarRelativeWorldScale(world: RunWorld): RunWorld {
  return {
    ...world,
    routes: world.routes.map((route) => ({
      ...route,
      segments: route.segments.map((segment) => (
        segment.kind === 'line'
          ? { ...segment, from: scalePoint(segment.from), to: scalePoint(segment.to) }
          : {
            ...segment,
            from: scalePoint(segment.from),
            control: scalePoint(segment.control),
            to: scalePoint(segment.to),
          }
      )),
    })),
  };
}

type RuntimeBridge = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
};

export function applyAvatarRelativePresentation(runtime: NextAcceptanceRuntime): void {
  const bridge = runtime as unknown as RuntimeBridge;
  bridge.camera.far = AVATAR_SCALE.cameraFarMetres;
  bridge.camera.updateProjectionMatrix();
  bridge.scene.fog = new THREE.FogExp2(0x020607, AVATAR_SCALE.undergroundFogDensity);
}

export function scaleRunnerToReferenceHeight(runtime: NextAcceptanceRuntime): void {
  const bridge = runtime as unknown as RuntimeBridge;
  const runner = bridge.scene.getObjectByName('arkour-runner');
  if (!runner) return;
  runner.scale.setScalar(AVATAR_SCALE.runnerScaleFactor);
}
