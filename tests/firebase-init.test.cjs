const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "firebase-init.js"), "utf8");

function load({ signIn = () => Promise.resolve() } = {}) {
    const events = [];
    let authListener = null;
    const warnings = [];
    const firebase = {
        initializeApp: config => events.push(`init:${config.projectId}`),
        database: () => ({
            goOffline: () => events.push("offline"),
            goOnline: () => events.push("online")
        }),
        auth: () => ({
            onAuthStateChanged: listener => { authListener = listener; },
            signInAnonymously: () => { events.push("signIn"); return signIn(); }
        })
    };
    vm.runInContext(source, vm.createContext({ firebase, console: { warn: (...args) => warnings.push(args) } }));
    return { events, warnings, auth: user => authListener(user) };
}

test("the database stays offline until an anonymous user is signed in", async () => {
    const f = load();
    assert.deepEqual(f.events, ["init:tycoon-240ff", "offline"]);
    f.auth(null);
    await Promise.resolve();
    assert.deepEqual(f.events.slice(2), ["signIn"], "No connection before sign-in completes");
    f.auth({ uid: "anonymous" });
    f.auth({ uid: "anonymous" });
    assert.deepEqual(f.events.slice(2), ["signIn", "online"], "Connects once");
});

test("a restored session connects immediately without signing in again", () => {
    const f = load();
    f.auth({ uid: "returning" });
    assert.deepEqual(f.events, ["init:tycoon-240ff", "offline", "online"]);
});

test("the game still connects when anonymous sign-in is unavailable", async () => {
    const f = load({ signIn: () => Promise.reject(new Error("auth/operation-not-allowed")) });
    f.auth(null);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.events.slice(2), ["signIn", "online"]);
    assert.equal(f.warnings.length, 1);
});
