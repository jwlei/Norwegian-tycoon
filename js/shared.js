function showDialog(dialogName, isVisible) {
    var dialog = document.querySelector(`#dialog${dialogName}`);
    var game = document.getElementById("DivHele");
    if (isVisible) {
        dialog.returnFocusElement = document.activeElement;
        game.inert = true;
        var title = dialog.querySelector(".dialogTittel");
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
            x = dialog.querySelector(".dialogVindu");
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
            if (menuIsClosed && dialog.returnFocusElement.closest("#DivFKnapper")) {
                if (menuToggle && game.classList.contains("SpillAktivt")) {
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
            dialog.querySelector(".dialogVindu").focus();
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

function setCookie(cookieName, cookieValue, expiryDays) {
    var expiryDate = new Date();
    expiryDate.setTime(expiryDate.getTime() + (expiryDays * 24 * 60 * 60 * 1000));
    var expires = "expires=" + expiryDate.toUTCString();
    document.cookie = cookieName + "=" + cookieValue + ";" + expires + ";path=/";
}

function getCookie(cookieName) {
    var name = cookieName + "=";
    var cookieParts = document.cookie.split(';');
    for (var i = 0; i < cookieParts.length; i++) {
        var c = cookieParts[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

function openFullscreen(element) {
    if (element.requestFullscreen) {
        element.requestFullscreen();
    } else if (element.mozRequestFullScreen) { /* Firefox */
        element.mozRequestFullScreen();
    } else if (element.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
        element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) { /* IE/Edge */
        element.msRequestFullscreen();
    }
}

function closeFullscreen() {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.mozCancelFullScreen) { /* Firefox */
        document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) { /* Chrome, Safari and Opera */
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { /* IE/Edge */
        document.msExitFullscreen();
    }
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

function getPlayerKey() {
    var key = getCookie("SpillerKey");
    if (key == "") {
        for (let i = 0; i < 50; i++) {
            const characters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"];
            key += characters[Math.trunc(Math.random() * (characters.length))];
        }
        setCookie("SpillerKey", key, 1000);
    }
    return key;
}

function initializeThemeToggle() {
    const root = document.documentElement;
    const storageKey = "norwegian-tycoon-theme";
    const themeButtons = document.querySelectorAll(".theme-toggle");
    const storedTheme = localStorage.getItem(storageKey);
    const initialTheme = (storedTheme === "light" || storedTheme === "dark") ? storedTheme : "dark";

    function applyTheme(theme) {
        const isDark = theme === "dark";
        root.dataset.theme = theme;
        themeButtons.forEach(button => {
            const label = button.querySelector(".theme-toggle__label");
            const actionLabel = isDark ? "Bytt til lys modus" : "Bytt til mørk modus";
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
            themeColor.content = isDark ? "#1e1e1e" : "#f3f6f8";
        }
    }

    applyTheme(initialTheme);
    themeButtons.forEach(button => {
        button.addEventListener("click", function () {
            const nextTheme = (root.dataset.theme === "dark") ? "light" : "dark";
            localStorage.setItem(storageKey, nextTheme);
            applyTheme(nextTheme);
        });
    });
    window.addEventListener("storage", event => {
        if (event.key === storageKey) {
            applyTheme(event.newValue === "light" ? "light" : "dark");
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeThemeToggle, { once: true });
} else {
    initializeThemeToggle();
}