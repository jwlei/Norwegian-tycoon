// In-memory stand-in for the Firebase SDK. Benchmarks measure rendering, not the network, and never touch production data.
"use strict";
(function () {
    const asyncMethods = new Set(["once", "get", "set", "update", "remove", "transaction", "push", "signInAnonymously",
        "signInWithCustomToken", "setPersistence"]);
    const snapshot = { val: () => null, exists: () => false, key: null, forEach() { }, child: () => snapshot, numChildren: () => 0 };
    const stub = new Proxy(function () { }, {
        get(target, property) {
            if (property === "then" || property === "catch" || property === "finally") { return undefined; }
            if (typeof property === "symbol") { return () => ""; }
            if (property === "key") { return "perf-key"; }
            if (property === "currentUser") { return { uid: "perf-user" }; }
            if (property === "val") { return () => null; }
            if (property === "exists") { return () => false; }
            if (property === "toString") { return () => "stub"; }
            if (asyncMethods.has(property)) {
                return () => Promise.resolve(property === "once" || property === "get" ? snapshot
                    : { committed: false, snapshot, user: { uid: "perf-user" } });
            }
            if (property === "onAuthStateChanged") {
                return callback => { setTimeout(() => callback({ uid: "perf-user" }), 0); return () => { }; };
            }
            return stub;
        },
        apply() { return stub; },
        construct() { return stub; }
    });
    window.firebase = stub;
    Math.seedrandom = Math.seedrandom || function () { };
})();
