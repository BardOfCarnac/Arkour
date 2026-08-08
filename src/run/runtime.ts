import * as THREE from 'three';
import { CameraRig } from './camera-rig';
import { RunInput, type RunAction } from './input';
import { RuntimeRoute } from './route';
import { addScenePlan } from './scenery';
import type { ScenePlan } from './scene-plan';
import type { EncounterSpec, JunctionSpec, RunState, RunWorld } from './types';
import { addParticles, addRouteGeometry } from './world';

interface RuntimeElements {
  canvasHost: HTMLElement;
  state: HTMLElement;
  route: HTMLElement;
  encounter: HTMLElement;
  encounterMeta: HTMLElement;
  range: HTMLElement;
  branchLayer: HTMLElement;
  holdButton: HTMLButtonElement;
  pauseButton: HTMLButtonElement;
  debug: HTMLElement;
}

export class RunRuntime {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(68, 1, 0.18, 600);
  private readonly routes = new Map<string, RuntimeRoute>();
  private readonly routeMeshes: Map<string, THREE.Mesh>;
  private readonly cameraRig = new CameraRig();
  private readonly input = new RunInput();
  private readonly clock = new THREE.Clock();

  private currentRoute: RuntimeRoute;
  private distance = 0;
  private readonly speed = 13;
  private state: RunState = 'TRANSIT';
  private held = false;
  private paused = false;
  private selectedExitIndex = 0;
  private activeJunction: JunctionSpec | null = null;
  private activeEncounter: EncounterSpec | null = null;
  private frame = 0;
  private elapsed = 0;
  private fps = 0;
  private fpsTime = 0;

  constructor(
    private readonly world: RunWorld,
    scenePlan: ScenePlan,
    private readonly elements: RuntimeElements,
  ) {
    for (const spec of world.routes) {
      this.routes.set(spec.id, new RuntimeRoute(spec));
    }

    const start = this.routes.get(world.startRoute);
    if (!start) throw new Error(`Unknown start route: ${world.startRoute}`);
    this.currentRoute = start;

    this.scene.background = new THREE.Color(0x020406);
    this.scene.fog = new THREE.FogExp2(0x02070b, 0.011);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.elements.canvasHost.appendChild(this.renderer.domElement);

    addScenePlan(this.scene, this.routes, scenePlan);
    addParticles(this.scene);
    this.routeMeshes = addRouteGeometry(this.scene, this.routes);
    this.highlightRoute(this.currentRoute.id);

    this.input.subscribe(this.onAction);
    this.elements.holdButton.addEventListener('click', () => this.input.emit('hold'));
    this.elements.pauseButton.addEventListener('click', () => this.input.emit('pause'));
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  start(): void {
    this.renderer.setAnimationLoop(this.tick);
  }

  destroy(): void {
    this.renderer.setAnimationLoop(null);
    this.input.destroy();
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }

  private tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;

    if (!this.paused) this.update(dt);

    this.cameraRig.update(this.camera, this.currentRoute, this.distance, dt, this.held, this.elapsed);
    this.updateBranchButtons();
    this.renderer.render(this.scene, this.camera);
    this.updateDebug(dt);
  };

  private update(dt: number): void {
    this.findJunction();
    this.findEncounter();

    if (!this.held) this.distance += this.speed * dt;

    if (this.activeJunction) {
      const junctionDistance = this.activeJunction.at * this.currentRoute.length;
      if (this.distance >= junctionDistance) {
        const exit = this.activeJunction.exits[this.selectedExitIndex];
        this.switchRoute(exit.routeId);
      }
    } else if (this.distance >= this.currentRoute.length) {
      this.distance = this.currentRoute.length;
      this.held = true;
      this.state = 'HELD';
      this.elements.holdButton.textContent = 'Resume';
    }

    if (this.held) this.state = 'HELD';
    this.updateHud();
  }

  private findJunction(): void {
    const junction = this.world.junctions.find((candidate) => candidate.incomingRoute === this.currentRoute.id);
    if (!junction) {
      this.activeJunction = null;
      return;
    }

    const junctionDistance = junction.at * this.currentRoute.length;
    const remaining = junctionDistance - this.distance;

    if (remaining <= junction.approachDistance && remaining >= -1) {
      if (this.activeJunction?.id !== junction.id) {
        this.selectedExitIndex = Math.max(
          0,
          junction.exits.findIndex((exit) => exit.routeId === junction.defaultExit),
        );
      }
      this.activeJunction = junction;
      this.state = 'APPROACH';
      this.renderBranchChoices();
    } else {
      this.activeJunction = null;
      this.clearBranchChoices();
    }
  }

  private findEncounter(): void {
    const encounters = this.currentRoute.spec.encounters ?? [];
    let nearest: EncounterSpec | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const encounter of encounters) {
      const encounterDistance = encounter.at * this.currentRoute.length;
      const delta = encounterDistance - this.distance;
      if (delta >= -encounter.engageDistance && delta < nearestDistance && delta <= encounter.approachDistance) {
        nearest = encounter;
        nearestDistance = delta;
      }
    }

