// Turns a Chromium trace into per-thread load, so costs show up on hardware fast enough to hide them in frame rate.
"use strict";

const CATEGORIES = ["toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline",
    "disabled-by-default-devtools.timeline.frame", "gpu", "viz", "cc"];

const PHASES = new Map(Object.entries({
    FunctionCall: "script", EvaluateScript: "script", "v8.compile": "script", V8Execute: "script", "v8.callFunction": "script",
    FireAnimationFrame: "script", TimerFire: "script", EventDispatch: "script", RunMicrotasks: "script",
    FireIdleCallback: "script", MajorGC: "gc", MinorGC: "gc", "V8.GC_MC_BACKGROUND_MARKING": "gc",
    UpdateLayoutTree: "style", ParseAuthorStyleSheet: "style", RecalcStyle: "style",
    Layout: "layout", UpdateLayout: "layout",
    PrePaint: "paint", Paint: "paint", Layerize: "paint", "LocalFrameView::RunPrePaintLifecyclePhase": "paint",
    UpdateLayer: "paint", UpdateLayerTree: "paint", CompositeLayers: "paint", Commit: "paint",
    "Decode Image": "decode", "Decode LazyPixelRef": "decode", ImageDecodeTask: "decode", "ImageResourceContent::Decode": "decode"
}));

function complete(events) {
    return events.filter(event => event.ph == "X" && event.dur != null);
}

function threads(events) {
    const names = new Map();
    for (const event of events) {
        if (event.ph == "M" && event.name == "thread_name") { names.set(`${event.pid}:${event.tid}`, event.args.name); }
    }
    return names;
}

// Sums non-nested time, which is what the thread actually spent busy, in wall and CPU time.
function busy(list) {
    const sorted = list.slice().sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    let wall = 0, cpu = 0, end = -Infinity, longest = 0, longTasks = 0, blocking = 0;
    for (const event of sorted) {
        if (event.ts >= end) {
            wall += event.dur;
            cpu += event.tdur != null ? event.tdur : event.dur;
            end = event.ts + event.dur;
            longest = Math.max(longest, event.dur);
            if (event.dur > 50000) { longTasks++; blocking += event.dur - 50000; }
        } else if (event.ts + event.dur > end) {
            wall += event.ts + event.dur - end;
            end = event.ts + event.dur;
        }
    }
    return { wall: wall / 1000, cpu: cpu / 1000, longest: longest / 1000, longTasks, blocking: blocking / 1000 };
}

// Self time per phase: each event's duration minus its children's, charged to its nearest named ancestor.
function phases(list) {
    const sorted = list.slice().sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    const totals = {};
    const stack = [];
    const close = until => {
        while (stack.length && stack[stack.length - 1].end <= until) {
            const frame = stack.pop();
            totals[frame.phase] = (totals[frame.phase] || 0) + Math.max(0, frame.self) / 1000;
        }
    };
    for (const event of sorted) {
        close(event.ts);
        const parent = stack[stack.length - 1];
        if (parent) { parent.self -= event.dur; }
        const phase = PHASES.get(event.name) || (parent ? parent.phase : "other");
        stack.push({ end: event.ts + event.dur, self: event.dur, phase });
    }
    close(Infinity);
    return totals;
}

function analyze(events, elapsedMs) {
    const names = threads(events);
    const groups = new Map();
    for (const event of complete(events)) {
        const name = names.get(`${event.pid}:${event.tid}`) || "";
        const key = `${event.pid}:${event.tid}`;
        if (!groups.has(key)) { groups.set(key, { pid: event.pid, name, events: [] }); }
        groups.get(key).events.push(event);
    }
    // The page's renderer is the busiest main thread, which excludes the spare renderer and about:blank.
    const renderer = [...groups.values()].filter(group => group.name == "CrRendererMain")
        .sort((a, b) => b.events.length - a.events.length)[0];
    const pid = renderer ? renderer.pid : -1;
    const list = test => [...groups.values()].filter(test);
    const main = renderer ? renderer.events : [];
    const compositor = list(group => group.pid == pid && group.name == "Compositor").flatMap(group => group.events);
    const workers = list(group => group.pid == pid && /ThreadPool|CompositorTileWorker/.test(group.name)).flatMap(group => group.events);
    const gpuThreads = list(group => group.name == "CrGpuMain" || group.name == "VizCompositorThread");
    const gpuEvents = gpuThreads.flatMap(group => group.events);
    const sum = (items, name) => items.filter(event => event.name == name).reduce((total, event) => total + event.dur, 0) / 1000;
    const count = (items, name) => items.filter(event => event.name == name).length;
    const mainBusy = busy(main);
    const gpuBusy = gpuThreads.reduce((total, group) => total + busy(group.events).wall, 0);
    const compositorBusy = busy(compositor).wall;
    const rasterMs = sum(workers, "RasterTask") + sum(gpuEvents, "RasterDecoderImpl::DoEndRasterCHROMIUM");
    const draws = count(gpuEvents, "Display::DrawAndSwap");
    const passes = count(gpuEvents, "DirectRenderer::DrawRenderPass");
    const seconds = elapsedMs / 1000;
    const perSecond = value => Math.round(value / seconds * 10) / 10;
    const round = value => Math.round(value * 10) / 10;
    return {
        elapsedMs,
        // Milliseconds of work per second of wall time; 1000 on one thread means saturated.
        loadMsPerS: { main: perSecond(mainBusy.wall), compositor: perSecond(compositorBusy), raster: perSecond(rasterMs), gpu: perSecond(gpuBusy) },
        mainPhasesMs: Object.fromEntries(Object.entries(phases(main)).map(([key, value]) => [key, round(value)])),
        totalMs: { main: round(mainBusy.wall), compositor: round(compositorBusy), raster: round(rasterMs), gpu: round(gpuBusy) },
        frames: { commits: count(main, "Commit"), paints: count(main, "Paint"), raf: count(main, "FireAnimationFrame"),
            styles: count(main, "UpdateLayoutTree"), layouts: count(main, "Layout"), draws, rasterTasks: count(workers, "RasterTask"), passes,
            passesPerDraw: draws ? round(passes / draws) : 0 },
        longestTaskMs: round(mainBusy.longest), longTasks: mainBusy.longTasks, blockingMs: round(mainBusy.blocking)
    };
}

function percentiles(intervals) {
    if (!intervals || !intervals.length) { return null; }
    const sorted = intervals.slice().sort((a, b) => a - b);
    const at = fraction => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
    return { frames: intervals.length, mean: Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length * 10) / 10,
        p50: Math.round(at(.5) * 10) / 10, p95: Math.round(at(.95) * 10) / 10, worst: Math.round(sorted[sorted.length - 1] * 10) / 10,
        over25ms: intervals.filter(value => value > 25).length };
}

module.exports = { CATEGORIES, analyze, percentiles };
