import * as THREE from 'three';
import { seededRandom } from './random';
import type { RuntimeRoute } from './route';
import type { RunWorld } from './types';

export function createAcceptanceWorld(): RunWorld {
  return {
    startRoute: 'trunk',
    routes: [
      {
        id: 'trunk',
        label: 'Main descent',
        segments: [
          { kind: 'line', from: [0, 8, 0], to: [0, 3, 28] },
          { kind: 'quadratic', from: [0, 3, 28], control: [0, -1, 38], to: [5, -5, 48] },
          { kind: 'line', from: [5, -5, 48], to: [5, -14, 76] },
        ],
        encounters: [
          {
            id: 'password-a', routeId: 'trunk', at: 0.24, type: 'password',
            label: 'PASSWORD', meta: 'DV 8', approachDistance: 18, engageDistance: 7,
          },
          {
            id: 'file-a', routeId: 'trunk', at: 0.50, type: 'file',
            label: 'FILE', meta: 'DV 6', approachDistance: 18, engageDistance: 7,
          },
          {
            id: 'hellhound-a', routeId: 'trunk', at: 0.72, type: 'ice',
            label: 'HELLHOUND', meta: 'BLACK ICE', approachDistance: 20, engageDistance: 8,
          },
        ],
      },
      {
        id: 'left',
        label: 'Upper-left branch',
        segments: [
          { kind: 'line', from: [5, -14, 76], to: [-8, -7, 96] },
          { kind: 'quadratic', from: [-8, -7, 96], control: [-18, -4, 108], to: [-24, -10, 122] },
          { kind: 'line', from: [-24, -10, 122], to: [-32, -24, 152] },
        ],
        encounters: [
          {
            id: 'control-left', routeId: 'left', at: 0.58, type: 'control',
            label: 'CONTROL NODE', meta: 'DV 6', approachDistance: 18, engageDistance: 7,
          },
        ],
      },
      {
        id: 'center',
        label: 'Deep branch',
        segments: [
          { kind: 'line', from: [5, -14, 76], to: [5, -28, 98] },
          { kind: 'line', from: [5, -28, 98], to: [5, -46, 126] },
          { kind: 'quadratic', from: [5, -46, 126], control: [8, -52, 140], to: [16, -50, 154] },
          { kind: 'line', from: [16, -50, 154], to: [22, -48, 184] },
        ],
        encounters: [
          {
            id: 'control-center', routeId: 'center', at: 0.40, type: 'control',
            label: 'CONTROL NODE', meta: 'DV 6', approachDistance: 18, engageDistance: 7,
          },
          {
            id: 'efreet-a', routeId: 'center', at: 0.78, type: 'demon',
            label: 'EFREET', meta: 'DEMON', approachDistance: 20, engageDistance: 8,
          },
        ],
      },
      {
        id: 'right',
        label: 'Upper-right branch',
        segments: [
          { kind: 'line', from: [5, -14, 76], to: [18, -3, 96] },
          { kind: 'line', from: [18, -3, 96], to: [32, -5, 124] },
          { kind: 'quadratic', from: [32, -5, 124], control: [38, -8, 140], to: [40, -20, 156] },
        ],
        encounters: [
          {
            id: 'control-right', routeId: 'right', at: 0.58, type: 'control',
            label: 'CONTROL NODE', meta: 'DV 6', approachDistance: 18, engageDistance: 7,
          },
        ],
      },
    ],
    junctions: [
      {
        id: 'fork-a',
        incomingRoute: 'trunk',
        at: 0.96,
        exits: [
          { routeId: 'left', label: 'LEFT', markerAt: 0.22 },
          { routeId: 'center', label: 'DOWN', markerAt: 0.18 },
          { routeId: 'right', label: 'RIGHT', markerAt: 0.22 },
        ],
        defaultExit: 'center',
        approachDistance: 26,
      },
    ],
  };
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
