const PlayerIdentity = {
    normalizeName(name) {
        return (name || "").trim().normalize("NFC").toLowerCase();
    },
    isDefaultName(name) {
        return ["", "player", "spiller"].includes(this.normalizeName(name));
    },
    cryptoApi() {
        const subtle = globalThis.crypto && globalThis.crypto.subtle;
        if (!subtle || typeof subtle.digest != "function" ||
            typeof subtle.importKey != "function" || typeof subtle.deriveBits != "function") {
            throw new Error("Nettleseren gir ikke tilgang til Web Crypto. Åpne https://playboms.eu direkte i en oppdatert nettleser og prøv igjen.");
        }
        return subtle;
    },
    async nameKey(name) {
        const subtle = this.cryptoApi();
        const bytes = new TextEncoder().encode(this.normalizeName(name));
        const hash = await subtle.digest("SHA-256", bytes);
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
        const subtle = this.cryptoApi();
        const key = await subtle.importKey("raw", new TextEncoder().encode(pin),
            "PBKDF2", false, ["deriveBits"]);
        const bits = await subtle.deriveBits({
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
    async registrationKey(playerKey) {
        const stats = (await firebase.database().ref(`playerStats/${playerKey}`).once("value")).val();
        if (stats) { return playerKey; }
        if (/^[A-Za-z0-9]{6}$/.test(playerKey)) { return this.allocatePlayerKey(playerKey); }
        // A saved login may outlive a database reset. Verify its alias before reusing a legacy ID.
        const savedProfile = getCookie("playerPinProfile");
        if (savedProfile) {
            const profile = JSON.parse(decodeURIComponent(savedProfile));
            if (Array.isArray(profile) && profile[1] == playerKey && typeof profile[0] == "string") {
                const record = (await firebase.database().ref(`playerNames/${await this.nameKey(profile[0])}`)
                    .once("value")).val();
                if (record && (record.playerKey == playerKey || record.noPinPlayerKey == playerKey ||
                    Object.values(record.pinProfiles || {}).some(value => value.playerKey == playerKey))) {
                    return playerKey;
                }
            }
        }
        return this.allocatePlayerKey();
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
    async resolve(name, playerKey, pin = "", expectedKey = null, inheritedCredential = null) {
        if (this.isDefaultName(name)) {
            if (pin || inheritedCredential) { throw new Error("Velg et eget spillernavn før du bruker PIN."); }
            return { playerKey, hasPin: false };
        }
        if (!pin && !inheritedCredential) {
            const resolvedKey = await this.registrationKey(playerKey);
            if (expectedKey != null && resolvedKey != expectedKey) {
                throw new Error("Dette navnet tilhører en annen spiller-ID. Gå til hovedmenyen før du henter profilen.");
            }
            await this.updatePlayerName(name, resolvedKey);
            return { playerKey: resolvedKey, hasPin: false };
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
        let resolvedKey = profiles[credential] && profiles[credential].playerKey ||
            (oldCredential && profiles[oldCredential] && profiles[oldCredential].playerKey) ||
            (legacyMatch ? previous.playerKey : null);
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
            resolvedKey = resolvedKey || await this.registrationKey(playerKey);
        }
        if (!resolvedKey) {
            if (!previous) {
                resolvedKey = await this.registrationKey(playerKey);
            } else if (pin && unprotectedKey == playerKey && Object.keys(profiles).length == 0 && !previous.pinHash) {
                resolvedKey = unprotectedKey;
            } else if ((previous.pinHash && previous.playerKey == playerKey) ||
                Object.values(profiles).some(profile => profile.playerKey == playerKey)) {
                resolvedKey = await this.allocatePlayerKey();
            } else {
                resolvedKey = await this.registrationKey(playerKey);
            }
        }
        if (expectedKey != null && resolvedKey != expectedKey) {
            throw new Error("Dette navnet tilhører en annen spiller-ID. Gå til hovedmenyen før du henter profilen.");
        }
        const result = await ref.transaction(record => {
            const currentProfiles = record && record.pinProfiles || {};
            const currentProfile = currentProfiles[credential];
            if (currentProfile && currentProfile.playerKey != resolvedKey) { return; }
            if (inheritedCredential && !pin && record && (
                (record.pinHash && record.playerKey != playerKey) ||
                Object.values(currentProfiles).some(profile => profile.pinVersion != 2 && profile.playerKey != playerKey)
            )) { return; }
            if (record && oldCredential && currentProfiles[oldCredential] &&
                currentProfiles[oldCredential].playerKey != resolvedKey) { return; }
            if (record && legacyMatch &&
                (record.playerKey != previous.playerKey || record.pinHash != previous.pinHash ||
                    record.pinSalt != previous.pinSalt)) { return; }
            return Object.assign({}, record || {}, {
                name: name.trim(),
                pinProfiles: Object.assign({}, currentProfiles, {
                    [credential]: { playerKey: resolvedKey, pinVersion: 2 }
                })
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
        const stats = (await firebase.database().ref(`playerStats/${playerKey}`).once("value")).val();
        const count = field => stats && Number.isSafeInteger(stats[field]) && stats[field] >= 0 ? stats[field] : 0;
        return { presidentWins: count("presidentWins"), roundsPlayed: count("roundsPlayed") };
    },
    async winsForName(name, playerKey) {
        return (await this.statsForName(name, playerKey)).presidentWins;
    },
    appearanceRef(playerKey) {
        return firebase.database().ref(`playerAppearance/${playerKey}`);
    },
    normalizeAppearance(record) {
        if (!record || typeof record != "object") { return null; }
        const style = typeof record.style == "string" &&
            (record.style == "botanical" || Card.normalizeStyle(record.style) == record.style) ? record.style : null;
        const foil = typeof record.foil == "string" && Card.normalizeFoil(record.foil) == record.foil
            ? record.foil : null;
        const updatedAt = Number.isFinite(Number(record.updatedAt)) ? Number(record.updatedAt) : 0;
        return style == null && foil == null ? null : { style, foil, updatedAt };
    },
    async saveAppearance(playerKey, style, foil, updatedAt = Date.now()) {
        const value = this.normalizeAppearance({ style, foil, updatedAt });
        if (!playerKey || playerKey == "PC" || value == null) { return; }
        await this.appearanceRef(playerKey).set(value);
    }
};
