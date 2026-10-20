"use strict";

const foilNames = {
    holo: "Striped", galaxy: "Stardust", v: "Prism", vmax: "Waves", vstar: "Facets",
    "full-art": "Rings", "trainer-full-art": "Weave", rainbow: "Rainbow",
    "rainbow-alt": "Contrast", gold: "Gold sheen", radiant: "Grid",
    "gallery-holo": "Color play", "gallery-v": "Pearl", "gallery-vmax": "Rays"
};
const variants = [
    { id: "plain", name: "No foil", detail: "Readability reference" },
    { id: "current", name: "Current", detail: "Unmodified production effect" },
    { id: "A", name: "A - Soft finish", detail: "Full-card foil, lower intensity" },
    { id: "B", name: "B - Clear window", detail: "Strong edges, clean center" },
    { id: "C", name: "C - Soft center", detail: "Original texture, faded center" }
];
const styleControl = document.getElementById("style");
const cardControl = document.getElementById("card");
const comparisons = document.getElementById("comparisons");
const status = document.getElementById("status");
const storageKey = "foil-readability-choices-v1";
const choices = {};
const foils = Card.foilOptions().filter(foil => foil.id != "none");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let frame = null;

try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if (saved == null || Array.isArray(saved) || typeof saved != "object") {
        throw new Error("Stored choices are not an object.");
    }
    for (const foil of foils) {
        if (["A", "B", "C"].includes(saved[foil.id])) { choices[foil.id] = saved[foil.id]; }
    }
} catch (error) {
    console.error("Could not load sandbox choices.", error);
    status.textContent = "Could not load saved choices. You can still compare and copy new choices.";
}

for (const style of ["normal", "monochrome", "minimalist", "pixel", "neon", "cyberpunk",
    "glitched", "cosmic", "origami", "gothic", "silver", "crystal", "holo", "gold", "parallax"]) {
    styleControl.add(new Option(style, style));
}

function updateChoices() {
    document.getElementById("choices").value = JSON.stringify(choices, null, 2);
}

function choose(foil, variant) {
    choices[foil] = variant;
    updateChoices();
    try {
        localStorage.setItem(storageKey, JSON.stringify(choices));
        status.textContent = `${foil}: ${variant} selected. ${Object.keys(choices).length}/${foils.length} chosen.`;
    } catch (error) {
        console.error("Could not save sandbox choices.", error);
        status.textContent = "Could not save choices locally. Use View / copy my choices to keep them.";
    }
}

function setLight(x, y) {
    comparisons.style.setProperty("--pointer-x", `${x}%`);
    comparisons.style.setProperty("--pointer-y", `${y}%`);
}

function render() {
    comparisons.replaceChildren();
    const [suit, rank] = cardControl.value.split(":").map(Number);
    const card = new Card(suit, rank);
    const source = card.toImageDataUri(styleControl.value, "none");
    for (const foil of foils) {
        const section = document.createElement("section");
        section.className = "foil-section";
        section.dataset.foilId = foil.id;
        const heading = document.createElement("h2");
        heading.textContent = `${foilNames[foil.id] || foil.name} `;
        const id = document.createElement("code");
        id.textContent = foil.id;
        heading.appendChild(id);
        const grid = document.createElement("div");
        grid.className = "comparison-grid";
        for (const variant of variants) {
            const figure = document.createElement("figure");
            figure.className = "candidate";
            const preview = document.createElement("span");
            preview.className = `card-preview card-preview--${styleControl.value}`;
            preview.dataset.foil = variant.id == "plain" ? "none" : foil.id;
            if (["A", "B", "C"].includes(variant.id)) { preview.dataset.variant = variant.id; }
            const image = document.createElement("img");
            image.src = source;
            image.alt = `${card.getName()} - ${foilNames[foil.id]} ${variant.name}`;
            image.draggable = false;
            preview.appendChild(image);
            if (preview.dataset.variant) {
                for (const corner of ["top", "bottom"]) {
                    const clean = image.cloneNode();
                    clean.alt = "";
                    clean.setAttribute("aria-hidden", "true");
                    clean.className = `clean-corners clean-corners--${corner}`;
                    preview.appendChild(clean);
                }
            }
            const caption = document.createElement("figcaption");
            if (preview.dataset.variant) {
                const label = document.createElement("label");
                const radio = document.createElement("input");
                radio.type = "radio";
                radio.name = `choice-${foil.id}`;
                radio.value = variant.id;
                radio.checked = choices[foil.id] == variant.id;
                radio.addEventListener("change", () => choose(foil.id, variant.id));
                label.append(radio, ` ${variant.name}`);
                caption.appendChild(label);
            } else {
                caption.textContent = variant.name;
            }
            const detail = document.createElement("small");
            detail.textContent = variant.detail;
            caption.appendChild(detail);
            figure.append(preview, caption);
            grid.appendChild(figure);
        }
        section.append(heading, grid);
        comparisons.appendChild(section);
    }
    updateActivity();
}

function updateActivity() {
    for (const preview of comparisons.querySelectorAll(".card-preview")) {
        preview.classList.toggle("is-tilting", document.getElementById("active").checked);
    }
}

function updateLight() {
    setLight(Number(document.getElementById("lightX").value), Number(document.getElementById("lightY").value));
}

function stopSweep() {
    if (frame != null) { cancelAnimationFrame(frame); }
    frame = null;
}

function updateSweep() {
    stopSweep();
    if (!document.getElementById("animate").checked || motion.matches || document.hidden) { return; }
    const tick = time => {
        setLight(50 + Math.sin(time / 1800) * 45, 50 + Math.cos(time / 2300) * 45);
        frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
}

styleControl.addEventListener("change", render);
cardControl.addEventListener("change", render);
document.getElementById("size").addEventListener("change", event => {
    comparisons.style.setProperty("--sample-width", `${event.target.value}px`);
});
document.getElementById("background").addEventListener("change", event => {
    document.documentElement.dataset.theme = event.target.value;
});
for (const id of ["lightX", "lightY"]) { document.getElementById(id).addEventListener("input", updateLight); }
document.getElementById("active").addEventListener("change", updateActivity);
document.getElementById("animate").addEventListener("change", updateSweep);
motion.addEventListener("change", updateSweep);
document.addEventListener("visibilitychange", updateSweep);
comparisons.addEventListener("pointermove", event => {
    const preview = event.target.closest(".card-preview");
    if (!preview || document.getElementById("animate").checked) { return; }
    const bounds = preview.getBoundingClientRect();
    setLight(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)),
        Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100)));
});
comparisons.addEventListener("pointerleave", updateLight);
document.getElementById("copy").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(document.getElementById("choices").value);
        status.textContent = "Choices copied.";
    } catch (error) {
        console.error("Could not copy sandbox choices.", error);
        document.getElementById("choices").select();
        status.textContent = "Clipboard access failed. Copy the selected text manually.";
    }
});
updateChoices();
render();
