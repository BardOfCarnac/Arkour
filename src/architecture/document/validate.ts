import {
  ARCHITECTURE_DOCUMENT_VERSION,
  type ArchitectureDocument,
  type ArchitectureEdge,
  type ArchitectureLayoutHint,
  type ArchitectureNode,
  type ArchitectureNodeKind,
  type JsonValue,
} from './types';

const NODE_KINDS = new Set<ArchitectureNodeKind>(['password', 'file', 'control', 'blackIce', 'demon', 'other']);

export class ArchitectureDocumentError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid ArchitectureDocument:\n- ${issues.join('\n- ')}`);
    this.name = 'ArchitectureDocumentError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isObject(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function readOptionalString(source: Record<string, unknown>, key: string, issues: string[], path: string): string | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path}.${key} must be a non-empty string when present`);
    return undefined;
  }
  return value;
}

function readOptionalFiniteNumber(source: Record<string, unknown>, key: string, issues: string[], path: string): number | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(`${path}.${key} must be a finite number when present`);
    return undefined;
  }
  return value;
}

function readLayout(value: unknown, issues: string[], path: string): ArchitectureLayoutHint | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) {
    issues.push(`${path}.layout must be an object when present`);
    return undefined;
  }

  const floor = readOptionalFiniteNumber(value, 'floor', issues, `${path}.layout`);
  const column = readOptionalFiniteNumber(value, 'column', issues, `${path}.layout`);

  if (floor !== undefined && (!Number.isInteger(floor) || floor < 1)) {
    issues.push(`${path}.layout.floor must be a positive integer`);
  }
  if (column !== undefined && !Number.isInteger(column)) {
    issues.push(`${path}.layout.column must be an integer`);
  }

  return {
    ...(floor !== undefined ? { floor } : {}),
    ...(column !== undefined ? { column } : {}),
  };
}

function readNode(value: unknown, index: number, issues: string[]): ArchitectureNode | null {
  const path = `nodes[${index}]`;
  if (!isObject(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }

  const id = value.id;
  if (typeof id !== 'string' || id.trim().length === 0) {
    issues.push(`${path}.id must be a non-empty string`);
    return null;
  }

  const kind = value.kind;
  if (typeof kind !== 'string' || !NODE_KINDS.has(kind as ArchitectureNodeKind)) {
    issues.push(`${path}.kind must be one of: ${Array.from(NODE_KINDS).join(', ')}`);
    return null;
  }

  const label = readOptionalString(value, 'label', issues, path);
  const subtype = readOptionalString(value, 'subtype', issues, path);
  const difficulty = readOptionalFiniteNumber(value, 'difficulty', issues, path);
  const layout = readLayout(value.layout, issues, path);

  let data: Readonly<Record<string, JsonValue>> | undefined;
  if (value.data !== undefined) {
    if (!isObject(value.data) || !isJsonValue(value.data)) issues.push(`${path}.data must contain JSON-compatible values only`);
    else data = value.data as Readonly<Record<string, JsonValue>>;
  }

  return {
    id,
    kind: kind as ArchitectureNodeKind,
    ...(label !== undefined ? { label } : {}),
    ...(subtype !== undefined ? { subtype } : {}),
    ...(difficulty !== undefined ? { difficulty } : {}),
    ...(layout !== undefined ? { layout } : {}),
    ...(data !== undefined ? { data } : {}),
  };
}

function readEdge(value: unknown, index: number, issues: string[]): ArchitectureEdge | null {
  const path = `edges[${index}]`;
  if (!isObject(value)) {
    issues.push(`${path} must be an object`);
    return null;
  }

  const from = value.from;
  const to = value.to;
  if (typeof from !== 'string' || from.trim().length === 0) issues.push(`${path}.from must be a non-empty string`);
  if (typeof to !== 'string' || to.trim().length === 0) issues.push(`${path}.to must be a non-empty string`);
  if (typeof from !== 'string' || typeof to !== 'string' || from.length === 0 || to.length === 0) return null;

  const label = readOptionalString(value, 'label', issues, path);
  const order = readOptionalFiniteNumber(value, 'order', issues, path);
  if (order !== undefined && !Number.isInteger(order)) issues.push(`${path}.order must be an integer`);

  let defaultRoute: boolean | undefined;
  if (value.default !== undefined) {
    if (typeof value.default !== 'boolean') issues.push(`${path}.default must be boolean when present`);
    else defaultRoute = value.default;
  }

  return {
    from,
    to,
    ...(label !== undefined ? { label } : {}),
    ...(order !== undefined ? { order } : {}),
    ...(defaultRoute !== undefined ? { default: defaultRoute } : {}),
  };
}

function validateRootedTree(document: ArchitectureDocument, issues: string[]): void {
  const nodeIds = new Set(document.nodes.map((node) => node.id));
  const outgoing = new Map<string, ArchitectureEdge[]>();
  const incomingCount = new Map<string, number>();

  for (const node of document.nodes) {
    outgoing.set(node.id, []);
    incomingCount.set(node.id, 0);
  }

  const edgeKeys = new Set<string>();
  for (const edge of document.edges) {
    if (!nodeIds.has(edge.from)) issues.push(`edge ${edge.from} -> ${edge.to} references unknown source node`);
    if (!nodeIds.has(edge.to)) issues.push(`edge ${edge.from} -> ${edge.to} references unknown target node`);
    if (edge.from === edge.to) issues.push(`node ${edge.from} cannot connect to itself`);

    const edgeKey = `${edge.from}\u0000${edge.to}`;
    if (edgeKeys.has(edgeKey)) issues.push(`duplicate edge ${edge.from} -> ${edge.to}`);
    edgeKeys.add(edgeKey);

    outgoing.get(edge.from)?.push(edge);
    if (incomingCount.has(edge.to)) incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  }

  if (!nodeIds.has(document.entry)) {
    issues.push(`entry node ${document.entry} does not exist`);
    return;
  }

  if ((incomingCount.get(document.entry) ?? 0) !== 0) issues.push(`entry node ${document.entry} must not have an incoming edge`);
  for (const node of document.nodes) {
    if (node.id !== document.entry && (incomingCount.get(node.id) ?? 0) > 1) {
      issues.push(`version 1 requires a rooted tree: node ${node.id} has more than one incoming edge`);
    }
  }

  for (const [sourceId, sourceEdges] of outgoing) {
    if (sourceEdges.filter((edge) => edge.default).length > 1) issues.push(`node ${sourceId} has more than one default outgoing edge`);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  let foundCycle = false;
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      foundCycle = true;
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of outgoing.get(id) ?? []) visit(edge.to);
    visiting.delete(id);
    visited.add(id);
  };
  visit(document.entry);

  if (foundCycle) issues.push('version 1 requires an acyclic rooted tree');
  for (const node of document.nodes) {
    if (!visited.has(node.id)) issues.push(`node ${node.id} is not reachable from entry ${document.entry}`);
  }

  const byId = new Map(document.nodes.map((node) => [node.id, node] as const));
  for (const edge of document.edges) {
    const fromFloor = byId.get(edge.from)?.layout?.floor;
    const toFloor = byId.get(edge.to)?.layout?.floor;
    if (fromFloor !== undefined && toFloor !== undefined && toFloor <= fromFloor) {
      issues.push(`layout floor must increase along edge ${edge.from} -> ${edge.to}`);
    }
  }
}

