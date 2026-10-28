const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const rules = JSON.parse(fs.readFileSync(path.join(root, "database.rules.json"), "utf8")).rules;
const scripts = fs.readdirSync(path.join(root, "js")).filter(file => file.endsWith(".js"))
    .map(file => fs.readFileSync(path.join(root, "js", file), "utf8")).join("\n");

function databaseRoots() {
    const constants = Object.fromEntries(Array.from(scripts.matchAll(/const (\w+_PATH) = "([^"]+)";/g),
        ([, name, value]) => [name, value]));
    const roots = new Set();
    for (const [, reference] of scripts.matchAll(/\.ref\(\s*[`"']([^`"']*)/g)) {
        const first = reference.split("/")[0].replace(/^\$\{(\w+)\}$/, (match, name) => constants[name] ?? match);
        if (first && !first.startsWith(".info")) { roots.add(first); }
    }
    for (const [, name] of scripts.matchAll(/\.ref\((\w+_PATH)\)/g)) { roots.add(constants[name]); }
    return roots;
}

test("every database root used by the game has explicit rules and everything else is denied", () => {
    assert.equal(rules[".read"], false);
    assert.equal(rules[".write"], false);
    const roots = databaseRoots();
    assert.deepEqual([...roots].sort(),
        ["boms_1", "boms_public", "playerAppearance", "playerIds", "playerNames", "playerStats"]);
    for (const name of roots) { assert.ok(rules[name], `${name} has rules`); }
});

test("every readable or writable location requires a signed-in user", () => {
    const visit = (node, location) => {
        for (const [key, value] of Object.entries(node)) {
            if ((key == ".read" || key == ".write") && value !== false) {
                assert.match(value, /^auth != null\b/, `${location}/${key}`);
            } else if (value && typeof value == "object" && !Array.isArray(value)) {
                visit(value, `${location}/${key}`);
            }
        }
    };
    visit(rules, "");
});

test("the leaderboard query is indexed", () => {
    assert.match(scripts, /orderByChild\("lastActiveAt"\)/);
    assert.deepEqual(rules.playerStats[".indexOn"], ["lastActiveAt"]);
});
