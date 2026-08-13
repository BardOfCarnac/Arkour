import * as THREE from 'three';
import type { RuntimeRoute } from './route';

export interface ThemeSettings {
  strength: number;
  mottleStrength: number;
  mottleScale: number;
  darkLift: number;
}

const FIELD_WIDTH = 24;
const FIELD_HEIGHT = 16;
const PROJECTION_SIZE = new THREE.Vector2(120, 90);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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

  context.clearRect(0, 0, canvas.width, canvas.height);
  const base = context.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, '#5bc8ea');
  base.addColorStop(0.46, '#dcecf0');
  base.addColorStop(0.72, '#8d5149');
  base.addColorStop(1, '#101215');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const coral = context.createRadialGradient(
    canvas.width * 0.74,
    canvas.height * 0.43,
    0,
    canvas.width * 0.74,
    canvas.height * 0.43,
    canvas.width * 0.48,
  );
  coral.addColorStop(0, 'rgba(242, 101, 83, .96)');
  coral.addColorStop(0.62, 'rgba(225, 92, 78, .58)');
  coral.addColorStop(1, 'rgba(150, 55, 50, 0)');
  context.fillStyle = coral;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const cream = context.createRadialGradient(
    canvas.width * 0.48,
    canvas.height * 0.4,
    0,
    canvas.width * 0.48,
    canvas.height * 0.4,
    canvas.width * 0.34,
  );
  cream.addColorStop(0, 'rgba(255, 242, 221, .98)');
  cream.addColorStop(0.55, 'rgba(255, 227, 207, .5)');
  cream.addColorStop(1, 'rgba(255, 227, 207, 0)');
  context.fillStyle = cream;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const shadow = context.createLinearGradient(0, canvas.height * 0.55, canvas.width * 0.45, canvas.height);
  shadow.addColorStop(0, 'rgba(3, 10, 14, 0)');
  shadow.addColorStop(1, 'rgba(3, 8, 11, .86)');
  context.fillStyle = shadow;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

export class SceneTheme {
  private readonly fieldCanvas = createFieldCanvas();
  private readonly fieldTexture: THREE.CanvasTexture;
  private readonly decorated = new Set<THREE.MeshStandardMaterial>();
  private ceiling: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;

  private readonly uniforms = {
    uThemeField: { value: null as THREE.Texture | null },
    uThemeStrength: { value: 0.82 },
    uThemeMottleStrength: { value: 0.68 },
    uThemeMottleScale: { value: 0.46 },
    uThemeDarkLift: { value: 0.24 },
    uThemeProjectionSize: { value: PROJECTION_SIZE.clone() },
  };

  constructor(private readonly scene: THREE.Scene, private readonly startRoute: RuntimeRoute) {
    drawDefaultField(this.fieldCanvas);
    this.fieldTexture = new THREE.CanvasTexture(this.fieldCanvas);
    this.fieldTexture.colorSpace = THREE.SRGBColorSpace;
    this.fieldTexture.minFilter = THREE.LinearFilter;
    this.fieldTexture.magFilter = THREE.LinearFilter;
    this.fieldTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.fieldTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.uniforms.uThemeField.value = this.fieldTexture;
  }

