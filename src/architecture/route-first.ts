import type { RouteAnchor, ScenePiece, ScenePlan } from '../run/scene-plan';
import type { RouteSpec, RunWorld, Vec3 } from '../run/types';
import type { ArchitectureOptions } from './generate';
import { generateNodeComponents } from './node-components';

const TARGET_SECTION_LENGTH = 6;
const NODE_CAVITY_RADIUS = 17;
const JUNCTION_CAVITY_RADIUS = 22;

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

function routeAnchor(routeId: string, at: number): RouteAnchor {
  return {
    routeId,
    at: Math.max(0.005, Math.min(0.995, at)),
  };
}

type VolumeZone = 'transit' | 'node' | 'junction';

function volumeZoneAt(
  world: RunWorld,
  route: RouteSpec,
  routeLength: number,
  distance: number,
): VolumeZone {
  const junctionDistances: number[] = [];

  for (const junction of world.junctions) {
    if (junction.incomingRoute === route.id) {
      junctionDistances.push(junction.at * routeLength);
    }
    if (junction.exits.some((exit) => exit.routeId === route.id)) {
      junctionDistances.push(0);
    }
  }

  if (junctionDistances.some((candidate) => Math.abs(candidate - distance) <= JUNCTION_CAVITY_RADIUS)) {
    return 'junction';
  }

  const nodeDistances = (route.encounters ?? []).map((encounter) => encounter.at * routeLength);
  if (nodeDistances.some((candidate) => Math.abs(candidate - distance) <= NODE_CAVITY_RADIUS)) {
    return 'node';
  }

  return 'transit';
}

function addMilledRouteVolume(
  pieces: ScenePiece[],
  world: RunWorld,
  route: RouteSpec,
  density: number,
): void {
  const routeLength = estimateRouteLength(route);
  const targetLength = TARGET_SECTION_LENGTH / density;
  const sectionCount = Math.max(3, Math.ceil(routeLength / targetLength));
  const sectionLength = routeLength / sectionCount;

  for (let index = 0; index < sectionCount; index += 1) {
    const at = (index + 0.5) / sectionCount;
    const distance = at * routeLength;
    const zone = volumeZoneAt(world, route, routeLength, distance);

    const opening: readonly [number, number] = zone === 'junction'
      ? [60, 46]
      : zone === 'node'
        ? [48, 38]
        : [18, 16];
    const member = zone === 'junction' ? 10 : zone === 'node' ? 14 : 24;

    pieces.push({
      kind: 'aperture',
      anchor: routeAnchor(route.id, at),
      opening,
      member,
      depth: sectionLength * 1.04,
      material: 'dark',
    });
  }
}

/**
 * Route-first prototype using negative space instead of a surrounding city.
 *
 * Each real route is treated as a bore milled through one huge dark volume.
 * Dense, overlapping aperture sections read as continuous solid material while
 * leaving the traversal corridor empty. Around encounters and branch points the
 * bore widens into larger cavities, so node machinery remains the only authored
 * content in the space rather than sitting among unrelated filler buildings.
 *
 * The gameplay graph, node machinery, camera and traversal runtime are unchanged.
 */
export function generateRouteFirstArchitecture(
  world: RunWorld,
  options: ArchitectureOptions = {},
): ScenePlan {
  const density = Math.max(0.65, Math.min(1.4, options.density ?? 1));
  const pieces: ScenePiece[] = [];

  for (const route of world.routes) {
    addMilledRouteVolume(pieces, world, route, density);
  }

  pieces.push(...generateNodeComponents(world));

  return {
    lighting: {
      hemisphere: { sky: 0x88b9c8, ground: 0x020406, intensity: 0.7 },
      key: { color: 0xffe6d4, intensity: 1.35, position: [22, 34, -14] },
    },
    pieces,
  };
}
