import * as THREE from 'three';
import type { RuntimeRoute } from './route';

export interface ThemeSettings {
  strength: number;
  mottleStrength: number;
  mottleScale: number;
  darkLift: number;
}

interface ThemedMaterial {
  object: THREE.Object3D;
  material: THREE.MeshStandardMaterial;
  neutral: THREE.Color;
  response: number;
}

const FIELD_WIDTH = 24;
const FIELD_HEIGHT = 16;
const FIELD_SPAN_X = 120;
const FIELD_SPAN_Y = 90;
const FIELD_DEPTH = 155;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, u), THREE.MathUtils.lerp(c, d, u), v);
}

function createFieldCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FIELD_WIDTH;
  canvas.height = FIELD_HEIGHT;
  return canvas;
}

function drawDefaultField(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;

  const base = context.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, '#58cbed');
  base.addColorStop(0.44, '#dff5f5');
  base.addColorStop(0.7, '#ed6b5d');
  base.addColorStop(1, '#071116');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const coral = context.createRadialGradient(18, 7, 0, 18, 7, 12);
  coral.addColorStop(0, 'rgba(245, 101, 83, .95)');
  coral.addColorStop(0.65, 'rgba(219, 75, 68, .45)');
  coral.addColorStop(1, 'rgba(120, 30, 30, 0)');
  context.fillStyle = coral;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function projectorBasis(forward: THREE.Vector3): { right: THREE.Vector3; up: THREE.Vector3 } {
  const seed = Math.abs(forward.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, seed).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return { right, up };
}

export class SceneTheme {
  private readonly fieldCanvas = createFieldCanvas();
  private readonly themed: ThemedMaterial[] = [];
  private fieldPixels = new Uint8ClampedArray(FIELD_WIDTH * FIELD_HEIGHT * 4);
  private readonly origin = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly worldPosition = new THREE.Vector3();
  private readonly relative = new THREE.Vector3();
  private settings: ThemeSettings = {
    strength: 0.82,
    mottleStrength: 0.68,
    mottleScale: 0.46,
    darkLift: 0.24,
  };

  constructor(private readonly scene: THREE.Scene, private readonly startRoute: RuntimeRoute) {
    drawDefaultField(this.fieldCanvas);
    this.refreshPixels();

    const start = this.startRoute.curve.getPointAt(0);
    this.forward.copy(this.startRoute.curve.getTangentAt(0)).normalize();
    const basis = projectorBasis(this.forward);
    this.right.copy(basis.right);
    this.up.copy(basis.up);
    this.origin.copy(start).addScaledVector(this.forward, -1.5);
  }

