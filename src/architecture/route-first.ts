import type { RouteAnchor, ScenePiece, ScenePlan } from '../run/scene-plan';
import type { RouteSpec, RunWorld, Vec3 } from '../run/types';
import type { ArchitectureOptions } from './generate';
import { generateNodeComponents } from './node-components';
import { generateStructuralArchitecture } from './structural';

const NODE_STRUCTURE_CLEARANCE = 15;

function pointDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function estimateRouteLength(route: RouteSpec): number {
  let length = 0;
  for (const segment of route.segments) {
    if (segment.kind === 'line') {
      length += pointDistance(segment.from, segment.to);
    } else {
      length += pointDistance(segment.from, segment.control)
        + pointDistance(segment.control, segment.to);
    }
  }
  return Math.max(1, length);
}

function anchorDistance(anchor: RouteAnchor, routeLength: number): number {
  if (anchor.distance !== undefined) return anchor.distance;
  return Math.max(0, Math.min(1, anchor.at)) * routeLength;
}

function structuralPieceEntersNodeZone(piece: ScenePiece, world: RunWorld): boolean {
  const route = world.routes.find((candidate) => candidate.id === piece.anchor.routeId);
  if (!route) return false;

  const routeLength = estimateRouteLength(route);
  const distance = anchorDistance(piece.anchor, routeLength);
  const reservedDistances = [
    ...(route.encounters ?? []).map((encounter) => encounter.at * routeLength),
    ...world.junctions
      .filter((junction) => junction.incomingRoute === route.id)
      .map((junction) => junction.at * routeLength),
  ];

  return reservedDistances.some((reserved) => Math.abs(distance - reserved) < NODE_STRUCTURE_CLEARANCE);
}

/**
 * Production composition point for the reconciled Arkour architecture model.
 *
 * The route network remains the geometric authority in the runtime. Large node
 * components now get first claim on the non-route space around encounters, and
 * the older structural generator is demoted to connective tissue between those
 * components. Generic structural pieces that land inside a node neighbourhood
 * are removed before scene admission so the chassis does not punch through the
 * identity-defining machinery.
 */
export function generateRouteFirstArchitecture(
  world: RunWorld,
  options: ArchitectureOptions = {},
): ScenePlan {
  const structural = generateStructuralArchitecture(world, options);
  const nodes = generateNodeComponents(world);
  const connectiveStructure = structural.pieces.filter((piece) => !structuralPieceEntersNodeZone(piece, world));

  return {
    ...structural,
    pieces: [...nodes, ...connectiveStructure],
  };
}