    this.activeEncounter = nearest;
    if (!this.held && nearest) {
      this.state = nearestDistance <= nearest.engageDistance ? 'ENGAGED' : 'APPROACH';
    } else if (!this.held && !this.activeJunction) {
      this.state = 'TRANSIT';
    }
  }

  private switchRoute(routeId: string): void {
    const next = this.routes.get(routeId);
    if (!next) throw new Error(`Unknown route: ${routeId}`);
    this.currentRoute = next;
    this.distance = 0.01;
    this.activeJunction = null;
    this.activeEncounter = null;
    this.state = 'RESUME';
    this.clearBranchChoices();
    this.highlightRoute(routeId);
  }

  private highlightRoute(routeId: string): void {
    for (const [id, mesh] of this.routeMeshes) {
      const material = mesh.material as THREE.MeshBasicMaterial;
      const active = id === routeId || id === 'trunk';
      material.color.setHex(active ? 0x2af1c8 : 0x426a82);
      material.opacity = active ? 0.95 : 0.34;
    }
  }

  private onAction = (action: RunAction): void => {
    if (action === 'hold') {
      this.held = !this.held;
      this.state = this.held ? 'HELD' : 'RESUME';
      this.elements.holdButton.textContent = this.held ? 'Resume' : 'Hold';
      return;
    }

    if (action === 'pause') {
      this.paused = !this.paused;
      this.elements.pauseButton.textContent = this.paused ? 'Unpause' : 'Pause';
      return;
    }

    if (!this.activeJunction) return;

    if (action === 'previous') {
      this.selectedExitIndex = (this.selectedExitIndex - 1 + this.activeJunction.exits.length) % this.activeJunction.exits.length;
      this.renderBranchChoices();
    }
    if (action === 'next') {
      this.selectedExitIndex = (this.selectedExitIndex + 1) % this.activeJunction.exits.length;
      this.renderBranchChoices();
    }
  };

  private renderBranchChoices(): void {
    if (!this.activeJunction) return;
    this.clearBranchChoices();

    this.activeJunction.exits.forEach((exit, index) => {
      const button = document.createElement('button');
      button.className = `branch-choice${index === this.selectedExitIndex ? ' selected' : ''}`;
      button.textContent = exit.label;
      button.dataset.routeId = exit.routeId;
      button.addEventListener('click', () => {
        this.selectedExitIndex = index;
        this.renderBranchChoices();
      });
      this.elements.branchLayer.appendChild(button);
    });
  }

  private clearBranchChoices(): void {
    this.elements.branchLayer.replaceChildren();
  }

  private updateBranchButtons(): void {
    if (!this.activeJunction) return;
    const buttons = Array.from(this.elements.branchLayer.querySelectorAll<HTMLButtonElement>('.branch-choice'));
    const rect = this.renderer.domElement.getBoundingClientRect();

    this.activeJunction.exits.forEach((exit, index) => {
      const route = this.routes.get(exit.routeId);
      const button = buttons[index];
      if (!route || !button) return;

      const point = route.pointAtDistance(route.length * exit.markerAt).project(this.camera);
      const x = (point.x * 0.5 + 0.5) * rect.width;
      const y = (-point.y * 0.5 + 0.5) * rect.height;
      button.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      button.style.opacity = point.z > 1 ? '0' : '1';
    });
  }

  private updateHud(): void {
    this.elements.state.textContent = this.paused ? 'PAUSED' : this.state;
    this.elements.route.textContent = this.currentRoute.label.toUpperCase();

    if (this.activeEncounter) {
      const encounterDistance = this.activeEncounter.at * this.currentRoute.length;
      const range = Math.max(0, encounterDistance - this.distance);
      this.elements.encounter.textContent = this.activeEncounter.label;
      this.elements.encounterMeta.textContent = this.activeEncounter.meta;
      this.elements.range.textContent = range <= 0.5 ? 'PASSING' : `${Math.round(range)} m`;
    } else if (this.activeJunction) {
      const junctionDistance = this.activeJunction.at * this.currentRoute.length;
      this.elements.encounter.textContent = 'ROUTE FORK';
      this.elements.encounterMeta.textContent = 'SELECT PATH';
      this.elements.range.textContent = `${Math.max(0, Math.round(junctionDistance - this.distance))} m`;
    } else {
      this.elements.encounter.textContent = '';
      this.elements.encounterMeta.textContent = '';
      this.elements.range.textContent = '';
    }
  }

  private updateDebug(dt: number): void {
    this.frame += 1;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frame / this.fpsTime);
      this.frame = 0;
      this.fpsTime = 0;
    }

    this.elements.debug.textContent = [
      `route ${this.currentRoute.id}`,
      `distance ${this.distance.toFixed(1)} / ${this.currentRoute.length.toFixed(1)}`,
      `state ${this.state}`,
      `fps ${this.fps}`,
      '←/→ choose · Space hold · Esc pause',
    ].join('\n');
  }

  private resize = (): void => {
    const width = this.elements.canvasHost.clientWidth;
    const height = this.elements.canvasHost.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };
}
