# Performance pass — 6 September 2026

Baseline: `df7a915`. Measurements use synthetic workspaces, a local Node runtime, and headless Edge. They describe these test conditions, not a guaranteed speedup on every device or network.

## Changes

- Timer updates read two counters directly instead of constructing a full workspace snapshot every second.
- A snapshot computes lesson visibility, active field, and progress rows once, then reuses those results within that snapshot. Reads still reflect current progress, curriculum settings, and review deadlines.
- Sync and backup exports serialize the state directly. They no longer stringify, parse, and then stringify the same state again. Exported files retain their format and indentation.
- Browsers without WebMCP skip the four agent reference downloads. Browsers with WebMCP load those references in parallel with startup and register tools after the workspace becomes usable. A failed reference file does not discard the other guides.
- The analog clock caches its hand elements and animates only while visible. It stops when hidden by the phone layout or when the page leaves view, and resumes with the current time.
- Depot registry requests run with at most four in flight. Results merge in declared source order, preserving official priority and deterministic handling of package collisions.
- Store changes do not construct a notification snapshot when nobody is listening. Local persistence still happens immediately.

## Workspace measurements

Run `node scripts/benchmark_workspace.mjs` from the repository root. It creates native-only and fully installed workspaces, including a larger history with 200 saved attempts. Each reported time is the median of seven batches of 20 calls after warmup.

| Operation | Workspace | Before | After |
|---|---|---:|---:|
| Full snapshot | 53 lessons, no attempts | 1.235 ms | 1.006 ms |
| Full snapshot | 94 lessons, no attempts | 1.776 ms | 1.245 ms |
| Full snapshot | 94 lessons, 200 attempts | 7.228 ms | 6.553 ms |
| Timer read | 94 lessons, 200 attempts | 7.239 ms | <0.01 ms |
| Sync export | 94 lessons, no attempts | 12.222 ms | 5.769 ms |
| Sync export | 94 lessons, 200 attempts | 29.849 ms | 14.495 ms |

The large snapshot remains about 1.42 MB: the improvement comes from avoiding repeated work and unnecessary copies, rather than removing saved information.

## Browser checks

The startup comparison added one second of latency to each agent reference request and 400 ms to the community configuration request. Ordinary desktop/mobile startup went from about 2.0 seconds to about 1.0 second; WebMCP startup went from 2.47 seconds to about 1.0 second, with tool registration completing afterward. All tools and complete manuals remained available once registration finished.

During a 2.2-second idle window, large JSON serialization calls fell from 18 to zero in ordinary browsers. The hidden mobile clock went from roughly 399 SVG attribute updates to zero. Desktop animation remained smooth, and checks covered resizing, leaving the page, and returning from browser history.

Validation included 339 JavaScript tests, 110 Python tests, and desktop/mobile checks for startup, guide failures, clock lifecycle, Studio editing, assessments, Depot installation, backups, sync resume, merge selection, and writes racing with a merge save. Browser storage writes used isolated synthetic fixtures and mocked GitHub responses.
