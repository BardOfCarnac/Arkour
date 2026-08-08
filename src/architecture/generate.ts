import { hashSeed, randomBetween, seededRandom } from '../run/random';
import type { RouteAnchor, ScenePiece, ScenePlan } from '../run/scene-plan';
import type { EncounterSpec, JunctionSpec, RouteSpec, RunWorld } from '../run/types';

export interface ArchitectureOptions {
  seed?: number;
  density?: number;
}

const DEFAULT_ARCHITECTURE_SEED = 0x41524b4f;

function clampAt(at: number): number {
  return Math.max(0.02, Math.min(0.98, at));
}

function encounterAnchor(
  encounter: EncounterSpec,
  atOffset = 0,
  right = 0,
  up = 0,
  forward = 0,
): RouteAnchor {
  return {
    routeId: encounter.routeId,
    at: clampAt(encounter.at + atOffset),
    right,
    up,
    forward,
  };
}

function routeAnchor(
  routeId: string,
  at: number,
  right = 0,
  up = 0,
  forward = 0,
): RouteAnchor {
  return { routeId, at: clampAt(at), right, up, forward };
}

function buildPassword(pieces: ScenePiece[], encounter: EncounterSpec, seed: number): void {
  const random = seededRandom(hashSeed(seed, `password:${encounter.id}`));
  if (random() < 0.5) {
    pieces.push(
      {
        kind: 'ring',
        anchor: encounterAnchor(encounter, -0.018),
        radius: 8.6,
        tube: 0.42,
        material: 'edge',
      },
      {
        kind: 'ring',
        anchor: encounterAnchor(encounter),
        radius: 7.2,
        tube: 0.72,
        material: 'conductor',
      },
      {
        kind: 'ring',
        anchor: encounterAnchor(encounter, 0.018),
        radius: 8.6,
        tube: 0.42,
        material: 'edge',
      },
      {
        kind: 'aperture',
        anchor: encounterAnchor(encounter),
        opening: [10.5, 10.5],
        member: 1.1,
        depth: 4.8,
        material: 'dark',
        rotation: [0, 0, Math.PI / 4],
      },
    );
    return;
  }

  pieces.push(
    {
      kind: 'aperture',
      anchor: encounterAnchor(encounter),
      opening: [10, 8.5],
      member: 1.4,
      depth: 7,
      material: 'ceramic',
    },
    {
      kind: 'repeat',
      anchor: encounterAnchor(encounter, 0, -7.2, 0),
      count: 6,
      spacing: 1.75,
      size: [1.1, 0.8, 5.4],
      axis: 'up',
      material: 'conductor',
    },
    {
      kind: 'repeat',
      anchor: encounterAnchor(encounter, 0, 7.2, 0),
      count: 6,
      spacing: 1.75,
      size: [1.1, 0.8, 5.4],
      axis: 'up',
      material: 'conductor',
    },
  );
}

function buildFile(pieces: ScenePiece[], encounter: EncounterSpec, seed: number): void {
  const random = seededRandom(hashSeed(seed, `file:${encounter.id}`));
  if (random() < 0.55) {
    pieces.push(
      {
        kind: 'canyon',
        anchor: encounterAnchor(encounter),
        gap: 10.5,
        wallThickness: 6.5,
        height: 27,
        length: 27,
        material: 'dark',
      },
      {
        kind: 'repeat',
        anchor: encounterAnchor(encounter, 0, -9.2, 0),
        count: 9,
        spacing: 2.45,
        size: [5.2, 4.4, 1.15],
        axis: 'forward',
        material: 'ceramic',
      },
      {
        kind: 'repeat',
        anchor: encounterAnchor(encounter, 0, 9.2, 0),
        count: 9,
        spacing: 2.45,
        size: [5.2, 4.4, 1.15],
        axis: 'forward',
        material: 'ceramic',
      },
      {
        kind: 'overpass',
        anchor: encounterAnchor(encounter, 0, 0, 8.5),
        width: 29,
        height: 1.2,
        depth: 3,
        material: 'conductor',
      },
    );
    return;
  }

  const side = random() < 0.5 ? -1 : 1;
  pieces.push(
    {
      kind: 'cylinder',
      anchor: encounterAnchor(encounter, 0, side * 10, -1),
      radius: 5.6,
      length: 28,
      material: 'ceramic',
    },
    {
      kind: 'ring',
      anchor: encounterAnchor(encounter, -0.07, side * 10, -1),
      radius: 6,
      tube: 0.55,
      material: 'conductor',
    },
    {
      kind: 'ring',
      anchor: encounterAnchor(encounter, 0.07, side * 10, -1),
      radius: 6,
      tube: 0.55,
      material: 'conductor',
    },
    {
      kind: 'repeat',
      anchor: encounterAnchor(encounter, 0, side * -10, 0),
      count: 8,
      spacing: 2.8,
      size: [5.5, 3.4, 1.2],
      axis: 'forward',
      material: 'dark',
    },
  );
}

