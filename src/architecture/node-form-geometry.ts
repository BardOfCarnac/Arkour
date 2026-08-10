import type { EncounterInteractionPlan, RouteAnchor, ScenePiece } from '../run/scene-plan';
import type { EncounterSpec, RunWorld } from '../run/types';

const DEG60 = Math.PI / 3;

function anchor(encounter: EncounterSpec, right = 0, up = 0, forward = 0): RouteAnchor {
  return {
    routeId: encounter.routeId,
    at: Math.max(0.02, Math.min(0.98, encounter.at)),
    right,
    up,
    forward,
  };
}

function passwordBulkhead(pieces: ScenePiece[], encounter: EncounterSpec): void {
  pieces.push(
    { kind: 'aperture', anchor: anchor(encounter), opening: [13, 11.5], member: 2.25, depth: 12, material: 'ceramic' },
    { kind: 'mass', anchor: anchor(encounter, -16.5, 0, -2), size: [11, 26, 13], material: 'dark', rotation: [0, 0, DEG60 * 0.18] },
    { kind: 'mass', anchor: anchor(encounter, 16.5, 0, 2), size: [11, 26, 13], material: 'dark', rotation: [0, 0, -DEG60 * 0.18] },
    { kind: 'mass', anchor: anchor(encounter, -7, 15, 1), size: [18, 5, 15], material: 'edge', rotation: [0, 0, DEG60] },
    { kind: 'mass', anchor: anchor(encounter, 7, -15, -1), size: [18, 5, 15], material: 'edge', rotation: [0, 0, DEG60] },
    { kind: 'repeat', anchor: anchor(encounter, -22, 0, -6), count: 5, spacing: 4.2, size: [1.2, 2.2, 17], axis: 'up', material: 'conductor', rotation: [0, 0, DEG60] },
    { kind: 'repeat', anchor: anchor(encounter, 22, 0, 6), count: 5, spacing: 4.2, size: [1.2, 2.2, 17], axis: 'up', material: 'conductor', rotation: [0, 0, -DEG60] },
  );
}

function fileMemoryCanyon(pieces: ScenePiece[], encounter: EncounterSpec): void {
  pieces.push(
    { kind: 'mass', anchor: anchor(encounter, -13, 1, -3), size: [8, 28, 34], material: 'dark', rotation: [0, DEG60 * 0.16, DEG60 * 0.08] },
    { kind: 'mass', anchor: anchor(encounter, 13, -1, 3), size: [8, 28, 34], material: 'dark', rotation: [0, -DEG60 * 0.16, -DEG60 * 0.08] },
    { kind: 'repeat', anchor: anchor(encounter, -10.5, 0, -1), count: 10, spacing: 2.8, size: [5.2, 5.8, 0.9], axis: 'forward', material: 'ceramic', rotation: [0, DEG60 * 0.12, 0] },
    { kind: 'repeat', anchor: anchor(encounter, 10.5, 0, 1), count: 10, spacing: 2.8, size: [5.2, 5.8, 0.9], axis: 'forward', material: 'ceramic', rotation: [0, -DEG60 * 0.12, 0] },
    { kind: 'spine', anchor: anchor(encounter, -20, 8, 0), size: [2.2, 2.2, 28], material: 'conductor', rotation: [0, DEG60, 0] },
    { kind: 'spine', anchor: anchor(encounter, 20, -8, 0), size: [2.2, 2.2, 28], material: 'conductor', rotation: [0, -DEG60, 0] },
  );
}

function controlRelay(pieces: ScenePiece[], encounter: EncounterSpec): void {
  pieces.push(
    { kind: 'ring', anchor: anchor(encounter), radius: 8.2, tube: 0.7, material: 'edge' },
    { kind: 'ring', anchor: anchor(encounter, 0, 0, -3.8), radius: 11, tube: 0.34, material: 'conductor', rotation: [0, 0, DEG60] },
    { kind: 'cylinder', anchor: anchor(encounter, -13, 7, -2), radius: 3.7, length: 18, material: 'dark', rotation: [0, DEG60, 0] },
    { kind: 'cylinder', anchor: anchor(encounter, 13, 7, 2), radius: 3.7, length: 18, material: 'dark', rotation: [0, -DEG60, 0] },
    { kind: 'cylinder', anchor: anchor(encounter, 0, -14, 0), radius: 4.2, length: 16, material: 'dark', rotation: [DEG60, 0, 0] },
    { kind: 'mass', anchor: anchor(encounter, 0, 14, 0), size: [18, 3, 10], material: 'ceramic', rotation: [0, 0, DEG60] },
  );
}

