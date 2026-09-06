import { loadLessonAsset, normalizeLessonMedia } from "./lesson-media.js?v=20260906-media-v1";

export function createLessonMediaRenderer({ getPack, fetchImpl = globalThis.fetch, documentImpl = globalThis.document } = {}) {
  const cache = new Map();
  let cacheBytes = 0;
  let generation = 0;
  let observer;
  let controller;
  const urls = new Set();
  const release = () => {
    generation += 1;
    observer?.disconnect(); controller?.abort();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  };
  const blobFor = async (asset, base, signal) => {
    const key = `${asset.sha256}:${asset.mime_type}:${asset.bytes}`;
    if (cache.has(key)) return cache.get(key);
    const bytes = await loadLessonAsset(asset, base, { fetchImpl, signal });
    const blob = new Blob([bytes], { type: asset.mime_type });
    while (cacheBytes + blob.size > 50_000_000 && cache.size) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).size; cache.delete(oldest);
    }
    cache.set(key, blob); cacheBytes += blob.size;
    return blob;
  };
  const hydrate = root => {
    release();
    const current = generation;
    controller = new AbortController();
    const signal = controller.signal;
    const packs = new Map();
    const load = async figure => {
      const box = figure.querySelector(".lesson-media-content");
      try {
        const item = normalizeLessonMedia([JSON.parse(figure.dataset.mediaItem)])[0];
        const packId = figure.dataset.mediaPack;
        if (!packs.has(packId)) packs.set(packId, getPack(packId));
        const pack = packs.get(packId) ?? {};
        const assets = new Map((pack.assets ?? []).map(asset => [asset.path, asset]));
        const source = async path => {
          const asset = assets.get(path);
          if (!asset) throw new Error(`Missing media file: ${path}.`);
          const blob = await blobFor(asset, pack.asset_base_url, signal);
          if (current !== generation || !figure.isConnected) throw new DOMException("Detached media", "AbortError");
          const url = URL.createObjectURL(blob); urls.add(url);
          return { url, type: asset.mime_type };
        };
        const element = documentImpl.createElement(item.type === "image" ? "img" : item.type);
        element.style.objectFit = item.fit;
        if (item.width) element.width = item.width;
        if (item.height) element.height = item.height;
        if (item.height && !item.width) { element.style.maxHeight = `${item.height}px`; element.style.width = "auto"; }
        const failed = () => {
          if (!figure.isConnected || current !== generation) return;
          const notice = documentImpl.createElement("p");
          notice.className = "lesson-media-status";
          notice.textContent = `This browser could not display the ${item.type}. ${item.alt}`;
          box.replaceChildren(notice);
        };
        element.addEventListener("error", failed, { once: true });
        if (item.type === "image") {
          element.alt = item.alt; element.decoding = "async";
          element.src = (await source(item.src)).url;
        } else {
          element.controls = true; element.preload = "metadata";
          element.setAttribute("aria-label", item.alt);
          if (item.type === "video") element.playsInline = true;
          if (item.poster) element.poster = (await source(item.poster)).url;
          let supported = 0;
          let failedSources = 0;
          for (const path of [item.src, ...(item.sources ?? [])]) {
            const asset = assets.get(path);
            if (asset && element.canPlayType && !element.canPlayType(asset.mime_type)) continue;
            const media = await source(path);
            const child = documentImpl.createElement("source"); child.src = media.url; child.type = media.type;
            child.addEventListener("error", () => { if (++failedSources === supported) failed(); }, { once: true });
            element.append(child); supported += 1;
          }
          if (!supported) throw new Error(`No supported ${item.type} source. ${item.alt}`);
          element.append(documentImpl.createTextNode(item.alt));
        }
        if (current === generation && figure.isConnected) box.replaceChildren(element);
      } catch (error) {
        if (error?.name === "AbortError" || current !== generation || !figure.isConnected) return;
        const notice = documentImpl.createElement("p"); notice.className = "lesson-media-status";
        notice.textContent = error instanceof Error ? error.message : "Media could not be loaded.";
        box.replaceChildren(notice);
      }
    };
    const figures = [...root.querySelectorAll("[data-lesson-media]")];
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); void load(entry.target); }
      }, { rootMargin: "200px" });
      figures.forEach(figure => observer.observe(figure));
    } else figures.forEach(figure => void load(figure));
  };
  return { hydrate, dispose() { release(); cache.clear(); cacheBytes = 0; } };
}