function addFalseBuses(
  pieces: ScenePiece[],
  routeId: string,
  at: number,
  seed: number,
  count: number,
): void {
  const random = seededRandom(seed);
  for (let index = 0; index < count; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const vertical = randomBetween(random, -10, 12);
    const reach = randomBetween(random, 24, 42);
    pieces.push({
      kind: 'decorative-route',
      anchor: routeAnchor(routeId, at, 0, 0, 0),
      points: [
        [side * 9, vertical * 0.25, -9],
        [side * 15, vertical * 0.55, 0],
        [side * reach * 0.7, vertical, 15],
        [side * reach, vertical + randomBetween(random, -5, 5), 34],
      ],
      radius: randomBetween(random, 0.18, 0.36),
      material: index < 2 ? 'conductor' : 'ghost',
    });
  }
}

function buildControl(pieces: ScenePiece[], encounter: EncounterSpec, seed: number): void {
  const random = seededRandom(hashSeed(seed, `control:${encounter.id}`));
  if (random() < 0.5) {
    pieces.push(
      {
        kind: 'ring',
        anchor: encounterAnchor(encounter, -0.02),
        radius: 9.8,
        tube: 0.6,
        material: 'edge',
      },
      {
        kind: 'ring',
        anchor: encounterAnchor(encounter, 0.02),
        radius: 7.8,
        tube: 0.72,
        material: 'conductor',
      },
      {
        kind: 'cylinder',
        anchor: encounterAnchor(encounter, 0, -11.5, -1.5),
        radius: 4.1,
        length: 11,
        material: 'dark',
      },
      {
        kind: 'cylinder',
        anchor: encounterAnchor(encounter, 0, 11.5, 1.5),
        radius: 4.1,
        length: 11,
        material: 'dark',
      },
    );
    addFalseBuses(pieces, encounter.routeId, encounter.at, hashSeed(seed, `relay:${encounter.id}`), 3);
    return;
  }

  pieces.push({
    kind: 'interchange',
    anchor: encounterAnchor(encounter),
    span: 36,
    supportHeight: 28,
    material: 'edge',
  });
  addFalseBuses(pieces, encounter.routeId, encounter.at, hashSeed(seed, `manifold:${encounter.id}`), 5);
}

function buildIceHabitat(pieces: ScenePiece[], encounter: EncounterSpec): void {
  pieces.push(
    {
      kind: 'canyon',
      anchor: encounterAnchor(encounter),
      gap: 21,
      wallThickness: 4,
      height: 25,
      length: 24,
      material: 'dark',
    },
    {
      kind: 'ring',
      anchor: encounterAnchor(encounter, -0.05),
      radius: 13.5,
      tube: 0.45,
      material: 'ghost',
    },
    {
      kind: 'ring',
      anchor: encounterAnchor(encounter, 0.05),
      radius: 13.5,
      tube: 0.45,
      material: 'ghost',
    },
    {
      kind: 'overpass',
      anchor: encounterAnchor(encounter, 0, 0, 10),
      width: 34,
      height: 1.1,
      depth: 2.6,
      material: 'conductor',
      rotation: [0, 0, 0.12],
    },
  );
}