  attach(): void {
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      const source = Array.isArray(object.material) ? object.material : [object.material];
      const replacements = source.map((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return material;

        const clone = material.clone();
        const luminance = clone.color.r * 0.2126 + clone.color.g * 0.7152 + clone.color.b * 0.0722;
        const level = THREE.MathUtils.clamp(luminance * 0.35, 0.022, 0.12);
        const neutral = new THREE.Color(level, level, level);
        clone.color.copy(neutral);
        clone.emissive.setRGB(0, 0, 0);
        clone.emissiveIntensity = 0;

        this.themed.push({
          object,
          material: clone,
          neutral,
          response: clone.metalness > 0.65 ? 1 : clone.roughness > 0.78 ? 0.78 : 0.9,
        });
        return clone;
      });

      object.material = Array.isArray(object.material) ? replacements : replacements[0];
    });

    this.apply();
  }

  setSettings(settings: Partial<ThemeSettings>): void {
    this.settings = {
      strength: settings.strength === undefined ? this.settings.strength : clamp01(settings.strength),
      mottleStrength: settings.mottleStrength === undefined ? this.settings.mottleStrength : clamp01(settings.mottleStrength),
      mottleScale: settings.mottleScale === undefined ? this.settings.mottleScale : clamp01(settings.mottleScale),
      darkLift: settings.darkLift === undefined ? this.settings.darkLift : clamp01(settings.darkLift),
    };
    this.apply();
  }

  resetField(): void {
    drawDefaultField(this.fieldCanvas);
    this.refreshPixels();
    this.apply();
  }

  async loadImage(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    try {
      const staging = document.createElement('canvas');
      staging.width = 192;
      staging.height = 128;
      const stagingContext = staging.getContext('2d');
      const fieldContext = this.fieldCanvas.getContext('2d');
      if (!stagingContext || !fieldContext) return;

      stagingContext.fillStyle = '#000';
      stagingContext.fillRect(0, 0, staging.width, staging.height);
      const scale = Math.max(staging.width / bitmap.width, staging.height / bitmap.height);
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      stagingContext.drawImage(bitmap, (staging.width - width) / 2, (staging.height - height) / 2, width, height);

      fieldContext.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
      fieldContext.imageSmoothingEnabled = true;
      fieldContext.imageSmoothingQuality = 'high';
      fieldContext.drawImage(staging, 0, 0, FIELD_WIDTH, FIELD_HEIGHT);
      this.refreshPixels();
      this.apply();
    } finally {
      bitmap.close();
    }
  }

  destroy(): void {
    for (const entry of this.themed) entry.material.dispose();
    this.themed.length = 0;
  }

  private refreshPixels(): void {
    const context = this.fieldCanvas.getContext('2d');
    if (!context) return;
    this.fieldPixels = context.getImageData(0, 0, FIELD_WIDTH, FIELD_HEIGHT).data;
  }

  private sampleField(u: number, v: number): THREE.Color {
    const x = Math.round(clamp01(u) * (FIELD_WIDTH - 1));
    const y = Math.round(clamp01(v) * (FIELD_HEIGHT - 1));
    const index = (y * FIELD_WIDTH + x) * 4;
    return new THREE.Color(
      this.fieldPixels[index] / 255,
      this.fieldPixels[index + 1] / 255,
      this.fieldPixels[index + 2] / 255,
    );
  }

  private projectedColour(position: THREE.Vector3): { colour: THREE.Color; intensity: number } {
    this.relative.copy(position).sub(this.origin);
    const depth = this.relative.dot(this.forward);
    const px = this.relative.dot(this.right);
    const py = this.relative.dot(this.up);
    let u = px / FIELD_SPAN_X + 0.5;
    let v = py / FIELD_SPAN_Y + 0.5;

    if (depth < -1 || u < 0 || u > 1 || v < 0 || v > 1) {
      return { colour: new THREE.Color(0, 0, 0), intensity: 0 };
    }

    const depth01 = clamp01(Math.max(0, depth) / FIELD_DEPTH);
    const scale = THREE.MathUtils.lerp(0.018, 0.108, this.settings.mottleScale);
    const broad = noise2(px * scale * 0.45 + depth * 0.006 + 11, py * scale * 0.45 - 7) - 0.5;
    const fine = noise2(px * scale * 2.2 - depth * 0.012 - 29, py * scale * 2.2 + 19) - 0.5;
    u += broad * (0.012 + depth01 * 0.026) * this.settings.mottleStrength;
    v += fine * (0.012 + depth01 * 0.026) * this.settings.mottleStrength;

    const colour = this.sampleField(u, v);
    const mottle = Math.max(0.5, 1 + broad * 0.55 * this.settings.mottleStrength + fine * 0.22 * this.settings.mottleStrength);
    colour.multiplyScalar(mottle);

    const luminance = colour.r * 0.2126 + colour.g * 0.7152 + colour.b * 0.0722;
    if (luminance < 0.2 && this.settings.darkLift > 0) {
      const darkTeal = new THREE.Color(0x06171b);
      const oxblood = new THREE.Color(0x1d0709);
      const fallback = darkTeal.lerp(oxblood, noise2(px * scale * 0.72 + 4, py * scale * 0.72 + 4));
      const mask = (1 - smoothstep((luminance - 0.025) / 0.175)) * this.settings.darkLift;
      const lift = this.settings.darkLift * 0.12;
      colour.lerp(fallback, mask);
      colour.r += fallback.r * lift;
      colour.g += fallback.g * lift;
      colour.b += fallback.b * lift;
    }

    const depthFade = THREE.MathUtils.lerp(1, 0.16, smoothstep(depth01));
    return { colour, intensity: depthFade };
  }

  private apply(): void {
    this.scene.updateMatrixWorld(true);
    for (const entry of this.themed) {
      entry.object.getWorldPosition(this.worldPosition);
      const projected = this.projectedColour(this.worldPosition);
      const amount = this.settings.strength * entry.response * projected.intensity;

      entry.material.color.copy(entry.neutral).lerp(projected.colour, amount * 0.9);
      entry.material.emissive.copy(projected.colour);
      entry.material.emissiveIntensity = amount * 0.72;
      entry.material.needsUpdate = true;
    }
  }
}
