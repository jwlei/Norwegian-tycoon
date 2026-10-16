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
            { name: "5", singularName: "femer", pluralName: "femere", code: "5" },
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
    getName() { return `${Card.suitInfo(this.suit).name} ${Card.rankInfo(this.rank).name}`; }
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
    toImageDataUri() {
        const code = Card.suitInfo(this.suit).code;
        const rank = this.rank === 1 ? "A" : this.rank > 10 ? { 11: "J", 12: "Q", 13: "K" }[this.rank] : String(this.rank);
        const color = (this.suit === 2 || this.suit === 4) ? "#ad3447" : "#193b35";
        const mark = (x, y, size, rotation = 0) => Card.suitMark(code, x, y, size, color, rotation);
        const corner = `<g font-family="Georgia,serif" font-size="12" font-weight="700" text-anchor="middle" fill="${color}"><text x="12" y="18">${rank}</text>${mark(12, 25, 7)}</g>`;
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
        if (this.rank === 1) {
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
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120">
            <defs><linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdf6"/><stop offset="1" stop-color="#f3ead8"/></linearGradient></defs>
            <rect x="1.5" y="1.5" width="77" height="117" rx="8" fill="url(#paper)" stroke="#cbbd9f" stroke-width="1.5"/>
            <rect x="5" y="5" width="70" height="110" rx="5" fill="none" stroke="#d8cba9" stroke-width=".8"/>
            <path d="M23 10h34M23 110h34" stroke="#d8cba9" stroke-width=".7"/>
            ${corner}
            <g transform="rotate(180 40 60)">${corner}</g>
            ${illustration}
        </svg>`;
        return Card.imageSource(svg);
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