function buildDemon(pieces: ScenePiece[], encounter: EncounterSpec): void {
  const coilOffset = 11.5;
  pieces.push(
    {
      kind: 'cylinder',
      anchor: encounterAnchor(encounter, 0, -coilOffset, 0),
      radius: 5.8,
      length: 27,
      material: 'dark',
    },
    {
      kind: 'cylinder',
      anchor: encounterAnchor(encounter, 0, coilOffset, 0),
      radius: 5.8,
      length: 27,
      material: 'dark',
    },
    {
      kind: 'mass',
      anchor: encounterAnchor(encounter, 0, 0, 10),
      size: [31, 3, 7],
      material: 'ceramic',
    },
    {
      kind: 'mass',
      anchor: encounterAnchor(encounter, 0, 0, -10),
      size: [31, 3, 7],
      material: 'ceramic',
    },
  );

  for (const side of [-1, 1] as const) {
    for (const atOffset of [-0.08, -0.04, 0, 0.04, 0.08]) {
      pieces.push({
        kind: 'ring',
        anchor: encounterAnchor(encounter, atOffset, side * coilOffset, 0),
        radius: 6.4,
        tube: 0.5,
        material: 'conductor',
      });
    }
  }
}

function buildEncounter(pieces: ScenePiece[], encounter: EncounterSpec, seed: number): void {
  switch (encounter.type) {
    case 'password':
      buildPassword(pieces, encounter, seed);
      break;
    case 'file':
      buildFile(pieces, encounter, seed);
      break;
    case 'control':
      buildControl(pieces, encounter, seed);
      break;
    case 'ice':
      buildIceHabitat(pieces, encounter);
      break;
    case 'demon':
      buildDemon(pieces, encounter);
      break;
  }
}

function routeVerticalDelta(route: RouteSpec): number {
  const first = route.segments[0];
  const last = route.segments[route.segments.length - 1];
  if (!first || !last) return 0;
  return last.to[1] - first.from[1];
}

function buildRouteInfrastructure(
  pieces: ScenePiece[],
  route: RouteSpec,
  seed: number,
  density: number,
): void {
  const random = seededRandom(hashSeed(seed, `route:${route.id}`));
  const side = random() < 0.5 ? -1 : 1;
  const finCount = Math.max(6, Math.round(randomBetween(random, 9, 14) * density));

  pieces.push(
    {
      kind: 'repeat',
      anchor: routeAnchor(route.id, randomBetween(random, 0.18, 0.34), side * 15, -3),
      count: finCount,
      spacing: randomBetween(random, 2.2, 3.1),
      size: [0.75, randomBetween(random, 12, 21), randomBetween(random, 3.5, 5)],
      axis: 'forward',
      material: 'edge',
    },
    {
      kind: 'spine',
      anchor: routeAnchor(route.id, randomBetween(random, 0.48, 0.68), side * -19, -5),
      size: [randomBetween(random, 4, 7), randomBetween(random, 38, 68), randomBetween(random, 7, 12)],
      material: random() < 0.45 ? 'conductor' : 'dark',
      rotation: [0, randomBetween(random, -0.16, 0.16), randomBetween(random, -0.05, 0.05)],
    },
    {
      kind: 'field',
      anchor: routeAnchor(route.id, randomBetween(random, 0.44, 0.72), 0, 0, 10),
      count: Math.max(12, Math.round(24 * density)),
      spread: [58, 42, 58],
      minSize: [1.2, 2.2, 1.2],
      maxSize: [6.5, 17, 8],
      keepoutRadius: 10,
      seed: hashSeed(seed, `field:${route.id}`),
      material: 'dark',
    },
  );

  const cableSide = side * -1;
  pieces.push({
    kind: 'decorative-route',
    anchor: routeAnchor(route.id, randomBetween(random, 0.38, 0.62), 0, 0, 0),
    points: [
      [cableSide * 11, 10, -18],
      [cableSide * 15, 13, -5],
      [cableSide * 18, 9, 12],
      [cableSide * 25, 15, 31],
    ],
    radius: 0.3,
    material: 'conductor',
  });

  if (routeVerticalDelta(route) < -18) {
    pieces.push(
      {
        kind: 'ring',
        anchor: routeAnchor(route.id, 0.12),
        radius: 10.5,
        tube: 0.8,
        material: 'ceramic',
      },
      {
        kind: 'ring',
        anchor: routeAnchor(route.id, 0.15),
        radius: 12.3,
        tube: 0.35,
        material: 'edge',
      },
    );
  }
}

