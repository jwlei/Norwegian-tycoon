// In-memory stand-in for the Firebase SDK, so the reaction demo runs the real game offline against real bots.
// It covers the Realtime Database calls the game makes. Nothing here can reach production: the SDK is never loaded.
"use strict";
(function () {
    const TIMESTAMP = { ".sv": "timestamp" };
    const LATENCY_MS = 25;
    const root = { ".info": { connected: true, serverTimeOffset: 0 } };
    const listeners = new Set();
    let pushCounter = 0;

    const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const segments = path => String(path || "").split("/").filter(Boolean);

    // Same storage rules as Realtime Database: no nulls, no empty containers, server timestamps resolved.
    function normalize(value) {
        if (value === null || value === undefined) { return undefined; }
        if (typeof value != "object") { return value; }
        if (value[".sv"] == "timestamp") { return Date.now(); }
        if (Array.isArray(value)) {
            const items = value.map(item => {
                const normalized = normalize(item);
                return normalized === undefined ? null : normalized;
            });
            while (items.length && items[items.length - 1] === null) { items.pop(); }
            return items.length ? items : undefined;
        }
        const result = {};
        Object.keys(value).forEach(key => {
            const normalized = normalize(value[key]);
            if (normalized !== undefined) { result[key] = normalized; }
        });
        return Object.keys(result).length ? result : undefined;
    }

    function read(parts) {
        let node = root;
        for (const part of parts) {
            if (node === null || typeof node != "object" || !(part in node)) { return null; }
            node = node[part];
        }
        return node === undefined ? null : node;
    }

    function write(parts, value) {
        const normalized = normalize(value);
        if (parts.length == 0) { return; }
        let node = root;
        const trail = [];
        for (const part of parts.slice(0, -1)) {
            if (node[part] === null || typeof node[part] != "object") { node[part] = {}; }
            trail.push([node, part]);
            node = node[part];
        }
        const last = parts[parts.length - 1];
        if (normalized === undefined) {
            if (Array.isArray(node)) { node[last] = null; } else { delete node[last]; }
        } else {
            node[last] = normalized;
        }
        // Removing the last child removes its parents too.
        for (let index = trail.length - 1; index >= 0; index--) {
            const [parent, key] = trail[index];
            const child = parent[key];
            if (child && typeof child == "object" && Object.keys(child).length == 0) { delete parent[key]; }
        }
    }

    function snapshot(parts) {
        const value = clone(read(parts));
        const self = {
            key: parts.length ? parts[parts.length - 1] : null,
            ref: new Reference(parts),
            val: () => clone(value),
            exists: () => value !== null,
            child: path => snapshot(parts.concat(segments(path))),
            hasChild: path => read(parts.concat(segments(path))) !== null,
            hasChildren: () => value !== null && typeof value == "object",
            numChildren: () => value !== null && typeof value == "object" ? Object.keys(value).length : 0,
            forEach(visit) {
                if (value === null || typeof value != "object") { return false; }
                return Object.keys(value).some(key => visit(snapshot(parts.concat(key))) === true);
            }
        };
        return self;
    }

    function related(a, b) {
        const length = Math.min(a.length, b.length);
        for (let index = 0; index < length; index++) {
            if (a[index] != b[index]) { return false; }
        }
        return true;
    }

    function fire(changed) {
        Array.from(listeners).forEach(listener => {
            if (!listeners.has(listener) || !related(listener.parts, changed)) { return; }
            const text = JSON.stringify(read(listener.parts));
            if (text === listener.lastText) { return; }
            listener.lastText = text;
            listener.callback(snapshot(listener.parts));
        });
    }

    class Reference {
        constructor(parts) {
            this.parts = parts;
            this.key = parts.length ? parts[parts.length - 1] : null;
        }
        get parent() { return this.parts.length ? new Reference(this.parts.slice(0, -1)) : null; }
        get root() { return new Reference([]); }
        toString() { return `memory://${this.parts.join("/")}`; }
        child(path) { return new Reference(this.parts.concat(segments(path))); }
        push(value) {
            const child = this.child(`m${(++pushCounter).toString(36)}${Math.random().toString(36).slice(2, 8)}`);
            if (value !== undefined) { child.set(value); }
            return child;
        }
        set(value) {
            write(this.parts, value);
            fire(this.parts);
            return Promise.resolve();
        }
        update(values) {
            Object.keys(values).forEach(path => write(this.parts.concat(segments(path)), values[path]));
            fire(this.parts);
            return Promise.resolve();
        }
        remove() { return this.set(null); }
        // Commits after a network-like delay, then raises value events before completing, as the SDK does.
        transaction(update, onComplete) {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    let result;
                    try {
                        result = update(clone(read(this.parts)));
                    } catch (error) {
                        if (onComplete) { onComplete(error, false, snapshot(this.parts)); }
                        reject(error);
                        return;
                    }
                    const committed = result !== undefined;
                    if (committed) {
                        write(this.parts, result);
                        fire(this.parts);
                    }
                    const state = snapshot(this.parts);
                    if (onComplete) { onComplete(null, committed, state); }
                    resolve({ committed, snapshot: state });
                }, LATENCY_MS);
            });
        }
        on(eventType, callback) {
            if (eventType != "value") { return callback; }
            const listener = { parts: this.parts, callback, lastText: undefined };
            listeners.add(listener);
            setTimeout(() => {
                if (!listeners.has(listener) || listener.lastText !== undefined) { return; }
                listener.lastText = JSON.stringify(read(listener.parts));
                listener.callback(snapshot(listener.parts));
            }, LATENCY_MS);
            return callback;
        }
        off(eventType, callback) {
            listeners.forEach(listener => {
                if (listener.parts.join("/") == this.parts.join("/") && (!callback || listener.callback === callback)) {
                    listeners.delete(listener);
                }
            });
        }
        once() {
            return new Promise(resolve => setTimeout(() => resolve(snapshot(this.parts)), LATENCY_MS));
        }
        get() { return this.once(); }
        onDisconnect() {
            const done = () => Promise.resolve();
            return { set: done, update: done, remove: done, cancel: done };
        }
        orderByChild() { return this; }
        orderByKey() { return this; }
        orderByValue() { return this; }
        limitToLast() { return this; }
        limitToFirst() { return this; }
        startAt() { return this; }
        endAt() { return this; }
        equalTo() { return this; }
    }

    const database = {
        ref: path => new Reference(segments(path)),
        goOnline() { },
        goOffline() { }
    };
    const user = { uid: "reaction-demo-user" };
    const auth = {
        currentUser: user,
        onAuthStateChanged(callback) { setTimeout(() => callback(user), 0); return () => { }; },
        signInAnonymously: () => Promise.resolve({ user }),
        setPersistence: () => Promise.resolve()
    };
    window.firebase = {
        apps: [],
        initializeApp() { },
        database: Object.assign(() => database, { ServerValue: { TIMESTAMP } }),
        auth: () => auth
    };
})();