function iceHabitat(pieces: ScenePiece[], encounter: EncounterSpec): void {
  pieces.push(
    { kind: 'ring', anchor: anchor(encounter, 0, 0, -4), radius: 12.5, tube: 0.85, material: 'conductor', rotation: [0, 0, DEG60 * 0.18] },
    { kind: 'ring', anchor: anchor(encounter, 0, 0, 3), radius: 15.5, tube: 0.42, material: 'edge', rotation: [0, 0, -DEG60 * 0.18] },
    { kind: 'ring', anchor: anchor(encounter, 0, 0, 9), radius: 9.5, tube: 0.34, material: 'ghost', rotation: [0, DEG60 * 0.2, 0] },
    { kind: 'mass', anchor: anchor(encounter, -19, 8, 0), size: [7, 18, 13], material: 'dark', rotation: [0, 0, DEG60] },
    { kind: 'mass', anchor: anchor(encounter, 19, -8, 0), size: [7, 18, 13], material: 'dark', rotation: [0, 0, DEG60] },
    { kind: 'repeat', anchor: anchor(encounter, 0, 18, -2), count: 5, spacing: 3.4, size: [2.1, 6.5, 2.1], axis: 'right', material: 'ceramic', rotation: [0, 0, DEG60] },
  );
}

function demonTransformer(pieces: ScenePiece[], encounter: EncounterSpec): void {
  pieces.push(
    { kind: 'ring', anchor: anchor(encounter), radius: 12.2, tube: 0.82, material: 'conductor' },
    { kind: 'cylinder', anchor: anchor(encounter, -13.5, 0, -2), radius: 5.4, length: 30, material: 'dark', rotation: [0, DEG60 * 0.22, 0] },
    { kind: 'cylinder', anchor: anchor(encounter, 13.5, 0, 2), radius: 5.4, length: 30, material: 'dark', rotation: [0, -DEG60 * 0.22, 0] },
    { kind: 'ring', anchor: anchor(encounter, -13.5, 0, -5), radius: 7.2, tube: 0.36, material: 'edge', rotation: [0, DEG60, 0] },
    { kind: 'ring', anchor: anchor(encounter, 13.5, 0, 5), radius: 7.2, tube: 0.36, material: 'edge', rotation: [0, -DEG60, 0] },
    { kind: 'mass', anchor: anchor(encounter, 0, 17, 0), size: [28, 3.4, 7], material: 'ceramic', rotation: [0, 0, DEG60] },
    { kind: 'mass', anchor: anchor(encounter, 0, -17, 0), size: [28, 3.4, 7], material: 'ceramic', rotation: [0, 0, -DEG60] },
  );
}

function generic(pieces: ScenePiece[], encounter: EncounterSpec): void {
  pieces.push(
    { kind: 'ring', anchor: anchor(encounter), radius: 8, tube: 0.55, material: 'edge' },
    { kind: 'mass', anchor: anchor(encounter, -13, 0, 0), size: [7, 14, 10], material: 'dark' },
    { kind: 'mass', anchor: anchor(encounter, 13, 0, 0), size: [7, 14, 10], material: 'dark' },
  );
}

function addForm(
  pieces: ScenePiece[],
  encounter: EncounterSpec,
  interaction: EncounterInteractionPlan | undefined,
): void {
  switch (interaction?.formId) {
    case 'password.bulkhead-gate.v1':
      passwordBulkhead(pieces, encounter);
      return;
    case 'file.memory-canyon.v1':
      fileMemoryCanyon(pieces, encounter);
      return;
    case 'control.relay-manifold.v1':
      controlRelay(pieces, encounter);
      return;
    case 'ice.habitat-ring.v1':
      iceHabitat(pieces, encounter);
      return;
    case 'demon.transformer-core.v1':
      demonTransformer(pieces, encounter);
      return;
    default:
      generic(pieces, encounter);
  }
}

/**
 * Canonical visual layer for interaction forms. Geometry is selected by formId,
 * making the visual machine and its hold/blocker contract two halves of one
 * node form rather than independent encounter-type switches.
 */
export function generateNodeFormGeometry(
  world: RunWorld,
  interactions: Readonly<Record<string, EncounterInteractionPlan>>,
): ScenePiece[] {
  const pieces: ScenePiece[] = [];
  for (const route of world.routes) {
    for (const encounter of route.encounters ?? []) addForm(pieces, encounter, interactions[encounter.id]);
  }
  return pieces;
}