function buildJunction(pieces: ScenePiece[], junction: JunctionSpec, seed: number): void {
  pieces.push(
    {
      kind: 'interchange',
      anchor: routeAnchor(junction.incomingRoute, junction.at, 0, 0, 3),
      span: 52,
      supportHeight: 36,
      material: 'edge',
    },
    {
      kind: 'ring',
      anchor: routeAnchor(junction.incomingRoute, junction.at - 0.025),
      radius: 14,
      tube: 0.55,
      material: 'conductor',
    },
  );
  addFalseBuses(
    pieces,
    junction.incomingRoute,
    junction.at,
    hashSeed(seed, `junction:${junction.id}`),
    Math.max(5, junction.exits.length + 3),
  );
}

function buildMacroArchitecture(
  pieces: ScenePiece[],
  world: RunWorld,
  seed: number,
  density: number,
): void {
  const start = world.routes.find((route) => route.id === world.startRoute);
  if (!start) return;
  const random = seededRandom(hashSeed(seed, 'macro'));

  pieces.push(
    {
      kind: 'aperture',
      anchor: routeAnchor(start.id, 0.055),
      opening: [12, 10],
      member: 1.4,
      depth: 5.5,
      material: 'ceramic',
    },
    {
      kind: 'ring',
      anchor: routeAnchor(start.id, 0.075),
      radius: 9.6,
      tube: 0.4,
      material: 'conductor',
    },
    {
      kind: 'field',
      anchor: routeAnchor(start.id, 0.76, 0, 0, 24),
      count: Math.max(24, Math.round(46 * density)),
      spread: [86, 64, 90],
      minSize: [2, 4, 2],
      maxSize: [10, 26, 14],
      keepoutRadius: 13,
      seed: hashSeed(seed, 'macro-field'),
      material: 'dark',
    },
    {
      kind: 'cylinder',
      anchor: routeAnchor(start.id, 0.64, -27, -8, 12),
      radius: randomBetween(random, 7, 10),
      length: randomBetween(random, 34, 48),
      material: 'ceramic',
      rotation: [0.08, -0.18, 0],
    },
    {
      kind: 'repeat',
      anchor: routeAnchor(start.id, 0.72, 27, -2, 18),
      count: 8,
      spacing: 4.2,
      size: [5, 2.2, 24],
      axis: 'up',
      material: 'edge',
      rotation: [0, 0.12, 0.03],
    },
  );
}

export function generateArchitecture(world: RunWorld, options: ArchitectureOptions = {}): ScenePlan {
  const seed = options.seed ?? DEFAULT_ARCHITECTURE_SEED;
  const density = Math.max(0.35, Math.min(1.8, options.density ?? 1));
  const pieces: ScenePiece[] = [];

  buildMacroArchitecture(pieces, world, seed, density);

  for (const route of world.routes) {
    buildRouteInfrastructure(pieces, route, seed, density);
    for (const encounter of route.encounters ?? []) {
      buildEncounter(pieces, encounter, seed);
    }
  }

  for (const junction of world.junctions) {
    buildJunction(pieces, junction, seed);
  }

  return {
    lighting: {
      hemisphere: { sky: 0x88b9c8, ground: 0x020406, intensity: 0.7 },
      key: { color: 0xffe6d4, intensity: 1.35, position: [22, 34, -14] },
    },
    pieces,
  };
}
