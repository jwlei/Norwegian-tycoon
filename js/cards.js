class CardDeck extends Array {
    constructor(...items) {
        super(...items);
    }
    addStandardCards(createCard = function (suit, rank) { return new Card(suit, rank) }) {
        for (let suit = 1; suit <= 4; suit++) {
            for (let rank = 1; rank <= 13; rank++) {
                this.push(createCard(suit, rank));
            }
        }
    }
    shuffle() {
        for (var i = this.length - 1; i > 0; i--) {
            let swapIndex = Math.floor(Math.random() * (i + 1));
            var previousValue = this[i];
            this[i] = this[swapIndex];
            this[swapIndex] = previousValue;
        }
    }
    sortCards() {
        if (this.length <= 1) { return; }
        this.sort(this[0].compareByStrength);
    }
}

class Card {
    static foilConfigNames = {
        holo: "stripes", galaxy: "stardust", v: "prism", vmax: "waves", vstar: "facets",
        "full-art": "rings", "trainer-full-art": "weave", rainbow: "rainbow",
        "rainbow-alt": "contrast", gold: "gold-sheen", radiant: "grid",
        "gallery-holo": "iridescent", "gallery-v": "pearlescent", "gallery-vmax": "rays"
    };
    static foilTreatments = {
        stripes: { opacityReduction: 30, saturation: 75, blend: "soft-light", printedFoil: true, fullReflection: false },
        stardust: { opacityReduction: 30, saturation: 50, blend: "original", printedFoil: true, fullReflection: false },
        prism: { opacityReduction: 20, saturation: 75, blend: "original", printedFoil: false, fullReflection: false },
        waves: { opacityReduction: 0, saturation: 100, blend: "original", printedFoil: false, fullReflection: false },
        facets: { opacityReduction: 30, saturation: 75, blend: "original", printedFoil: true, fullReflection: false },
        rings: { opacityReduction: 20, saturation: 75, blend: "original", printedFoil: true, fullReflection: false },
        weave: { opacityReduction: 20, saturation: 75, blend: "original", printedFoil: true, fullReflection: false },
        rainbow: { opacityReduction: 10, saturation: 100, blend: "original", printedFoil: true, fullReflection: false },
        contrast: { opacityReduction: 30, saturation: 100, blend: "original", printedFoil: false, fullReflection: false },
        "gold-sheen": { opacityReduction: 30, saturation: 100, blend: "original", printedFoil: true, fullReflection: false },
        grid: { opacityReduction: 20, saturation: 100, blend: "original", printedFoil: false, fullReflection: false },
        iridescent: { opacityReduction: 30, saturation: 100, blend: "original", printedFoil: true, fullReflection: false },
        pearlescent: { opacityReduction: 30, saturation: 75, blend: "original", printedFoil: true, fullReflection: false },
        rays: { opacityReduction: 30, saturation: 75, blend: "original", printedFoil: false, fullReflection: false }
    };

