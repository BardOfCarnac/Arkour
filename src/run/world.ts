import * as THREE from 'three';
import type { RunWorld } from './types';
import type { RuntimeRoute } from './route';

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

function darkMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x11181d, roughness: 0.72, metalness: 0.42 });
}

function edgeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x22313a, roughness: 0.58, metalness: 0.5 });
}

export function addAcceptanceFixtures(scene: THREE.Scene): void {
  const dark = darkMaterial();
  const edge = edgeMaterial();

  const gate = new THREE.Group();
  const vertical = new THREE.BoxGeometry(1.3, 12, 2.8);
  const horizontal = new THREE.BoxGeometry(10, 1.3, 2.8);
  const left = new THREE.Mesh(vertical, edge);
  left.position.set(-5.2, 0, 0);
  const right = left.clone();
  right.position.x = 5.2;
  const top = new THREE.Mesh(horizontal, edge);
  top.position.y = 6.2;
  const bottom = top.clone();
  bottom.position.y = -6.2;
  gate.add(left, right, top, bottom);
  gate.position.set(0, 4.2, 19);
  gate.rotation.x = -0.18;
  scene.add(gate);

  const mass = new THREE.Mesh(new THREE.BoxGeometry(14, 18, 28), dark);
  mass.position.set(-13, -5, 43);
  mass.rotation.y = -0.18;
  scene.add(mass);

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(28, 1.8, 3), edge);
  bridge.position.set(5, 3, 63);
  bridge.rotation.z = 0.08;
  scene.add(bridge);

  const towerGeometry = new THREE.BoxGeometry(6, 28, 8);
  const towerA = new THREE.Mesh(towerGeometry, dark);
  towerA.position.set(-19, -15, 112);
  const towerB = towerA.clone();
  towerB.position.set(26, -18, 117);
  const lowerMass = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 34), edge);
  lowerMass.position.set(-7, -59, 145);
  scene.add(towerA, towerB, lowerMass);

  const ambient = new THREE.HemisphereLight(0x7bc8ff, 0x020406, 0.85);
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(18, 30, -10);
  scene.add(ambient, key);
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

export function addParticles(scene: THREE.Scene): void {
  const count = 720;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 120;
    positions[i * 3 + 1] = (Math.random() - 0.55) * 110;
    positions[i * 3 + 2] = Math.random() * 230 - 15;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0x78909c, size: 0.13, transparent: true, opacity: 0.55 });
  scene.add(new THREE.Points(geometry, material));
}
