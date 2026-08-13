import type * as THREE from 'three';

export interface ParticleLightSampler {
  sampleLight(position: THREE.Vector3, target: THREE.Color): number;
}
