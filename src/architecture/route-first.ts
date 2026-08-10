import type { RouteAnchor, ScenePiece, ScenePlan } from '../run/scene-plan';
import type { RouteSpec, RunWorld, Vec3 } from '../run/types';
import type { ArchitectureOptions } from './generate';
import { generateHexLattice } from './hex-lattice';
import { generateNodeAttachments } from './node-attachments';
import { generateNodeComponents } from './node-components';
import { generateNodeFormPlan } from './node-forms';
import { generateStructuralArchitecture } from './structural';
import { generateVerticalCity } from './vertical-city';

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
 * Transitional node-only composition for the canonical `next` runtime while
 * its environment moves to one absolute world-space lattice volume. Keeping the
 * old route-local chassis/city out of this plan is deliberate: otherwise the
 * old repeated frames remain visually dominant and hide whether the new global
 * substrate actually works.
 */
export function generateLatticeFoundationArchitecture(world: RunWorld): ScenePlan {
  return {
    lighting: {
      hemisphere: { sky: 0x6fb9ca, ground: 0x020406, intensity: 0.72 },
      key: { color: 0xdceff2, intensity: 1.15, position: [22, 34, -18] },
    },
    interactions: generateNodeFormPlan(world),
    pieces: generateNodeComponents(world),
  };
}

/**
 * Legacy-compatible route-first composition retained for comparison while the
 * canonical runtime migrates away from route-local environment generation.
 */
export function generateRouteFirstArchitecture(
  world: RunWorld,
  options: ArchitectureOptions = {},
): ScenePlan {
  const structural = generateStructuralArchitecture(world, options);
  const lattice = generateHexLattice(world);
  const nodes = generateNodeComponents(world);
  const city = generateVerticalCity(world, options);
  const connectiveStructure = structural.pieces.filter((piece) => !structuralPieceEntersNodeZone(piece, world));
  const interactions = generateNodeFormPlan(world);

  const environmentPieces: ScenePiece[] = [
    ...connectiveStructure,
    ...city,
  ];
  const attachments = generateNodeAttachments(world, environmentPieces, interactions);

  return {
    ...structural,
    interactions,
    pieces: [...lattice, ...nodes, ...attachments, ...connectiveStructure, ...city],
  };
}