  attach(): void {
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) this.decorateMaterial(material);
      }
    });
    this.addCeiling();
  }

  setSettings(settings: Partial<ThemeSettings>): void {
    if (settings.strength !== undefined) {
      this.uniforms.uThemeStrength.value = clamp01(settings.strength);
    }
    if (settings.mottleStrength !== undefined) {
      this.uniforms.uThemeMottleStrength.value = clamp01(settings.mottleStrength);
    }
    if (settings.mottleScale !== undefined) {
      this.uniforms.uThemeMottleScale.value = clamp01(settings.mottleScale);
    }
    if (settings.darkLift !== undefined) {
      this.uniforms.uThemeDarkLift.value = clamp01(settings.darkLift);
    }
  }

  resetField(): void {
    drawDefaultField(this.fieldCanvas);
    this.fieldTexture.needsUpdate = true;
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
      stagingContext.drawImage(
        bitmap,
        (staging.width - width) * 0.5,
        (staging.height - height) * 0.5,
        width,
        height,
      );

      fieldContext.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
      fieldContext.imageSmoothingEnabled = true;
      fieldContext.imageSmoothingQuality = 'high';
      fieldContext.drawImage(staging, 0, 0, FIELD_WIDTH, FIELD_HEIGHT);
      this.fieldTexture.needsUpdate = true;
    } finally {
      bitmap.close();
    }
  }

  destroy(): void {
    this.ceiling?.geometry.dispose();
    this.ceiling?.material.dispose();
    this.fieldTexture.dispose();
  }

  private decorateMaterial(material: THREE.MeshStandardMaterial): void {
    if (this.decorated.has(material)) return;
    this.decorated.add(material);

    const response = material.metalness > 0.65 ? 0.9 : material.roughness > 0.78 ? 0.58 : 0.72;
    const responseUniform = { value: response };
    const originalOnBeforeCompile = material.onBeforeCompile.bind(material);

    material.onBeforeCompile = (shader, renderer) => {
      originalOnBeforeCompile(shader, renderer);
      Object.assign(shader.uniforms, this.uniforms, { uThemeResponse: responseUniform });

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vThemeWorldPosition;\nvarying vec3 vThemeWorldNormal;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>\nvThemeWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvThemeWorldNormal = normalize(mat3(modelMatrix) * normal);`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform sampler2D uThemeField;
uniform float uThemeStrength;
uniform float uThemeMottleStrength;
uniform float uThemeMottleScale;
uniform float uThemeDarkLift;
uniform float uThemeResponse;
uniform vec2 uThemeProjectionSize;
varying vec3 vThemeWorldPosition;
varying vec3 vThemeWorldNormal;

float arkourHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float arkourNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = arkourHash(i);
  float b = arkourHash(i + vec2(1.0, 0.0));
  float c = arkourHash(i + vec2(0.0, 1.0));
  float d = arkourHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 arkourThemeColor(vec3 worldPosition) {
  vec2 uv = clamp(worldPosition.xy / uThemeProjectionSize + vec2(0.5), vec2(0.0), vec2(1.0));
  vec3 source = texture2D(uThemeField, uv).rgb;
  float scale = mix(0.018, 0.108, uThemeMottleScale);
  float broad = arkourNoise(worldPosition.xy * scale * 0.45 + vec2(11.0, -7.0)) - 0.5;
  float fine = arkourNoise(worldPosition.xy * scale * 2.2 + vec2(-29.0, 19.0)) - 0.5;
  source *= max(0.42, 1.0 + broad * 0.55 * uThemeMottleStrength + fine * 0.22 * uThemeMottleStrength);

  float luminance = dot(source, vec3(0.2126, 0.7152, 0.0722));
  vec3 darkBlue = vec3(0.018, 0.055, 0.075);
  vec3 oxblood = vec3(0.082, 0.025, 0.024);
  vec3 fallback = mix(darkBlue, oxblood, arkourNoise(worldPosition.xy * scale * 0.7 + 4.0));
  float darkMask = 1.0 - smoothstep(0.025, 0.19, luminance);
  source = mix(source, fallback, darkMask * uThemeDarkLift);
  source += fallback * uThemeDarkLift * 0.16;
  return clamp(source, vec3(0.0), vec3(1.25));
}`,
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );
vec3 arkourTheme = arkourThemeColor(vThemeWorldPosition);
float arkourFacing = 0.34 + 0.66 * abs(normalize(vThemeWorldNormal).z);
float arkourMix = uThemeStrength * uThemeResponse * arkourFacing;
diffuseColor.rgb = mix(diffuseColor.rgb, max(diffuseColor.rgb, arkourTheme * 0.30), arkourMix);`,
        )
        .replace(
          'vec3 totalEmissiveRadiance = emissive;',
          `vec3 totalEmissiveRadiance = emissive;
totalEmissiveRadiance += arkourTheme * arkourMix * 0.10;`,
        );
    };

    material.customProgramCacheKey = () => 'arkour-image-theme-v1';
    material.needsUpdate = true;
  }

  private addCeiling(): void {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      fragmentShader: `
uniform sampler2D uThemeField;
uniform float uThemeStrength;
uniform float uThemeMottleStrength;
uniform float uThemeMottleScale;
uniform float uThemeDarkLift;
varying vec2 vUv;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec3 source = texture2D(uThemeField, vUv).rgb;
  float scale = mix(4.0, 18.0, uThemeMottleScale);
  float broad = noise21(vUv * scale * 0.45 + vec2(8.0, 3.0)) - 0.5;
  float fine = noise21(vUv * scale * 2.1 + vec2(-4.0, 12.0)) - 0.5;
  source *= max(0.4, 1.0 + broad * 0.62 * uThemeMottleStrength + fine * 0.22 * uThemeMottleStrength);
  float luminance = dot(source, vec3(0.2126, 0.7152, 0.0722));
  vec3 fallback = mix(vec3(0.02, 0.07, 0.09), vec3(0.09, 0.025, 0.02), noise21(vUv * 7.0));
  source = mix(source, fallback, (1.0 - smoothstep(0.02, 0.2, luminance)) * uThemeDarkLift);
  source += fallback * uThemeDarkLift * 0.16;
  source = mix(vec3(0.025, 0.03, 0.032), source, uThemeStrength);
  gl_FragColor = vec4(source, 1.0);
}`,
      side: THREE.FrontSide,
      toneMapped: false,
    });

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), material);
    const start = this.startRoute.curve.getPointAt(0);
    const tangent = this.startRoute.curve.getTangentAt(0).normalize();
    ceiling.position.copy(start).addScaledVector(tangent, -5);
    ceiling.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    ceiling.renderOrder = -2;
    ceiling.name = 'theme:ceiling';
    this.scene.add(ceiling);
    this.ceiling = ceiling;
  }
}
