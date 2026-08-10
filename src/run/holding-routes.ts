import type { HoldRouteSpec } from './scene-plan';

export interface HoldRouteSample {
  right: number;
  up: number;
  forward: number;
}

/**
 * Samples node-owned holding motion in route-local coordinates. The sample is
 * presentation/runtime data only: it never changes the logical NET topology.
 */
export function sampleHoldingRoute(
  spec: HoldRouteSpec,
  elapsed: number,
): HoldRouteSample {
  const phase = elapsed * Math.PI * 2 * spec.speed;
  let right = 0;
  let up = 0;
  let forward = 0;

  switch (spec.kind) {
    case 'orbit':
      right = Math.cos(phase) * spec.radius;
      up = Math.sin(phase) * spec.upAmplitude;
      forward = Math.sin(phase * 0.5) * spec.forwardAmplitude;
      break;
    case 'perch':
      right = Math.sin(phase) * spec.radius * 0.22;
      up = spec.upAmplitude + Math.cos(phase * 0.7) * spec.upAmplitude * 0.12;
      forward = Math.sin(phase * 0.45) * spec.forwardAmplitude * 0.45;
      break;
    case 'dart':
      right = Math.sin(phase) * spec.radius;
      up = Math.sin(phase * 2) * spec.upAmplitude;
      forward = Math.cos(phase * 1.5) * spec.forwardAmplitude;
      break;
    case 'helix':
      right = Math.cos(phase) * spec.radius;
      up = Math.sin(phase) * spec.upAmplitude;
      forward = Math.sin(phase * 0.5) * spec.forwardAmplitude;
      break;
  }

  if (spec.approachSideOnly) {
    // A blocking node's hold may move around the approach volume but must not
    // carry the traveller through or behind the barrier before resolution.
    forward = Math.min(forward, 0);
  }

  return { right, up, forward };
}
