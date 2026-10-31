#!/usr/bin/env node
// Prints the median of each metric per profile, scenario and variant, with the change from baseline.
//   node perf/compare.cjs perf/results/baseline.json [more.json ...] [--json out.json]
"use strict";
const fs = require("node:fs");

const files = process.argv.slice(2).filter((value, index, all) => !value.startsWith("--") && !["--json", "--ref"].includes(all[index - 1]));
const jsonIndex = process.argv.indexOf("--json");
const refIndex = process.argv.indexOf("--ref");
const reference = refIndex >= 0 ? process.argv[refIndex + 1] : "baseline";
const rows = files.flatMap(file => JSON.parse(fs.readFileSync(file, "utf8")).data);
const median = values => {
    const sorted = values.filter(value => value != null).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};
const spread = values => {
    const sorted = values.filter(value => value != null).sort((a, b) => a - b);
    return sorted.length ? [sorted[0], sorted[sorted.length - 1]] : null;
};

const METRICS = {
    main: row => row.loadMsPerS.main, comp: row => row.loadMsPerS.compositor, raster: row => row.loadMsPerS.raster, gpu: row => row.loadMsPerS.gpu,
    passes: row => row.frames.passesPerDraw, commits: row => row.frames.commits, draws: row => row.frames.draws, paints: row => row.frames.paints,
    rasterTasks: row => row.frames.rasterTasks, longest: row => row.longestTaskMs, blocking: row => row.blockingMs,
    sync: row => row.syncMs, p95: row => row.frameStats && row.frameStats.p95, worst: row => row.frameStats && row.frameStats.worst,
    jank: row => row.frameStats && row.frameStats.over25ms, layers: row => row.layers && row.layers.count, layerMb: row => row.layers && row.layers.megabytes,
    totalMain: row => row.totalMs.main, totalGpu: row => row.totalMs.gpu
};

const groups = new Map();
for (const row of rows) {
    const key = `${row.profile}|${row.scenario}|${row.variant}`;
    if (!groups.has(key)) { groups.set(key, []); }
    groups.get(key).push(row);
}
const summary = [...groups.entries()].map(([key, list]) => {
    const [profile, scenario, variant] = key.split("|");
    const values = Object.fromEntries(Object.entries(METRICS).map(([name, read]) => [name, median(list.map(read))]));
    const ranges = Object.fromEntries(["main", "gpu"].map(name => [name, spread(list.map(METRICS[name]))]));
    return { profile, scenario, variant, runs: list.length, ...values, ranges, errors: list.flatMap(row => row.errors || []).length };
});

const cell = (value, width = 7) => String(value == null ? "-" : Math.round(value * 10) / 10).padStart(width);
const change = (value, base) => value == null || !base ? "" : `${value >= base ? "+" : ""}${Math.round((value - base) / base * 100)}%`.padStart(6);
console.log(`${"profile".padEnd(8)} ${"scenario".padEnd(22)} ${"variant".padEnd(30)} ${"main".padStart(13)} ${"gpu".padStart(13)} ${"comp".padStart(7)} ${"raster".padStart(7)} ${"pass/f".padStart(6)} ${"commit".padStart(6)} ${"draws".padStart(6)} ${"long".padStart(7)} ${"sync".padStart(7)} ${"p95".padStart(6)} ${"jank".padStart(5)} ${"lyr".padStart(4)} ${"MB".padStart(6)}`);
for (const row of summary) {
    const base = summary.find(other => other.profile == row.profile && other.scenario == row.scenario && other.variant == reference);
    const isBase = row.variant == reference;
    console.log(`${row.profile.padEnd(8)} ${row.scenario.padEnd(22)} ${row.variant.slice(0, 30).padEnd(30)} ${cell(row.main)}${isBase ? "      " : change(row.main, base && base.main)} ${cell(row.gpu)}${isBase ? "      " : change(row.gpu, base && base.gpu)} ${cell(row.comp)} ${cell(row.raster)} ${cell(row.passes, 6)} ${cell(row.commits, 6)} ${cell(row.draws, 6)} ${cell(row.longest)} ${cell(row.sync)} ${cell(row.p95, 6)} ${cell(row.jank, 5)} ${cell(row.layers, 4)} ${cell(row.layerMb, 6)}${row.errors ? ` ERR:${row.errors}` : ""}`);
}
if (jsonIndex >= 0) { fs.writeFileSync(process.argv[jsonIndex + 1], JSON.stringify(summary, null, 1)); }
