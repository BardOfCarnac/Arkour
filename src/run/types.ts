export type Vec3 = readonly [number, number, number];

export type RunState =
  | 'TRANSIT'
  | 'APPROACH'
  | 'ENGAGED'
  | 'HELD'
  | 'BLOCKED'
  | 'RESUME';

export type SegmentSpec =
  | { kind: 'line'; from: Vec3; to: Vec3 }
  | { kind: 'quadratic'; from: Vec3; control: Vec3; to: Vec3 };

export interface EncounterSpec {
  id: string;
  routeId: string;
  at: number;
  type: 'password' | 'file' | 'control' | 'ice' | 'demon';
  label: string;
  meta: string;
  approachDistance: number;
  engageDistance: number;
}

export interface RouteSpec {
  id: string;
  label: string;
  segments: SegmentSpec[];
  encounters?: EncounterSpec[];
}

export interface JunctionExit {
  routeId: string;
  label: string;
  markerAt: number;
}

export interface JunctionSpec {
  id: string;
  incomingRoute: string;
  at: number;
  exits: JunctionExit[];
  defaultExit: string;
  approachDistance: number;
}

export interface RunWorld {
  startRoute: string;
  routes: RouteSpec[];
  junctions: JunctionSpec[];
}
