import { hashSeed, randomBetween, seededRandom } from '../run/random';
import type { RouteAnchor, ScenePiece } from '../run/scene-plan';
import type { RouteSpec, RunWorld, Vec3 } from '../run/types';
import type { ArchitectureOptions } from './generate';

const DEFAULT_CITY_SEED = 0x56434954;
const NODE_CITY_CLEARANCE = 20;
const ROUTE_END_CLEARANCE = 12;
const TARGET_DISTRICT_SPACING = 24;

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

function anchor(routeId: string, at: number, right = 0, up = 0, forward = 0): RouteAnchor {
  return {
    routeId,
    at: Math.max(0.02, Math.min(0.98, at)),
    right,
    up,
    forward,
  };
}

function reservedDistances(world: RunWorld, route: RouteSpec): number[] {
  const routeLength = estimateRouteLength(route);
  return [
    0,
    routeLength,
    ...(route.encounters ?? []).map((encounter) => encounter.at * routeLength),
    ...world.junctions
      .filter((junction) => junction.incomingRoute === route.id)
      .map((junction) => junction.at * routeLength),
  ];
}

function districtFits(world: RunWorld, route: RouteSpec, at: number): boolean {
  const routeLength = estimateRouteLength(route);
  const distance = at * routeLength;
  return reservedDistances(world, route).every((reserved, index, all) => {
    const end = index === 0 || index === all.length - 1;
    const clearance = end ? ROUTE_END_CLEARANCE : NODE_CITY_CLEARANCE;
    return Math.abs(distance - reserved) >= clearance;
  });
}

function addCanyonDistrict(
  pieces: ScenePiece[],
  route: RouteSpec,
  at: number,
  random: () => number,
): void {
  const gap = randomBetween(random, 17, 23);
  const wallThickness = randomBetween(random, 8, 13);
  const height = randomBetween(random, 34, 52);
  const length = randomBetween(random, 22, 34);
  pieces.push({
    kind: 'canyon',
    anchor: anchor(route.id, at, 0, randomBetween(random, -3, 3)),
    gap,
    wallThickness,
    height,
    length,
    material: 'dark',
  });

  const side = random() < 0.5 ? -1 : 1;
  pieces.push({
    kind: 'mass',
    anchor: anchor(route.id, at, side * randomBetween(random, 20, 27), randomBetween(random, 9, 15)),
    size: [randomBetween(random, 9, 14), randomBetween(random, 10, 17), randomBetween(random, 12, 20)],
    material: 'edge',
  });
}

function addCantileverDistrict(
  pieces: ScenePiece[],
  route: RouteSpec,
  at: number,
  random: () => number,
): void {
  const up = randomBetween(random, 7.5, 13.5) * (random() < 0.35 ? -1 : 1);
  const width = randomBetween(random, 16, 21);
  const depth = randomBetween(random, 5.5, 8.5);
  const right = width * 0.5 + randomBetween(random, 10, 13);

  for (const side of [-1, 1] as const) {
    pieces.push(
      {
        kind: 'mass',
        anchor: anchor(route.id, at, side * right, up, randomBetween(random, -2, 2)),
        size: [width, randomBetween(random, 1.35, 2.1), depth],
        material: 'edge',
      },
      {
        kind: 'mass',
        anchor: anchor(route.id, at, side * (right + width * 0.28), up - randomBetween(random, 9, 16), 0),
        size: [randomBetween(random, 2, 3.2), randomBetween(random, 16, 27), randomBetween(random, 2, 3.2)],
        material: 'dark',
      },
    );
  }

  const trafficSide = random() < 0.5 ? -1 : 1;
  pieces.push({
    kind: 'decorative-route',
    anchor: anchor(route.id, at, trafficSide * (right + 2), up + 1.5),
    points: [
      [0, 0, -15],
      [trafficSide * 1.5, randomBetween(random, -1.2, 1.2), -5],
      [trafficSide * -1.5, randomBetween(random, -1.2, 1.2), 6],
      [0, 0, 17],
    ],
    radius: 0.18,
    material: 'ghost',
  });
}

