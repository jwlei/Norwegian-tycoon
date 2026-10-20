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
    async allocatePlayerKey(candidate = null) {
        const token = this.hex(crypto.getRandomValues(new Uint8Array(16)));
        for (let attempt = 0; attempt < 10; attempt++) {
            const key = candidate || generatePlayerKey();
            const ref = firebase.database().ref(`playerIds/${key}`);
            const ownedToken = getCookie(`playerIdToken_${key}`);
            const stats = (await firebase.database().ref(`playerStats/${key}`).once("value")).val();
            if (!stats) {
                const result = await ref.transaction(record => {
                    if (record && record != ownedToken) { return; }
                    return record || token;
                }, undefined, false);
                if (result.committed) {
                    setCookie(`playerIdToken_${key}`, result.snapshot.val(), 1000);
                    return key;
                }
            }
            candidate = null;
        }
        throw new Error("Kunne ikke opprette en unik spiller-ID. Prøv igjen.");
    },
    async pinHash(pin, salt) {
        if (!this.isRecoveryPin(pin)) { throw new Error("PIN må ha 6 sifre. Eldre PIN kan fortsatt brukes til gjenoppretting."); }
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin),
            "PBKDF2", false, ["deriveBits"]);
        const bits = await crypto.subtle.deriveBits({
            name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 210000, hash: "SHA-256"
        }, key, 256);
        return this.hex(new Uint8Array(bits));
    },
    isRecoveryPin(pin) {
        return /^(?:\d{3,4}|\d{6})$/.test(pin);
    },
    rememberedPinCredential(playerKey) {
        const credential = getCookie("playerPinCredential");
        return getCookie("playerPinKey") == playerKey && /^[a-f0-9]{64}$/.test(credential)
            ? credential : null;
    },
    async updatePlayerName(name, playerKey) {
        const updatedAt = Date.now();
        await firebase.database().ref(`playerStats/${playerKey}`).transaction(record => {
            // Profiles join the leaderboard only after their first completed round.
            if (!record || record.nameUpdatedAt > updatedAt) { return; }
            const names = Array.isArray(record.names) ? record.names.filter(value => typeof value == "string") : [];
            for (const value of [record.name, name.trim()]) {
                if (typeof value == "string" && !names.includes(value)) { names.push(value); }
            }
            return Object.assign({}, record, { name: name.trim(), names, nameUpdatedAt: updatedAt });
        }, undefined, false);
    },
    async findLegacyKey(name, playerKey) {
        const ref = firebase.database().ref("playerStats");
        const own = (await ref.child(playerKey).once("value")).val();
        const normalized = this.normalizeName(name);
        if (own && [own.name, ...(Array.isArray(own.names) ? own.names : [])]
            .some(value => this.normalizeName(value) == normalized)) { return playerKey; }
        const snapshot = await ref.orderByChild("name").equalTo(name.trim()).limitToFirst(2).once("value");
        let keys = Object.keys(snapshot.val() || {}).filter(key => key != "PC");
        if (keys.length < 2) {
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
    async resolve(name, playerKey, pin = "", expectedKey = null, inheritedCredential = null) {
        if (this.isDefaultName(name)) {
            if (pin || inheritedCredential) { throw new Error("Velg et eget spillernavn før du bruker PIN."); }
            return { playerKey, hasPin: false };
        }
        const nameKey = await this.nameKey(name);
        const ref = firebase.database().ref(`playerNames/${nameKey}`);
        const previous = (await ref.once("value")).val();
        if (inheritedCredential && !/^[a-f0-9]{64}$/.test(inheritedCredential)) {
            throw new Error("Ugyldig lagret PIN-profil. Logg inn med navn og PIN på nytt.");
        }
        // A stable fingerprint lets aliases keep the PIN without storing its plaintext.
        const credential = pin ? await this.pinHash(pin, "norwegian-tycoon-profile-pin-v1") : inheritedCredential;
        const profiles = previous && previous.pinProfiles || {};
        const oldCredential = pin ? await this.pinHash(pin, nameKey) : null;
        const legacyMatch = pin && previous && previous.pinHash &&
            await this.pinHash(pin, previous.pinSalt) == previous.pinHash;
        const unprotectedKey = previous && (previous.noPinPlayerKey ||
            (!previous.pinHash && previous.playerKey)) || null;
        let resolvedKey = credential
            ? profiles[credential] && profiles[credential].playerKey ||
                (oldCredential && profiles[oldCredential] && profiles[oldCredential].playerKey) ||
                (legacyMatch ? previous.playerKey : null)
            : unprotectedKey;
        if (pin && pin.length != 6 && !resolvedKey) {
            throw new Error("Nye PIN må ha 6 sifre. Eldre PIN virker bare for eksisterende profiler.");
        }
        if (inheritedCredential && !pin) {
            if (resolvedKey && resolvedKey != playerKey) {
                throw new Error("Navnet og PIN tilhører en annen spiller-ID. Velg et annet navn.");
            }
            if (!resolvedKey && previous && (
                (previous.pinHash && previous.playerKey != playerKey) ||
                Object.values(profiles).some(profile => profile.pinVersion != 2 && profile.playerKey != playerKey)
            )) {
                throw new Error("Navnet har en eldre PIN-profil. Skriv inn PIN for å registrere navnebyttet.");
            }
            resolvedKey = playerKey;
        }
        if (!resolvedKey) {
            if (!previous) {
                resolvedKey = await this.findLegacyKey(name, playerKey);
                if (!resolvedKey) {
                    resolvedKey = getCookie("playerKeyPending") == playerKey
                        ? await this.allocatePlayerKey(playerKey) : playerKey;
                }
            } else if (pin && unprotectedKey && Object.keys(profiles).length == 0 && !previous.pinHash) {
                resolvedKey = unprotectedKey;
            } else {
                resolvedKey = await this.allocatePlayerKey();
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
                    [credential]: { playerKey: resolvedKey, pinVersion: 2 }
                }) } : { noPinPlayerKey: resolvedKey })
            });
        }, undefined, false);
        if (!result.committed) { throw new Error("Profilen ble endret samtidig. Prøv igjen."); }
        if (/^[A-Za-z0-9]{6}$/.test(resolvedKey)) {
            const token = (await firebase.database().ref(`playerIds/${resolvedKey}`).once("value")).val();
            if (token) { setCookie(`playerIdToken_${resolvedKey}`, token, 1000); }
        }
        await this.updatePlayerName(name, resolvedKey);
        return { playerKey: resolvedKey, hasPin: Boolean(credential), pinCredential: credential };
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