export function parseArchitectureDocument(value: unknown): ArchitectureDocument {
  const issues: string[] = [];
  if (!isObject(value)) throw new ArchitectureDocumentError(['document must be an object']);

  if (value.version !== ARCHITECTURE_DOCUMENT_VERSION) {
    issues.push(`version must be ${ARCHITECTURE_DOCUMENT_VERSION}`);
  }

  const entry = value.entry;
  if (typeof entry !== 'string' || entry.trim().length === 0) issues.push('entry must be a non-empty string');

  const rawNodes = value.nodes;
  const rawEdges = value.edges;
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) issues.push('nodes must be a non-empty array');
  if (!Array.isArray(rawEdges)) issues.push('edges must be an array');

  const nodes = Array.isArray(rawNodes)
    ? rawNodes.map((node, index) => readNode(node, index, issues)).filter((node): node is ArchitectureNode => node !== null)
    : [];
  const edges = Array.isArray(rawEdges)
    ? rawEdges.map((edge, index) => readEdge(edge, index, issues)).filter((edge): edge is ArchitectureEdge => edge !== null)
    : [];

  const seenNodeIds = new Set<string>();
  for (const node of nodes) {
    if (seenNodeIds.has(node.id)) issues.push(`duplicate node id ${node.id}`);
    seenNodeIds.add(node.id);
  }

  const id = readOptionalString(value, 'id', issues, 'document');
  const title = readOptionalString(value, 'title', issues, 'document');

  let metadata: Readonly<Record<string, JsonValue>> | undefined;
  if (value.metadata !== undefined) {
    if (!isObject(value.metadata) || !isJsonValue(value.metadata)) issues.push('metadata must contain JSON-compatible values only');
    else metadata = value.metadata as Readonly<Record<string, JsonValue>>;
  }

  const document: ArchitectureDocument = {
    version: ARCHITECTURE_DOCUMENT_VERSION,
    entry: typeof entry === 'string' ? entry : '',
    nodes,
    edges,
    ...(id !== undefined ? { id } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };

  validateRootedTree(document, issues);
  if (issues.length > 0) throw new ArchitectureDocumentError(issues);
  return document;
}

export function validateArchitectureDocument(document: ArchitectureDocument): void {
  parseArchitectureDocument(document);
}
