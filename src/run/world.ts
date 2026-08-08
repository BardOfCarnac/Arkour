import * as THREE from 'three';
import { acceptanceArchitectureDocument } from '../architecture/document/acceptance';
import { compileArchitectureDocument } from '../architecture/document/compile';
import { seededRandom } from './random';
import type { RuntimeRoute } from './route';
import type { RunWorld } from './types';

/**
 * Temporary adapter for the existing runtime.
 *
 * The acceptance world is no longer hand-authored as renderer routes. It now
 * enters through the same canonical ArchitectureDocument seam that the editor
 * and future importers will target.
 */
export function createAcceptanceWorld(): RunWorld {
  return compileArchitectureDocument(acceptanceArchitectureDocument);
}

export function addRouteGeometry(scene: THREE.Scene, routes: Map<string, RuntimeRoute>): Map<string, THREE.Mesh> {
  const meshes = new Map<string, THREE.Mesh>();

  for (const route of routes.values()) {
    const geometry = new THREE.TubeGeometry(route.curve, 180, 0.16, 7, false);
    const material = new THREE.MeshBasicMaterial({
      color: route.id === 'trunk' ? 0x2af1c8 : 0x426a82,
      transparent: true,
      opacity: route.id === 'trunk' ? 0.95 : 0.42,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `route:${route.id}`;
    scene.add(mesh);
    meshes.set(route.id, mesh);
  }

  return meshes;
}

export function addParticles(scene: THREE.Scene, seed = 0x41524b4f): void {
  const count = 720;
  const positions = new Float32Array(count * 3);
  const random = seededRandom(seed);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (random() - 0.5) * 120;
    positions[i * 3 + 1] = (random() - 0.55) * 110;
    positions[i * 3 + 2] = random() * 230 - 15;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0x78909c, size: 0.13, transparent: true, opacity: 0.55 });
  scene.add(new THREE.Points(geometry, material));
}
