import type { ScenePiece } from '../run/scene-plan';
import type { RunWorld, Vec3 } from '../run/types';

const GRID_EXTENT = 34;
const GRID_OFFSETS = [-24, -16, -10, 10, 16, 24] as const;
const GRID_ANGLES = [0, Math.PI / 3, -Math.PI / 3] as const;
const GRID_RADIUS = 0.055;

function linePoints(angle: number, offset: number): readonly Vec3[] {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;

  const cx = nx * offset;
  const cy = ny * offset;
  return [
    [cx - dx * GRID_EXTENT, cy - dy * GRID_EXTENT, 0],
    [cx, cy, 0],
    [cx + dx * GRID_EXTENT, cy + dy * GRID_EXTENT, 0],
  ];
}

/**
 * Makes the 60-degree spatial grammar visible while the engine is being
 * reconciled. These are non-blocking ghost construction lines: three 60-degree
 * line families around every logical floor/node, with the central traversal
 * corridor deliberately left empty. The lattice is a placement substrate, not
 * gameplay topology; routes remain geometric authority.
 */
export function generateHexLattice(world: RunWorld): ScenePiece[] {
  const pieces: ScenePiece[] = [];

  for (const route of world.routes) {
    for (const encounter of route.encounters ?? []) {
      for (const angle of GRID_ANGLES) {
        for (const offset of GRID_OFFSETS) {
          pieces.push({
            kind: 'decorative-route',
            anchor: {
              routeId: encounter.routeId,
              at: encounter.at,
              forward: -1.2,
            },
            points: linePoints(angle, offset),
            radius: GRID_RADIUS,
            material: 'ghost',
          });
        }
      }
    }
  }

  return pieces;
}
