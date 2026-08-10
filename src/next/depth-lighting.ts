import * as THREE from 'three';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import type { RuntimeRoute } from '../run/route';
import type { EncounterSpec, RunWorld } from '../run/types';

function accentColour(encounter: EncounterSpec): number {
  switch (encounter.type) {
    case 'password': return 0xff7658;
    case 'file': return 0x65c8ff;
    case 'control': return 0xe2c66b;
    case 'ice': return 0x82efff;
    case 'demon': return 0xd06cff;
  }
}

/**
 * Low-cost lighting rig for the underground architecture. The intention is not
 * to brighten the scene uniformly: cool and warm directions should reveal
 * roughness/metalness differences, while small node-local accents provide depth
 * and identity around encounters. All lights are deliberately shadowless for
 * mobile performance.
 */
export function addUndergroundDepthLighting(
  scene: THREE.Scene,
  routes: Map<string, RuntimeRoute>,
  world: RunWorld,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'arkour-underground-depth-lighting';

  const hemisphere = new THREE.HemisphereLight(0x6a9ca4, 0x11080b, 1.05);
  group.add(hemisphere);

  const coolKey = new THREE.DirectionalLight(0x8bcbd8, 1.55);
  coolKey.position.set(62, 94, 48);
  coolKey.castShadow = false;
  group.add(coolKey);

  const warmRim = new THREE.DirectionalLight(0xff7559, 1.0);
  warmRim.position.set(-74, -28, -58);
  warmRim.castShadow = false;
  group.add(warmRim);

  const frame = createRouteFrame();
  for (const routeSpec of world.routes) {
    const route = routes.get(routeSpec.id);
    if (!route) continue;

    for (const encounter of routeSpec.encounters ?? []) {
      sampleRouteFrameAtDistance(route, encounter.at * route.length, frame);
      const light = new THREE.PointLight(accentColour(encounter), 3.6, 42, 1.85);
      light.position.copy(frame.position)
        .addScaledVector(frame.right, 5.5)
        .addScaledVector(frame.up, 3.6)
        .addScaledVector(frame.forward, -1.5);
      light.castShadow = false;
      group.add(light);
    }
  }

  scene.add(group);
  return group;
}
