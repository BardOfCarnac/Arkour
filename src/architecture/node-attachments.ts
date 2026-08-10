import type {
  AttachmentDirection,
  EncounterInteractionPlan,
  RouteAnchor,
  ScenePiece,
} from '../run/scene-plan';
import type { EncounterSpec, RouteSpec, RunWorld, Vec3 } from '../run/types';

interface LocalTarget {
  right: number;
  up: number;
  forward: number;
  score: number;
}

type MutableVec3 = [number, number, number];

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

function anchorDistance(anchor: RouteAnchor, routeLength: number): number {
  if (anchor.distance !== undefined) return anchor.distance;
  return Math.max(0, Math.min(1, anchor.at)) * routeLength;
}

function localTargetFor(
  piece: ScenePiece,
  encounter: EncounterSpec,
  routeLength: number,
): LocalTarget {
  const nodeDistance = encounter.at * routeLength;
  const pieceDistance = anchorDistance(piece.anchor, routeLength);
  return {
    right: piece.anchor.right ?? 0,
    up: piece.anchor.up ?? 0,
    forward: pieceDistance - nodeDistance + (piece.anchor.forward ?? 0),
    score: Number.POSITIVE_INFINITY,
  };
}

function isAttachmentTarget(piece: ScenePiece): boolean {
  return piece.kind === 'mass'
    || piece.kind === 'spine'
    || piece.kind === 'canyon'
    || piece.kind === 'overpass'
    || piece.kind === 'interchange'
    || piece.kind === 'cylinder'
    || piece.kind === 'repeat';
}

function directionScore(
  direction: AttachmentDirection,
  target: LocalTarget,
  minReach: number,
): number | null {
  const { right, up, forward } = target;
  let axial = 0;
  let cross = 0;

  switch (direction) {
    case 'left':
      if (right > -minReach) return null;
      axial = -right;
      cross = Math.abs(up);
      break;
    case 'right':
      if (right < minReach) return null;
      axial = right;
      cross = Math.abs(up);
      break;
    case 'up':
      if (up < minReach) return null;
      axial = up;
      cross = Math.abs(right);
      break;
    case 'down':
      if (up > -minReach) return null;
      axial = -up;
      cross = Math.abs(right);
      break;
  }

  // Prefer a nearby surface in the requested sector, but allow diagonal and
  // slightly fore/aft machinery so attachments feel grown into a 3D city rather
  // than four perfect orthogonal struts.
  return axial + cross * 0.32 + Math.abs(forward) * 0.24;
}

function findTarget(
  direction: AttachmentDirection,
  encounter: EncounterSpec,
  route: RouteSpec,
  pieces: readonly ScenePiece[],
  interaction: EncounterInteractionPlan,
): LocalTarget | null {
  const attachment = interaction.attachments;
  if (!attachment) return null;
  const routeLength = estimateRouteLength(route);
  let best: LocalTarget | null = null;

  for (const piece of pieces) {
    if (piece.anchor.routeId !== route.id || !isAttachmentTarget(piece)) continue;
    const target = localTargetFor(piece, encounter, routeLength);
    if (Math.abs(target.forward) > attachment.forwardSearch) continue;

    const radial = Math.hypot(target.right, target.up);
    if (radial > attachment.maxReach) continue;

    const score = directionScore(direction, target, attachment.minReach);
    if (score === null) continue;
    target.score = score;
    if (!best || score < best.score) best = target;
  }

  return best;
}

function startFor(direction: AttachmentDirection, strand: number): Vec3 {
  const jitter = (strand - 1) * 1.35;
  switch (direction) {
    case 'left': return [-8.8, jitter, -1.2];
    case 'right': return [8.8, jitter, 1.2];
    case 'up': return [jitter, 7.7, -0.8];
    case 'down': return [jitter, -7.7, 0.8];
  }
}

function strandPoints(
  direction: AttachmentDirection,
  target: LocalTarget,
  strand: number,
): readonly Vec3[] {
  const start = startFor(direction, strand);
  const bias = (strand - 1) * 1.1;
  const mid: MutableVec3 = [
    start[0] + (target.right - start[0]) * 0.48,
    start[1] + (target.up - start[1]) * 0.48,
    start[2] + (target.forward - start[2]) * 0.42,
  ];

  if (direction === 'left' || direction === 'right') mid[1] += bias;
  else mid[0] += bias;

  return [
    start,
    mid,
    [target.right, target.up, target.forward],
  ];
}

/**
 * Searches the already-proposed route-relative machinery for actual nearby
 * structural targets and grows node-owned buses/braces into them. No fixed room
 * wall is invented when a direction has no target: the node simply leaves that
 * side open for later city/detail passes to occupy.
 */
export function generateNodeAttachments(
  world: RunWorld,
  basePieces: readonly ScenePiece[],
  interactions: Readonly<Record<string, EncounterInteractionPlan>>,
): ScenePiece[] {
  const attachments: ScenePiece[] = [];

  for (const route of world.routes) {
    for (const encounter of route.encounters ?? []) {
      const interaction = interactions[encounter.id];
      const spec = interaction?.attachments;
      if (!interaction || !spec) continue;

      for (const direction of spec.directions) {
        const target = findTarget(direction, encounter, route, basePieces, interaction);
        if (!target) continue;

        for (let strand = 0; strand < spec.strands; strand += 1) {
          attachments.push({
            kind: 'decorative-route',
            anchor: { routeId: encounter.routeId, at: encounter.at },
            points: strandPoints(direction, target, strand),
            radius: spec.radius * (strand === 1 ? 1.15 : 0.82),
            material: strand === 1 ? 'edge' : 'conductor',
          });
        }
      }
    }
  }

  return attachments;
}
