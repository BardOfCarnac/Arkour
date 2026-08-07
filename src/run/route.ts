import * as THREE from 'three';
import type { RouteSpec, SegmentSpec, Vec3 } from './types';

const vector = ([x, y, z]: Vec3) => new THREE.Vector3(x, y, z);

function segmentCurve(segment: SegmentSpec): THREE.Curve<THREE.Vector3> {
  if (segment.kind === 'line') {
    return new THREE.LineCurve3(vector(segment.from), vector(segment.to));
  }

  return new THREE.QuadraticBezierCurve3(
    vector(segment.from),
    vector(segment.control),
    vector(segment.to),
  );
}

export class RuntimeRoute {
  readonly id: string;
  readonly label: string;
  readonly spec: RouteSpec;
  readonly curve: THREE.CurvePath<THREE.Vector3>;
  readonly length: number;

  constructor(spec: RouteSpec) {
    this.id = spec.id;
    this.label = spec.label;
    this.spec = spec;
    this.curve = new THREE.CurvePath<THREE.Vector3>();

    for (const segment of spec.segments) {
      this.curve.add(segmentCurve(segment));
    }

    this.curve.arcLengthDivisions = 640;
    this.length = this.curve.getLength();
  }

  pointAtDistance(distance: number, target = new THREE.Vector3()): THREE.Vector3 {
    const u = THREE.MathUtils.clamp(distance / this.length, 0, 1);
    return this.curve.getPointAt(u, target);
  }

  tangentAtDistance(distance: number, target = new THREE.Vector3()): THREE.Vector3 {
    const u = THREE.MathUtils.clamp(distance / this.length, 0, 1);
    return this.curve.getTangentAt(u, target).normalize();
  }
}
