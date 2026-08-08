import type { Vec3 } from './types';

export type SceneMaterial = 'dark' | 'edge' | 'ghost';

export type RoutePosition =
  | { distance: number; at?: never }
  | { at: number; distance?: never };

export type RouteAnchor = RoutePosition & {
  routeId: string;
  right?: number;
  up?: number;
  forward?: number;
};

interface BasePiece {
  anchor: RouteAnchor;
  material?: SceneMaterial;
  rotation?: Vec3;
}

export interface AperturePiece extends BasePiece {
  kind: 'aperture';
  opening: readonly [number, number];
  member: number;
  depth: number;
}

export interface MassPiece extends BasePiece {
  kind: 'mass';
  size: Vec3;
}

export interface OverpassPiece extends BasePiece {
  kind: 'overpass';
  width: number;
  height: number;
  depth: number;
}

export interface SpinePiece extends BasePiece {
  kind: 'spine';
  size: Vec3;
}

export interface CanyonPiece extends BasePiece {
  kind: 'canyon';
  gap: number;
  wallThickness: number;
  height: number;
  length: number;
}

export interface FieldPiece extends BasePiece {
  kind: 'field';
  count: number;
  spread: Vec3;
  minSize: Vec3;
  maxSize: Vec3;
  keepoutRadius: number;
  seed: number;
}

export interface InterchangePiece extends BasePiece {
  kind: 'interchange';
  span: number;
  supportHeight: number;
}

export interface DecorativeRoutePiece extends BasePiece {
  kind: 'decorative-route';
  points: readonly Vec3[];
  radius: number;
}

export type ScenePiece =
  | AperturePiece
  | MassPiece
  | OverpassPiece
  | SpinePiece
  | CanyonPiece
  | FieldPiece
  | InterchangePiece
  | DecorativeRoutePiece;

export interface SceneLighting {
  hemisphere: {
    sky: number;
    ground: number;
    intensity: number;
  };
  key: {
    color: number;
    intensity: number;
    position: Vec3;
  };
}

export interface ScenePlan {
  pieces: readonly ScenePiece[];
  lighting?: SceneLighting;
}

export function createAcceptanceScenePlan(): ScenePlan {
  return {
    lighting: {
      hemisphere: { sky: 0x7bc8ff, ground: 0x020406, intensity: 0.85 },
      key: { color: 0xffffff, intensity: 1.4, position: [18, 30, -10] },
    },
    pieces: [
      {
        kind: 'aperture',
        anchor: { routeId: 'trunk', at: 0.15 },
        opening: [10, 12],
        member: 1.3,
        depth: 2.8,
        material: 'edge',
        rotation: [-0.12, 0, 0],
      },
      {
        kind: 'mass',
        anchor: { routeId: 'trunk', at: 0.35, right: -13, up: -2, forward: 2 },
        size: [14, 20, 28],
        material: 'dark',
        rotation: [0, -0.18, 0],
      },
      {
        kind: 'overpass',
        anchor: { routeId: 'trunk', at: 0.48, up: 5 },
        width: 30,
        height: 1.6,
        depth: 3.2,
        material: 'edge',
        rotation: [0, 0, 0.08],
      },
      {
        kind: 'canyon',
        anchor: { routeId: 'trunk', at: 0.61, up: -1 },
        gap: 11,
        wallThickness: 8,
        height: 30,
        length: 24,
        material: 'dark',
        rotation: [0, 0.08, 0],
      },
      {
        kind: 'spine',
        anchor: { routeId: 'trunk', at: 0.72, right: 18, up: -4 },
        size: [7, 86, 10],
        material: 'edge',
        rotation: [0, 0.12, 0.03],
      },
      {
        kind: 'field',
        anchor: { routeId: 'trunk', at: 0.79, forward: 14 },
        count: 54,
        spread: [72, 58, 76],
        minSize: [1.4, 2.5, 1.4],
        maxSize: [7, 18, 9],
        keepoutRadius: 9,
        seed: 4712,
        material: 'dark',
      },
      {
        kind: 'decorative-route',
        anchor: { routeId: 'trunk', at: 0.86, up: 8 },
        points: [
          [-34, 4, -24],
          [-18, 2, -10],
          [-4, 0, 0],
          [12, -4, 14],
          [30, -8, 34],
        ],
        radius: 0.28,
        material: 'ghost',
      },
      {
        kind: 'interchange',
        anchor: { routeId: 'trunk', at: 0.94, forward: 4 },
        span: 46,
        supportHeight: 34,
        material: 'edge',
      },
      {
        kind: 'mass',
        anchor: { routeId: 'left', at: 0.42, right: -15, up: -4 },
        size: [8, 34, 12],
        material: 'dark',
      },
      {
        kind: 'mass',
        anchor: { routeId: 'right', at: 0.42, right: 15, up: -5 },
        size: [8, 32, 12],
        material: 'dark',
      },
      {
        kind: 'spine',
        anchor: { routeId: 'center', at: 0.58, right: -12, up: -8 },
        size: [10, 62, 16],
        material: 'edge',
        rotation: [0, -0.08, 0],
      },
    ],
  };
}
