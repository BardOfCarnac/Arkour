import * as THREE from 'three';
import type { RuntimeRoute } from './route';
import { createRouteFrame, sampleRouteFrameAtDistance } from './route-frame';
import type { EncounterSpec, RunWorld } from './types';

interface PasswordGate {
  encounter: EncounterSpec;
  left: THREE.Mesh;
  right: THREE.Mesh;
  openingWidth: number;
  openAmount: number;
  targetOpen: number;
}

const OPENING_HEIGHT = 11.5;
const SHUTTER_DEPTH = 2.2;
const OPEN_SPEED = 5.5;

function openingWidthFor(world: RunWorld, encounter: EncounterSpec): number {
  const nearbyJunction = world.junctions.find((junction) => (
    junction.incomingRoute === encounter.routeId
    && junction.at >= encounter.at - 0.08
    && junction.at <= encounter.at + 0.12
    && junction.exits.length > 1
  ));
  return nearbyJunction ? 15 : 13;
}

function createLeaf(width: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, OPENING_HEIGHT, SHUTTER_DEPTH);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export class PasswordBlockers {
  constructor(private readonly gates: Map<string, PasswordGate>) {}

  resolve(encounterId: string): void {
    const gate = this.gates.get(encounterId);
    if (gate) gate.targetOpen = 1;
  }

  update(dt: number): void {
    for (const gate of this.gates.values()) {
      const smoothing = 1 - Math.exp(-dt * OPEN_SPEED);
      gate.openAmount = THREE.MathUtils.lerp(gate.openAmount, gate.targetOpen, smoothing);

      const half = gate.openingWidth / 4;
      const travel = gate.openingWidth * 0.72 + 1.8;
      gate.left.position.x = -half - travel * gate.openAmount;
      gate.right.position.x = half + travel * gate.openAmount;
    }
  }
}

/**
 * Adds the moving route-blocking part of Password nodes after static scenery has
 * been admitted. These shutters intentionally occupy the reserved route volume;
 * the surrounding bulkhead remains ordinary architecture and therefore still
 * obeys the normal keep-out rules.
 */
export function addPasswordBlockers(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  world: RunWorld,
): PasswordBlockers {
  const gates = new Map<string, PasswordGate>();
  const shutterMaterial = new THREE.MeshStandardMaterial({
    color: 0x3f1717,
    emissive: 0x260606,
    emissiveIntensity: 0.7,
    roughness: 0.64,
    metalness: 0.55,
  });

  for (const routeSpec of world.routes) {
    const route = routes.get(routeSpec.id);
    if (!route) continue;

    for (const encounter of routeSpec.encounters ?? []) {
      if (encounter.type !== 'password') continue;

      const openingWidth = openingWidthFor(world, encounter);
      const leafWidth = openingWidth / 2 + 0.18;
      const group = new THREE.Group();
      const frame = createRouteFrame();
      sampleRouteFrameAtDistance(route, route.length * encounter.at, frame);
      group.position.copy(frame.position);
      group.quaternion.copy(frame.quaternion);

      const left = createLeaf(leafWidth, shutterMaterial);
      const right = createLeaf(leafWidth, shutterMaterial);
      const half = openingWidth / 4;
      left.position.x = -half;
      right.position.x = half;

      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, OPENING_HEIGHT * 0.92, SHUTTER_DEPTH + 0.45),
        new THREE.MeshStandardMaterial({
          color: 0x8b3327,
          emissive: 0x4a0b08,
          emissiveIntensity: 1.1,
          roughness: 0.38,
          metalness: 0.72,
        }),
      );
      group.add(left, right, seam);
      scene.add(group);

      gates.set(encounter.id, {
        encounter,
        left,
        right,
        openingWidth,
        openAmount: 0,
        targetOpen: 0,
      });
    }
  }

  return new PasswordBlockers(gates);
}
