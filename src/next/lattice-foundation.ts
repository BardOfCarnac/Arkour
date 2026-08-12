import * as THREE from 'three';
import { generateNodeFormPlan } from '../architecture/node-forms';
import type { SpatialKeepout } from '../run/keepout';
import { addPasswordBlockers, type PasswordBlockers } from '../run/password-blockers';
import { createRouteFrame, sampleRouteFrameAtDistance } from '../run/route-frame';
import type { RuntimeRoute } from '../run/route';
import type { EncounterSpec, RunWorld } from '../run/types';
import { AVATAR_SCALE } from './avatar-scale';
import { addUndergroundDepthLighting } from './depth-lighting';
import { HoldCircuitSystem, type HoldPose } from './hold-circuits';
import { addSparseLatticeChassis } from './lattice-chassis';
import { addLatticeVolumeCity } from './lattice-volume';
import { addMacrostructureProxies } from './macrostructure-proxies';
import { addLatticeNodeSeals, collectAttachmentTargets } from './node-seals';
import { createNextPresentationKeepout } from './presentation-keepout';

function addWireAccents(root: THREE.Object3D): void {
  const material = new THREE.LineBasicMaterial({
    color: 0x24494d,
    transparent: true,
    opacity: 0.34,
  });
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh
      && !(object instanceof THREE.InstancedMesh)
      && object.userData.noWireAccent !== true
    ) {
      meshes.push(object);
    }
  });
  for (const mesh of meshes) {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), material);
    mesh.add(lines);
  }
}

/**
 * Native runtime owner for the new Arkour foundation. World-space providers use
 * the same spatial admission authority as ordinary scenery. Password sealing is
 * a separate hard gameplay boundary; lattice/chassis targets only decorate it.
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
    keepout?: SpatialKeepout,
  ) {
    const interactions = generateNodeFormPlan(world);
    const spatialKeepout = keepout ?? createNextPresentationKeepout(world, routes);

    // Macroarchitecture gets first claim on safe world-space volume. The current
    // shapes are deliberately crude proxies: their job is to prove ownership and
    // scale before any of the experimental building vocabularies are promoted.
    const macrostructures = addMacrostructureProxies(scene, world, spatialKeepout);
    const lattice = addLatticeVolumeCity(scene, world, {
      seed: 4712,
      // At 350 m per NET floor the absolute lattice volume is roughly two orders
      // of magnitude larger than the old 36 m test world. Keep the 18 m cell size
      // and machinery dimensions physical, but sample occupancy much more sparsely
      // so mobile cost does not grow with the new kilometre-scale bounds.
      density: AVATAR_SCALE.latticeDensity,
      claims: macrostructures.claims,
    });
    const chassis = addSparseLatticeChassis(scene, world, spatialKeepout);

    // Targets are cosmetic integration points only. The Password seal itself is
    // now guaranteed independently as a complete level boundary.
    const attachmentTargets = collectAttachmentTargets(macrostructures.group, lattice, chassis);
    const seals = addLatticeNodeSeals(
      scene,
      routes,
      world,
      interactions,
      attachmentTargets,
      spatialKeepout,
    );

    addWireAccents(macrostructures.group);
    addWireAccents(lattice);
    addWireAccents(chassis);
    addWireAccents(seals);
    addUndergroundDepthLighting(scene, routes, world);

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

    const encounterDistance = encounter.at * pose.route.length;
    sampleRouteFrameAtDistance(pose.route, encounterDistance, this.nodeFrame);

    const shoulder = pose.offset.right >= 0 ? 2.7 : -2.7;
    this.cameraPosition.copy(this.runnerPosition)
      .addScaledVector(this.holdFrame.right, shoulder)
      .addScaledVector(this.holdFrame.up, 1.65)
      .addScaledVector(this.holdFrame.forward, -6.4);
    camera.position.copy(this.cameraPosition);
    camera.up.copy(this.nodeFrame.up);

    this.target.copy(this.nodeFrame.position)
      .addScaledVector(this.nodeFrame.up, 0.2)
      .addScaledVector(this.nodeFrame.forward, 0.35);
    camera.lookAt(this.target);
    return true;
  }
}
