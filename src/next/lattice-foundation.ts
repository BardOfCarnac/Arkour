import * as THREE from 'three';
import { generateNodeFormPlan } from '../architecture/node-forms';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import type { RuntimeRoute } from '../run/route';
import type { EncounterSpec, RunWorld } from '../run/types';
import { HoldCircuitSystem } from './hold-circuits';
import { addLatticeVolumeCity } from './lattice-volume';
import type { NextAcceptanceRuntime } from './runtime';

interface RuntimeBridge {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  routes: Map<string, RuntimeRoute>;
  pendingEncounter?: EncounterSpec;
}

function addWireAccents(root: THREE.Object3D): void {
  const material = new THREE.LineBasicMaterial({
    color: 0x24494d,
    transparent: true,
    opacity: 0.34,
  });
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh)) meshes.push(object);
  });
  for (const mesh of meshes) {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), material);
    mesh.add(lines);
  }
}

/**
 * Runtime reconciliation bridge for the new foundation. It adds the global
 * absolute lattice volume after the canonical runtime has constructed its node
 * scenery, renders physical hold circuits from the interaction contract, and
 * applies the same hold sample to both runner glyph and first-person camera.
 */
export function attachLatticeFoundation(runtime: NextAcceptanceRuntime, world: RunWorld): void {
  const bridge = runtime as unknown as RuntimeBridge;
  const interactions = generateNodeFormPlan(world);
  const lattice = addLatticeVolumeCity(bridge.scene, world, { seed: 4712, density: 0.31 });
  addWireAccents(lattice);

  const holds = new HoldCircuitSystem(bridge.scene, bridge.routes, world, interactions);
  const originalRender = bridge.renderer.render.bind(bridge.renderer);
  const holdFrame = createRouteFrame();
  const nodeFrame = createRouteFrame();
  const target = new THREE.Vector3();
  const runnerPosition = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();

  bridge.renderer.render = ((scene: THREE.Scene, camera: THREE.Camera): void => {
    const encounter = bridge.pendingEncounter;
    if (encounter && camera instanceof THREE.PerspectiveCamera) {
      const pose = holds.sample(encounter.id, performance.now() / 1000);
      if (pose) {
        sampleRouteFrameAtDistance(pose.route, pose.distance, holdFrame);
        runnerPosition.copy(holdFrame.position)
          .addScaledVector(holdFrame.right, pose.offset.right)
          .addScaledVector(holdFrame.up, pose.offset.up)
          .addScaledVector(holdFrame.forward, pose.offset.forward);

        cameraPosition.copy(runnerPosition)
          .addScaledVector(holdFrame.up, 1.25)
          .addScaledVector(holdFrame.forward, -3.4);
        camera.position.copy(cameraPosition);

        const encounterDistance = encounter.at * pose.route.length;
        sampleRouteFrameAtDistance(pose.route, encounterDistance, nodeFrame);
        target.copy(nodeFrame.position).addScaledVector(nodeFrame.up, 0.3);
        camera.lookAt(target);
      }
    }
    originalRender(scene, camera);
  }) as THREE.WebGLRenderer['render'];

  // RunnerEntity updates earlier in the animation frame. Applying the sampled
  // offset afterwards means the glyph follows the physical circuit without
  // duplicating its pose/animation logic.
  const updateRunner = (): void => {
    const encounter = bridge.pendingEncounter;
    const runner = bridge.scene.getObjectByName('arkour-runner');
    if (encounter && runner) {
      const pose = holds.sample(encounter.id, performance.now() / 1000);
      if (pose) {
        sampleRouteFrameAtDistance(pose.route, pose.distance, holdFrame);
        runner.position.copy(holdFrame.position)
          .addScaledVector(holdFrame.right, pose.offset.right)
          .addScaledVector(holdFrame.up, pose.offset.up + 0.12)
          .addScaledVector(holdFrame.forward, pose.offset.forward);
      }
    }
    requestAnimationFrame(updateRunner);
  };
  requestAnimationFrame(updateRunner);
}
