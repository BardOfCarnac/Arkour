import { generateArchitecture as generateDetailArchitecture, type ArchitectureOptions } from './generate';
import type { RouteAnchor, ScenePiece, ScenePlan } from '../run/scene-plan';
import type { RouteSpec, RunWorld, Vec3 } from '../run/types';

const INNER_RAIL_RIGHT = 22;
const INNER_RAIL_UP = -5;
const FRAME_RIGHT = 27;
const FRAME_MID = 2.5;
const FRAME_TOP = 12;
const FRAME_BOTTOM = -12;
const TARGET_RAIL_SPAN = 11;
const TARGET_RIB_SPACING = 18;

function pointDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function estimateRouteLength(route: RouteSpec): number {
  let length = 0;
  for (const segment of route.segments) {
    length += pointDistance(segment.from, segment.to);
  }
  return Math.max(24, length);
}

function routeAnchor(routeId: string, at: number, right = 0, up = 0, forward = 0): RouteAnchor {
  return { routeId, at: Math.max(0.01, Math.min(0.99, at)), right, up, forward };
}

function addLongitudinalChassis(pieces: ScenePiece[], route: RouteSpec): void {
  const routeLength = estimateRouteLength(route);
  const sectionCount = Math.max(4, Math.ceil(routeLength / TARGET_RAIL_SPAN));
  const sectionLength = (routeLength / sectionCount) * 1.35;

  for (let index = 0; index < sectionCount; index += 1) {
    const at = (index + 0.5) / sectionCount;
    for (const side of [-1, 1] as const) {
      pieces.push(
        { kind: 'spine', anchor: routeAnchor(route.id, at, side * INNER_RAIL_RIGHT, INNER_RAIL_UP), size: [1.55, 1.55, sectionLength], material: 'conductor' },
        { kind: 'spine', anchor: routeAnchor(route.id, at, side * FRAME_RIGHT, FRAME_MID), size: [1.9, 1.9, sectionLength], material: 'edge' },
        { kind: 'spine', anchor: routeAnchor(route.id, at, side * FRAME_RIGHT, FRAME_TOP), size: [1.9, 1.9, sectionLength], material: 'edge' },
        { kind: 'spine', anchor: routeAnchor(route.id, at, side * FRAME_RIGHT, FRAME_BOTTOM), size: [1.9, 1.9, sectionLength], material: 'edge' },
      );
    }
  }
}

function addStructuralRib(pieces: ScenePiece[], routeId: string, at: number): void {
  pieces.push(
    { kind: 'overpass', anchor: routeAnchor(routeId, at, 0, FRAME_TOP), width: FRAME_RIGHT * 2, height: 1.5, depth: 1.8, material: 'edge' },
    { kind: 'overpass', anchor: routeAnchor(routeId, at, 0, FRAME_BOTTOM), width: FRAME_RIGHT * 2, height: 1.5, depth: 1.8, material: 'edge' },
  );
  for (const side of [-1, 1] as const) {
    pieces.push({ kind: 'repeat', anchor: routeAnchor(routeId, at, side * FRAME_RIGHT, 0), count: 7, spacing: 3.8, size: [1.55, 3.5, 1.55], axis: 'up', material: 'edge' });
  }
}

function addRouteChassis(pieces: ScenePiece[], route: RouteSpec): void {
  addLongitudinalChassis(pieces, route);
  const routeLength = estimateRouteLength(route);
  const ribCount = Math.max(3, Math.ceil(routeLength / TARGET_RIB_SPACING) + 1);
  for (let index = 0; index < ribCount; index += 1) {
    addStructuralRib(pieces, route.id, index / (ribCount - 1));
  }
}

function isLegacyLongBackbone(piece: ScenePiece): boolean {
  return piece.kind === 'spine' && piece.size[2] > 24;
}

export function generateStructuralArchitecture(world: RunWorld, options: ArchitectureOptions = {}): ScenePlan {
  const detailPlan = generateDetailArchitecture(world, options);
  const chassis: ScenePiece[] = [];
  for (const route of world.routes) addRouteChassis(chassis, route);
  return {
    ...detailPlan,
    pieces: [...chassis, ...detailPlan.pieces.filter((piece) => !isLegacyLongBackbone(piece))],
  };
}
