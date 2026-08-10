import type { EncounterSpec, RunWorld } from '../run/types';
import type { RouteAnchor, ScenePiece } from '../run/scene-plan';

const DEFAULT_OPENING_WIDTH = 13;
const BRANCH_OPENING_WIDTH = 15;
const OPENING_HEIGHT = 11.5;
const FRAME_MEMBER = 1.8;
const SEAL_WIDTH = 58;
const SEAL_HEIGHT = 42;
const SEAL_DEPTH = 11;

function anchor(
  encounter: EncounterSpec,
  right = 0,
  up = 0,
  forward = 0,
): RouteAnchor {
  return {
    routeId: encounter.routeId,
    at: Math.max(0.02, Math.min(0.98, encounter.at)),
    right,
    up,
    forward,
  };
}

function openingWidthFor(world: RunWorld, encounter: EncounterSpec): number {
  const nearbyJunction = world.junctions.find((junction) => (
    junction.incomingRoute === encounter.routeId
    && junction.at >= encounter.at - 0.08
    && junction.at <= encounter.at + 0.12
    && junction.exits.length > 1
  ));
  return nearbyJunction ? BRANCH_OPENING_WIDTH : DEFAULT_OPENING_WIDTH;
}

function addPasswordSeal(
  pieces: ScenePiece[],
  world: RunWorld,
  encounter: EncounterSpec,
): void {
  const openingWidth = openingWidthFor(world, encounter);
  const innerX = openingWidth / 2 + FRAME_MEMBER;
  const innerY = OPENING_HEIGHT / 2 + FRAME_MEMBER;
  const sideWidth = SEAL_WIDTH / 2 - innerX;
  const capHeight = SEAL_HEIGHT / 2 - innerY;
  const sideCenter = innerX + sideWidth / 2;
  const capCenter = innerY + capHeight / 2;
  const centralWidth = openingWidth + FRAME_MEMBER * 2;

  // Passwords are exceptional architecture: unlike ordinary node scenery they
  // are meant to read as a complete local bulkhead. The four staggered masses
  // deliberately reach far enough into surrounding district/chassis structure
  // that there is no visually plausible bypass around the node.
  pieces.push(
    {
      kind: 'mass',
      anchor: anchor(encounter, -sideCenter, 0, -1.1),
      size: [sideWidth, SEAL_HEIGHT, SEAL_DEPTH],
      material: 'dark',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, sideCenter, 0, 1.1),
      size: [sideWidth, SEAL_HEIGHT, SEAL_DEPTH],
      material: 'dark',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, capCenter, -0.45),
      size: [centralWidth, capHeight, SEAL_DEPTH + 2],
      material: 'ceramic',
    },
    {
      kind: 'mass',
      anchor: anchor(encounter, 0, -capCenter, 0.45),
      size: [centralWidth, capHeight, SEAL_DEPTH + 2],
      material: 'ceramic',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, -SEAL_WIDTH / 2 + 3.2, 0, -6.4),
      count: 8,
      spacing: 4.6,
      size: [1.15, 2.15, 15],
      axis: 'up',
      material: 'conductor',
    },
    {
      kind: 'repeat',
      anchor: anchor(encounter, SEAL_WIDTH / 2 - 3.2, 0, 6.4),
      count: 8,
      spacing: 4.6,
      size: [1.15, 2.15, 15],
      axis: 'up',
      material: 'conductor',
    },
  );
}

/**
 * Extends Password node machinery into a true local bulkhead. This pass is
 * intentionally separate from the core node-form generator: node forms own the
 * recognisable Password mechanism, while sealing owns attachment to the nearby
 * structural envelope.
 */
export function generatePasswordSeals(world: RunWorld): ScenePiece[] {
  const pieces: ScenePiece[] = [];

  for (const route of world.routes) {
    for (const encounter of route.encounters ?? []) {
      if (encounter.type !== 'password') continue;
      addPasswordSeal(pieces, world, encounter);
    }
  }

  return pieces;
}
