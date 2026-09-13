// Runtime artifacts are shared immutable data. This module grants no proof authority.
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');

export function createFormalArtifactCache({cache, baseUrl, fetcher = fetch}) {
  const pending = new Map();
  const stats = {downloads: 0, downloadedBytes: 0, hits: 0, writable: true};
  async function read(spec) {
    if (!/^[a-f0-9]{64}$/.test(spec.sha256) || !/^[A-Za-z0-9_.-]+$/.test(spec.file) ||
        !Number.isSafeInteger(spec.compressedBytes) || spec.compressedBytes < 1 || spec.compressedBytes > 2 ** 31 - 1)
      throw Error('Invalid curated artifact descriptor');
    const key = new URL('.formal-cache/' + spec.sha256, baseUrl).href;
    if (!pending.has(key)) {
      const promise = (async () => {
        let response = await cache.match(key), hit = Boolean(response);
        let bytes = response ? await response.arrayBuffer() : null;
        if (bytes && (bytes.byteLength !== spec.compressedBytes || await digest(bytes) !== spec.sha256)) {
          await cache.delete(key); bytes = null; hit = false;
        }
        if (!bytes) {
          response = await fetcher(new URL(spec.file, baseUrl));
          if (!response.ok) throw Error('Curated artifact download failed');
          bytes = await response.arrayBuffer();
          if (bytes.byteLength !== spec.compressedBytes || await digest(bytes) !== spec.sha256)
            throw Error('Curated artifact integrity failure');
          stats.downloads++; stats.downloadedBytes += bytes.byteLength;
          try {
            await cache.put(key, new Response(bytes));
            if (!(await cache.match(key))) stats.writable = false;
          } catch { stats.writable = false; }
        } else stats.hits++;
        return {blob: new Blob([bytes]), cacheHit: hit, cacheKey: spec.sha256};
      })();
      pending.set(key, promise);
      promise.finally(() => pending.delete(key)).catch(() => {});
    }
    const result = await pending.get(key);
    if (result.blob.size !== spec.compressedBytes) throw Error('Curated artifact size mismatch');
    return result;
  }
  return {read, stats};
}

export function createFormalEnvironmentPool({catalog, create}) {
  const environments = structuredClone(catalog);
  let current = null, queue = Promise.resolve(), disposed = false;
  const enqueue = action => {
    const task = queue.then(action);
    queue = task.catch(() => {});
    return task;
  };
  async function discardCurrent() {
    const previous = current; current = null;
    if (previous) await previous.instance.dispose();
  }
  return {
    select(capabilities) {
      const required = new Set(['algebra', ...capabilities]);
      const candidates = Object.values(environments).filter(env => [...required].every(cap => env.capabilities.includes(cap)));
      candidates.sort((a,b) => a.modules.length-b.modules.length || a.id.localeCompare(b.id));
      if (!candidates.length) throw Error('No curated environment supports these capabilities');
      return candidates[0].id;
    },
    withEnvironment(id, format, action) {
      return enqueue(async () => {
        if (disposed) throw Error('Formal environment pool was disposed');
        if (!Object.hasOwn(environments, id) || !['modules','snapshot'].includes(format))
          throw Error('Unknown curated environment or representation');
        const key = id + ':' + format;
        if (current?.key !== key) {
          await discardCurrent();
          const instance = await create(environments[id], format);
          if (!instance || typeof instance.dispose !== 'function') throw Error('Invalid verifier worker handle');
          if (disposed) { await instance.dispose(); throw Error('Formal environment pool was disposed'); }
          current = {key, instance};
        }
        return action(current.instance);
      });
    },
    discard() { return enqueue(discardCurrent); },
    async dispose() { disposed = true; await queue; await discardCurrent(); },
  };
}
