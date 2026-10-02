/* =========================================================================
 * 4. Data loading, refresh, and scheduling
 * ======================================================================= */

function eventKeyFromLocation() {
    const match = location.pathname.match(/^\/event\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
}

// AES is a single-page app: the event in the URL can change without a reload.
function ensureContext() {
    const key = eventKeyFromLocation();
    if (!key || key === state.eventKey) return false;
    resetEventState(key);
    return true;
}

async function api(path = '') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULTS.fetchTimeoutMs);
    try {
        const response = await fetch(`/api/event/${state.eventKey}${path}`, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`AES returned ${response.status} for ${path || 'event'}`);
        return await response.json();
    } catch (error) {
        if (error?.name === 'AbortError') throw new Error(`AES did not respond within ${DEFAULTS.fetchTimeoutMs / 1000}s (${path || 'event'})`);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function mapLimit(items, limit, worker) {
    const queue = [...items];
    const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
        while (queue.length) await worker(queue.shift());
    });
    await Promise.all(runners);
}

function divisionLabel(division) {
    if (!division) return '';
    return division.Name || division.DivisionName || division.ShortName || `Division ${division.DivisionId}`;
}

function resolveDivision(event, preferredId = null) {
    const divisions = Array.isArray(event?.Divisions) ? event.Divisions : [];
    if (!divisions.length) return null;
    const byId = id => (id == null || id === '' ? null : divisions.find(d => Number(d.DivisionId) === Number(id)) || null);
    return byId(state.divisionId)
        || (!state.hashApplied ? byId(state.hashState?.division) : null)
        || byId(state.prefs.divisionByEvent?.[state.eventKey])
        || byId(preferredId)
        || divisions.find(d => normName(divisionLabel(d)) === normName(state.prefs.divisionName))
        || divisions[0];
}

// A pool sheet from an earlier day whose matches all have results will not change,
// so incremental refreshes reuse it instead of refetching every pool.
function poolSheetSettled(sheet) {
    const matches = sheet?.Matches || [];
    return matches.length > 0 && matches.every(matchHasResult);
}

function captureData() {
    return Object.fromEntries(DATA_FIELDS.map(field => [field, state[field]]));
}

function restoreData(snapshot) {
    Object.assign(state, snapshot);
}

async function loadData({ full = true } = {}) {
    if (state.loading || !state.eventKey) return;
    state.loading = true;
    setRefreshDisabled(true);
    const hadData = state.loaded;
    setStatus(hadData ? 'Checking AES for updates' : 'Loading AES event');
    try {
        // Everything is fetched into locals first. The live model is only replaced once
        // every request has succeeded and the new model has been built.
        const event = await api('');
        const explicit = state.divisionId != null
            || (!state.hashApplied && state.hashState?.division)
            || state.prefs.divisionByEvent?.[state.eventKey] != null;
        const preferredId = hadData || explicit ? null : await myTeamsDivision(event);
        const division = resolveDivision(event, preferredId);
        if (!division) throw new Error('This event has no published divisions yet.');
        const divisionId = Number(division.DivisionId);
        const divisionName = divisionLabel(division);
        if (!hadData) setStatus(`Loading ${divisionName} schedule`);

        const [playdays, master, timestamp] = await Promise.all([
            api(`/division/${divisionId}/playdays`),
            api(`/division/${divisionId}/plays`),
            api('/timestamp').catch(() => null)
        ]);
        const dates = [...new Set((playdays || []).map(day => String(day.DateTime || '').slice(0, 10)).filter(Boolean))].sort();
        if (!dates.length) throw new Error(`AES has not published playdays for ${divisionName} yet.`);

        const dailyPlays = await Promise.all(dates.map(async date => ({
            date,
            plays: (await api(`/division/${divisionId}/plays/${date}`)) || []
        })));

        const today = eventDateString();
        const poolPlays = new Map();
        for (const day of dailyPlays) {
            for (const play of day.plays) {
                if (play.Type === 0 && play.PlayId != null && !poolPlays.has(play.PlayId)) poolPlays.set(play.PlayId, day.date);
            }
        }
        const sameDivision = state.divisionId === divisionId;
        const poolSheets = new Map();
        const poolSheetFailures = [];
        const toFetch = [];
        let reused = 0;
        for (const [playId, date] of poolPlays) {
            const cached = sameDivision ? state.poolSheets.get(playId) : null;
            if (!full && cached && date < today && poolSheetSettled(cached)) {
                poolSheets.set(playId, cached);
                reused += 1;
            } else {
                toFetch.push(playId);
            }
        }
        if (!hadData) setStatus(`Loading ${toFetch.length} pool sheets`);
        await mapLimit(toFetch, DEFAULTS.poolSheetConcurrency, async playId => {
            try {
                poolSheets.set(playId, await api(`/poolsheet/${playId}`));
            } catch (error) {
                const cached = sameDivision ? state.poolSheets.get(playId) : null;
                if (cached) poolSheets.set(playId, cached);
                poolSheetFailures.push({ playId, error: error.message + (cached ? ' (showing last good copy)' : '') });
            }
        });

        const previousSchedule = hadData && sameDivision ? snapshotTeamSchedule() : null;
        const snapshot = captureData();
        try {
            Object.assign(state, {
                event,
                divisionId,
                divisionName,
                detectedTimeZone: detectEventTimeZone(event),
                playdays: playdays || [],
                masterPlays: master?.Plays || [],
                dailyPlays,
                poolSheets,
                poolSheetFailures,
                poolSheetsReused: reused,
                lastUpdatedTimestamp: timestamp?.LastUpdatedTimestamp || state.lastUpdatedTimestamp,
                lastLoadedAt: Date.now(),
                lastSyncedAt: Date.now()
            });
            clearTimeCaches();
            buildGraphModel();
        } catch (error) {
            restoreData(snapshot);
            clearTimeCaches();
            throw error;
        }
        state.loaded = true;
        state.loadError = null;
        afterModelBuilt(hadData);
        if (previousSchedule) notifyScheduleChanges(previousSchedule);
    } catch (error) {
        console.error('[AES Bracket Viewer]', error);
        state.loadError = error.message || String(error);
        if (!state.loaded) {
            const canvas = getViewCanvas();
            if (canvas) canvas.innerHTML = emptyHtml(`AES data could not be loaded: ${state.loadError}. Select Refresh to try again.`);
            setStatus(`AES data could not be loaded: ${state.loadError}`, 'error');
        } else {
            setStatus(`Refresh failed (${state.loadError}). Showing data loaded ${formatDateTime(state.lastLoadedAt)}.`, 'error');
        }
    } finally {
        state.loading = false;
        setRefreshDisabled(false);
        renderStatusChip();
    }
}

