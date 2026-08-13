import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const assetDir = resolve('public/assets/black-ice');
const sourceNames = [
  'panther-walk-v3.gz.b64.00aa',
  'panther-walk-v3.gz.b64.00ab',
  'panther-walk-v3.gz.b64.00ba',
  'panther-walk-v3.gz.b64.00bb',
  'panther-walk-v3.gz.b64.01aa',
  'panther-walk-v3.gz.b64.01ab',
  'panther-walk-v3.gz.b64.01ba',
  'panther-walk-v3.gz.b64.01bb',
  'panther-walk-v3.gz.b64.02',
  'panther-walk-v3.gz.b64.03',
  'panther-walk-v3.gz.b64.04',
  'panther-walk-v3.gz.b64.05aa',
  'panther-walk-v3.gz.b64.05ab',
  'panther-walk-v3.gz.b64.05ba',
  'panther-walk-v3.gz.b64.05bb',
  'panther-walk-v3.gz.b64.06',
  'panther-walk-v3.gz.b64.07',
];

const EXPECTED_BASE64_LENGTH = 83944;
const EXPECTED_GZIP_SHA256 = '5c8f7898d36ff8af2f177053fe0fa174d7f8c07857317dda2197d553748295c6';
const EXPECTED_GLB_LENGTH = 174192;
const EXPECTED_GLB_SHA256 = '508f9e4cb548fdbd46a3f942cd16e969d064e3f0cab2dc851346de0d8981506d';
const OUTPUT_PARTS = 4;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const sourceChunks = await Promise.all(
  sourceNames.map(async (name) => (await readFile(resolve(assetDir, name), 'utf8')).trim()),
);
const encoded = sourceChunks.join('');
if (encoded.length !== EXPECTED_BASE64_LENGTH) {
  throw new Error(`Panther base64 length mismatch: ${encoded.length} !== ${EXPECTED_BASE64_LENGTH}`);
}

const compressed = Buffer.from(encoded, 'base64');
const gzipSha = sha256(compressed);
if (gzipSha !== EXPECTED_GZIP_SHA256) {
  throw new Error(`Panther gzip SHA-256 mismatch: ${gzipSha}`);
}

const glb = gunzipSync(compressed);
const glbSha = sha256(glb);
if (glb.length !== EXPECTED_GLB_LENGTH || glb.subarray(0, 4).toString('ascii') !== 'glTF' || glbSha !== EXPECTED_GLB_SHA256) {
  throw new Error(`Panther GLB integrity mismatch: length=${glb.length} header=${glb.subarray(0, 4).toString('ascii')} sha256=${glbSha}`);
}

const partSize = Math.ceil(encoded.length / OUTPUT_PARTS);
for (let index = 0; index < OUTPUT_PARTS; index += 1) {
  const output = resolve(assetDir, `panther-mask.gz.b64.${String(index).padStart(2, '0')}`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, encoded.slice(index * partSize, (index + 1) * partSize), 'utf8');
}

console.log(`Panther asset verified: ${glb.length} byte GLB, sha256 ${glbSha}`);
