import * as THREE from 'three';
import { generateNodeFormPlan } from '../architecture/node-forms';
import { addPasswordBlockers, type PasswordBlockers } from '../run/password-blockers';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import type { RuntimeRoute } from '../run/route';
import type { EncounterSpec, RunWorld } from '../run/types';
import { HoldCircuitSystem, type HoldPose } from './hold-circuits';
import { addSparseLatticeChassis } from './lattice-chassis';
import { addLatticeVolumeCity } from './lattice-volume';

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
 * Native runtime owner for the new Arkour foundation. The runtime calls this
 * subsystem directly during its own animation tick; there is no renderer
 * monkey-patch and no second requestAnimationFrame loop.
 */
export class LatticeFoundation {
  private readonly holds: HoldCircuitSystem;
  private readonly blockers: PasswordBlockers;
  private readonly holdFrame = createRouteFrame();
  private readonly nodeFrame = createRouteFrame();
  private readonly runnerPosition = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    routes: Map<string, RuntimeRoute>,
    world: RunWorld,
  ) {
    const interactions = generateNodeFormPlan(world);

    const lattice = addLatticeVolumeCity(scene, world, { seed: 4712, density: 0.18 });
    addWireAccents(lattice);

    const chassis = addSparseLatticeChassis(scene, world);
    addWireAccents(chassis);

    this.holds = new HoldCircuitSystem(scene, routes, world, interactions);
    this.blockers = addPasswordBlockers(scene, routes, world);
  }

  update(dt: number): void {
    this.blockers.update(dt);
  }

  anchorDistance(encounterId: string): number | undefined {
    return this.holds.anchorDistance(encounterId);
  }

  sampleHold(encounterId: string, nowSeconds: number): HoldPose | undefined {
    return this.holds.sample(encounterId, nowSeconds);
  }

  resolveEncounter(encounterId: string): void {
    this.blockers.resolve(encounterId);
  }

  reset(): void {
    this.blockers.resetAll();
  }

  /**
   * Applies the physical hold circuit to both the first-person camera and the
   * visible Runner glyph immediately before the runtime renders the frame.
   */
  applyHoldPresentation(
    camera: THREE.PerspectiveCamera,
    runner: THREE.Object3D | undefined,
    encounter: EncounterSpec,
    nowSeconds: number,
  ): boolean {
    const pose = this.sampleHold(encounter.id, nowSeconds);
    if (!pose) return false;

    sampleRouteFrameAtDistance(pose.route, pose.distance, this.holdFrame);
    this.runnerPosition.copy(this.holdFrame.position)
      .addScaledVector(this.holdFrame.right, pose.offset.right)
      .addScaledVector(this.holdFrame.up, pose.offset.up)
      .addScaledVector(this.holdFrame.forward, pose.offset.forward);

    if (runner) {
      runner.position.copy(this.runnerPosition)
        .addScaledVector(this.holdFrame.up, 0.12);
    }

    this.cameraPosition.copy(this.runnerPosition)
      .addScaledVector(this.holdFrame.up, 1.25)
      .addScaledVector(this.holdFrame.forward, -3.4);
    camera.position.copy(this.cameraPosition);

    const encounterDistance = encounter.at * pose.route.length;
    sampleRouteFrameAtDistance(pose.route, encounterDistance, this.nodeFrame);
    this.target.copy(this.nodeFrame.position).addScaledVector(this.nodeFrame.up, 0.3);
    camera.lookAt(this.target);
    return true;
  }
}
