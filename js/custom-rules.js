// Custom rules dialogs: the host's editor (with presets), the join confirmation for public lobbies,
// and the "this game" section of the rules dialog. The rule catalogue lives in game.js.
var CustomRulesUI = (function () {
    var PRESET_COOKIE = "CustomRulesPreset";
    var editorGame = null;
    var draft = {};
    var randomDraw = null;
    var presetJustSaved = false;
    var saveError = "";

    function make(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text != null) { node.textContent = text; }
        return node;
    }

    function countText(count) {
        return count == 1 ? "1 egen regel" : `${count} egne regler`;
    }

    function sameRules(a, b) {
        return JSON.stringify(normalizeCustomRules(a)) == JSON.stringify(normalizeCustomRules(b));
    }

    // The preset follows the player across lobbies; stored as the ids of the rules that are on.
    function savedPreset() {
        var stored = getCookie(PRESET_COOKIE);
        if (!stored) { return null; }
        var ids = String(stored).split(".");
        var rules = normalizeCustomRules(Object.fromEntries(ids.map(id => [id, true])));
        return activeCustomRules(rules).length ? rules : null;
    }

    function storePreset(rules) {
        setCookie(PRESET_COOKIE, activeCustomRules(rules).map(rule => rule.id).join("."), 1000);
    }

    // Each rule is a coin flip (dependent rules only when their requirement is on). Never Standard,
    // and never a repeat of the current draft when another draw exists.
    function drawRandom(current) {
        var drawn = {};
        for (var attempt = 0; attempt < 20; attempt++) {
            drawn = {};
            CUSTOM_RULES.forEach(rule => {
                if (rule.requires && drawn[rule.requires] !== true) { return; }
                drawn[rule.id] = Math.random() < 0.5;
            });
            drawn = normalizeCustomRules(drawn);
            if (activeCustomRules(drawn).length && !sameRules(drawn, current)) { break; }
        }
        return drawn;
    }

    function currentPreset() {
        if (!activeCustomRules(draft).length) { return "standard"; }
        var saved = savedPreset();
        if (saved && sameRules(draft, saved)) { return "saved"; }
        if (randomDraw && sameRules(draft, randomDraw)) { return "random"; }
        return null;
    }

    function presetRow() {
        var preset = currentPreset();
        var saved = savedPreset();
        var row = make("div", "setting-row setting-speed custom-rules-presets");
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", "Forhåndsvalg");
        var text = make("span", "setting-row__text");
        text.appendChild(make("strong", null, "Forhåndsvalg"));
        text.appendChild(make("small", null, {
            standard: "Ingen egne regler.",
            saved: "Dine lagrede regler.",
            random: "Trykk igjen for nye regler."
        }[preset] || "Endret. Lagre som Mine regler for å bruke dem senere."));
        var options = make("span", "speed-options");
        [
            { key: "standard", title: "Standard", rules: () => normalizeCustomRules({}) },
            { key: "saved", title: "Mine regler", rules: () => saved },
            { key: "random", title: "Tilfeldig", rules: () => (randomDraw = drawRandom(draft)) }
        ].forEach(option => {
            var button = make("button", "speed-option", option.title);
            button.type = "button";
            button.dataset.focusKey = `preset-${option.key}`;
            button.setAttribute("aria-pressed", String(preset == option.key));
            if (option.key == "saved" && !saved) {
                button.disabled = true;
                button.title = "Du har ikke lagret Mine regler ennå.";
            }
            button.addEventListener("click", () => {
                draft = Object.assign({}, option.rules());
                presetJustSaved = false;
                renderEditor();
            });
            options.appendChild(button);
        });
        var actions = make("span", "custom-rules-preset-actions");
        var save = make("button", "custom-rules-save-preset", saved ? "Erstatt Mine regler" : "Lagre som Mine regler");
        save.type = "button";
        save.dataset.focusKey = "save-preset";
        save.disabled = preset == "standard" || preset == "saved";
        save.addEventListener("click", () => {
            storePreset(draft);
            presetJustSaved = true;
            renderEditor();
        });
        actions.appendChild(save);
        if (presetJustSaved) {
            actions.appendChild(make("span", "custom-rules-preset-status", "Lagret. Brukes i alle lobbyer du lager."));
        }
        row.append(text, options, actions);
        return row;
    }

    function ruleRow(rule) {
        var on = draft[rule.id] === true;
        var row = make("button", "setting-row");
        row.type = "button";
        row.dataset.focusKey = rule.id;
        row.setAttribute("aria-pressed", String(on));
        var text = make("span", "setting-row__text");
        text.append(make("strong", null, rule.title), make("small", null, rule.summary));
        var track = make("span", "setting-row__switch");
        track.setAttribute("aria-hidden", "true");
        track.appendChild(make("span"));
        row.append(text, track);
        row.addEventListener("click", () => {
            var next = Object.assign({}, draft, { [rule.id]: !on });
            // The rule just turned on wins over the rules it conflicts with.
            if (!on) { (rule.conflicts || []).forEach(id => { next[id] = false; }); }
            draft = normalizeCustomRules(next);
            presetJustSaved = false;
            renderEditor();
        });
        return row;
    }

    function renderEditor() {
        var dialog = document.getElementById("dialogCustomRules");
        var scroller = dialog.querySelector(".dialog-window");
        var scroll = scroller.scrollTop;
        var focusKey = dialog.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
        var body = document.getElementById("customRulesEditor");
        body.replaceChildren(presetRow());
        CUSTOM_RULE_CATEGORIES.forEach(category => {
            var rules = CUSTOM_RULES.filter(rule => rule.category == category.id && rule.requires == null);
            if (!rules.length) { return; }
            body.appendChild(make("h3", "settings-category", category.title));
            var placed = new Set();
            rules.forEach(rule => {
                if (placed.has(rule.id)) { return; }
                // Rules that exclude each other share one box, wherever they sit in the catalogue.
                var rivals = rules.filter(other => (rule.conflicts || []).includes(other.id));
                if (rivals.length) {
                    var box = make("section", "message-settings is-enabled custom-rules-pick-group");
                    box.setAttribute("aria-label", "Velg én av disse");
                    box.appendChild(make("div", "custom-rules-pick-one", "Velg én"));
                    [rule, ...rivals].forEach(member => {
                        placed.add(member.id);
                        box.appendChild(ruleRow(member));
                    });
                    body.appendChild(box);
                    return;
                }
                var dependents = CUSTOM_RULES.filter(other => other.requires == rule.id);
                if (!dependents.length) { body.appendChild(ruleRow(rule)); return; }
                // Same pattern as Settings → Messages: the extra options appear inside the toggle's group.
                var group = make("section", "message-settings");
                group.setAttribute("aria-label", rule.title);
                group.classList.toggle("is-enabled", draft[rule.id] === true);
                group.appendChild(ruleRow(rule));
                dependents.forEach(dependent => {
                    var row = ruleRow(dependent);
                    row.hidden = draft[rule.id] !== true;
                    group.appendChild(row);
                });
                body.appendChild(group);
            });
        });
        var count = activeCustomRules(draft).length;
        document.getElementById("customRulesEditorCount").textContent = saveError || (count ? countText(count) : "Standard");
        scroller.scrollTop = scroll;
        if (focusKey) { dialog.querySelector(`[data-focus-key="${focusKey}"]`)?.focus(); }
    }

    function openEditor(game) {
        if (!game || game.status != "O" || !isLobbyHost(game)) { return; }
        editorGame = game;
        draft = normalizeCustomRules(game.rules);
        randomDraw = null;
        presetJustSaved = false;
        saveError = "";
        renderEditor();
        showDialog("CustomRules", true);
    }

    function saveEditor() {
        try {
            editorGame.setCustomRules(draft);
        } catch (error) {
            saveError = String(error.message || error);
            renderEditor();
            return;
        }
        showDialog("CustomRules", false);
    }

    function detailsList(list, rules, seats) {
        list.replaceChildren();
        rules.forEach(rule => {
            var item = make("li");
            item.append(make("strong", null, rule.title), make("small", null, customRuleDetails(rule, seats)));
            list.appendChild(item);
        });
    }

    // Public lobbies with custom rules ask before joining; the listing only carries the count.
    function confirmJoin(lobby, join) {
        if (!(lobby.customRules > 0)) { join(); return; }
        firebase.database().ref(`boms_1/${lobby.id}/regler`).once("value").then(snapshot => {
            var rules = activeCustomRules(customRulesFromRecord(snapshot.val()));
            if (!rules.length) { join(); return; }
            document.getElementById("joinRulesTitle").textContent = `Bli med i spillet til ${lobby.host}?`;
            document.getElementById("joinRulesIntro").textContent = `Denne lobbyen spiller med ${countText(rules.length)}:`;
            detailsList(document.getElementById("joinRulesList"), rules,
                Math.min(4, (lobby.players || 0) + (lobby.waiting ? 1 : 0)));
            document.getElementById("joinRulesOkButton").onclick = () => {
                showDialog("JoinRules", false);
                join();
            };
            showDialog("JoinRules", true);
        }, () => join());
    }

    function prepareRulesDialog(game) {
        var section = document.getElementById("customRulesSection");
        var rules = game ? activeCustomRules(game.rules) : [];
        section.hidden = rules.length == 0;
        var seats = game ? Math.max(2, game.players.length) : 3;
        var list = document.getElementById("customRulesSectionList");
        list.replaceChildren();
        rules.forEach(rule => {
            var item = make("li");
            item.append(make("strong", null, `${rule.title}:`), document.createTextNode(" "),
                make("span", null, customRuleDetails(rule, seats)));
            list.appendChild(item);
        });
        // Open the player-count tab that matches the game.
        if (game) { document.querySelector(`[data-rules-players="${Math.min(4, seats)}"]`)?.click(); }
    }

    function showRules(game) {
        prepareRulesDialog(game);
        showDialog("Rules", true);
    }

    document.getElementById("customRulesCancelButton").addEventListener("click", () => showDialog("CustomRules", false));
    document.getElementById("customRulesSaveButton").addEventListener("click", saveEditor);
    document.getElementById("joinRulesCancelButton").addEventListener("click", () => showDialog("JoinRules", false));
    // An open rule explanation in the lobby closes on any click outside it.
    document.addEventListener("click", event => {
        if (GameLayout.openCustomRule == null || event.target.closest("#customRuleDetails, .custom-rule-chip")) { return; }
        GameLayout.openCustomRule = null;
        if (GameLayout.customRulesGame) { GameLayout.updateCustomRules(GameLayout.customRulesGame); }
    }, true);

    return { openEditor, confirmJoin, showRules, prepareRulesDialog };
})();
