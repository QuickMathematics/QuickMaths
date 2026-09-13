import test from "node:test";
import assert from "node:assert/strict";

import { createFormalArtifactCache, createFormalEnvironmentPool } from "./formal-environment-loader.js";

const bytes = new TextEncoder().encode("curated artifact");

async function descriptorFor(data = bytes, file = "matched.pack") {
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
  return { file, compressedBytes: data.byteLength, sha256: hash };
}

function memoryCache(entries = new Map()) {
  return {
    entries,
    async match(key) { return entries.get(key)?.clone(); },
    async put(key, response) { entries.set(key, response.clone()); },
    async delete(key) { return entries.delete(key); },
  };
}

function responseFor(data, ok = true) {
  return new Response(data, { status: ok ? 200 : 500 });
}

test("artifact cache rejects size and hash tampering", async () => {
  const cache = memoryCache();
  const fetcher = async () => responseFor(bytes);
  const artifactCache = createFormalArtifactCache({ cache, baseUrl: "https://example.test/", fetcher });
  const spec = await descriptorFor();

  await assert.rejects(artifactCache.read({ ...spec, compressedBytes: spec.compressedBytes + 1 }), /integrity failure/i);
  await assert.rejects(artifactCache.read({ ...spec, sha256: "0".repeat(64) }), /integrity failure/i);
});

test("corrupted cached bytes are deleted and refetched", async () => {
  const spec = await descriptorFor();
  const cache = memoryCache(new Map([[new URL(`.formal-cache/${spec.sha256}`, "https://example.test/").href, responseFor(new Uint8Array([1, 2, 3]))]]));
  let fetches = 0;
  const artifactCache = createFormalArtifactCache({
    cache,
    baseUrl: "https://example.test/",
    fetcher: async () => { fetches++; return responseFor(bytes); },
  });

  const result = await artifactCache.read(spec);
  assert.equal(fetches, 1);
  assert.equal(result.cacheHit, false);
  assert.equal(artifactCache.stats.downloads, 1);
});

test("concurrent reads deduplicate one download", async () => {
  const spec = await descriptorFor();
  let fetches = 0;
  const artifactCache = createFormalArtifactCache({
    cache: memoryCache(), baseUrl: "https://example.test/",
    fetcher: async () => { fetches++; await new Promise(resolve => setTimeout(resolve, 5)); return responseFor(bytes); },
  });

  const results = await Promise.all([artifactCache.read(spec), artifactCache.read(spec), artifactCache.read(spec)]);
  assert.equal(fetches, 1);
  assert.deepEqual(results.map(result => result.cacheKey), [spec.sha256, spec.sha256, spec.sha256]);
});

test("cache quota failure preserves verified online use without claiming offline availability", async () => {
  const cache = memoryCache();
  cache.put = async () => { throw Error("QuotaExceededError"); };
  const loader = createFormalArtifactCache({cache, baseUrl: "https://example.test/", fetcher: async () => responseFor(bytes)});
  const result = await loader.read(await descriptorFor());
  assert.equal(result.blob.size, bytes.byteLength);
  assert.equal(loader.stats.writable, false);
  assert.equal(result.cacheHit, false);
});

test("the content-addressed cache reuses an artifact across catalog profiles", async () => {
  const first = await descriptorFor(bytes, "profile-a.pack");
  const second = { ...first, file: "profile-b.pack" };
  let fetches = 0;
  const artifactCache = createFormalArtifactCache({
    cache: memoryCache(), baseUrl: "https://example.test/",
    fetcher: async () => { fetches++; return responseFor(bytes); },
  });

  await artifactCache.read(first);
  const reused = await artifactCache.read(second);
  assert.equal(fetches, 1);
  assert.equal(reused.cacheHit, true);
  assert.equal(artifactCache.stats.hits, 1);
});

function catalog() {
  return {
    algebra: { id: "algebra", capabilities: ["algebra"], modules: ["Init"], snapshot: "init.snap" },
    calculus: { id: "calculus", capabilities: ["algebra", "calculus"], modules: ["Init", "Math"], snapshot: "calc.snap" },
  };
}

test("pool reuses one worker for serial calls", async () => {
  const instances = [];
  const pool = createFormalEnvironmentPool({ catalog: catalog(), create: async env => {
    const instance = { id: env.id, calls: 0, dispose: async () => {} };
    instances.push(instance);
    return instance;
  }});

  const first = await pool.withEnvironment("algebra", "modules", worker => ++worker.calls);
  const second = await pool.withEnvironment("algebra", "modules", worker => ++worker.calls);
  assert.deepEqual([first, second], [1, 2]);
  assert.equal(instances.length, 1);
});

test("pool discards the old worker when the environment changes", async () => {
  const disposed = [];
  const pool = createFormalEnvironmentPool({ catalog: catalog(), create: async env => ({
    id: env.id, dispose: async () => disposed.push(env.id),
  })});

  await pool.withEnvironment("algebra", "modules", worker => worker.id);
  await pool.withEnvironment("calculus", "snapshot", worker => worker.id);
  assert.deepEqual(disposed, ["algebra"]);
});

test("explicit discard and dispose release workers; unsupported capabilities fail", async () => {
  let disposed = 0;
  const pool = createFormalEnvironmentPool({ catalog: catalog(), create: async () => ({ dispose: async () => { disposed++; } }) });

  assert.equal(pool.select(["calculus"]), "calculus");
  assert.throws(() => pool.select(["topology"]), /No curated environment supports/i);
  await pool.withEnvironment("algebra", "modules", () => undefined);
  await pool.discard();
  assert.equal(disposed, 1);
  await pool.dispose();
  await assert.rejects(pool.withEnvironment("algebra", "modules", () => undefined), /disposed/i);
  assert.equal(disposed, 1);
});
