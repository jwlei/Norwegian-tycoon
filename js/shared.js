function showDialog(dialogName, isVisible) {
    var dialog = document.querySelector(`#dialog${dialogName}`);
    var game = document.getElementById("DivHele");
    if (isVisible) {
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
    }
};

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