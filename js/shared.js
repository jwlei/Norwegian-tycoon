function showDialog(dialogName, isVisible) {
    var dialog = document.querySelector(`#dialog${dialogName}`);
    var game = document.getElementById("gameShell");
    if (isVisible) {
        dialog.returnFocusElement = document.activeElement;
        game.inert = true;
        var title = dialog.querySelector(".dialog-title");
        if (title) {
            if (!title.id) { title.id = `dialog${dialogName}Title`; }
            dialog.setAttribute("aria-labelledby", title.id);
        }
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-hidden", "false");
        dialog.classList.add('dialog-container--visible');
        var x = dialog.querySelector(".autofocus");
        if (!x) {
            x = dialog.querySelector(".dialog-window");
            if (x) { x.setAttribute("tabindex", "-1"); }
        }
        if (x) { x.focus(); }
    } else {
        dialog.classList.remove('dialog-container--visible');
        dialog.setAttribute("aria-hidden", "true");
        game.inert = false;
        if (dialog.returnFocusElement instanceof HTMLElement && dialog.returnFocusElement.isConnected) {
            const menuToggle = document.getElementById("gameMenuToggleButton");
            const menuIsClosed = !game.classList.contains("GameMenuOpen");
            if (menuIsClosed && dialog.returnFocusElement.closest("#gameMenu")) {
                if (menuToggle && game.classList.contains("game-active")) {
                    menuToggle.focus();
                } else {
                    document.getElementById("newGameButton").focus();
                }
            } else {
                dialog.returnFocusElement.focus();
            }
        }
    }
};

document.querySelectorAll(".dialog-container").forEach(dialog => {
    dialog.addEventListener("click", event => {
        if (event.target === dialog && dialog.classList.contains("dialog-container--visible")) {
            showDialog(dialog.id.replace(/^dialog/, ""), false);
        }
    });
});

