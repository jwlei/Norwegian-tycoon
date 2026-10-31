#!/usr/bin/env node
// Applies each example patch to a scratch copy and runs the project's real test suite against it.
// A patch is judged by the failures it adds, since the suite may already have failures of its own.
//   node perf/check-examples.cjs [--out perf/results/tests.json] [--jobs 5] [name ...]
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { exportCommit } = require("./run.cjs");

const ROOT = path.join(__dirname, "..");
const EXAMPLES = path.join(__dirname, "examples");
const args = process.argv.slice(2);
const option = name => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args.splice(index, 2)[1] : null;
};
const out = option("out");
const jobs = Number(option("jobs") || 5);
const names = args.length ? args : fs.readdirSync(EXAMPLES).filter(file => file.endsWith(".patch")).map(file => file.slice(0, -6)).sort();

async function check(variant) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "boms-check-"));
    exportCommit(directory);
    if (variant != "baseline") {
        for (const name of variant.split("+")) {
            execFileSync("git", ["apply", "--ignore-whitespace", "--whitespace=nowarn", path.join(EXAMPLES, `${name}.patch`)], { cwd: directory });
        }
    }
    // The app's own step after changing an asset. Stamping the baseline too keeps the comparison fair.
    execFileSync(process.execPath, ["scripts/stamp-revs.cjs"], { cwd: directory });
    const output = await new Promise(resolve => {
        const child = spawn(process.execPath, ["--test", "--test-reporter=tap"], { cwd: directory });
        let text = "";
        child.stdout.on("data", chunk => { text += chunk; });
        child.stderr.on("data", () => { });
        child.on("close", () => resolve(text));
    });
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    const number = label => Number((output.match(new RegExp(`^# ${label} (\\d+)`, "m")) || [])[1] || 0);
    const failed = [...output.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(match => match[1]).filter(name => !/\.cjs$/.test(name));
    return { variant, tests: number("tests"), pass: number("pass"), fail: number("fail"), failed };
}

async function main() {
    const baseline = await check("baseline");
    console.log(`baseline (stamped): ${baseline.pass} pass, ${baseline.fail} fail`);
    const queue = [...names];
    const results = [];
    await Promise.all(Array.from({ length: jobs }, async () => {
        while (queue.length) {
            const name = queue.shift();
            const result = await check(name);
            result.added = result.failed.filter(test => !baseline.failed.includes(test));
            result.fixed = baseline.failed.filter(test => !result.failed.includes(test));
            results.push(result);
            console.log(`${name.padEnd(46)} ${String(result.pass).padStart(4)} pass  ${result.added.length} new failures`);
            result.added.slice(0, 10).forEach(test => console.log(`    + ${test.slice(0, 130)}`));
        }
    }));
    if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify({ baseline, results: results.sort((a, b) => a.variant.localeCompare(b.variant)) }, null, 1));
    }
}

main().catch(error => { console.error(error); process.exit(1); });
