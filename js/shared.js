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
            const menuToggle = document.getElementById("BnGameMenuToggle");
            const menuIsClosed = !game.classList.contains("GameMenuOpen");
            if (menuIsClosed && dialog.returnFocusElement.closest("#gameMenu")) {
                if (menuToggle && game.classList.contains("game-active")) {
                    menuToggle.focus();
                } else {
                    document.getElementById("BnHNySpill").focus();
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

function initializeThemeToggle() {
    const root = document.documentElement;
    const storageKey = "norwegian-tycoon-theme";
    const themeButtons = document.querySelectorAll(".theme-toggle");
    let storedTheme = null;
    try { storedTheme = localStorage.getItem(storageKey); } catch (error) { }
    let preferredTheme = (storedTheme === "light" || storedTheme === "dark") ? storedTheme : "dark";

    function applyTheme(theme) {
        const amoled = root.dataset.colorTheme === "amoled";
        if (amoled) { theme = "dark"; }
        const isDark = theme === "dark";
        root.dataset.theme = theme;
        themeButtons.forEach(button => {
            const label = button.querySelector(".theme-toggle__label");
            const actionLabel = amoled ? "AMOLED Black bruker mørk modus" :
                (isDark ? "Bytt til lys modus" : "Bytt til mørk modus");
            button.disabled = amoled;
            const description = button.querySelector(".setting-row__text small");
            if (description) {
                description.textContent = amoled ? actionLabel : "Bytt mellom mørkt og lyst tema";
            }
            button.setAttribute("aria-pressed", String(isDark));
            if (label) {
                label.textContent = isDark ? "Mørk" : "Lys";
            }
            button.setAttribute(
                "aria-label",
                `${isDark ? "Mørk" : "Lys"} modus. ${actionLabel}`
            );
            button.title = actionLabel;
        });
        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) {
            themeColor.content = amoled ? "#000000" : (isDark ? "#1e1e1e" : "#f3f6f8");
        }
    }

    applyTheme(preferredTheme);
    document.addEventListener("colorthemechange", () => applyTheme(preferredTheme));
    themeButtons.forEach(button => {
        button.addEventListener("click", function () {
            preferredTheme = (root.dataset.theme === "dark") ? "light" : "dark";
            try { localStorage.setItem(storageKey, preferredTheme); } catch (error) { }
            applyTheme(preferredTheme);
        });
    });
    window.addEventListener("storage", event => {
        if (event.key === storageKey) {
            preferredTheme = event.newValue === "light" ? "light" : "dark";
            applyTheme(preferredTheme);
        }
    });
}

function initializeColorTheme() {
    const root = document.documentElement;
    const options = Array.from(document.querySelectorAll(".color-theme-option"));
    const current = document.getElementById("colorThemeCurrent");
    const currentName = document.getElementById("colorThemeCurrentName");

    function applyColorTheme(theme) {
        const selected = options.find(button => button.dataset.colorTheme === theme) ||
            options.find(button => button.dataset.colorTheme === "teal");
        root.dataset.colorTheme = selected.dataset.colorTheme;
        options.forEach(button => {
            button.setAttribute("aria-pressed", String(button === selected));
        });
        current.replaceChildren(selected.querySelector(".color-theme-preview").cloneNode(true));
        const name = selected.querySelector("strong").textContent;
        currentName.textContent = window.I18n ? window.I18n.msg(name) : name;
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
        showDialog("Innstillinger", false);
        showDialog("Fargetema", true);
    });
    document.getElementById("colorThemeCloseButton").addEventListener("click", () => {
        showDialog("Fargetema", false);
        showDialog("Innstillinger", true);
    });
    options.forEach(button => {
        button.addEventListener("click", () => {
            setCookie("ColorTheme", button.dataset.colorTheme, 1000);
            applyColorTheme(button.dataset.colorTheme);
            showDialog("Fargetema", false);
            showDialog("Innstillinger", true);
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
    document.addEventListener("DOMContentLoaded", initializeThemeToggle, { once: true });
    document.addEventListener("DOMContentLoaded", initializeColorTheme, { once: true });
} else {
    initializeRulesPlayerOptions();
    initializeThemeToggle();
    initializeColorTheme();
}