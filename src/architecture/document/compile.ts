import type { EncounterSpec, JunctionExit, JunctionSpec, RouteSpec, RunWorld, Vec3 } from '../../run/types';
import type { ArchitectureDocument, ArchitectureEdge, ArchitectureNode, ArchitectureNodeKind } from './types';
import { validateArchitectureDocument } from './validate';

interface LogicalPlacement {
  floor: number;
  column: number;
}

interface RouteBuildResult {
  route: RouteSpec;
  endNodeId: string;
}

/**
 * Spatial route grammar.
 *
 * Same-column links fall straight down. A one-column branch moves through a
 * horizontal vector whose magnitude is sqrt(3) times the floor drop, so the
 * resulting branch segment is exactly 60 degrees from the vertical trunk in
 * real 3D space. The horizontal step is split across X/Z so left/right branches
 * flare into depth instead of living on a flat diagram plane.
 */
const FLOOR_DROP = 36;
const BRANCH_HORIZONTAL_STEP = FLOOR_DROP * Math.sqrt(3);
const BRANCH_AZIMUTH = Math.PI / 8;
const COLUMN_X_SPACING = BRANCH_HORIZONTAL_STEP * Math.cos(BRANCH_AZIMUTH);
const COLUMN_Z_SPACING = BRANCH_HORIZONTAL_STEP * Math.sin(BRANCH_AZIMUTH);
const ENTRY_POINT: Vec3 = [0, 8, 0];

function runtimeEncounterType(kind: ArchitectureNodeKind): EncounterSpec['type'] {
  switch (kind) {
    case 'password':
      return 'password';
    case 'file':
      return 'file';
    case 'control':
      return 'control';
    case 'blackIce':
      return 'ice';
    case 'demon':
      return 'demon';
    case 'other':
      // The legacy runtime has no generic encounter visual yet. Treating it as
      // a control node preserves a neutral machinery treatment until the new
      // route-first renderer consumes node kinds directly.
      return 'control';
  }
}

function defaultLabel(node: ArchitectureNode): string {
  if (node.label) return node.label;
  if (node.subtype) return node.subtype.toUpperCase();
  switch (node.kind) {
    case 'password':
      return 'PASSWORD';
    case 'file':
      return 'FILE';
    case 'control':
      return 'CONTROL NODE';
    case 'blackIce':
      return 'BLACK ICE';
    case 'demon':
      return 'DEMON';
    case 'other':
      return 'NODE';
  }
}

function encounterMeta(node: ArchitectureNode): string {
  if (node.difficulty !== undefined) return `DV ${node.difficulty}`;
  if (node.kind === 'blackIce') return node.subtype?.toUpperCase() ?? 'BLACK ICE';
  if (node.kind === 'demon') return node.subtype?.toUpperCase() ?? 'DEMON';
  return node.subtype?.toUpperCase() ?? '';
}

function edgeOrder(a: ArchitectureEdge, b: ArchitectureEdge): number {
  const aOrder = a.order ?? 0;
  const bOrder = b.order ?? 0;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.to.localeCompare(b.to);
}

function pointDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function computePlacements(
  document: ArchitectureDocument,
  outgoing: ReadonlyMap<string, readonly ArchitectureEdge[]>,
): Map<string, LogicalPlacement> {
  const byId = new Map(document.nodes.map((node) => [node.id, node] as const));
  const depth = new Map<string, number>();
  const visitDepth = (nodeId: string, currentDepth: number): void => {
    depth.set(nodeId, currentDepth);
    for (const edge of outgoing.get(nodeId) ?? []) visitDepth(edge.to, currentDepth + 1);
  };
  visitDepth(document.entry, 0);

  let nextLeafColumn = 0;
  const inferredColumns = new Map<string, number>();
  const inferColumn = (nodeId: string): number => {
    const existing = inferredColumns.get(nodeId);
    if (existing !== undefined) return existing;

    const explicit = byId.get(nodeId)?.layout?.column;
    if (explicit !== undefined) {
      inferredColumns.set(nodeId, explicit);
      return explicit;
    }

    const children = outgoing.get(nodeId) ?? [];
    if (children.length === 0) {
      const column = nextLeafColumn;
      nextLeafColumn += 1;
      inferredColumns.set(nodeId, column);
      return column;
    }

    const childColumns = children.map((edge) => inferColumn(edge.to));
    const column = childColumns.reduce((sum, value) => sum + value, 0) / childColumns.length;
    inferredColumns.set(nodeId, column);
    return column;
  };
  const rootColumn = inferColumn(document.entry);

  const placements = new Map<string, LogicalPlacement>();
  for (const node of document.nodes) {
    const floor = node.layout?.floor ?? (depth.get(node.id) ?? 0) + 1;
    const rawColumn = node.layout?.column ?? (inferredColumns.get(node.id) ?? rootColumn);
    placements.set(node.id, { floor, column: rawColumn - rootColumn });
  }
  return placements;
}

