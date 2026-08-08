import * as THREE from 'three';
import { RUN_CAMERA_PROFILE } from '../run/camera-profile';
import { createSpatialKeepout, type PresentationKeepoutPath, type SpatialKeepout } from '../run/keepout';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import type { RuntimeRoute } from '../run/route';
import type { RunWorld } from '../run/types';

interface TourLeg {
  route: RuntimeRoute;
  start: number;
  end: number;
}

interface TourSample {
  route: RuntimeRoute;
  distance: number;
  globalDistance: number;
}

function legsFor(routes: readonly RuntimeRoute[]): TourLeg[] {
  const total = routes.reduce((sum, route) => sum + route.length, 0);
  let cursor = 0;
  return routes.map((route) => {
    const start = cursor;
    cursor += route.length;
    return {
      route,
      start: total > 0 ? start / total : 0,
      end: total > 0 ? cursor / total : 1,
    };
  });
}

function enumerateRouteChains(
  world: RunWorld,
  routes: Map<string, RuntimeRoute>,
  routeId: string,
  visited: ReadonlySet<string> = new Set(),
): RuntimeRoute[][] {
  if (visited.has(routeId)) return [];
  const route = routes.get(routeId);
  if (!route) return [];

  const nextVisited = new Set(visited);
  nextVisited.add(routeId);
  const junction = world.junctions.find((candidate) => candidate.incomingRoute === routeId);
  if (!junction || junction.exits.length === 0) return [[route]];

  const chains: RuntimeRoute[][] = [];
  for (const exit of junction.exits) {
    const tails = enumerateRouteChains(world, routes, exit.routeId, nextVisited);
    for (const tail of tails) chains.push([route, ...tail]);
  }
  return chains.length > 0 ? chains : [[route]];
}

function sampleTour(legs: readonly TourLeg[], progress: number): TourSample {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  const leg = legs.find((candidate) => clamped <= candidate.end + 1e-6) ?? legs[legs.length - 1];
  if (!leg) throw new Error('Presentation keep-out has no routes');
  const span = Math.max(1e-6, leg.end - leg.start);
  const local = THREE.MathUtils.clamp((clamped - leg.start) / span, 0, 1);
  const globalDistance = legs.reduce((sum, candidate) => {
    if (candidate === leg) return sum + candidate.route.length * local;
    if (candidate.end <= leg.start) return sum + candidate.route.length;
    return sum;
  }, 0);
  return { route: leg.route, distance: leg.route.length * local, globalDistance };
}

function nearestEncounterDistance(route: RuntimeRoute, distance: number): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const encounter of route.spec.encounters ?? []) {
    nearest = Math.min(nearest, Math.abs(encounter.at * route.length - distance));
  }
  return nearest;
}

/**
 * Samples the same authored camera grammar used by /next/: a smooth arc around
 * the hard route which contracts back toward centre on encounter approach.
 * Every terminal branch is sampled, not only the default path, so a later route
 * choice cannot lead the camera into scenery that was admitted for another path.
 */
function samplePresentationPath(legs: TourLeg[]): PresentationKeepoutPath {
  const totalLength = legs.reduce((sum, leg) => sum + leg.route.length, 0);
  const count = Math.max(48, Math.ceil(totalLength / 3));
  const camera: THREE.Vector3[] = [];
  const look: THREE.Vector3[] = [];
  const frame = createRouteFrame();
  const lookFrame = createRouteFrame();

  for (let index = 0; index <= count; index += 1) {
    const u = index / count;
    const sample = sampleTour(legs, u);
    sampleRouteFrameAtDistance(sample.route, sample.distance, frame);

    const nearest = nearestEncounterDistance(sample.route, sample.distance);
    const betweenNodes = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp(nearest / 20, 0, 1),
      0,
      1,
    );
    const wing = Math.sin(sample.globalDistance / 25) * (0.55 + betweenNodes * 1.55);
    const lift = 0.65 + betweenNodes * 0.55;

    camera.push(
      frame.position.clone()
        .addScaledVector(frame.forward, -1.8)
        .addScaledVector(frame.right, wing)
        .addScaledVector(frame.up, lift),
    );

    const lookSample = sampleTour(legs, Math.min(1, u + 0.025));
    sampleRouteFrameAtDistance(lookSample.route, lookSample.distance, lookFrame);
    look.push(lookFrame.position.clone().addScaledVector(lookFrame.up, 0.15));
  }

  return {
    camera,
    look,
    // Includes the small deterministic encounter-hold drift used by /next/.
    clearance: RUN_CAMERA_PROFILE.sceneryClearance + 0.45,
  };
}

export function createNextPresentationKeepout(
  world: RunWorld,
  routes: Map<string, RuntimeRoute>,
): SpatialKeepout {
  const chains = enumerateRouteChains(world, routes, world.startRoute);
  const paths = chains.map((chain) => samplePresentationPath(legsFor(chain)));
  return createSpatialKeepout(routes, paths);
}