document.addEventListener("keydown", event => {
    var dialog = document.querySelector(".dialog-container--visible");
    if (!dialog) { return; }
    if (event.key == "Escape") {
        event.preventDefault();
        showDialog(dialog.id.replace(/^dialog/, ""), false);
        return;
    }
    if (event.key == "Tab") {
        var focusable = Array.from(dialog.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(element => element.getClientRects().length > 0);
        if (focusable.length == 0) {
            event.preventDefault();
            dialog.querySelector(".dialog-window").focus();
            return;
        }
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
});

var savedCookieValues = Object.create(null);

function setCookie(cookieName, cookieValue, expiryDays) {
    savedCookieValues[cookieName] = String(cookieValue);
    try { localStorage.setItem("norwegian-tycoon-cookie-" + cookieName, String(cookieValue)); } catch (error) { }
    var expiryDate = new Date();
    expiryDate.setTime(expiryDate.getTime() + (expiryDays * 24 * 60 * 60 * 1000));
    var expires = "expires=" + expiryDate.toUTCString();
    var secureAttribute = window.location.protocol == "https:" ? ";Secure" : "";
    try {
        document.cookie = cookieName + "=" + cookieValue + ";" + expires + ";path=/;SameSite=Lax" + secureAttribute;
    } catch (error) { }
}

function getCookie(cookieName) {
    if (Object.prototype.hasOwnProperty.call(savedCookieValues, cookieName)) {
        return savedCookieValues[cookieName];
    }
    var name = cookieName + "=";
    var cookieParts = [];
    try { cookieParts = document.cookie.split(';'); } catch (error) { }
    for (var i = 0; i < cookieParts.length; i++) {
        var c = cookieParts[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    try { return localStorage.getItem("norwegian-tycoon-cookie-" + cookieName) || ""; } catch (error) { }
    return "";
}

function hasClass(element, name) {
    return element.className.split(" ").filter(text => { return text == name; }).length > 0;
}

function setClass(element, name, isEnabled = true) {
    var classes = element.className.split(" ");
    var entries = classes.filter(text => { return text != name; });
    element.className = entries.join(" ") + ((isEnabled) ? ` ${name}` : "");
    return classes.length != element.className.split(" ").length;
}

function generatePlayerKey() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let key = "";
    while (key.length < 6) {
        const bytes = crypto.getRandomValues(new Uint8Array(12));
        for (const value of bytes) {
            if (value < 248 && key.length < 6) { key += characters[value % characters.length]; }
        }
    }
    return key;
}

function getPlayerKey() {
    var key = getCookie("SpillerKey");
    if (key == "") {
        key = generatePlayerKey();
        setCookie("SpillerKey", key, 1000);
        setCookie("playerKeyPending", key, 1000);
    }
    return key;
}

// Saved IDs from the previous theme set map to the closest new theme; light-mode users get a light theme.
const COLOR_THEME_DEFAULT = "modern";
const LEGACY_COLOR_THEMES = {
    gray: "modern", burgundy: "glod", "high-contrast-amber": "kontrast", "high-contrast-blue": "kontrast",
    "high-contrast-violet": "kontrast", amber: "hostlov", classic: "furu", forest: "furu", teal: "solarisert",
    material: "solarisert", solarized: "solarisert", nord: "fjord", "dark-modern": "modern", blue: "atom",
    "one-dark": "atom", gradianto: "vampyr", amethyst: "vampyr"
};
const LEGACY_LIGHT_COLOR_THEMES = { blue: "vs-bla", "dark-modern": "vs-bla", "one-dark": "vs-bla", nord: "vs-bla",
    solarized: "sol", teal: "sol", classic: "sol", forest: "sol", amber: "sol", material: "sol" };

function initializeColorTheme() {
    const root = document.documentElement;
    const options = Array.from(document.querySelectorAll(".color-theme-option"));
    const current = document.getElementById("colorThemeCurrent");
    const currentName = document.getElementById("colorThemeCurrentName");
    const option = theme => options.find(button => button.dataset.colorTheme === theme);

    function resolve(theme) {
        if (option(theme)) { return theme; }
        if (!Object.prototype.hasOwnProperty.call(LEGACY_COLOR_THEMES, theme)) { return COLOR_THEME_DEFAULT; }
        let legacyMode = null;
        try { legacyMode = localStorage.getItem("norwegian-tycoon-theme"); } catch (error) { }
        return legacyMode === "light" ? LEGACY_LIGHT_COLOR_THEMES[theme] || "papir" : LEGACY_COLOR_THEMES[theme];
    }

    function applyColorTheme(theme) {
        const resolved = resolve(theme);
        if (resolved !== theme && Object.prototype.hasOwnProperty.call(LEGACY_COLOR_THEMES, theme)) {
            setCookie("ColorTheme", resolved, 1000);
        }
        const selected = option(resolved) || option(COLOR_THEME_DEFAULT);
        root.dataset.colorTheme = selected.dataset.colorTheme;
        root.dataset.theme = selected.dataset.themeMode === "light" ? "light" : "dark";
        options.forEach(button => {
            button.setAttribute("aria-pressed", String(button === selected));
        });
        current.replaceChildren(selected.querySelector(".color-theme-preview").cloneNode(true));
        const name = selected.querySelector("strong").textContent;
        currentName.textContent = window.I18n ? window.I18n.msg(name) : name;
        const themeColor = typeof document.querySelector === "function" ? document.querySelector('meta[name="theme-color"]') : null;
        if (themeColor && typeof getComputedStyle === "function") {
            themeColor.content = getComputedStyle(root).getPropertyValue("--felt-deep").trim() || themeColor.content;
        }
        document.dispatchEvent(new CustomEvent("colorthemechange"));
    }

    applyColorTheme(getCookie("ColorTheme"));
    document.addEventListener("languagechange", () => applyColorTheme(root.dataset.colorTheme));
    window.addEventListener("storage", event => {
        if (event.key === "norwegian-tycoon-cookie-ColorTheme") {
            applyColorTheme(event.newValue);
        }
    });
    document.getElementById("colorThemeOpenButton").addEventListener("click", () => {
        showDialog("Settings", false);
        showDialog("ColorTheme", true);
    });
    document.getElementById("colorThemeCloseButton").addEventListener("click", () => {
        showDialog("ColorTheme", false);
        showDialog("Settings", true);
    });
    options.forEach(button => {
        button.addEventListener("click", () => {
            setCookie("ColorTheme", button.dataset.colorTheme, 1000);
            applyColorTheme(button.dataset.colorTheme);
            showDialog("ColorTheme", false);
            showDialog("Settings", true);
        });
    });
}

function initializeRulesPlayerOptions() {
    const buttons = Array.from(document.querySelectorAll("[data-rules-players]"));
    buttons.forEach(button => button.addEventListener("click", () => {
        buttons.forEach(option => {
            const selected = option === button;
            option.setAttribute("aria-pressed", String(selected));
            document.getElementById(option.getAttribute("aria-controls")).hidden = !selected;
        });
    }));
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeRulesPlayerOptions, { once: true });
    document.addEventListener("DOMContentLoaded", initializeColorTheme, { once: true });
} else {
    initializeRulesPlayerOptions();
    initializeColorTheme();
}