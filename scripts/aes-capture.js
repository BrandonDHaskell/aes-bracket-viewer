// AES capture script
// 1. Open an AES event page (https://results.advancedeventsystems.com/event/<key>/...).
// 2. Open DevTools (F12) > Console, paste this whole file, press Enter.
// 3. A JSON file downloads. Upload it to the chat.
// Uses only the same-origin endpoints the bracket viewer already calls. Read-only.
(async () => {
    const DIVISION_NAME = '18 Boys';  // used when DIVISION_ID is null
    const DIVISION_ID = null;         // set a number to pick a division explicitly
    const CONCURRENCY = 4;

    const key = location.pathname.match(/^\/event\/([^/?#]+)/)?.[1];
    if (!key) {
        console.error('Open an AES event page first.');
        return;
    }
    const base = `/api/event/${key}`;
    const requests = [];
    const get = async path => {
        const started = performance.now();
        try {
            const response = await fetch(base + path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
            const body = response.ok ? await response.json() : null;
            requests.push({ path, status: response.status, ms: Math.round(performance.now() - started) });
            return body;
        } catch (error) {
            requests.push({ path, error: String(error) });
            return null;
        }
    };

    console.log('[capture] event');
    const event = await get('');
    const divisions = Array.isArray(event?.Divisions) ? event.Divisions : [];
    const label = d => d?.Name || d?.DivisionName || d?.ShortName || '';
    const division = DIVISION_ID != null
        ? divisions.find(d => Number(d.DivisionId) === Number(DIVISION_ID))
        : divisions.find(d => label(d).trim().toLowerCase() === DIVISION_NAME.toLowerCase()) || divisions[0];
    if (!division) {
        console.error('[capture] No divisions found.', divisions);
        return;
    }
    const id = division.DivisionId;
    console.log(`[capture] division ${label(division)} (${id})`);

    const [timestamp, playdays, plays] = await Promise.all([
        get('/timestamp'),
        get(`/division/${id}/playdays`),
        get(`/division/${id}/plays`)
    ]);
    const dates = [...new Set((playdays || []).map(p => String(p.DateTime || '').slice(0, 10)).filter(Boolean))].sort();
    const playsByDate = {};
    for (const date of dates) {
        console.log(`[capture] plays ${date}`);
        playsByDate[date] = await get(`/division/${id}/plays/${date}`);
    }

    const poolIds = [...new Set(Object.values(playsByDate).flat().filter(p => p?.Type === 0).map(p => p.PlayId))];
    const poolSheets = {};
    const queue = [...poolIds];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
            const playId = queue.shift();
            poolSheets[playId] = await get(`/poolsheet/${playId}`);
        }
    }));
    console.log(`[capture] ${poolIds.length} pool sheets`);

    // Field report: every key seen per object type, with a few sample values, so field names
    // can be checked without reading the whole payload.
    const report = {};
    const note = (type, object) => {
        if (!object || typeof object !== 'object' || Array.isArray(object)) return;
        const entry = report[type] || (report[type] = { count: 0, fields: {} });
        entry.count += 1;
        for (const [field, value] of Object.entries(object)) {
            const slot = entry.fields[field] || (entry.fields[field] = { types: [], samples: [] });
            const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
            if (!slot.types.includes(kind)) slot.types.push(kind);
            if (kind !== 'object' && kind !== 'array' && slot.samples.length < 4) {
                const sample = String(value).slice(0, 60);
                if (!slot.samples.includes(sample)) slot.samples.push(sample);
            }
        }
    };
    note('event', event);
    divisions.forEach(d => note('event.Divisions[]', d));
    (playdays || []).forEach(p => note('playday', p));
    (plays?.Plays || []).forEach(p => note('divisionPlays.Plays[]', p));
    const walkTree = node => {
        if (!node || typeof node !== 'object') return;
        note('bracketTreeNode', node);
        if (node.Match) note('bracketMatch', node.Match);
        walkTree(node.TopSource);
        walkTree(node.BottomSource);
    };
    for (const list of Object.values(playsByDate)) {
        for (const play of list || []) {
            note(play?.Type === 0 ? 'dailyPlay(pool)' : play?.Type === 1 ? 'dailyPlay(bracket)' : `dailyPlay(type ${play?.Type})`, play);
            (play?.Teams || []).forEach(t => note('dailyPlay.Teams[]', t));
            (play?.Roots || []).forEach(walkTree);
        }
    }
    for (const sheet of Object.values(poolSheets)) {
        note('poolSheet', sheet);
        note('poolSheet.Pool', sheet?.Pool);
        (sheet?.Pool?.Teams || []).forEach(t => note('poolSheet.Pool.Teams[]', t));
        for (const match of sheet?.Matches || []) {
            note('poolSheet.Matches[]', match);
            note('match.FirstTeam', match.FirstTeam);
            note('match.Court', match.Court);
            (match.Sets || []).forEach(s => note('match.Sets[]', s));
        }
    }

    const bundle = {
        capturedAt: new Date().toISOString(),
        browserTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        url: location.href,
        eventKey: key,
        division: { id, name: label(division) },
        fieldReport: report,
        requests,
        data: { event, timestamp, playdays, plays, playsByDate, poolSheets }
    };
    const text = JSON.stringify(bundle, null, 1);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.download = `aes-capture-${key.slice(0, 12)}-div${id}-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    const failed = requests.filter(r => r.error || r.status >= 400).length;
    console.log(`[capture] done: ${requests.length} requests, ${failed} failed, ${(text.length / 1024).toFixed(0)} KB`);
})();
