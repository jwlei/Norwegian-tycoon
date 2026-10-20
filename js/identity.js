const PlayerIdentity = {
    normalizeName(name) {
        return (name || "").trim().normalize("NFC").toLowerCase();
    },
    isDefaultName(name) {
        return ["", "player", "spiller"].includes(this.normalizeName(name));
    },
    async nameKey(name) {
        const bytes = new TextEncoder().encode(this.normalizeName(name));
        const hash = await crypto.subtle.digest("SHA-256", bytes);
        return this.hex(new Uint8Array(hash));
    },
    hex(bytes) {
        return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    },
    async pinHash(pin, salt) {
        if (!/^\d{3,4}$/.test(pin)) { throw new Error("PIN må ha 3–4 sifre."); }
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin),
            "PBKDF2", false, ["deriveBits"]);
        const bits = await crypto.subtle.deriveBits({
            name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 210000, hash: "SHA-256"
        }, key, 256);
        return this.hex(new Uint8Array(bits));
    },
    async findLegacyKey(name, playerKey) {
        const ref = firebase.database().ref("playerStats");
        const own = (await ref.child(playerKey).once("value")).val();
        const normalized = this.normalizeName(name);
        if (own && [own.name, ...(Array.isArray(own.names) ? own.names : [])]
            .some(value => this.normalizeName(value) == normalized)) { return playerKey; }
        const snapshot = await ref.orderByChild("name").equalTo(name.trim()).limitToFirst(2).once("value");
        let keys = Object.keys(snapshot.val() || {}).filter(key => key != "PC");
        if (keys.length == 0) {
            // Old records have no normalized name index; only unregistered names need this migration scan.
            const records = (await ref.once("value")).val() || {};
            keys = Object.keys(records).filter(key => key != "PC" &&
                [records[key].name, ...(Array.isArray(records[key].names) ? records[key].names : [])]
                    .some(value => this.normalizeName(value) == normalized));
        }
        if (keys.length > 1) {
            throw new Error("Flere gamle profiler har dette navnet. Bruk enheten du spilte med, eller kontakt administrator.");
        }
        return keys[0] || null;
    },
    async resolve(name, playerKey, pin = "", expectedKey = null) {
        if (this.isDefaultName(name)) {
            if (pin) { throw new Error("Velg et eget spillernavn før du bruker PIN."); }
            return { playerKey, hasPin: false };
        }
        const nameKey = await this.nameKey(name);
        const ref = firebase.database().ref(`playerNames/${nameKey}`);
        const previous = (await ref.once("value")).val();
        // The name hash salts the lookup so different names do not share a PIN fingerprint.
        const credential = pin ? await this.pinHash(pin, nameKey) : null;
        const profiles = previous && previous.pinProfiles || {};
        const legacyMatch = pin && previous && previous.pinHash &&
            await this.pinHash(pin, previous.pinSalt) == previous.pinHash;
        const unprotectedKey = previous && (previous.noPinPlayerKey ||
            (!previous.pinHash && previous.playerKey)) || null;
        let resolvedKey = credential
            ? profiles[credential] && profiles[credential].playerKey || (legacyMatch ? previous.playerKey : null)
            : unprotectedKey;
        if (!resolvedKey) {
            if (!previous) {
                resolvedKey = await this.findLegacyKey(name, playerKey) || playerKey;
            } else if (pin && unprotectedKey && Object.keys(profiles).length == 0 && !previous.pinHash) {
                resolvedKey = unprotectedKey;
            } else {
                resolvedKey = this.hex(crypto.getRandomValues(new Uint8Array(25)));
            }
        }
        if (expectedKey != null && resolvedKey != expectedKey) {
            throw new Error("Dette navnet tilhører en annen spiller-ID. Gå til hovedmenyen før du henter profilen.");
        }
        const result = await ref.transaction(record => {
            if (JSON.stringify(record || null) != JSON.stringify(previous || null)) { return; }
            return Object.assign({}, record || {}, {
                name: name.trim(),
                ...(credential ? { pinProfiles: Object.assign({}, profiles, {
                    [credential]: { playerKey: resolvedKey }
                }) } : { noPinPlayerKey: resolvedKey })
            });
        }, undefined, false);
        if (!result.committed) { throw new Error("Profilen ble endret samtidig. Prøv igjen."); }
        return { playerKey: resolvedKey, hasPin: Boolean(pin) };
    },
    async statsForName(name, playerKey) {
        const empty = { presidentWins: 0, roundsPlayed: 0 };
        if (this.isDefaultName(name)) { return empty; }
        const record = (await firebase.database().ref(`playerNames/${await this.nameKey(name)}`).once("value")).val();
        const profileKeys = record ? [
            record.playerKey, record.noPinPlayerKey,
            ...Object.values(record.pinProfiles || {}).map(profile => profile.playerKey)
        ] : [];
        const key = record
            ? profileKeys.includes(playerKey) ? playerKey : record.noPinPlayerKey || (!record.pinHash ? record.playerKey : null)
            : await this.findLegacyKey(name, playerKey);
        if (!key) { return empty; }
        const stats = (await firebase.database().ref(`playerStats/${key}`).once("value")).val();
        const count = field => stats && Number.isSafeInteger(stats[field]) && stats[field] >= 0 ? stats[field] : 0;
        return { presidentWins: count("presidentWins"), roundsPlayed: count("roundsPlayed") };
    },
    async winsForName(name, playerKey) {
        return (await this.statsForName(name, playerKey)).presidentWins;
    }
};
