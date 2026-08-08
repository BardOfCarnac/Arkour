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

function addPassword(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter, branch } = context;
  const opening = branch ? 15 : 13;

  pieces.push(
    {
      kind: 'aperture',
      anchor: anchor(encounter),
      opening: [opening, 11.5],
      member: 1.8,
      depth: 9,
      material: 'ceramic',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, -12.5, 0),
      size: [6.5, 15, 13],
      material: 'dark',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, 12.5, 0),
      size: [6.5, 15, 13],
      material: 'dark',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, -16, 0),
      count: 6,
      spacing: 2.1,
      size: [1.2, 1.15, 7],
      axis: 'up',
      material: 'conductor',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, 16, 0),
      count: 6,
      spacing: 2.1,
      size: [1.2, 1.15, 7],
      axis: 'up',
      material: 'conductor',
    },
  );
}

function addFile(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter } = context;
  pieces.push(
    {
      kind: 'canyon',
      anchor: anchor(encounter),
      gap: 15.5,
      wallThickness: 7.5,
      height: 24,
      length: 31,
      material: 'dark',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, -12.2, 0),
      count: 9,
      spacing: 2.7,
      size: [5.6, 4.2, 1.2],
      axis: 'forward',
      material: 'ceramic',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, 12.2, 0),
      count: 9,
      spacing: 2.7,
      size: [5.6, 4.2, 1.2],
      axis: 'forward',
      material: 'ceramic',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, -17.5, -7),
      size: [5, 8, 11],
      material: 'edge',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, 17.5, 7),
      size: [5, 8, 11],
      material: 'edge',
    },
  );
}

function addControl(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter, branch } = context;
  pieces.push(
    {
      kind: 'aperture',
      anchor: anchor(encounter),
      opening: [branch ? 15 : 12.5, 12.5],
      member: 1.45,
      depth: 8.5,
      material: 'edge',
    },
    {
      kind: 'cylinder',
      anchor: anchor(encounter, 0, -12.5, -1),
      radius: 4.5,
      length: 19,
      material: 'dark',
    },
    {
      kind: 'cylinder',
      anchor: anchor(encounter, 0, 12.5, 1),
      radius: 4.5,
      length: 19,
      material: 'dark',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, -18, 0),
      count: branch ? 7 : 5,
      spacing: 2.8,
      size: [3.8, 1.25, 6],
      axis: 'up',
      material: 'conductor',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, 0, 18, 0),
      count: branch ? 7 : 5,
      spacing: 2.8,
      size: [3.8, 1.25, 6],
      axis: 'up',
      material: 'conductor',
    },
  );
}

function addIce(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter, outgoing, branch } = context;
  const span = branch ? 18 : 14.5;
  const wing = branch ? 18.5 : 15;

  pieces.push(
    {
      kind: 'canyon',
      anchor: anchor(encounter),
      gap: span,
      wallThickness: branch ? 9 : 7,
      height: branch ? 27 : 23,
      length: branch ? 28 : 23,
      material: 'dark',
    },
    {
      kind: 'ring',
      anchor: anchor(encounter, -0.025),
      radius: branch ? 12.5 : 10.5,
      tube: 0.65,
      material: 'conductor',
    },
    {
      kind: 'ring',
      anchor: anchor(encounter, 0.025),
      radius: branch ? 14.5 : 12,
      tube: 0.38,
      material: 'edge',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, -wing, 0),
      size: [branch ? 10 : 8, branch ? 16 : 12, branch ? 16 : 13],
      material: 'edge',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, wing, 0),
      size: [branch ? 10 : 8, branch ? 16 : 12, branch ? 16 : 13],
      material: 'edge',
    },
  );

  if (outgoing >= 3) {
    pieces.push(
      {
        kind: 'mass',
        anchor: anchor(encounter, 0, -10, 9),
        size: [6, 5, 9],
        material: 'conductor',
      },
      {
        kind: 'mass',
        anchor: anchor(encounter, 0, 10, 9),
        size: [6, 5, 9],
        material: 'conductor',
      },
      {
        kind: 'mass',
        anchor: anchor(encounter, 0, -10, -9),
        size: [6, 5, 9],
        material: 'conductor',
      },
      {
        kind: 'mass',
        anchor: anchor(encounter, 0, 10, -9),
        size: [6, 5, 9],
        material: 'conductor',
      },
    );
  }
}

function addDemon(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter, terminal } = context;
  const coil = terminal ? 13.5 : 12.5;
  pieces.push(
    {
      kind: 'aperture',
      anchor: anchor(encounter),
      opening: [14.5, 12.5],
      member: 2,
      depth: 10,
      material: 'edge',
    },
    {
      kind: 'cylinder',
      anchor: anchor(encounter, 0, -coil, 0),
      radius: 5.2,
      length: 28,
      material: 'dark',
    },
    {
      kind: 'cylinder',
      anchor: anchor(encounter, 0, coil, 0),
      radius: 5.2,
      length: 28,
      material: 'dark',
    },
    {
      kind: 'ring',
      anchor: anchor(encounter),
      radius: 10.8,
      tube: 0.72,
      material: 'conductor',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, 0, 10.5),
      size: [25, 3.2, 6],
      material: 'ceramic',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, 0, -10.5),
      size: [25, 3.2, 6],
      material: 'ceramic',
    },
  );
}

function addGeneric(pieces: ScenePiece[], context: NodeContext): void {
  const { encounter } = context;
  pieces.push(
    {
      kind: 'aperture',
      anchor: anchor(encounter),
      opening: [12, 11],
      member: 1.5,
      depth: 8,
      material: 'edge',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, -12, 0),
      size: [7, 12, 12],
      material: 'dark',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, 12, 0),
      size: [7, 12, 12],
      material: 'dark',
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
 * physical identity. The component vocabulary is deliberately expressed as
 * flanks, apertures and side-mounted machinery so the route-first admission
 * pass can preserve a genuine fly-through volume down the middle.
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
