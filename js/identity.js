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
    async resolve(name, playerKey, pin = "", newPin = "", expectedKey = null) {
        if (this.isDefaultName(name)) {
            if (pin || newPin) { throw new Error("Velg et eget spillernavn før du setter PIN."); }
            return { playerKey, hasPin: false };
        }
        const ref = firebase.database().ref(`playerNames/${await this.nameKey(name)}`);
        const previous = (await ref.once("value")).val();
        if (previous && previous.pinHash && previous.playerKey != playerKey) {
            if (!pin || await this.pinHash(pin, previous.pinSalt) != previous.pinHash) {
                throw new Error("Navnet har en PIN. Oppgi riktig PIN for å hente spillerprofilen.");
            }
        }
        const resolvedKey = previous ? previous.playerKey : await this.findLegacyKey(name, playerKey) || playerKey;
        if (expectedKey != null && resolvedKey != expectedKey) {
            throw new Error("Dette navnet tilhører en annen spiller-ID. Gå til hovedmenyen før du henter profilen.");
        }
        const pinSalt = newPin ? this.hex(crypto.getRandomValues(new Uint8Array(16))) : null;
        const pinHash = newPin ? await this.pinHash(newPin, pinSalt) : null;
        const result = await ref.transaction(record => {
            if ((record && record.playerKey) != (previous && previous.playerKey) ||
                (record && record.pinHash) != (previous && previous.pinHash) ||
                (record && record.pinSalt) != (previous && previous.pinSalt)) { return; }
            return Object.assign({}, record || {}, {
                name: name.trim(), playerKey: resolvedKey,
                ...(newPin ? { pinSalt, pinHash } : {})
            });
        }, undefined, false);
        if (!result.committed) { throw new Error("Profilen ble endret samtidig. Prøv igjen."); }
        return { playerKey: resolvedKey, hasPin: Boolean(newPin || previous && previous.pinHash) };
    },
    async statsForName(name, playerKey) {
        const empty = { presidentWins: 0, roundsPlayed: 0 };
        if (this.isDefaultName(name)) { return empty; }
        const record = (await firebase.database().ref(`playerNames/${await this.nameKey(name)}`).once("value")).val();
        const key = record ? record.playerKey : await this.findLegacyKey(name, playerKey);
        if (!key) { return empty; }
        const stats = (await firebase.database().ref(`playerStats/${key}`).once("value")).val();
        const count = field => stats && Number.isSafeInteger(stats[field]) && stats[field] >= 0 ? stats[field] : 0;
        return { presidentWins: count("presidentWins"), roundsPlayed: count("roundsPlayed") };
    },
    async winsForName(name, playerKey) {
        return (await this.statsForName(name, playerKey)).presidentWins;
    }
};
