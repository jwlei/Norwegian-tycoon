# Graphics benchmarks

Measures the real game in headless Edge with a real `PresidentGame`, with no dependencies beyond Node. Nothing here runs as part of `npm test`, and the benchmarks never reach production: `run.cjs` and friends swap Firebase for an in-memory stub, and `startup.cjs` loads the real SDK but blocks every backend URL.

## Run it

```
node perf/run.cjs --profile desktop,phone --scenario hand-idle,play-1-on-12 --variant baseline,01,01+09 --runs 5 --out perf/results/x.json
node perf/compare.cjs perf/results/x.json [--ref 01]
```

| Script | What it answers |
|---|---|
| `run.cjs` | Thread load, frames, freezes, layers and memory for each scenario and variant |
| `compare.cjs` | Median per scenario, with the change from a reference variant |
| `profile.cjs`, `profile-startup.cjs` | Which functions take the time |
| `startup.cjs` | Cold start on Fast 4G, first and repeat visit |
| `visual.cjs` | Pixel difference from baseline. Add `--motion` to sample the whole foil cycle and cards in flight |
| `styles.cjs` | What each foil and card style costs |
| `check-examples.cjs` | Runs the test suite against a patch and reports only the failures it adds |
| `micro.cjs` | Geometry micro-benchmarks in plain Node |
| `foil-model.cjs` | Plain Node: foil's off-screen pixels on a OnePlus 15, the plain sheen's match to soft-light, and foil repaints per drag and flight |
| `phone-lab.cjs` | Serves the benchmark, a playable game and a look comparison to a real phone on your Wi-Fi. Run it in a terminal; Ctrl+C stops it |

Variants are patches in `examples/`, named by number. `01+09` stacks them in that order.

## Running it reliably

- **Measure a commit.** Every variant, baseline included, is exported from `HEAD`, so saving files during a run changes nothing. The patches were made against `756b252`, so use `PERF_COMMIT=756b252` to reproduce the report. Patches 17 and 18 were made against `0424bf9`, which `phone-lab.cjs` uses by default.
- **Keep the machine quiet.** Phone timings are very sensitive to other load: another heavy job raised the 4-card freeze about sevenfold in one run. Each run records `machineBusyPercent`, and `compare.cjs` warns when runs shared a busy machine. Do not run two benchmarks at once.
- **Use at least 5 runs for freezes.** With 3 runs, patch 11 looked like a 31% gain that disappeared at 7 runs.
- **Compare within one run.** Absolute phone figures drift between sessions, so only trust differences measured together.
- **Watch the drag scenario.** It settles into one of two layer states from run to run (115 or 121 layers on desktop) with about 8 times the raster load, whichever patch is applied. Compare runs in the same state.

## What the numbers mean

- `main`, `comp`, `raster`, `gpu`: busy time per second on that thread. `gpu` is the GPU process threads, a proxy for GPU work and not time on the graphics card.
- `sync`: time for the update call itself. `long`: longest main-thread task, which is what a player feels as a freeze.
- `p95`, `jank`: frame intervals, and frames slower than 25 ms.
- `passes`: render passes per frame. `MB`: estimated memory for painted layers.

## Limits

- `phone` is an emulated viewport with 4× CPU throttling on the main thread only, running on a desktop GPU. It is not a real device, so check final decisions on a real phone with `phone-lab.cjs`.
- The `-simple` and `hand-idle-foil-off` scenarios measure settings removed in 1.4.3, so they need `PERF_COMMIT=0424bf9`. On later commits `-simple` throws, and `hand-idle-foil-off` measures the same as `hand-idle`.
- `phone-lab.cjs` measures frame intervals from inside the page. GPU overload shows up there because the browser holds back frames, but render passes and layers cannot be read from a page.
- `phone-sw` uses a software GPU as a pessimistic stand-in for a weak mobile GPU.
- Headless Edge runs at 144 Hz here, so per-second loads are higher than on a 60 Hz display.
- `visual.cjs` compares frozen frames. It shows how far a picture moves, not how smooth motion feels.
