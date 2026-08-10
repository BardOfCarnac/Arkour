import * as THREE from 'three';
import { sampleHoldingRoute, type HoldRouteSample } from '../run/holding-routes';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import type { RuntimeRoute } from '../run/route';
import type { EncounterInteractionPlan } from '../run/scene-plan';
import type { EncounterSpec, RunWorld } from '../run/types';

interface Circuit {
  encounter: EncounterSpec;
  route: RuntimeRoute;
  interaction: EncounterInteractionPlan;
  anchorDistance: number;
}

export interface HoldPose {
  route: RuntimeRoute;
  distance: number;
  offset: HoldRouteSample;
}

const LOOP_SAMPLES = 72;
const CIRCUIT_RADIUS = 0.16;

function worldPoint(
  route: RuntimeRoute,
  distance: number,
  offset: HoldRouteSample,
): THREE.Vector3 {
  const frame = createRouteFrame();
  sampleRouteFrameAtDistance(route, distance, frame);
  return frame.position.clone()
    .addScaledVector(frame.right, offset.right)
    .addScaledVector(frame.up, offset.up)
    .addScaledVector(frame.forward, offset.forward);
}

function tubeThrough(points: THREE.Vector3[], radius: number, material: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.28);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(24, points.length * 3), radius, 6, false),
    material,
  );
}

/**
 * Physical holding circuits are generated from the same interaction contract
 * that drives runtime movement. The route therefore has one visible machine
 * path and one sampled motion grammar rather than a decorative loop plus a
 * separate camera animation.
 */
export class HoldCircuitSystem {
  private readonly circuits = new Map<string, Circuit>();

  constructor(
    scene: THREE.Scene,
    routes: Map<string, RuntimeRoute>,
    world: RunWorld,
    interactions: Readonly<Record<string, EncounterInteractionPlan>>,
  ) {
    const loopMaterial = new THREE.MeshBasicMaterial({
      color: 0xc49b4a,
      transparent: true,
      opacity: 0.58,
    });
    const spurMaterial = new THREE.MeshBasicMaterial({
      color: 0x806b45,
      transparent: true,
      opacity: 0.48,
    });

    for (const routeSpec of world.routes) {
      const route = routes.get(routeSpec.id);
      if (!route) continue;

      for (const encounter of routeSpec.encounters ?? []) {
        const interaction = interactions[encounter.id];
        if (!interaction) continue;

        const encounterDistance = encounter.at * route.length;
        const anchorDistance = Math.max(
          0,
          encounterDistance - (interaction.blocker ? interaction.stopClearance ?? 7 : 2.2),
        );
        const circuit: Circuit = { encounter, route, interaction, anchorDistance };
        this.circuits.set(encounter.id, circuit);

        const points: THREE.Vector3[] = [];
        for (let index = 0; index <= LOOP_SAMPLES; index += 1) {
          const phaseProgress = index / LOOP_SAMPLES;
          // sampleHoldingRoute computes phase from elapsed * speed. Dividing by
          // speed makes phaseProgress map exactly once around the closed grammar.
          const elapsed = phaseProgress / Math.max(0.001, interaction.holdRoute.speed);
          points.push(worldPoint(route, anchorDistance, sampleHoldingRoute(interaction.holdRoute, elapsed)));
        }
        scene.add(tubeThrough(points, CIRCUIT_RADIUS, loopMaterial));

        const routePoint = worldPoint(route, anchorDistance, { right: 0, up: 0, forward: 0 });
        const entryPoint = points[0];
        if (entryPoint && routePoint.distanceTo(entryPoint) > 0.2) {
          scene.add(tubeThrough([routePoint, routePoint.clone().lerp(entryPoint, 0.46), entryPoint], CIRCUIT_RADIUS * 0.78, spurMaterial));
        }
      }
    }
  }

  has(encounterId: string): boolean {
    return this.circuits.has(encounterId);
  }

  anchorDistance(encounterId: string): number | undefined {
    return this.circuits.get(encounterId)?.anchorDistance;
  }

  sample(encounterId: string, elapsed: number): HoldPose | undefined {
    const circuit = this.circuits.get(encounterId);
    if (!circuit) return undefined;
    return {
      route: circuit.route,
      distance: circuit.anchorDistance,
      offset: sampleHoldingRoute(circuit.interaction.holdRoute, elapsed),
    };
  }
}
