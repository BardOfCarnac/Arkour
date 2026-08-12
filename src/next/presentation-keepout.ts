import * as THREE from 'three';
import { generateNodeFormPlan } from '../architecture/node-forms';
import { RUN_CAMERA_PROFILE } from '../run/camera-profile';
import { sampleHoldingRoute } from '../run/holding-routes';
import { createSpatialKeepout, type PresentationKeepoutPath, type SpatialKeepout } from '../run/keepout';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import type { RuntimeRoute } from '../run/route';
import type { EncounterInteractionPlan } from '../run/scene-plan';
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

/** Samples the same authored smooth camera grammar used by /next/. */
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
    clearance: RUN_CAMERA_PROFILE.sceneryClearance + 0.45,
  };
}

function holdAnchorDistance(
  route: RuntimeRoute,
  encounterAt: number,
  interaction: EncounterInteractionPlan,
): number {
  const encounterDistance = encounterAt * route.length;
  return Math.max(
    0,
    encounterDistance - (interaction.blocker ? interaction.stopClearance ?? 7 : 2.2),
  );
}

/**
 * Holding circuits are real traversal reservations too. They are supplied as
 * keep-out paths so a chassis brace can never be admitted merely because it is
 * clear of the main rail while cutting through an orbit/perch/dart circuit.
 */
function sampleHoldKeepoutPaths(
  world: RunWorld,
  routes: Map<string, RuntimeRoute>,
): PresentationKeepoutPath[] {
  const interactions = generateNodeFormPlan(world);
  const paths: PresentationKeepoutPath[] = [];
  const frame = createRouteFrame();

  for (const routeSpec of world.routes) {
    const route = routes.get(routeSpec.id);
    if (!route) continue;

    for (const encounter of routeSpec.encounters ?? []) {
      const interaction = interactions[encounter.id];
      if (!interaction?.holdRoute) continue;

      const distance = holdAnchorDistance(route, encounter.at, interaction);
      const points: THREE.Vector3[] = [];
      const samples = 56;
      for (let index = 0; index <= samples; index += 1) {
        const progress = index / samples;
        const elapsed = progress / Math.max(0.001, interaction.holdRoute.speed);
        const offset = sampleHoldingRoute(interaction.holdRoute, elapsed);
        sampleRouteFrameAtDistance(route, distance, frame);
        points.push(
          frame.position.clone()
            .addScaledVector(frame.right, offset.right)
            .addScaledVector(frame.up, offset.up)
            .addScaledVector(frame.forward, offset.forward),
        );
      }
      paths.push({ camera: points, clearance: 2.1 });
    }
  }

  return paths;
}

export function createNextPresentationKeepout(
  world: RunWorld,
  routes: Map<string, RuntimeRoute>,
): SpatialKeepout {
  const chains = enumerateRouteChains(world, routes, world.startRoute);
  const paths = chains.map((chain) => samplePresentationPath(legsFor(chain)));
  paths.push(...sampleHoldKeepoutPaths(world, routes));
  return createSpatialKeepout(routes, paths);
}