function afterModelBuilt(hadData) {
    state.probedDivisions.add(state.divisionId);
    refreshMyTeams();
    applyDefaultsOnce();
    if (!state.hashApplied) applyHashState();
    populateSettings();
    populateClubFilter();
    populateTeamFilter();
    recomputeFilterScope(state.teamFilterId != null && !state.groupFilterPinned);
    populateGroupFilter();
    // Keep the user's trace and selection across refreshes when the nodes still exist.
    if (state.traceNodeKey && state.nodes.has(state.traceNodeKey)) computeTrace(state.traceNodeKey);
    else clearTrace(false);
    if (!state.selectedNodeKey || !state.nodes.has(state.selectedNodeKey)) {
        state.selectedNodeKey = findActiveTeamMatch(state.filterDirectNodes)?.key || null;
    }
    if (!hadData) state.pendingFocusScroll = true;
    updateLauncher();
    renderGraph();
    if (state.notice) {
        setStatus(state.notice);
        state.notice = '';
    }
}

async function refreshIfChanged() {
    if (state.loading || !state.loaded) return false;
    try {
        const timestamp = await api('/timestamp');
        const latest = timestamp?.LastUpdatedTimestamp || null;
        if (!latest) return false;
        if (!state.lastUpdatedTimestamp) {
            state.lastUpdatedTimestamp = latest;
            state.lastSyncedAt = Date.now();
            renderStatusChip();
            return false;
        }
        if (latest === state.lastUpdatedTimestamp) {
            state.lastSyncedAt = Date.now();
            renderStatusChip();
            return false;
        }
        await loadData({ full: false });
        return true;
    } catch (error) {
        console.warn('[AES Bracket Viewer] update check failed', error);
        return false;
    }
}

// One lightweight 1-second tick handles SPA navigation, countdowns, and update checks.
// Checks pause while the tab is hidden unless notifications are on.
function startScheduler() {
    if (state.schedulerTimer) return;
    state.schedulerTimer = window.setInterval(schedulerTick, 1000);
}

function schedulerTick() {
    const now = Date.now();
    const key = eventKeyFromLocation();
    const launcher = document.getElementById(BUTTON_ID);
    if (launcher) launcher.hidden = !key;
    if (!key) {
        if (isOpen()) closeViewer();
        return;
    }
    if (isOpen() && key !== state.eventKey && !state.loading) {
        ensureContext();
        loadData({ full: true });
        return;
    }
    if (isOpen() && now - state.lastCountdownAt >= 30000) {
        state.lastCountdownAt = now;
        updateCountdowns();
    }
    if (!state.loaded || state.loading) return;
    // Starring or unstarring a team on AES takes effect within a second.
    if (key === state.eventKey && aesFavoritesRaw() !== state.favoritesRaw) onFavoritesChanged();
    const foreground = isOpen() && !document.hidden;
    const interval = foreground ? DEFAULTS.freshnessCheckMs : (state.prefs.notify ? DEFAULTS.backgroundCheckMs : null);
    if (interval && now - state.lastCheckAt >= interval) {
        state.lastCheckAt = now;
        refreshIfChanged();
    }
}

function updateCountdowns() {
    document.querySelectorAll(`#${APP_ID} [data-countdown]`).forEach(element => {
        element.textContent = formatRelative(Number(element.dataset.countdown));
    });
}

