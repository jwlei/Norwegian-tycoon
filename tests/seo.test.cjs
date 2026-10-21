const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const pages = [
    { file: path.join("rules", "index.html"), language: "nb", url: "https://playboms.eu/rules/" },
    { file: path.join("en", "rules", "index.html"), language: "en", url: "https://playboms.eu/en/rules/" }
];
const alternates = [
    ...pages.map(page => [page.language, page.url]),
    ["x-default", pages[0].url]
];

for (const page of pages) {
    test(`${page.language} rules are static, indexable and have language-specific metadata`, () => {
        const html = read(page.file);
        assert.ok(html.includes(`<html lang="${page.language}">`));
        assert.ok(html.includes(`<link rel="canonical" href="${page.url}" />`));
        assert.match(html, /<title>[^<]+<\/title>/);
        assert.match(html, /<meta name="description" content="[^"]+" \/>/);
        assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large" \/>/);
        assert.ok(html.includes(`<meta property="og:url" content="${page.url}" />`));
        for (const [language, url] of alternates) {
            assert.ok(html.includes(`<link rel="alternate" hreflang="${language}" href="${url}" />`));
        }
        assert.equal((html.match(/<h1>/g) || []).length, 1);
        assert.ok((html.match(/<h2>/g) || []).length >= 6);
        assert.ok((html.match(/<h3>/g) || []).length >= 3);
        assert.doesNotMatch(html, /\bhidden\b|<script[^>]+src=|<noscript>/);
        const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
        assert.equal(schema["@type"], "WebPage");
        assert.equal(schema.inLanguage, page.language);
        assert.equal(schema.url, page.url);
        assert.equal(schema.about["@id"], "https://playboms.eu/#game");
        const stylesheet = html.match(/<link rel="stylesheet" href="\/([^"]+)" \/>/)[1];
        assert.ok(fs.existsSync(path.join(root, ...stylesheet.split("/"))));
    });
}

test("sitemap discovers both rules languages with reciprocal alternates", () => {
    const sitemap = read("sitemap.xml");
    assert.match(sitemap, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
    const entries = Array.from(sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g), match => match[1]);
    for (const page of pages) {
        const entry = entries.find(value => value.includes(`<loc>${page.url}</loc>`));
        assert.ok(entry, `${page.url} is in the sitemap`);
        for (const [language, url] of alternates) {
            assert.ok(entry.includes(`<xhtml:link rel="alternate" hreflang="${language}" href="${url}" />`));
        }
    }
    assert.match(read("robots.txt"), /Sitemap: https:\/\/playboms\.eu\/sitemap\.xml/);
});

test("the game does not link to the standalone rules pages", () => {
    const html = read("index.html");
    assert.doesNotMatch(html, /(?:href|src)\s*=\s*["'][^"']*\/rules(?:\/|["'?#])/i);
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema["@id"], "https://playboms.eu/#game");
});
