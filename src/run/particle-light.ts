import * as THREE from 'three';
import type { RuntimeRoute } from './route';
import type { ThemeSettings } from './theme';

const W = 12;
const H = 8;
const SPAN_X = 96;
const SPAN_Y = 72;
const DEPTH = 140;
const PROBES: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.34], [0.31, 0.48], [0.69, 0.46], [0.42, 0.68], [0.74, 0.69],
];

interface Shaft {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  colour: THREE.Color;
  x: number;
  y: number;
  strength: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smooth = (value: number): number => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  return canvas;
}

function drawDefault(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const gradient = context.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, '#58cbed');
  gradient.addColorStop(0.45, '#dff5f5');
  gradient.addColorStop(0.72, '#ed6b5d');
  gradient.addColorStop(1, '#071116');
  context.fillStyle = gradient;
  context.fillRect(0, 0, W, H);
}

export class ParticleLightField {
  private readonly canvas = makeCanvas();
  private pixels = new Uint8ClampedArray(W * H * 4);
  private readonly group = new THREE.Group();
  private readonly shafts: Shaft[] = [];
  private readonly origin = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly relative = new THREE.Vector3();
  private settings: ThemeSettings = { strength: 0.82, mottleStrength: 0.68, mottleScale: 0.46, darkLift: 0.24 };

  constructor(private readonly scene: THREE.Scene, route: RuntimeRoute) {
    drawDefault(this.canvas);
    this.refresh();
    const start = route.curve.getPointAt(0);
    this.forward.copy(route.curve.getTangentAt(0)).normalize();
    const seed = Math.abs(this.forward.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    this.right.crossVectors(this.forward, seed).normalize();
    this.up.crossVectors(this.right, this.forward).normalize();
    this.origin.copy(start).addScaledVector(this.forward, -1.5);
    this.createShafts();
  }

  setSettings(settings: Partial<ThemeSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.updateShafts();
  }

  resetField(): void {
    drawDefault(this.canvas);
    this.refresh();
    this.updateShafts();
  }

  async loadImage(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    try {
      const context = this.canvas.getContext('2d');
      if (!context) return;
      const scale = Math.max(W / bitmap.width, H / bitmap.height);
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      context.fillStyle = '#000';
      context.fillRect(0, 0, W, H);
      context.drawImage(bitmap, (W - width) / 2, (H - height) / 2, width, height);
      this.refresh();
      this.updateShafts();
    } finally {
      bitmap.close();
    }
  }

  sampleLight(position: THREE.Vector3, target: THREE.Color): number {
    target.setRGB(0, 0, 0);
    this.relative.copy(position).sub(this.origin);
    const depth = this.relative.dot(this.forward);
    if (depth < 0 || depth > DEPTH) return 0;
    const x = this.relative.dot(this.right);
    const y = this.relative.dot(this.up);
    const depth01 = depth / DEPTH;
    const radius = THREE.MathUtils.lerp(3.2, 10.2, depth01);
    let total = 0;
    for (const shaft of this.shafts) {
      const distance = Math.hypot(x - shaft.x, y - shaft.y);
      if (distance >= radius) continue;
      const radial = 1 - smooth((distance - radius * 0.15) / (radius * 0.85));
      const weight = shaft.strength * radial * (1 - depth01 * 0.42);
      target.r += shaft.colour.r * weight;
      target.g += shaft.colour.g * weight;
      target.b += shaft.colour.b * weight;
      total += weight;
    }
    if (total <= 0.0001) return 0;
    target.multiplyScalar(1 / total);
    return clamp01(total);
  }

  destroy(): void {
    for (const shaft of this.shafts) {
      shaft.mesh.geometry.dispose();
      shaft.material.dispose();
    }
    this.scene.remove(this.group);
  }

  private refresh(): void {
    const context = this.canvas.getContext('2d');
    if (context) this.pixels = context.getImageData(0, 0, W, H).data;
  }

  private sample(u: number, v: number, target: THREE.Color): void {
    const x = Math.round(u * (W - 1));
    const y = Math.round(v * (H - 1));
    const index = (y * W + x) * 4;
    target.setRGB(this.pixels[index] / 255, this.pixels[index + 1] / 255, this.pixels[index + 2] / 255);
    const luminance = target.r * 0.2126 + target.g * 0.7152 + target.b * 0.0722;
    if (luminance < 0.12 && this.settings.darkLift > 0) {
      target.lerp(new THREE.Color(u > 0.5 ? 0x1d0709 : 0x06171b), this.settings.darkLift * 0.7);
    }
  }

  private createShafts(): void {
    const localY = new THREE.Vector3(0, 1, 0);
    for (const [u, v] of PROBES) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(10.2, 3.2, DEPTH, 12, 1, true), material);
      mesh.quaternion.setFromUnitVectors(localY, this.forward);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.shafts.push({ mesh, material, colour: new THREE.Color(), x: (u - 0.5) * SPAN_X, y: (v - 0.5) * SPAN_Y, strength: 0 });
    }
    this.scene.add(this.group);
    this.updateShafts();
  }

  private updateShafts(): void {
    this.shafts.forEach((shaft, index) => {
      const probe = PROBES[index] ?? [0.5, 0.5];
      this.sample(probe[0], probe[1], shaft.colour);
      const luminance = shaft.colour.r * 0.2126 + shaft.colour.g * 0.7152 + shaft.colour.b * 0.0722;
      shaft.strength = clamp01((luminance * 1.2 + this.settings.darkLift * 0.05) * this.settings.strength);
      shaft.material.color.copy(shaft.colour);
      shaft.material.opacity = shaft.strength * 0.1;
      shaft.mesh.position.copy(this.origin)
        .addScaledVector(this.right, shaft.x)
        .addScaledVector(this.up, shaft.y)
        .addScaledVector(this.forward, DEPTH * 0.5);
    });
  }
}
