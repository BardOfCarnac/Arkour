import type { EncounterSpec, RouteSpec, RunWorld, Vec3 } from '../run/types';
import type { RouteAnchor, ScenePiece, ScenePlan } from '../run/scene-plan';
import type { ArchitectureOptions } from './generate';
import { generateNodeComponents } from './node-components';

const TARGET_SECTION_LENGTH = 5;
const JUNCTION_CAVITY_RADIUS = 24;

interface CavityProfile {
  opening: readonly [number, number];
  member: number;
  radius: number;
}

const TRANSIT_PROFILE: CavityProfile = {
  opening: [16, 14],
  member: 26,
  radius: 0,
};

const JUNCTION_PROFILE: CavityProfile = {
  opening: [68, 54],
  member: 9,
  radius: JUNCTION_CAVITY_RADIUS,
};

const ENCOUNTER_PROFILES: Record<EncounterSpec['type'], CavityProfile> = {
  password: { opening: [42, 30], member: 16, radius: 15 },
  file: { opening: [34, 48], member: 15, radius: 19 },
  control: { opening: [52, 34], member: 13, radius: 17 },
  ice: { opening: [58, 48], member: 11, radius: 21 },
  demon: { opening: [48, 58], member: 12, radius: 22 },
};

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

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function profileBlend(
  base: CavityProfile,
  target: CavityProfile,
  influence: number,
): CavityProfile {
  const t = smoothstep(influence);
  return {
    opening: [
      base.opening[0] + (target.opening[0] - base.opening[0]) * t,
      base.opening[1] + (target.opening[1] - base.opening[1]) * t,
    ],
    member: base.member + (target.member - base.member) * t,
    radius: target.radius,
  };
}

function encounterProfileAt(
  route: RouteSpec,
  routeLength: number,
  distance: number,
): { profile: CavityProfile; influence: number } | null {
  let nearest: { encounter: EncounterSpec; delta: number } | null = null;

  for (const encounter of route.encounters ?? []) {
    const delta = Math.abs(encounter.at * routeLength - distance);
    if (!nearest || delta < nearest.delta) nearest = { encounter, delta };
  }

  if (!nearest) return null;
  const profile = ENCOUNTER_PROFILES[nearest.encounter.type];
  if (nearest.delta > profile.radius) return null;

  return {
    profile,
    influence: 1 - nearest.delta / profile.radius,
  };
}

function junctionInfluenceAt(
  world: RunWorld,
  route: RouteSpec,
  routeLength: number,
  distance: number,
): number {
  let influence = 0;

  for (const junction of world.junctions) {
    const candidates: number[] = [];
    if (junction.incomingRoute === route.id) {
      candidates.push(junction.at * routeLength);
    }
    if (junction.exits.some((exit) => exit.routeId === route.id)) {
      candidates.push(0);
    }

    for (const candidate of candidates) {
      const delta = Math.abs(candidate - distance);
      if (delta <= JUNCTION_CAVITY_RADIUS) {
        influence = Math.max(influence, 1 - delta / JUNCTION_CAVITY_RADIUS);
      }
    }
  }

  return influence;
}

function volumeProfileAt(
  world: RunWorld,
  route: RouteSpec,
  routeLength: number,
  distance: number,
): CavityProfile {
  let profile = TRANSIT_PROFILE;

  const encounter = encounterProfileAt(route, routeLength, distance);
  if (encounter) {
    profile = profileBlend(profile, encounter.profile, encounter.influence);
  }

  const junctionInfluence = junctionInfluenceAt(world, route, routeLength, distance);
  if (junctionInfluence > 0) {
    profile = profileBlend(profile, JUNCTION_PROFILE, junctionInfluence);
  }

  return profile;
}

function addMilledRouteVolume(
  pieces: ScenePiece[],
  world: RunWorld,
  route: RouteSpec,
  density: number,
): void {
  const routeLength = estimateRouteLength(route);
  const targetLength = TARGET_SECTION_LENGTH / density;
  const sectionCount = Math.max(4, Math.ceil(routeLength / targetLength));
  const sectionLength = routeLength / sectionCount;

  for (let index = 0; index < sectionCount; index += 1) {
    const at = (index + 0.5) / sectionCount;
    const distance = at * routeLength;
    const profile = volumeProfileAt(world, route, routeLength, distance);

    pieces.push({
      kind: 'aperture',
      anchor: routeAnchor(route.id, at),
      opening: profile.opening,
      member: profile.member,
      depth: sectionLength * 1.08,
      material: 'dark',
    });
  }
}

/**
 * Route-first prototype using negative space instead of a surrounding city.
 *
 * Every valid route is a bore milled through one continuous dark mass. The bore
 * remains deliberately tight in transit, then changes cross-section around the
 * actual NET content: Password spaces spread horizontally, Files become taller
 * slots, Controls widen into switch-like chambers, and ICE/Demon encounters open
 * into the largest volumes. Junctions expand beyond all of them so the topology
 * can be read from the shape of the void itself.
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
