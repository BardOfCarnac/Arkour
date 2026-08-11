import type { EncounterSpec, RouteSpec, RunWorld } from '../run/types';
import type { RouteAnchor, ScenePiece } from '../run/scene-plan';

interface NodeContext {
  encounter: EncounterSpec;
  route: RouteSpec;
  incoming: number;
  outgoing: number;
  branch: boolean;
  terminal: boolean;
}

function anchor(
  encounter: EncounterSpec,
  atOffset = 0,
  right = 0,
  up = 0,
  forward = 0,
): RouteAnchor {
  return {
    routeId: encounter.routeId,
    at: Math.max(0.02, Math.min(0.98, encounter.at + atOffset)),
    right,
    up,
    forward,
  };
}

function connectivityFor(world: RunWorld, route: RouteSpec, encounter: EncounterSpec): NodeContext {
  const encounters = [...(route.encounters ?? [])].sort((a, b) => a.at - b.at);
  const index = encounters.findIndex((candidate) => candidate.id === encounter.id);
  const next = index >= 0 ? encounters[index + 1] : undefined;
  const previous = index > 0 ? encounters[index - 1] : undefined;
  const junction = world.junctions.find((candidate) => (
    candidate.incomingRoute === route.id
    && candidate.at >= encounter.at - 0.08
  ));

  const incoming = previous || route.id !== world.startRoute ? 1 : 0;
  let outgoing = 0;
  if (next) outgoing = 1;
  else if (junction) outgoing = junction.exits.length;
  else if (encounter.at < 0.9) outgoing = 1;

  return {
    encounter,
    route,
    incoming,
    outgoing,
    branch: outgoing > 1,
    terminal: outgoing === 0,
  };
}

/**
 * Passwords are now a pair of long side-mounted mechanisms rather than a wall
 * with a doorway. The thin ring is only an encounter marker; the dominant read
 * should be machinery continuing past the runner on both sides of the fall.
 */
function addPassword(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter, branch } = context;
  const side = branch ? 14.5 : 13.5;

  pieces.push(
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, -side, 0, -1.5),
      size: [7.5, 18, 24],
      material: 'dark',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, side, 1.5, 2),
      size: [6.5, 15, 20],
      material: 'edge',
    },
    {
      kind: 'cylinder',
      anchor: anchor(encounter, 0, -side - 4.5, 4, 0),
      radius: 2.1,
      length: 26,
      material: 'conductor',
    },
    {
      kind: 'cylinder',
      anchor: anchor(encounter, 0, side + 4, -3, 0),
      radius: 1.7,
      length: 22,
      material: 'conductor',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, -side - 1.5, 0),
      count: 7,
      spacing: 2.2,
      size: [1.15, 1.3, 8.5],
      axis: 'up',
      material: 'ceramic',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, side + 1.5, 0),
      count: 6,
      spacing: 2.35,
      size: [1.15, 1.15, 7.5],
      axis: 'up',
      material: 'ceramic',
    },
    {
      kind: 'ring',
      anchor: anchor(encounter, -0.018),
      radius: branch ? 9.5 : 8.5,
      tube: 0.32,
      material: 'conductor',
    },
  );
}

/**
 * Files remain a deep data canyon, but the racks are staggered so the encounter
 * reads as an occupied stretch of city rather than a symmetrical room.
 */
function addFile(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter } = context;
  pieces.push(
    {
      kind: 'canyon',
      anchor: anchor(encounter),
      gap: 17,
      wallThickness: 7,
      height: 28,
      length: 36,
      material: 'dark',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, -0.018, -12.5, 1.5, -2),
      count: 9,
      spacing: 2.8,
      size: [5.2, 3.8, 1.15],
      axis: 'forward',
      material: 'ceramic',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0.02, 13, -1.5, 3),
      count: 8,
      spacing: 3,
      size: [5.4, 4.1, 1.15],
      axis: 'forward',
      material: 'ceramic',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, -0.025, -18, -6, -6),
      size: [5.5, 10, 14],
      material: 'edge',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0.025, 18, 6, 7),
      size: [5.5, 9, 13],
      material: 'edge',
    },
  );
}

/**
 * Controls are open machine stacks: long cylinders, side cabinets and a thin
 * encircling marker. Nothing presents a flat facade across the route.
 */
function addControl(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter, branch } = context;
  const side = branch ? 14 : 12.5;

  pieces.push(
    {
      kind: 'cylinder',
      anchor: anchor(encounter, 0, -side, -1.5, -1),
      radius: branch ? 4.8 : 4.3,
      length: branch ? 28 : 24,
      material: 'dark',
    },
    {
      kind: 'cylinder',
      anchor: anchor(encounter, 0, side, 1.5, 2),
      radius: branch ? 4.8 : 4.3,
      length: branch ? 28 : 24,
      material: 'dark',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, -0.015, -side - 5.5, 5, -2),
      size: [6, 11, 15],
      material: 'edge',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0.018, side + 5, -5, 3),
      size: [5.5, 10, 13],
      material: 'edge',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, -side - 7, 0),
      count: branch ? 7 : 5,
      spacing: 2.8,
      size: [3.6, 1.15, 6.5],
      axis: 'up',
      material: 'conductor',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, side + 6.5, 0),
      count: branch ? 7 : 5,
      spacing: 3.1,
      size: [3.2, 1.15, 6],
      axis: 'up',
      material: 'conductor',
    },
    {
      kind: 'ring',
      anchor: anchor(encounter, 0.012),
      radius: branch ? 9.8 : 8.6,
      tube: 0.34,
      material: 'edge',
    },
  );
}

