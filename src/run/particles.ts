import * as THREE from 'three';
import { seededRandom } from './random';
import type { ParticleLightSampler } from './particle-light-types';

const AMBIENT_COUNT = 360;
const WAKE_COUNT = 560;
const WAKE_RATE = 34;
const AMBIENT_TOP = 24;
const AMBIENT_BOTTOM = -244;

const AMBIENT_BASE = new THREE.Color(0x71838d);
const WAKE_BASE = new THREE.Color(0xd7edf0);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export class RunParticles {
  private readonly random = seededRandom(0x50415254);
  private readonly ambientPositions = new Float32Array(AMBIENT_COUNT * 3);
  private readonly ambientColours = new Float32Array(AMBIENT_COUNT * 3);
  private readonly ambientSpeeds = new Float32Array(AMBIENT_COUNT);
  private readonly ambientDriftX = new Float32Array(AMBIENT_COUNT);
  private readonly ambientDriftZ = new Float32Array(AMBIENT_COUNT);
  private readonly ambientGeometry = new THREE.BufferGeometry();
  private readonly ambientMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    vertexColors: true,
    sizeAttenuation: true,
  });
  private readonly ambientPoints: THREE.Points;

  private readonly wakePositions = new Float32Array(WAKE_COUNT * 3);
  private readonly wakeColours = new Float32Array(WAKE_COUNT * 3);
  private readonly wakeVelocity = new Float32Array(WAKE_COUNT * 3);
  private readonly wakeAge = new Float32Array(WAKE_COUNT);
  private readonly wakeLife = new Float32Array(WAKE_COUNT);
  private readonly wakePhase = new Float32Array(WAKE_COUNT);
  private readonly wakeFrequency = new Float32Array(WAKE_COUNT);
  private readonly wakeWander = new Float32Array(WAKE_COUNT);
  private readonly wakeGeometry = new THREE.BufferGeometry();
  private readonly wakeMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.19,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    vertexColors: true,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  });
  private readonly wakePoints: THREE.Points;

  private readonly samplePosition = new THREE.Vector3();
  private readonly lightColour = new THREE.Color();
  private readonly displayColour = new THREE.Color();
  private wakeCursor = 0;
  private wakeAccumulator = 0;
  private colourAccumulator = 0;

  constructor(private readonly scene: THREE.Scene, private readonly theme: ParticleLightSampler) {
    this.seedAmbient();

    for (let index = 0; index < WAKE_COUNT; index += 1) {
      const base = index * 3;
      this.wakePositions[base + 1] = AMBIENT_BOTTOM - 1000;
    }

    this.ambientGeometry.setAttribute('position', new THREE.BufferAttribute(this.ambientPositions, 3));
    this.ambientGeometry.setAttribute('color', new THREE.BufferAttribute(this.ambientColours, 3));
    this.ambientPoints = new THREE.Points(this.ambientGeometry, this.ambientMaterial);
    this.ambientPoints.frustumCulled = false;
    this.ambientPoints.name = 'ambient-particles';
    this.scene.add(this.ambientPoints);

    this.wakeGeometry.setAttribute('position', new THREE.BufferAttribute(this.wakePositions, 3));
    this.wakeGeometry.setAttribute('color', new THREE.BufferAttribute(this.wakeColours, 3));
    this.wakePoints = new THREE.Points(this.wakeGeometry, this.wakeMaterial);
    this.wakePoints.frustumCulled = false;
    this.wakePoints.name = 'runner-wake';
    this.scene.add(this.wakePoints);

    this.refreshColours();
  }

  update(dt: number, runnerPosition: THREE.Vector3): void {
    this.updateAmbient(dt);
    this.emitWake(dt, runnerPosition);
    this.updateWake(dt);

    this.colourAccumulator += dt;
    if (this.colourAccumulator >= 0.08) {
      this.colourAccumulator %= 0.08;
      this.refreshColours();
    }
  }

  destroy(): void {
    this.scene.remove(this.ambientPoints, this.wakePoints);
    this.ambientGeometry.dispose();
    this.ambientMaterial.dispose();
    this.wakeGeometry.dispose();
    this.wakeMaterial.dispose();
  }

  private seedAmbient(): void {
    for (let index = 0; index < AMBIENT_COUNT; index += 1) {
      const base = index * 3;
      this.ambientPositions[base] = (this.random() - 0.5) * 150;
      this.ambientPositions[base + 1] = THREE.MathUtils.lerp(AMBIENT_BOTTOM, AMBIENT_TOP, this.random());
      this.ambientPositions[base + 2] = this.random() * 115 - 38;
      this.ambientSpeeds[index] = THREE.MathUtils.lerp(1.15, 3.2, this.random());
      this.ambientDriftX[index] = (this.random() - 0.5) * 0.26;
      this.ambientDriftZ[index] = (this.random() - 0.5) * 0.22;
    }
  }

  private updateAmbient(dt: number): void {
    for (let index = 0; index < AMBIENT_COUNT; index += 1) {
      const base = index * 3;
      this.ambientPositions[base] += this.ambientDriftX[index] * dt;
      this.ambientPositions[base + 1] -= this.ambientSpeeds[index] * dt;
      this.ambientPositions[base + 2] += this.ambientDriftZ[index] * dt;

      if (this.ambientPositions[base + 1] < AMBIENT_BOTTOM) {
        this.ambientPositions[base] = (this.random() - 0.5) * 150;
        this.ambientPositions[base + 1] = AMBIENT_TOP + this.random() * 9;
        this.ambientPositions[base + 2] = this.random() * 115 - 38;
      }
    }
    (this.ambientGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private emitWake(dt: number, runnerPosition: THREE.Vector3): void {
    this.wakeAccumulator += dt * WAKE_RATE;
    const spawnCount = Math.floor(this.wakeAccumulator);
    this.wakeAccumulator -= spawnCount;

    for (let spawn = 0; spawn < spawnCount; spawn += 1) {
      const index = this.wakeCursor;
      const base = index * 3;
      this.wakeCursor = (this.wakeCursor + 1) % WAKE_COUNT;

      this.wakePositions[base] = runnerPosition.x + (this.random() - 0.5) * 0.34;
      this.wakePositions[base + 1] = runnerPosition.y + (this.random() - 0.5) * 0.24;
      this.wakePositions[base + 2] = runnerPosition.z + (this.random() - 0.5) * 0.34;

      this.wakeVelocity[base] = (this.random() - 0.5) * 0.08;
      this.wakeVelocity[base + 1] = THREE.MathUtils.lerp(0.52, 0.88, this.random());
      this.wakeVelocity[base + 2] = (this.random() - 0.5) * 0.08;

      this.wakeAge[index] = 0;
      this.wakeLife[index] = THREE.MathUtils.lerp(18, 23, this.random());
      this.wakePhase[index] = this.random() * Math.PI * 2;
      this.wakeFrequency[index] = THREE.MathUtils.lerp(0.42, 1.05, this.random());
      this.wakeWander[index] = THREE.MathUtils.lerp(0.42, 0.95, this.random());
    }
  }

  private updateWake(dt: number): void {
    for (let index = 0; index < WAKE_COUNT; index += 1) {
      if (this.wakeLife[index] <= 0) continue;

      this.wakeAge[index] += dt;
      const age = this.wakeAge[index];
      const life = this.wakeLife[index];
      if (age >= life) {
        this.wakeLife[index] = 0;
        const base = index * 3;
        this.wakePositions[base + 1] = AMBIENT_BOTTOM - 1000;
        continue;
      }

      const age01 = age / life;
      const freedom = age01 * age01;
      const phase = this.wakePhase[index];
      const frequency = this.wakeFrequency[index];
      const wander = this.wakeWander[index] * freedom;
      const base = index * 3;

      this.wakeVelocity[base] += Math.sin(age * frequency + phase) * wander * dt;
      this.wakeVelocity[base + 1] += Math.sin(age * frequency * 0.47 + phase * 1.61) * wander * 0.12 * dt;
      this.wakeVelocity[base + 2] += Math.cos(age * frequency * 0.79 + phase * 0.73) * wander * dt;

      const lateralSpeed = Math.hypot(this.wakeVelocity[base], this.wakeVelocity[base + 2]);
      if (lateralSpeed > 1.65) {
        const scale = 1.65 / lateralSpeed;
        this.wakeVelocity[base] *= scale;
        this.wakeVelocity[base + 2] *= scale;
      }

      this.wakePositions[base] += this.wakeVelocity[base] * dt;
      this.wakePositions[base + 1] += this.wakeVelocity[base + 1] * dt;
      this.wakePositions[base + 2] += this.wakeVelocity[base + 2] * dt;
    }

    (this.wakeGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private refreshColours(): void {
    for (let index = 0; index < AMBIENT_COUNT; index += 1) {
      const base = index * 3;
      this.samplePosition.fromArray(this.ambientPositions, base);
      const light = this.theme.sampleLight(this.samplePosition, this.lightColour);
      this.displayColour.copy(AMBIENT_BASE).lerp(this.lightColour, light * 0.9);
      this.displayColour.multiplyScalar(0.72 + light * 0.58);
      this.ambientColours[base] = this.displayColour.r;
      this.ambientColours[base + 1] = this.displayColour.g;
      this.ambientColours[base + 2] = this.displayColour.b;
    }

    for (let index = 0; index < WAKE_COUNT; index += 1) {
      const base = index * 3;
      const life = this.wakeLife[index];
      if (life <= 0) {
        this.wakeColours[base] = 0;
        this.wakeColours[base + 1] = 0;
        this.wakeColours[base + 2] = 0;
        continue;
      }

      const age01 = this.wakeAge[index] / life;
      const oldFade = 1 - smoothstep((age01 - 0.62) / 0.38) * 0.68;
      this.samplePosition.fromArray(this.wakePositions, base);
      const light = this.theme.sampleLight(this.samplePosition, this.lightColour);
      this.displayColour.copy(WAKE_BASE).lerp(this.lightColour, light);
      this.displayColour.multiplyScalar((0.72 + light * 0.72) * oldFade);
      this.wakeColours[base] = this.displayColour.r;
      this.wakeColours[base + 1] = this.displayColour.g;
      this.wakeColours[base + 2] = this.displayColour.b;
    }

    (this.ambientGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (this.wakeGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
