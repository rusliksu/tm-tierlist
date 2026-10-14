(() => {
    const aliases = {"TerraLabs Research": "Terralabs Research"};
    const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const canonicalName = (name) => owns(aliases, name) ? aliases[name] : name;

    function migrateRatings(ratings) {
        const next = {...ratings};
        for (const [oldName, name] of Object.entries(aliases)) {
            if (owns(next, oldName)) {
                // A newer canonical entry, including zero, wins over the old spelling.
                if (!owns(next, name)) next[name] = next[oldName];
                delete next[oldName];
            }
        }
        return next;
    }

    function migratePlacements(placements) {
        const existing = new Set(Object.values(placements).flat());
        return Object.fromEntries(Object.entries(placements).map(([tier, names]) => [tier,
            Array.from(new Set(names
                .filter((name) => canonicalName(name) === name || !existing.has(canonicalName(name)))
                .map(canonicalName)))
        ]));
    }

    window.TM_CARD_NAME_COMPAT = {canonicalName, migrateRatings, migratePlacements};
})();