    static suitInfo(suitNumber) {
        return [
            {},
            { name: "Spar", code: "S" },
            { name: "Hjerter", code: "H" },
            { name: "Kløver", code: "C" },
            { name: "Ruter", code: "D" }
        ][suitNumber];
    }
    static rankInfo(rankNumber) {
        return [
            {},
            { name: "Ess", singularName: "Ess", pluralName: "Ess", code: "A" },
            { name: "2", singularName: "toer", pluralName: "toere", code: "2" },
            { name: "3", singularName: "treer", pluralName: "treere", code: "3" },
            { name: "4", singularName: "firer", pluralName: "firere", code: "4" },
            { name: "5", singularName: "femmer", pluralName: "femmere", code: "5" },
            { name: "6", singularName: "sekser", pluralName: "seksere", code: "6" },
            { name: "7", singularName: "syver", pluralName: "syvere", code: "7" },
            { name: "8", singularName: "åtter", pluralName: "Åttere", code: "8" },
            { name: "9", singularName: "nier", pluralName: "niere", code: "9" },
            { name: "10", singularName: "tier", pluralName: "tiere", code: "0" },
            { name: "Knekt", singularName: "Knekt", pluralName: "Knekter", code: "J" },
            { name: "Dame", singularName: "Dame", pluralName: "Damer", code: "Q" },
            { name: "Konge", singularName: "Konge", pluralName: "Konger", code: "K" }
        ][rankNumber];
    }
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
    }
    code() { return `${Card.suitInfo(this.suit).code}${Card.rankInfo(this.rank).code}`; }
    getName(includeSuit = true) {
        var rank = Card.rankInfo(this.rank).name;
        return includeSuit ? `${Card.suitInfo(this.suit).name} ${rank}` : rank;
    }
    static suitPath(code) {
        return {
            S: '<path d="M50 8C39 22 10 38 10 57c0 17 18 25 31 16-2 10-8 18-15 24h48c-7-6-13-14-15-24 13 9 31 1 31-16C90 38 61 22 50 8Z"/>',
            H: '<path d="M50 88 14 54C-4 35 8 12 27 12c10 0 18 6 23 15 5-9 13-15 23-15 19 0 31 23 13 42Z"/>',
            C: '<path d="M50 13c-13 0-21 10-19 22-11-7-26 0-26 14 0 13 15 21 27 13-2 12-9 21-17 27h70c-8-6-15-15-17-27 12 8 27 0 27-13 0-14-15-21-26-14 2-12-6-22-19-22Z"/>',
            D: '<path d="M50 5 94 50 50 95 6 50Z"/>'
        }[code];
    }
    static suitMark(code, x, y, size, color, rotation = 0) {
        return `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${size / 100}) translate(-50 -50)" fill="${color}">${Card.suitPath(code)}</g>`;
    }
    static courtIllustration(rank, color) {
        const hair = rank === "Q" ? "#442d2a" : "#352a25";
        const headwear = rank === "J"
            ? '<path d="M31 29c0-8 5-14 11-18 0 8 5 11 10 13l-2 8Z" fill="#c79b43"/><path d="M42 15c-3-7-1-11 4-14 0 7 4 10 7 12" fill="none" stroke="#c79b43" stroke-width="2"/>'
            : '<path d="m29 29-3-11 9 6 5-12 7 12 10-6-3 13Z" fill="#d6b45a" stroke="#765a22" stroke-width="1.5"/><circle cx="40" cy="17" r="2" fill="#fff0b0"/><circle cx="52" cy="22" r="2" fill="#fff0b0"/>';
        const hairShape = rank === "Q"
            ? '<path d="M30 36c-2-10 3-16 10-16s13 6 11 16l5 17-6 5-2-18H32l-2 18-6-5Z" fill="#442d2a"/>'
            : '<path d="M31 35c-2-9 2-15 9-15s12 6 10 15l-3 5H34Z" fill="' + hair + '"/>';
        const beard = rank === "K"
            ? '<path d="M33 43q7 5 14 0l5 9-12 8-12-8Z" fill="' + hair + '"/>'
            : "";
        const figure = `<g>
            <path d="M24 59q2-13 12-16h8q10 3 12 16Z" fill="${color}" stroke="#173d2d" stroke-width="1"/>
            <path d="m34 46 6 8 6-8 4 13H30Z" fill="#f5ead0"/>
            <ellipse cx="40" cy="36" rx="8.5" ry="10" fill="#edc49a" stroke="#684a36" stroke-width="1"/>
            ${hairShape}${headwear}${beard}
            <path d="M36 37h2m5 0h2" stroke="#352a25" stroke-linecap="round" stroke-width="1.3"/>
            <path d="M37 42q3 2 6 0" fill="none" stroke="#8d5045" stroke-linecap="round" stroke-width="1"/>
            <circle cx="40" cy="51" r="2" fill="#d6b45a"/>
        </g>`;
        return `<rect x="18" y="22" width="44" height="76" rx="7" fill="#f3ead8" stroke="${color}" stroke-width="1.5"/>
            <path d="M21 25h38v70H21Z" fill="none" stroke="#d6b45a" stroke-width=".8"/>
            ${figure}
            <g transform="rotate(180 40 60)">${figure}</g>
            <path d="M20 60h40" stroke="#d6b45a" stroke-width="1.5"/>
            <circle cx="40" cy="60" r="2.5" fill="#d6b45a"/>`;
    }
    static pixelSuitMark(code, x, y, size, color, rotation = 0) {
        const pixels = {
            H: ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000", "0000000"],
            S: ["0001000", "0011100", "0111110", "1111111", "1111111", "0001000", "0011100"],
            D: ["0001000", "0011100", "0111110", "1111111", "0111110", "0011100", "0001000"],
            C: ["0011100", "0011100", "1101011", "1111111", "1101011", "0001000", "0011100"]
        }[code];
        const blocks = pixels.map((row, py) => Array.from(row).map((pixel, px) =>
            pixel === "1" ? `<rect x="${px}" y="${py}" width="1" height="1"/>` : ""
        ).join("")).join("");
        return `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${size / 7}) translate(-3.5 -3.5)" fill="${color}" shape-rendering="crispEdges">${blocks}</g>`;
    }
    static normalizeStyle(style, playerName = "", playerKey = "") {
        if (style == "botanical") {
            return Card.hasAllAppearanceUnlocks(playerName, playerKey) || ["mrhotbox", "tåkefyrsten", "bjørn"].includes(
                playerName.trim().toLocaleLowerCase()) ? style : "normal";
        }
        return ["normal", "holo", "gold", "pixel", "parallax", "neon",
            "monochrome", "minimalist", "cyberpunk", "glitched", "cosmic", "origami", "gothic",
            "silver", "crystal"].includes(style)
            ? style : "normal";
    }
    static hasAllAppearanceUnlocks(playerName, playerKey = "") {
        return playerKey == "source" ||
            ["h4cker", "tåkefyrsten"].includes((playerName || "").trim().normalize("NFC").toLowerCase());
    }
    static styleUnlockRounds(style) {
        return {
            normal: 0, botanical: 0,
            monochrome: 5, minimalist: 5, origami: 5, gothic: 5, silver: 5,
            gold: 15, crystal: 15, holo: 15, parallax: 15, cosmic: 15,
            pixel: 30, neon: 30, cyberpunk: 30, glitched: 30
        }[style] ?? null;
    }
    static foilOptions() {
        return [
            { id: "none", name: "Ingen folie" },
            { id: "holo", name: "Stripet" },
            { id: "galaxy", name: "Stjernestøv" },
            { id: "v", name: "Prisme" },
            { id: "vmax", name: "Bølger" },
            { id: "vstar", name: "Fasetter" },
            { id: "full-art", name: "Ringer" },
            { id: "trainer-full-art", name: "Vev" },
            { id: "rainbow", name: "Regnbue" },
            { id: "rainbow-alt", name: "Kontrast" },
            { id: "gold", name: "Gullglans" },
            { id: "radiant", name: "Rutenett" },
            { id: "gallery-holo", name: "Fargespill" },
            { id: "gallery-v", name: "Perlemor" },
            { id: "gallery-vmax", name: "Stråler" }
        ];
    }
    static normalizeFoil(foil) {
        return Card.foilOptions().some(option => option.id == foil) ? foil : "none";
    }
    static foilUnlockWins(foil) {
        return {
            none: 0,
            holo: 3,
            galaxy: 20,
            v: 10,
            vmax: 5,
            vstar: 5,
            "full-art": 3,
            "trainer-full-art": 3,
            radiant: 5,
            "rainbow-alt": 50,
            "gallery-holo": 100,
            "gallery-v": 10,
            "gallery-vmax": 20,
            rainbow: 50,
            gold: 100
        }[foil] ?? null;
    }
    static foilOptionsByUnlock() {
        // Fixed English alphabetical order within each unlock tier, independent of UI language.
        const order = ["none", "full-art", "holo", "trainer-full-art", "vstar", "radiant", "vmax",
            "gallery-v", "v", "gallery-vmax", "galaxy", "rainbow-alt", "rainbow", "gold", "gallery-holo"];
        const options = Card.foilOptions();
        return order.map(id => options.find(option => option.id == id));
    }
    static foilTreatment(foil) {
        return Card.foilTreatments[Card.foilConfigNames[foil]];
    }
    static foilOverlay(foil, applyTreatment = true) {
        foil = Card.normalizeFoil(foil);
        if (foil == "none") { return ""; }
        const treatment = applyTreatment ? Card.foilTreatment(foil) : null;
        const opacity = treatment ? .23 * (1 - treatment.opacityReduction / 100) * Number(treatment.printedFoil) : .23;
        const appearance = treatment ? ` style="filter:saturate(${treatment.saturation / 100});${
            treatment.blend === "original" ? "" : `mix-blend-mode:${treatment.blend};`}"` : "";
        const index = Card.foilOptions().findIndex(option => option.id == foil);
        const angle = { holo: 90, galaxy: 82, v: 133, vmax: -33, vstar: 133,
            "full-art": 133, "trainer-full-art": 133, rainbow: -20, "rainbow-alt": -20,
            gold: 110, radiant: 55, "gallery-holo": -22, "gallery-v": 133, "gallery-vmax": 133 }[foil];
        const gold = foil == "gold";
        const colors = gold ? ["#775120", "#e0bc63", "#fff2bf", "#c4963a", "#775120"] :
            ["#ff7773", "#ffed5f", "#a8ff5f", "#83fff7", "#7894ff", "#d875ff", "#ff7773"];
        const spectrum = `<linearGradient id="card-foil-spectrum" gradientTransform="rotate(${angle} .5 .5)">${colors.map((color, i) =>
            `<stop offset="${i / (colors.length - 1)}" stop-color="${color}"/>`).join("")}</linearGradient>`;
        const pattern = foil == "galaxy"
            ? Array.from({ length: 22 }, (_, i) => `<circle cx="${(i * 37 + 11) % 80}" cy="${(i * 43 + 7) % 120}" r="${i % 3 + 0.5}" fill="#fff" opacity="${i % 2 ? 0.18 : 0.6}"/>`).join("")
            : foil == "radiant"
                ? '<path d="M0 0h12v12H0zM12 12h12v12H12z" fill="#fff" opacity=".4"/>'
                : `<path d="M0 0v24M${3 + index % 5} 0v24" stroke="#fff" stroke-width="${foil == "holo" ? 1 : 0.6}" opacity=".6"/>
                    <path d="m0 0 24 24m-24 0 24-24" stroke="#182244" stroke-width=".6" opacity=".35"/>`;
        const texture = `<pattern id="card-foil-texture" width="${foil == "galaxy" ? 80 : 9 + index}" height="${foil == "galaxy" ? 120 : 9 + index}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})">${pattern}</pattern>`;
        return `<defs>${spectrum}${texture}<clipPath id="card-foil-clip">
            <rect x="1.5" y="1.5" width="77" height="117" rx="8"/>
        </clipPath></defs><g data-foil="${foil}" opacity="${opacity}"${appearance} clip-path="url(#card-foil-clip)">
            <rect x="1.5" y="1.5" width="77" height="117" fill="url(#card-foil-spectrum)"/>
            <rect x="1.5" y="1.5" width="77" height="117" fill="url(#card-foil-texture)" opacity=".7"/>
        </g>`;
    }
    static imageCache = new Map();
    toImageDataUri(style = "normal", cardFoil = "none", applyFoilTreatment = true) {
        const cacheKey = JSON.stringify([this.suit, this.rank, style, cardFoil, applyFoilTreatment]);
        if (Card.imageCache.has(cacheKey)) { return Card.imageCache.get(cacheKey); }
        const code = Card.suitInfo(this.suit).code;
        const rank = this.rank === 1 ? "A" : this.rank > 10 ? { 11: "J", 12: "Q", 13: "K" }[this.rank] : String(this.rank);
        const isRed = (this.suit === 2 || this.suit === 4);
        const theme = {
            normal: { color: isRed ? "#ad3447" : "#193b35", paper: ["#fffdf6", "#f3ead8"], edge: "#cbbd9f", inner: "#d8cba9" },
            holo: { color: isRed ? "#b02a52" : "#1f2f6b", paper: ["#f4f1ff", "#d9ecff"], edge: "#9aa6ff", inner: "#b9c2ff" },
            gold: { color: isRed ? "#8f2a14" : "#3b2605", paper: ["#fff0a6", "#e0ae2f"], edge: "#8a5f0f", inner: "#b8841c" },
            pixel: { color: isRed ? "#ee5173" : "#7af2ce", paper: ["#24334d", "#111a2b"], edge: "#89a6cf", inner: "#435c80" },
            parallax: { color: isRed ? "#a73572" : "#203f86", paper: ["#edf6ff", "#c3c9ed"], edge: "#7e8cce", inner: "#a2b2e0" },
            neon: { color: isRed ? "#ff60c8" : "#55edff", paper: ["#170f2d", "#080e20"], edge: "#7657ff", inner: "#473b83" },
            monochrome: { color: "#242424", paper: ["#fafafa", "#e6e6e6"], edge: "#555555", inner: "#aaaaaa" },
            minimalist: { color: isRed ? "#b62b42" : "#22313b", paper: ["#ffffff", "#ffffff"], edge: "#c5cdd2", inner: "#ffffff" },
            cyberpunk: { color: isRed ? "#fff34d" : "#a3ff45", paper: ["#17251a", "#080e0b"], edge: "#e8ef35", inner: "#4b7535" },
            glitched: { color: isRed ? "#ff85ce" : "#7cf4ed", paper: ["#201d34", "#111423"], edge: "#d087e8", inner: "#4d4867" },
            cosmic: { color: isRed ? "#ffb4d8" : "#c8d6ff", paper: ["#252251", "#0c142a"], edge: "#9d9bdf", inner: "#565b96" },
            origami: { color: isRed ? "#ae3943" : "#245a63", paper: ["#fff7e9", "#e8dcc9"], edge: "#b9a88d", inner: "#d0bea2" },
            gothic: { color: isRed ? "#f4a1ab" : "#e5ddd0", paper: ["#30232d", "#120f18"], edge: "#b69e78", inner: "#685565" },
            silver: { color: isRed ? "#823447" : "#263346", paper: ["#f8fbff", "#aab8c8"], edge: "#65788d", inner: "#8fa0b3" },
            crystal: { color: isRed ? "#8a2867" : "#1a427a", paper: ["#f0fdff", "#cad8f8"], edge: "#749cbf", inner: "#a5bde3" },
            botanical: { color: isRed ? "#c7a85e" : "#92d98c", paper: ["#143b2a", "#071c16"], edge: "#b8a15b", inner: "#3c7048" }
        }[style] || null;
        const palette = theme || { color: isRed ? "#ad3447" : "#193b35", paper: ["#fffdf6", "#f3ead8"], edge: "#cbbd9f", inner: "#d8cba9" };
        const color = palette.color;
        const mark = (x, y, size, rotation = 0) => style === "pixel"
            ? Card.pixelSuitMark(code, x, y, size, color, rotation)
            : Card.suitMark(code, x, y, size, color, rotation);
        const font = ["pixel", "cyberpunk", "glitched"].includes(style) ? "monospace"
            : ["minimalist", "cosmic", "origami"].includes(style) ? "Arial,sans-serif" : "Georgia,serif";
        const corner = `<g font-family="${font}" font-size="12" font-weight="700" text-anchor="middle" fill="${color}"><text x="12" y="18">${rank}</text>${mark(12, 25, 7)}</g>`;
        const positions = {
            2: [[40, 38], [40, 82]],
            3: [[40, 34], [40, 60], [40, 86]],
            4: [[27, 36], [53, 36], [27, 84], [53, 84]],
            5: [[27, 36], [53, 36], [40, 60], [27, 84], [53, 84]],
            6: [[27, 32], [53, 32], [27, 60], [53, 60], [27, 88], [53, 88]],
            7: [[27, 32], [53, 32], [40, 45], [27, 60], [53, 60], [27, 88], [53, 88]],
            8: [[27, 32], [53, 32], [40, 43], [27, 60], [53, 60], [40, 77], [27, 88], [53, 88]],
            9: [[27, 30], [53, 30], [27, 48], [53, 48], [40, 60], [27, 72], [53, 72], [27, 90], [53, 90]],
            10: [[27, 30], [53, 30], [40, 40], [27, 50], [53, 50], [27, 70], [53, 70], [40, 80], [27, 90], [53, 90]]
        };
        let illustration;
        if (style === "minimalist") {
            illustration = `<text x="40" y="66" text-anchor="middle" font-family="${font}" font-size="32" font-weight="400" fill="${color}">${rank}</text>
                ${mark(40, 83, 12)}`;
        } else if (["cyberpunk", "glitched", "cosmic", "origami", "gothic", "silver", "crystal"].includes(style)) {
            illustration = `${mark(40, 56, 32)}
                <text x="40" y="89" text-anchor="middle" font-family="${font}" font-size="20" font-weight="700" fill="${color}">${rank}</text>`;
            if (style === "glitched") {
                illustration = `<defs><clipPath id="glitch-band"><path d="M18 43h44v7H18zM18 59h44v5H18z"/></clipPath></defs>
                    <g clip-path="url(#glitch-band)"><g transform="translate(-3 0)">${Card.suitMark(code, 40, 56, 34, "#ff55b8")}</g>
                    <g transform="translate(3 0)">${Card.suitMark(code, 40, 56, 34, "#4ffff0")}</g></g>${illustration}
                    <path d="M21 49h12m15 11h14M24 74h8" stroke="#a1fff5" stroke-width="2"/>`;
            } else if (style === "origami") {
                illustration += `<path d="m28 49 12 7 12-7M40 40v32m-12-9 12-7 12 7" fill="none" stroke="${palette.paper[0]}" stroke-width=".9" opacity=".7"/>`;
            }
        } else if (style === "monochrome") {
            illustration = this.rank === 1 || this.rank >= 11
                ? `${mark(40, 52, 34)}<text x="40" y="86" text-anchor="middle" font-family="${font}" font-size="20" fill="${color}">${rank}</text>`
                : positions[this.rank].map(([x, y]) => mark(x, y, 13, y > 60 ? 180 : 0)).join("");
        } else if (style === "pixel" && (this.rank === 1 || this.rank >= 11)) {
            illustration = `<path d="M22 28h36v4h4v56h-4v4H22v-4h-4V32h4Z" fill="none" stroke="${palette.inner}" stroke-width="2" shape-rendering="crispEdges"/>
                ${mark(40, 53, 28)}
                <text x="40" y="82" text-anchor="middle" font-family="monospace" font-size="16" font-weight="bold" fill="${color}">${rank}</text>`;
        } else if (style === "pixel") {
            illustration = positions[this.rank].map(([x, y]) => mark(x, y, 13, y > 60 ? 180 : 0)).join("");
        } else if (this.rank === 1) {
            illustration = `<circle cx="40" cy="60" r="25" fill="#f5eddc" stroke="#d6b45a" stroke-width="1.5"/>
                <circle cx="40" cy="60" r="21" fill="none" stroke="${color}" stroke-opacity=".4" stroke-width=".8"/>
                <path d="M40 31v58M11 60h58M20 40l40 40m0-40L20 80" stroke="#d6b45a" stroke-opacity=".7" stroke-width="1"/>
                ${mark(40, 60, 38)}`;
        } else if (this.rank >= 11) {
            illustration = Card.courtIllustration(rank, color);
        } else {
            illustration = `<circle cx="40" cy="60" r="22" fill="none" stroke="#d6b45a" stroke-opacity=".22" stroke-width="1"/>
                <path d="M40 35v50M15 60h50M22 42l36 36m0-36L22 78" stroke="#d6b45a" stroke-opacity=".18" stroke-width="1"/>
                ${positions[this.rank].map(([x, y]) => mark(x, y, 13, y > 60 ? 180 : 0)).join("")}`;
        }
        const foil = style === "holo"
            ? `<defs><linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#ff5fa2" stop-opacity=".32"/><stop offset=".25" stop-color="#ffd25f" stop-opacity=".28"/>
                    <stop offset=".5" stop-color="#5fff9c" stop-opacity=".3"/><stop offset=".75" stop-color="#5fb8ff" stop-opacity=".32"/>
                    <stop offset="1" stop-color="#b45fff" stop-opacity=".32"/></linearGradient></defs>
                <rect x="1.5" y="1.5" width="77" height="117" rx="8" fill="url(#foil)"/>`
            : style === "gold"
                ? `<defs><linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
                        <stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#fff" stop-opacity=".45"/>
                        <stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
                    <rect x="1.5" y="1.5" width="77" height="117" rx="8" fill="url(#sheen)"/>`
                : style === "silver"
                    ? `<defs><linearGradient id="silver-sheen" x1="0" y1="0" x2="1" y2=".4">
                        <stop stop-color="#ffffff" stop-opacity="0"/><stop offset=".4" stop-color="#ffffff" stop-opacity=".55"/>
                        <stop offset=".5" stop-color="#51657e" stop-opacity=".1"/><stop offset=".7" stop-color="#ffffff" stop-opacity=".4"/>
                        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>
                        <rect x="2" y="2" width="76" height="116" rx="8" fill="url(#silver-sheen)"/>`
                    : "";
        const depth = style === "parallax"
            ? `<g fill="none" stroke="${palette.edge}" stroke-width="1">
                <path d="M8 30 40 12 72 30 40 48Z M8 46 40 28 72 46 40 64Z M8 62 40 44 72 62 40 80Z" opacity=".3"/>
                <path d="M8 78 40 60 72 78 40 96Z M8 94 40 76 72 94 40 112Z" opacity=".5"/></g>`
            : style === "botanical"
                ? `<g fill="#69b968" opacity=".2" transform="translate(40 60)">
                    <path d="M0 25C-7 8-8-13 0-39 8-13 7 8 0 25Z"/>
                    <path d="M0 25C-18 13-27-1-29-22-10-13-2 3 0 25Z M0 25C18 13 27-1 29-22 10-13 2 3 0 25Z"/>
                    <path d="M0 25C-21 23-31 16-35 3-16 2-5 11 0 25Z M0 25C21 23 31 16 35 3 16 2 5 11 0 25Z"/>
                    <path d="M0 25v17" fill="none" stroke="#b8a15b" stroke-width="2"/>
                  </g>
                  <path d="M8 9Q40 32 72 9M8 111Q40 88 72 111" fill="none" stroke="#7ca379" stroke-width="1" opacity=".5"/>`
                : "";
        const ornament = {
            cyberpunk: `<g fill="none" stroke="#a3ff45" stroke-width=".8">
                <path d="M7 35v-4h11l6-6h32l6 6h11v8M7 85v4h11l6 6h32l6-6h11v-8"/>
                <path d="M10 42v32m60-28v32" stroke-dasharray="7 3"/>
                <path d="M22 12h13m10 96h13" stroke="#fff34d" stroke-width="2"/>
                <circle cx="24" cy="25" r="1.5"/><circle cx="56" cy="95" r="1.5"/></g>
                <path d="M6 100h10v3H6zm58-83h10v3H64z" fill="#fff34d"/>`,
            glitched: `<g fill="#7cf4ed" opacity=".35"><path d="M7 34h15v2H7zm46 4h20v1H53zM9 92h17v2H9zm44-8h19v2H53z"/>
                <path d="M6 29h68m-68 9h68m-68 17h68m-68 17h68m-68 20h68" fill="none" stroke="#a6a0cf" stroke-width=".4"/></g>`,
            cosmic: `<g fill="#d2dcff">${Array.from({ length: 28 }, (_, index) =>
                `<circle cx="${9 + index * 23 % 62}" cy="${10 + index * 37 % 99}" r="${index % 4 == 0 ? 0.8 : 0.4}" opacity="${index % 3 == 0 ? 0.8 : 0.35}"/>`).join("")}</g>
                <g fill="none" stroke="#ad9ae0" opacity=".65"><ellipse cx="40" cy="56" rx="27" ry="13" transform="rotate(-32 40 56)"/>
                <circle cx="40" cy="56" r="27" stroke-width=".5"/></g><circle cx="64" cy="43" r="2.5" fill="#f3c7dd"/>`,
            origami: `<path d="M5 34 40 18 75 34 40 60Z" fill="#ffffff" opacity=".25"/>
                <path d="M5 34 40 60 5 85Z" fill="#b9a88d" opacity=".15"/>
                <path d="m75 34-35 26 35 25Z" fill="#8f7b64" opacity=".12"/>
                <path d="M5 34 40 60 75 34M5 85l35-25 35 25M40 18v84" fill="none" stroke="#a99579" stroke-width=".5" opacity=".5"/>
                <path d="M60 5h15v15Z" fill="#d0bea2"/><path d="m60 5 15 15H60Z" fill="#fffaf0"/>`,
            gothic: `<g fill="none" stroke="#b69e78" stroke-width=".8">
                <path d="M19 96V46Q19 31 40 20q21 11 21 26v50Z"/>
                <path d="M23 92V46q0-12 17-22 17 10 17 22v46Z" opacity=".5"/>
                <path d="M27 29q13 15 26 0M28 100h24m-19 4h14"/>
                <circle cx="40" cy="32" r="4"/><path d="M40 28v8m-4-4h8"/>
                <path d="m8 40 4 5-4 5-4-5Zm64 30 4 5-4 5-4-5Z"/></g>`,
            silver: `<g fill="none" stroke="#718399">
                <rect x="19" y="28" width="42" height="67" rx="16" stroke-width=".6"/>
                <rect x="22" y="31" width="36" height="61" rx="13" stroke-width=".4"/>
                <path d="m40 21 4 4-4 4-4-4Zm0 73 4 4-4 4-4-4Z" fill="#f8fbff"/>
                <path d="M9 36v48m62-48v48" stroke-dasharray="1 2" opacity=".6"/></g>`,
            crystal: `<g stroke="#8eaad6" stroke-width=".5" stroke-linejoin="round">
                <path d="m40 20 25 21-6 44-19 18-19-18-6-44Z" fill="#ffffff" fill-opacity=".2"/>
                <path d="M40 20 27 43l13 42 13-42Z" fill="#ffffff" fill-opacity=".45"/>
                <path d="m15 41 12 2-6 42 19 18-13-60 13-23m25 21-12 2 6 42-19 18 13-60-13-23" fill="#a8b8ef" fill-opacity=".22"/>
                <path d="m40 20 25 21-25 44-25-44Zm0 65v18" fill="none"/>
                </g><path d="M64 23v10m-5-5h10M12 89v7m-3-3.5h6" stroke="#ffffff" stroke-width="1.5"/>`
        }[style] || "";
        const glow = style === "neon"
            ? `<defs><filter id="neon" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
            : "";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120">
            <defs><linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette.paper[0]}"/><stop offset="1" stop-color="${palette.paper[1]}"/></linearGradient></defs>
            ${glow}
            <rect x="1.5" y="1.5" width="77" height="117" rx="${style === "pixel" ? 0 : 8}" fill="url(#paper)" stroke="${palette.edge}" stroke-width="1.5"/>
            <rect x="5" y="5" width="70" height="110" rx="${style === "pixel" ? 0 : 5}" fill="none" stroke="${palette.inner}" stroke-width=".8"/>
            <path d="M23 10h34M23 110h34" stroke="${palette.inner}" stroke-width=".7"/>
            ${depth}
            ${ornament}
            ${style === "silver" ? foil : ""}
            <g${style === "neon" ? ' filter="url(#neon)"' : ""}>
            ${corner}
            <g transform="rotate(180 40 60)">${corner}</g>
            ${illustration}
            </g>
            ${style === "silver" ? "" : foil}
            ${Card.foilOverlay(cardFoil, applyFoilTreatment)}
        </svg>`;
        const source = Card.imageSource(svg);
        // Bound retained SVGs when players browse many style/foil combinations.
        if (Card.imageCache.size >= 256) {
            Card.imageCache.delete(Card.imageCache.keys().next().value);
        }
        Card.imageCache.set(cacheKey, source);
        return source;
    }
    static imageSource(svg) {
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }
    static compareByStrength(a, b) {
        return (a.suit - b.suit) * 100 + (a.rank - b.rank);
    }
    static createBack(variant = 0) {
        const background = (variant == 0) ? "#174a35" : "#713a43";
        const ornament = (variant == 0) ? "#e2c76b" : "#f4e2b2";
        return {
            toImageDataUri() {
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120">
                    <defs><linearGradient id="back" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="#102c25"/></linearGradient></defs>
                    <rect x="1.5" y="1.5" width="77" height="117" rx="8" fill="url(#back)" stroke="${ornament}" stroke-width="1.5"/>
                    <rect x="6" y="6" width="68" height="108" rx="5" fill="none" stroke="${ornament}" stroke-width="1"/>
                    <rect x="10" y="10" width="60" height="100" rx="3" fill="none" stroke="${ornament}" stroke-opacity=".55" stroke-width=".7"/>
                    <path d="M40 18 47 31 61 31 51 41 55 55 40 47 25 55 29 41 19 31 33 31Z" fill="none" stroke="${ornament}" stroke-width="1.5" stroke-linejoin="round"/>
                    <path d="M40 48v24M28 60h24M32 52l16 16m0-16L32 68" stroke="${ornament}" stroke-opacity=".8" stroke-width="1.5"/>
                    <circle cx="40" cy="60" r="8" fill="${background}" stroke="${ornament}" stroke-width="1.5"/>
                    <circle cx="40" cy="60" r="3" fill="${ornament}"/>
                    <path d="M40 73 47 86 61 86 51 96 55 108 40 100 25 108 29 96 19 86 33 86Z" fill="none" stroke="${ornament}" stroke-width="1.5" stroke-linejoin="round" transform="rotate(180 40 90)"/>
                </svg>`;
                return Card.imageSource(svg);
            },
            getName() { return ""; }
        }
    }
}