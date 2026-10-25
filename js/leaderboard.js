const PlayerLeaderboard = {
    isBot(record) {
        return record.isBot === true || (typeof record.id == "string" &&
            (record.id.startsWith("bot-") || record.id == "PC"));
    },
    async load(includeBots = false) {
        // Add .indexOn: ["lastActiveAt"] at /playerStats in the existing database rules.
        const ref = firebase.database().ref("playerStats");
        const rows = [];
        let cursor = null;
        while (rows.length < 50) {
            let query = ref.orderByChild("lastActiveAt");
            if (cursor) { query = query.endBefore(cursor.time, cursor.id); }
            const snapshot = await query.limitToLast(50).once("value");
            const entries = [];
            snapshot.forEach(child => { entries.push({ ...child.val(), id: child.key }); });
            entries.reverse();
            for (const record of entries) {
                const isBot = PlayerLeaderboard.isBot(record);
                if ((!isBot || includeBots) && record.id != "PC" &&
                    typeof record.name == "string" && !PlayerIdentity.isDefaultName(record.name) &&
                    Number.isFinite(record.lastActiveAt) && record.lastActiveAt > 0) {
                    rows.push(record);
                    if (rows.length == 50) { break; }
                }
            }
            const last = entries[entries.length - 1];
            if (entries.length < 50 || !last || !(last.lastActiveAt > 0)) { break; }
            cursor = { time: last.lastActiveAt, id: last.id };
        }
        return rows;
    },
    sort(rows, column, direction) {
        return rows.slice().sort((a, b) => {
            const first = a[column];
            const second = b[column];
            if (column == "placementScore") {
                if (!Number.isFinite(first)) { return Number.isFinite(second) ? 1 : a.name.localeCompare(b.name); }
                if (!Number.isFinite(second)) { return -1; }
            }
            const difference = column == "name"
                ? a.name.localeCompare(b.name, "nb")
                : (Number(first) || 0) - (Number(second) || 0);
            return difference * (direction == "ascending" ? 1 : -1) ||
                a.name.localeCompare(b.name, "nb") || a.id.localeCompare(b.id, "en");
        });
    }
};

function initializeLeaderboard() {
    const message = text => window.I18n ? window.I18n.msg(text) : text;
    let rows = [];
    let column = "roundsPlayed";
    let direction = "descending";
    let requestId = 0;
    let playerIdTimer = null;
    let showBots = getCookie("LeaderboardShowBots") == "true";
    const botsToggle = document.getElementById("leaderboardBotsToggleButton");
    botsToggle.setAttribute("aria-pressed", String(showBots));
    const playerIdPopup = document.getElementById("leaderboardPlayerId");
    const body = document.getElementById("leaderboardRows");
    const status = document.getElementById("leaderboardStatus");
    const headers = Array.from(document.querySelectorAll("[data-leaderboard-sort]"));
    function hidePlayerId() {
        if (playerIdTimer != null) { clearTimeout(playerIdTimer); }
        playerIdTimer = null;
        playerIdPopup.hidden = true;
        playerIdPopup.textContent = "";
    }
    document.getElementById("dialogLeaderboard").addEventListener("scroll", hidePlayerId, true);
    window.addEventListener("resize", hidePlayerId);
    function render() {
        hidePlayerId();
        headers.forEach(button => button.closest("th").setAttribute("aria-sort",
            button.dataset.leaderboardSort == column ? direction : "none"));
        body.replaceChildren();
        PlayerLeaderboard.sort(rows, column, direction).forEach(record => {
            const row = document.createElement("tr");
            for (const field of ["name", "roundsPlayed", "presidentWins", "bomsCount",
                "placementScore", "longestPresidentStreak", "longestBomsStreak"]) {
                const cell = document.createElement("td");
                if (field == "name") {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "leaderboard-player-name";
                    const isBot = PlayerLeaderboard.isBot(record);
                    button.textContent = record.name + (isBot ? " (AI)" : "");
                    button.title = button.textContent;
                    button.setAttribute("aria-controls", "leaderboardPlayerId");
                    button.addEventListener("click", () => {
                        hidePlayerId();
                        // Stats keys are splash player IDs. Legacy keys remain unchanged on the splash,
                        // but have no six-character ID to display here; never shorten or replace them.
                        playerIdPopup.textContent = typeof record.id == "string" &&
                            record.id.length == 6 && /^[A-Za-z0-9]{6}$/.test(record.id)
                            ? `ID ${record.id}` : message("Sekstegns-ID utilgjengelig");
                        playerIdPopup.hidden = false;
                        const anchor = button.getBoundingClientRect();
                        const container = playerIdPopup.offsetParent.getBoundingClientRect();
                        const left = anchor.right - container.left + 6;
                        playerIdPopup.style.left = `${left}px`;
                        playerIdPopup.style.top = `${anchor.top - container.top + anchor.height / 2}px`;
                        playerIdPopup.style.maxWidth = `${Math.max(1, container.width - left - 8)}px`;
                        playerIdTimer = setTimeout(hidePlayerId, 5000);
                    });
                    cell.appendChild(button);
                } else {
                    cell.textContent = field == "placementScore"
                    ? Number.isFinite(record[field]) ? record[field].toFixed(2) : "–"
                    : String(Number.isSafeInteger(record[field]) && record[field] >= 0 ? record[field] : 0);
                }
                cell.dataset.i18nSkip = "";
                row.appendChild(cell);
            }
            body.appendChild(row);
        });
    }
    headers.forEach(button => button.addEventListener("click", () => {
        const next = button.dataset.leaderboardSort;
        direction = next == column
            ? direction == "descending" ? "ascending" : "descending"
            : next == "placementScore" || next == "name" ? "ascending" : "descending";
        column = next;
        render();
    }));
    async function loadRows() {
        const request = ++requestId;
        column = "roundsPlayed";
        direction = "descending";
        rows = [];
        render();
        status.textContent = message("Henter leaderboard…");
        try {
            const result = await PlayerLeaderboard.load(showBots);
            if (request != requestId) { return; }
            rows = result;
            status.textContent = rows.length == 0 ? message("Ingen registrerte runder ennå.") : "";
            render();
        } catch (error) {
            if (request != requestId) { return; }
            console.error("Kunne ikke hente leaderboard.", error);
            status.textContent = message("Kunne ikke hente leaderboard. Lukk og åpne igjen for å prøve på nytt.");
        }
    }
    botsToggle.addEventListener("click", () => {
        showBots = !showBots;
        setCookie("LeaderboardShowBots", showBots, 1000);
        botsToggle.setAttribute("aria-pressed", String(showBots));
        return loadRows();
    });
    document.getElementById("leaderboardOpenButton").addEventListener("click", event => {
        event.preventDefault();
        showDialog("Leaderboard", true);
        return loadRows();
    });
}

initializeLeaderboard();
