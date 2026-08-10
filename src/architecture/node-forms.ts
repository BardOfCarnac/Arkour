import type { EncounterSpec, RunWorld } from '../run/types';
import type {
  EncounterInteractionPlan,
  HoldRouteSpec,
  NodeAttachmentSpec,
} from '../run/scene-plan';

const PASSWORD_HOLD: HoldRouteSpec = {
  kind: 'perch',
  radius: 2.8,
  upAmplitude: 2.2,
  forwardAmplitude: 1.2,
  speed: 0.72,
  approachSideOnly: true,
};

const FILE_HOLD: HoldRouteSpec = {
  kind: 'orbit',
  radius: 4.8,
  upAmplitude: 2.2,
  forwardAmplitude: 1.5,
  speed: 0.62,
};

const CONTROL_HOLD: HoldRouteSpec = {
  kind: 'orbit',
  radius: 4.1,
  upAmplitude: 1.6,
  forwardAmplitude: 1.1,
  speed: 0.8,
};

const ICE_HOLD: HoldRouteSpec = {
  kind: 'dart',
  radius: 5.4,
  upAmplitude: 3.2,
  forwardAmplitude: 1.4,
  speed: 1.18,
};

const DEMON_HOLD: HoldRouteSpec = {
  kind: 'helix',
  radius: 5.8,
  upAmplitude: 3.4,
  forwardAmplitude: 2.2,
  speed: 0.68,
};

const PASSWORD_ATTACHMENTS: NodeAttachmentSpec = {
  directions: ['left', 'right', 'up', 'down'],
  minReach: 7,
  maxReach: 40,
  forwardSearch: 24,
  strands: 3,
  radius: 0.42,
};

function formFor(encounter: EncounterSpec): EncounterInteractionPlan {
  switch (encounter.type) {
    case 'password':
      return {
        formId: 'password.bulkhead-gate.v1',
        blocker: true,
        stopClearance: 7,
        holdRoute: PASSWORD_HOLD,
        attachments: PASSWORD_ATTACHMENTS,
      };
    case 'file':
      return {
        formId: 'file.memory-canyon.v1',
        blocker: false,
        holdRoute: FILE_HOLD,
      };
    case 'control':
      return {
        formId: 'control.relay-manifold.v1',
        blocker: false,
        holdRoute: CONTROL_HOLD,
      };
    case 'ice':
      return {
        formId: 'ice.habitat-ring.v1',
        blocker: false,
        holdRoute: ICE_HOLD,
      };
    case 'demon':
      return {
        formId: 'demon.transformer-core.v1',
        blocker: false,
        holdRoute: DEMON_HOLD,
      };
  }
}

/**
 * Node forms are the seam between visual architecture and traversal behaviour.
 * The runtime does not need to know how a Password or ICE habitat was built; it
 * receives the chosen form id plus its hold-route/blocker contract in ScenePlan.
 * Multiple geometry variants can later share the same interaction grammar.
 */
export function generateNodeFormPlan(
  world: RunWorld,
): Readonly<Record<string, EncounterInteractionPlan>> {
  const interactions: Record<string, EncounterInteractionPlan> = {};
  for (const route of world.routes) {
    for (const encounter of route.encounters ?? []) {
      interactions[encounter.id] = formFor(encounter);
    }
  }
  return interactions;
}
