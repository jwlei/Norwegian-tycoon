const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pages, assetRevision, stampPage } = require("../scripts/stamp-revs.cjs");

const root = path.join(__dirname, "..");

for (const page of pages) {
    test(`${page} references every local script and stylesheet with its current content revision`, () => {
        const html = fs.readFileSync(path.join(root, page), "utf8");
        const assets = Array.from(html.matchAll(/(?:src|href)="(\/?(?:js|css)\/[^"]+)"/g), match => match[1]);
        assert.ok(assets.length > 0);
        for (const reference of assets) {
            const [asset, query] = reference.split("?");
            assert.ok(fs.existsSync(path.join(root, asset.replace(/^\//, ""))), `${asset} exists`);
            assert.equal(query, `rev=${assetRevision(asset)}`,
                `${asset} changed since its revision was stamped; run "npm run stamp"`);
        }
        assert.equal(stampPage(html), html);
    });
}

test("index.html loads every script, with GameLayout's extensions after layout.js and before its users", () => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const order = Array.from(html.matchAll(/<script src="js\/([\w.-]+\.js)/g), match => match[1]);
    const scripts = fs.readdirSync(path.join(root, "js")).filter(file => file.endsWith(".js"));
    assert.deepEqual([...order].sort(), scripts.sort());
    const extensions = scripts.filter(file => /^layout-.+\.js$/.test(file));
    assert.ok(extensions.length > 0);
    for (const extension of extensions) {
        assert.ok(order.indexOf("layout.js") < order.indexOf(extension), extension);
        assert.ok(order.indexOf(extension) < order.indexOf("engine.js"), extension);
    }
});