function addIce(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter, outgoing, branch } = context;
  const span = branch ? 19 : 15.5;
  const wing = branch ? 19 : 15.5;

  pieces.push(
    {
      kind: 'canyon',
      anchor: anchor(encounter),
      gap: span,
      wallThickness: branch ? 8.5 : 7,
      height: branch ? 29 : 24,
      length: branch ? 34 : 28,
      material: 'dark',
    },
    {
      kind: 'ring',
      anchor: anchor(encounter, -0.032),
      radius: branch ? 12.5 : 10.5,
      tube: 0.6,
      material: 'conductor',
    },
    {
      kind: 'ring',
      anchor: anchor(encounter, 0.035),
      radius: branch ? 14.5 : 12,
      tube: 0.34,
      material: 'edge',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, -0.02, -wing, 2, -5),
      size: [branch ? 10 : 8, branch ? 17 : 13, branch ? 18 : 14],
      material: 'edge',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0.024, wing, -2, 6),
      size: [branch ? 10 : 8, branch ? 16 : 12, branch ? 17 : 13],
      material: 'edge',
    },
  );

  if (outgoing >= 3) {
    pieces.push(
      {
        kind: 'mass',
        anchor: anchor(encounter, -0.025, -11, 8, 8),
        size: [6, 5, 10],
        material: 'conductor',
      },
      {
        kind: 'mass',
        anchor: anchor(encounter, 0.02, 11, 7, 9),
        size: [6, 5, 10],
        material: 'conductor',
      },
      {
        kind: 'mass',
        anchor: anchor(encounter, 0.018, -10, -8, -9),
        size: [6, 5, 10],
        material: 'conductor',
      },
      {
        kind: 'mass',
        anchor: anchor(encounter, -0.018, 10, -7, -8),
        size: [6, 5, 10],
        material: 'conductor',
      },
    );
  }
}

/**
 * Demons should feel like enormous machinery occupying a vertical district, not
 * a terminal chamber. Long coils and asymmetric side masses surround a clear
 * central descent while the rings provide the encounter's distinctive signature.
 */
function addDemon(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter, terminal } = context;
  const coil = terminal ? 14.5 : 13.5;

  pieces.push(
    {
      kind: 'cylinder',
      anchor: anchor(encounter, 0, -coil, 1, -2),
      radius: 5.4,
      length: terminal ? 36 : 32,
      material: 'dark',
    },
    {
      kind: 'cylinder',
      anchor: anchor(encounter, 0, coil, -1, 3),
      radius: 5.4,
      length: terminal ? 36 : 32,
      material: 'dark',
    },
    {
      kind: 'ring',
      anchor: anchor(encounter, -0.025),
      radius: 10.8,
      tube: 0.7,
      material: 'conductor',
    },
    {
      kind: 'ring',
      anchor: anchor(encounter, 0.028),
      radius: 13.2,
      tube: 0.34,
      material: 'edge',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, -0.018, -20, 7, -7),
      size: [9, 18, 16],
      material: 'edge',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0.02, 19, -6, 8),
      size: [8, 16, 15],
      material: 'ceramic',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, -21, -2, 0),
      count: 7,
      spacing: 3,
      size: [2.8, 1.2, 8],
      axis: 'up',
      material: 'conductor',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, 20.5, 2, 0),
      count: 6,
      spacing: 3.2,
      size: [2.6, 1.1, 7],
      axis: 'up',
      material: 'conductor',
    },
  );
}

function addGeneric(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter } = context;
  pieces.push(
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, -13, 0, -2),
      size: [8, 14, 20],
      material: 'dark',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, 13, 1.5, 3),
      size: [7, 12, 18],
      material: 'edge',
    },
    {
      kind: 'ring',
      anchor: anchor(encounter, 0.015),
      radius: 8.5,
      tube: 0.3,
      material: 'edge',
    },
  );
}

function addNodeComponent(pieces: ScenePiece[], context: NodeContext): void {
  switch (context.encounter.type) {
    case 'password':
      addPassword(pieces, context);
      break;
    case 'file':
      addFile(pieces, context);
      break;
    case 'control':
      addControl(pieces, context);
      break;
    case 'ice':
      addIce(pieces, context);
      break;
    case 'demon':
      addDemon(pieces, context);
      break;
    default:
      addGeneric(pieces, context);
  }
}

/**
 * Builds the large route-aware machinery that gives each logical NET element a
 * physical identity. Encounter structures now favour long side-mounted and
 * encircling machinery over transverse facades: the route should read as one
 * continuous open city descent, not a succession of rooms with doors between
 * them. The runtime keep-out still has final authority over every proposed part.
 */
export function generateNodeComponents(world: RunWorld): ScenePiece[] {
  const pieces: ScenePiece[] = [];
  for (const route of world.routes) {
    for (const encounter of route.encounters ?? []) {
      addNodeComponent(pieces, connectivityFor(world, route, encounter));
    }
  }
  return pieces;
}