function addServiceDeckDistrict(
  pieces: ScenePiece[],
  route: RouteSpec,
  at: number,
  random: () => number,
): void {
  const side = random() < 0.5 ? -1 : 1;
  const right = side * randomBetween(random, 17, 24);
  const up = randomBetween(random, -7, 8);

  pieces.push(
    {
      kind: 'mass',
      anchor: anchor(route.id, at, right, up),
      size: [randomBetween(random, 11, 16), randomBetween(random, 1.3, 2), randomBetween(random, 10, 16)],
      material: 'edge',
    },
    {
      kind: 'mass',
      anchor: anchor(route.id, at, right + side * randomBetween(random, 2, 5), up + randomBetween(random, 3.5, 6.5), 0),
      size: [randomBetween(random, 4, 7), randomBetween(random, 5, 9), randomBetween(random, 5, 8)],
      material: 'dark',
    },
    {
      kind: 'repeat',
      anchor: anchor(route.id, at, right + side * randomBetween(random, 4, 7), up + randomBetween(random, -4, 4)),
      count: 5,
      spacing: randomBetween(random, 2.3, 3.4),
      size: [randomBetween(random, 2.5, 4.5), randomBetween(random, 1.1, 2), 1.1],
      axis: 'forward',
      material: 'ceramic',
    },
  );

  if (random() > 0.45) {
    pieces.push({
      kind: 'mass',
      anchor: anchor(route.id, at, -right * 0.9, up + randomBetween(random, -6, 5), randomBetween(random, -5, 5)),
      size: [randomBetween(random, 8, 12), randomBetween(random, 8, 16), randomBetween(random, 8, 13)],
      material: 'dark',
    });
  }
}

function addUtilityStackDistrict(
  pieces: ScenePiece[],
  route: RouteSpec,
  at: number,
  random: () => number,
): void {
  for (const side of [-1, 1] as const) {
    const right = side * randomBetween(random, 22, 31);
    const up = randomBetween(random, -5, 5);
    pieces.push(
      {
        kind: 'spine',
        anchor: anchor(route.id, at, right, up),
        size: [randomBetween(random, 3.2, 5.5), randomBetween(random, 3.2, 5.5), randomBetween(random, 22, 34)],
        material: 'conductor',
      },
      {
        kind: 'repeat',
        anchor: anchor(route.id, at, right + side * randomBetween(random, 4, 7), up),
        count: 6,
        spacing: randomBetween(random, 2.8, 4),
        size: [randomBetween(random, 4, 7), randomBetween(random, 5, 10), randomBetween(random, 1.1, 1.8)],
        axis: 'forward',
        material: 'dark',
      },
    );
  }
}

function addDistrict(
  pieces: ScenePiece[],
  route: RouteSpec,
  at: number,
  seed: number,
  index: number,
): void {
  const random = seededRandom(hashSeed(seed, `${route.id}:city:${index}`));
  const style = Math.floor(random() * 4);
  switch (style) {
    case 0:
      addCanyonDistrict(pieces, route, at, random);
      break;
    case 1:
      addCantileverDistrict(pieces, route, at, random);
      break;
    case 2:
      addServiceDeckDistrict(pieces, route, at, random);
      break;
    default:
      addUtilityStackDistrict(pieces, route, at, random);
      break;
  }
}

function addRouteCity(
  pieces: ScenePiece[],
  world: RunWorld,
  route: RouteSpec,
  seed: number,
  density: number,
): void {
  const length = estimateRouteLength(route);
  const desired = Math.max(2, Math.min(8, Math.round((length / TARGET_DISTRICT_SPACING) * density)));
  const jitter = seededRandom(hashSeed(seed, `${route.id}:slots`));

  let emitted = 0;
  for (let index = 0; index < desired * 3 && emitted < desired; index += 1) {
    const base = (index + 1) / (desired * 3 + 1);
    const at = Math.max(0.08, Math.min(0.92, base + randomBetween(jitter, -0.025, 0.025)));
    if (!districtFits(world, route, at)) continue;
    addDistrict(pieces, route, at, seed, emitted);
    emitted += 1;
  }
}

/**
 * Packs secondary megastructure into route-relative space between encounter
 * neighbourhoods. These are proposals only: the renderer's route/camera keep-out
 * authority still decides whether each piece may enter the Three.js scene.
 */
export function generateVerticalCity(
  world: RunWorld,
  options: ArchitectureOptions = {},
): ScenePiece[] {
  const density = Math.max(0.35, Math.min(1.5, options.density ?? 0.8));
  const seed = options.seed ?? DEFAULT_CITY_SEED;
  const pieces: ScenePiece[] = [];

  for (const route of world.routes) addRouteCity(pieces, world, route, seed, density);
  return pieces;
}
