export async function loadGzipBase64Parts(paths) {
  const chunks = await Promise.all(paths.map(async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Compressed asset part failed: ${response.status} ${path}`);
    return (await response.text()).trim();
  }));

  const binary = atob(chunks.join(''));
  const compressed = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) compressed[i] = binary.charCodeAt(i);

  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser does not support gzip decompression.');
  }

  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
