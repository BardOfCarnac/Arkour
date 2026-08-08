export const ARCHITECTURE_DOCUMENT_VERSION = 1 as const;

export type ArchitectureDocumentVersion = typeof ARCHITECTURE_DOCUMENT_VERSION;

export type ArchitectureNodeKind =
  | 'password'
  | 'file'
  | 'control'
  | 'blackIce'
  | 'demon'
  | 'other';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * Optional authoring hints from the 2D editor.
 *
 * These values express topology/layout intention only. They are not world-space
 * coordinates and must never be interpreted as metres or renderer positions.
 */
export interface ArchitectureLayoutHint {
  /** 1-based logical depth/floor. Higher numbers are farther from the entry. */
  floor?: number;
  /** Relative horizontal lane. Negative = left, positive = right. */
  column?: number;
}

export interface ArchitectureNode {
  id: string;
  kind: ArchitectureNodeKind;
  /** Display name. If omitted the importer derives one from kind/subtype. */
  label?: string;
  /** Specific game identity, e.g. "Hellhound" or "Efreet". */
  subtype?: string;
  /** Optional DV or equivalent numeric difficulty. */
  difficulty?: number;
  /** Editor-to-runtime layout intention, never literal 3D placement. */
  layout?: ArchitectureLayoutHint;
  /** Forward-compatible game/editor data that Arkour does not need to understand yet. */
  data?: Readonly<Record<string, JsonValue>>;
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  /** Optional author-facing branch label. */
  label?: string;
  /** Stable sibling ordering supplied by the editor. */
  order?: number;
  /** Marks the preferred route when a branch needs a default selection. */
  default?: boolean;
}

/**
 * Canonical interchange format between the editor/importers and Arkour.
 *
 * Version 1 intentionally describes game topology, not scenery. Camera paths,
 * route metres, node meshes, city geometry and collision volumes do not belong
 * in this document.
 */
export interface ArchitectureDocument {
  version: ArchitectureDocumentVersion;
  id?: string;
  title?: string;
  entry: string;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  metadata?: Readonly<Record<string, JsonValue>>;
}
