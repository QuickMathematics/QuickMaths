import test from "node:test";
import assert from "node:assert/strict";

import { fetchTextLimited, githubFileRawUrl, readFileTextLimited, readTextLimited } from "./safe-fetch.js";

test("bounded remote reads cancel a stream as soon as it exceeds the limit", async () => {
  let cancelled = false;
  const response = {
    headers: { get: () => null },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
      },
      cancel() { cancelled = true; },
    }),
  };
  await assert.rejects(readTextLimited(response, 10, { label: "Curriculum" }), /larger than 10 bytes/i);
  assert.equal(cancelled, true);
});

test("declared remote and local oversize files are rejected before allocation", async () => {
  let responseTextCalled = false;
  await assert.rejects(readTextLimited({
    headers: { get: () => "2000001" },
    text: async () => { responseTextCalled = true; return "ignored"; },
  }, 2_000_000, { label: "Lesson file" }), /larger than 2 MB/i);
  assert.equal(responseTextCalled, false);

  let fileTextCalled = false;
  await assert.rejects(readFileTextLimited({ size: 20, text: async () => { fileTextCalled = true; return "ignored"; } }, 10), /larger than 10 bytes/i);
  assert.equal(fileTextCalled, false);
});

test("bounded fetch aborts a stalled download", async () => {
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  await assert.rejects(fetchTextLimited(fetchImpl, "https://example.com/file", { maximumBytes: 10, timeoutMs: 5 }), /timed out/i);
});

test("GitHub file links reject credentials and persist a canonical URL without query secrets", () => {
  assert.throws(() => githubFileRawUrl("https://user:secret@raw.githubusercontent.com/org/repo/main/file.json"), /cannot contain credentials/i);
  assert.equal(
    githubFileRawUrl("https://github.com/org/repo/blob/abc123/path/file.json?token=secret#fragment"),
    "https://raw.githubusercontent.com/org/repo/abc123/path/file.json",
  );
  assert.equal(
    githubFileRawUrl("https://raw.githubusercontent.com/org/repo/abc123/path/file.json?token=secret#fragment"),
    "https://raw.githubusercontent.com/org/repo/abc123/path/file.json",
  );
});