function worldPosition(placement: LogicalPlacement): Vec3 {
  return [
    placement.column * COLUMN_X_SPACING,
    ENTRY_POINT[1] - placement.floor * FLOOR_DROP,
    Math.abs(placement.column) * COLUMN_Z_SPACING,
  ];
}

function branchLabel(parent: LogicalPlacement, child: LogicalPlacement, edge: ArchitectureEdge): string {
  if (edge.label) return edge.label;
  const delta = child.column - parent.column;
  if (delta < -0.25) return 'LEFT';
  if (delta > 0.25) return 'RIGHT';
  return 'DOWN';
}

function makeEncounter(node: ArchitectureNode, routeId: string, at: number): EncounterSpec {
  const dangerous = node.kind === 'blackIce' || node.kind === 'demon';
  return {
    id: node.id,
    routeId,
    at,
    type: runtimeEncounterType(node.kind),
    label: defaultLabel(node),
    meta: encounterMeta(node),
    approachDistance: dangerous ? 20 : 18,
    engageDistance: dangerous ? 8 : 7,
  };
}

export function compileArchitectureDocument(document: ArchitectureDocument): RunWorld {
  validateArchitectureDocument(document);

  const byId = new Map(document.nodes.map((node) => [node.id, node] as const));
  const outgoing = new Map<string, ArchitectureEdge[]>();
  for (const node of document.nodes) outgoing.set(node.id, []);
  for (const edge of document.edges) outgoing.get(edge.from)?.push(edge);
  for (const edges of outgoing.values()) edges.sort(edgeOrder);

  const placements = computePlacements(document, outgoing);
  const position = (nodeId: string): Vec3 => {
    const placement = placements.get(nodeId);
    if (!placement) throw new Error(`Missing logical placement for ${nodeId}`);
    return worldPosition(placement);
  };

  const routes: RouteSpec[] = [];
  const junctions: JunctionSpec[] = [];
  let routeCounter = 0;

  const buildRoute = (parentNodeId: string | null, firstNodeId: string, preferredId?: string): RouteBuildResult => {
    routeCounter += 1;
    const routeId = preferredId ?? `route-${routeCounter}-${firstNodeId}`;
    const nodeIds: string[] = [firstNodeId];
    let currentId = firstNodeId;

    while ((outgoing.get(currentId) ?? []).length === 1) {
      const next = (outgoing.get(currentId) ?? [])[0];
      if (!next) break;
      currentId = next.to;
      nodeIds.push(currentId);
    }

    const points: Vec3[] = [parentNodeId === null ? ENTRY_POINT : position(parentNodeId)];
    for (const nodeId of nodeIds) points.push(position(nodeId));

    const segments: RouteSpec['segments'] = [];
    const cumulative: number[] = [0];
    let totalLength = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      if (!from || !to) continue;
      segments.push({ kind: 'line', from, to });
      totalLength += pointDistance(from, to);
      cumulative.push(totalLength);
    }

    const encounters = nodeIds.map((nodeId, index) => {
      const node = byId.get(nodeId);
      if (!node) throw new Error(`Unknown node ${nodeId}`);
      const at = totalLength > 0 ? (cumulative[index + 1] ?? totalLength) / totalLength : 0.5;
      return makeEncounter(node, routeId, Math.max(0.04, Math.min(0.96, at)));
    });

    const route: RouteSpec = {
      id: routeId,
      label: parentNodeId === null ? document.title ?? 'Main descent' : defaultLabel(byId.get(firstNodeId) ?? { id: firstNodeId, kind: 'other' }),
      segments,
      encounters,
    };
    routes.push(route);

    const branchEdges = outgoing.get(currentId) ?? [];
    if (branchEdges.length > 1) {
      const parentPlacement = placements.get(currentId);
      if (!parentPlacement) throw new Error(`Missing branch placement for ${currentId}`);

      const exits: JunctionExit[] = [];
      const routeByEdge = new Map<ArchitectureEdge, string>();
      for (const edge of branchEdges) {
        const childResult = buildRoute(currentId, edge.to);
        const childPlacement = placements.get(edge.to);
        if (!childPlacement) throw new Error(`Missing branch placement for ${edge.to}`);
        exits.push({
          routeId: childResult.route.id,
          label: branchLabel(parentPlacement, childPlacement, edge),
          markerAt: 0.2,
        });
        routeByEdge.set(edge, childResult.route.id);
      }

      const defaultEdge = branchEdges.find((edge) => edge.default) ?? branchEdges.find((edge) => {
        const child = placements.get(edge.to);
        return child !== undefined && Math.abs(child.column - parentPlacement.column) < 0.25;
      }) ?? branchEdges[0];
      if (!defaultEdge) throw new Error(`Branch ${currentId} has no exits`);

      junctions.push({
        id: `junction-${currentId}`,
        incomingRoute: routeId,
        at: 1,
        exits,
        defaultExit: routeByEdge.get(defaultEdge) ?? exits[0]?.routeId ?? '',
        approachDistance: 26,
      });
    }

    return { route, endNodeId: currentId };
  };

  const start = buildRoute(null, document.entry, 'trunk');
  return {
    startRoute: start.route.id,
    routes,
    junctions,
  };
}
