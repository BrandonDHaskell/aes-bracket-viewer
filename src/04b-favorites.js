/* =========================================================================
 * 4b. My teams: AES favorites, remembered teams, division lookup, switcher
 * ======================================================================= */

// AES keeps favorites per event, in this browser only:
//   localStorage "aes/favorite/teams/<eventKey>" = {"TeamIds":[150886, ...]}
// The viewer reads that list and never writes it. Because AES's list is per event, the
// viewer also remembers favorites by team code (stable across events) and falls back to
// those remembered teams at events where nothing is starred yet.
const AES_FAVORITES_PREFIX = 'aes/favorite/teams/';
const SAVED_TEAMS_LIMIT = 12;
const TEAM_LOOKUP_EVENTS = 10;

function aesFavoritesRaw(eventKey = state.eventKey) {
    if (!eventKey) return null;
    try {
        return localStorage.getItem(`${AES_FAVORITES_PREFIX}${eventKey}`);
    } catch {
        return null;
    }
}

function parseFavoriteIds(raw) {
    try {
        const parsed = JSON.parse(raw || 'null');
        const ids = Array.isArray(parsed?.TeamIds) ? parsed.TeamIds : (Array.isArray(parsed) ? parsed : []);
        return [...new Set(ids.map(Number).filter(id => Number.isFinite(id) && id > 0))];
    } catch {
        return [];
    }
}

// teamId -> { divisionId, name, code } for this event, remembered across sessions so the
// division lookup runs at most once per event.
function knownTeamDivisions() {
    const all = state.prefs.teamDivisions || (state.prefs.teamDivisions = {});
    return all[state.eventKey] || (all[state.eventKey] = {});
}

function saveKnownTeamDivisions() {
    const all = state.prefs.teamDivisions || {};
    const keys = Object.keys(all);
    while (keys.length > TEAM_LOOKUP_EVENTS) delete all[keys.shift()];
    savePrefs({ teamDivisions: all });
}

function mergeSavedTeams(entries) {
    const current = state.prefs.savedTeams || [];
    const merged = [];
    for (const entry of [...entries, ...current]) {
        if (!entry?.code) continue;
        const existing = merged.find(other => normName(other.code) === normName(entry.code));
        if (!existing) merged.push({ code: entry.code, name: entry.name || entry.code });
        else if (existing.name === existing.code && entry.name && entry.name !== entry.code) existing.name = entry.name;
    }
    const next = merged.slice(0, SAVED_TEAMS_LIMIT);
    const unchanged = next.length === current.length
        && next.every((entry, index) => entry.code === current[index].code && entry.name === current[index].name);
    if (!unchanged) savePrefs({ savedTeams: next });
    return next.filter(entry => !current.some(other => normName(other.code) === normName(entry.code))).length;
}

function myTeamRefs() {
    const known = knownTeamDivisions();
    if (state.favoriteIds.length) {
        return { source: 'aes', refs: state.favoriteIds.map(id => ({ id, ...(known[id] || {}) })) };
    }
    const saved = state.prefs.savedTeams || [];
    return { source: saved.length ? 'saved' : 'none', refs: saved.map(entry => ({ id: null, code: entry.code, name: entry.name })) };
}

function resolveMyTeamRef(ref) {
    const inDivision = (ref.id != null && state.teamById.get(Number(ref.id)))
        || (ref.code && state.teamDirectory.find(team => normName(team.code) === normName(ref.code)));
    if (inDivision) return { id: inDivision.id, name: inDivision.name, divisionId: state.divisionId, team: inDivision };
    const known = knownTeamDivisions();
    if (ref.id != null && known[ref.id]) return { id: Number(ref.id), name: known[ref.id].name, divisionId: known[ref.id].divisionId, team: null };
    if (ref.code) {
        const hit = Object.entries(known).find(([, info]) => normName(info.code) === normName(ref.code));
        if (hit) return { id: Number(hit[0]), name: hit[1].name, divisionId: hit[1].divisionId, team: null };
    }
    return null;
}

function refreshMyTeams() {
    state.favoritesRaw = aesFavoritesRaw();
    state.favoriteIds = parseFavoriteIds(state.favoritesRaw);
    const { source, refs } = myTeamRefs();
    state.myTeamSource = source;
    state.myTeamRefs = refs;
    state.myTeams = [...new Set(refs.map(resolveMyTeamRef).map(resolved => resolved?.team).filter(Boolean))];
    state.defaultTeam = state.myTeams[0] || null;
    rememberMyTeams();
}

function rememberMyTeams() {
    if (!state.teamDirectory.length) return;
    const known = knownTeamDivisions();
    let changed = false;
    for (const team of state.myTeams) {
        const entry = { divisionId: state.divisionId, name: team.name, code: team.code || '' };
        const previous = known[team.id];
        if (!previous || previous.divisionId !== entry.divisionId || previous.code !== entry.code || previous.name !== entry.name) {
            known[team.id] = entry;
            changed = true;
        }
    }
    if (changed) saveKnownTeamDivisions();
    if (state.myTeamSource === 'aes') {
        mergeSavedTeams(state.favoriteIds.map(id => known[id]).filter(info => info?.code).map(info => ({ code: info.code, name: info.name })));
    } else if (state.myTeamSource === 'saved') {
        mergeSavedTeams(state.myTeams.filter(team => team.code).map(team => ({ code: team.code, name: team.name })));
    }
}

function isMyTeam(participant) {
    return state.myTeams.some(team => isSameTeam(participant, team));
}

// Finds which division each wanted team plays in by reading the first two playdays of each
// division's pools. A team's code is not a reliable guide: "16-1" teams can play in 18 Boys.
async function locateTeams(event, { ids = [], codes = [] } = {}) {
    const known = knownTeamDivisions();
    const knownCodes = new Set(Object.values(known).map(info => normName(info.code)).filter(Boolean));
    const wantedIds = new Set(ids.map(Number).filter(id => id > 0 && !known[id]));
    const wantedCodes = new Set(codes.map(normName).filter(code => code && !knownCodes.has(code)));
    const remaining = () => wantedIds.size + wantedCodes.size;
    let found = false;
    // Look in the last-used division first; a coach's teams are usually there.
    const lastUsed = normName(state.prefs.divisionName);
    const divisions = [...(Array.isArray(event?.Divisions) ? event.Divisions : [])]
        .sort((a, b) => Number(normName(divisionLabel(b)) === lastUsed) - Number(normName(divisionLabel(a)) === lastUsed));
    for (const division of divisions) {
        if (!remaining()) break;
        const divisionId = Number(division.DivisionId);
        if (state.probedDivisions.has(divisionId)) continue;
        state.probedDivisions.add(divisionId);
        try {
            const playdays = await api(`/division/${divisionId}/playdays`);
            const dates = [...new Set((playdays || []).map(day => String(day.DateTime || '').slice(0, 10)).filter(Boolean))].sort().slice(0, 2);
            for (const date of dates) {
                for (const play of (await api(`/division/${divisionId}/plays/${date}`)) || []) {
                    for (const team of play.Teams || []) {
                        const teamId = Number(team.TeamId);
                        const code = normName(team.TeamCode);
                        if (!(teamId > 0) || !(wantedIds.has(teamId) || (code && wantedCodes.has(code)))) continue;
                        known[teamId] = { divisionId, name: team.TeamName || team.TeamText || `Team ${teamId}`, code: team.TeamCode || '' };
                        wantedIds.delete(teamId);
                        wantedCodes.delete(code);
                        found = true;
                    }
                }
                if (!remaining()) break;
            }
        } catch (error) {
            console.warn('[AES Bracket Viewer] team lookup skipped a division', divisionId, error);
        }
    }
    if (found) saveKnownTeamDivisions();
    return known;
}

// First load at an event: open the division where the coach's first team plays.
async function myTeamsDivision(event) {
    state.favoriteIds = parseFavoriteIds(aesFavoritesRaw());
    const { refs } = myTeamRefs();
    if (!refs.length) return null;
    const firstKnown = () => {
        const known = knownTeamDivisions();
        for (const ref of refs) {
            if (ref.id != null && known[ref.id]) return known[ref.id].divisionId;
            const hit = ref.code && Object.values(known).find(info => normName(info.code) === normName(ref.code));
            if (hit) return hit.divisionId;
        }
        return null;
    };
    if (firstKnown() == null) {
        setStatus('Finding your teams');
        await locateTeams(event, { ids: refs.map(ref => ref.id).filter(id => id != null), codes: refs.filter(ref => ref.id == null).map(ref => ref.code) });
    }
    return firstKnown();
}

function renderMyTeamsBar() {
    const bar = $('[data-role="my-teams"]');
    if (!bar) return;
    bar.hidden = !state.loaded;
    if (!state.loaded) return;
    const refs = state.myTeamRefs || [];
    if (!refs.length) {
        bar.innerHTML = '<span class="abv-muted">Star your teams on AES (the star icon on a team) and the viewer will select and follow them.</span>';
        return;
    }
    const divisions = Array.isArray(state.event?.Divisions) ? state.event.Divisions : [];
    const resolved = refs.map(resolveMyTeamRef);
    const chips = [];
    const seen = new Set();
    resolved.forEach(item => {
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        const other = item.divisionId !== state.divisionId;
        const division = other ? divisions.find(d => Number(d.DivisionId) === Number(item.divisionId)) : null;
        const active = !other && Number(state.teamFilterId) === item.id;
        chips.push(`<button type="button" class="abv-chip ${active ? 'active' : ''}" data-action="pick-team" data-team-id="${item.id}" data-division-id="${escapeHtml(item.divisionId ?? '')}" aria-pressed="${active}">
                ${escapeHtml(item.name)}${division ? ` <small>${escapeHtml(shortDivisionLabel(divisionLabel(division)))}</small>` : ''}
            </button>`);
    });
    const unresolved = resolved.filter(item => !item).length;
    const unprobed = divisions.some(d => Number(d.DivisionId) !== state.divisionId && !state.probedDivisions.has(Number(d.DivisionId)));
    let note = '';
    if (unresolved && unprobed) {
        note = '<span class="abv-muted">Finding your other teams</span>';
        if (!state.locatingTeams) {
            state.locatingTeams = true;
            locateTeams(state.event, {
                ids: refs.filter((ref, index) => !resolved[index] && ref.id != null).map(ref => ref.id),
                codes: refs.filter((ref, index) => !resolved[index] && ref.id == null).map(ref => ref.code)
            }).finally(() => {
                state.locatingTeams = false;
                renderMyTeamsBar();
            });
        }
    } else if (unresolved) {
        note = `<span class="abv-muted">${unresolved} ${state.myTeamSource === 'aes' ? 'starred' : 'saved'} team${unresolved === 1 ? ' is' : 's are'} not in this event's published divisions</span>`;
    }
    const label = state.myTeamSource === 'aes' ? 'My teams' : 'My teams (saved)';
    bar.innerHTML = `<span class="abv-my-label">\u2605 ${label}</span>${chips.join('')}${note}`;
}

function pickMyTeam(teamId, divisionId) {
    if (!Number.isFinite(teamId)) return;
    if (Number.isFinite(divisionId) && divisionId !== state.divisionId) {
        changeDivision(divisionId, { teamId });
        return;
    }
    const team = state.teamById.get(teamId);
    if (!team) return;
    state.clubFilterId = team.clubId == null ? null : Number(team.clubId);
    state.teamFilterId = team.id;
    populateClubFilter();
    populateTeamFilter();
    onFocusChanged();
}

function onFavoritesChanged() {
    refreshMyTeams();
    populateTeamFilter();
    renderGraph();
}

function rememberSelectedTeam() {
    const team = selectedFocusTeam();
    if (!team) {
        setSettingsNote('Select a team first.');
        return;
    }
    if (!team.code) {
        setSettingsNote('AES has no team code for this team, so it cannot be remembered across events.');
        return;
    }
    mergeSavedTeams([{ code: team.code, name: team.name }]);
    refreshMyTeams();
    renderMyTeamsBar();
    setSettingsNote(`${team.name} saved. At events where you have not starred any teams, the viewer follows your saved teams.`);
}

function clearSavedTeams() {
    savePrefs({ savedTeams: [] });
    refreshMyTeams();
    populateTeamFilter();
    renderGraph();
    setSettingsNote('Saved teams cleared. Teams you star on AES still count as your teams.');
}

// A link that adds the given team codes to a coach's saved teams, e.g. for onboarding.
function copyStarterLink() {
    const codes = [...new Set([...state.myTeams.map(team => team.code), ...(state.prefs.savedTeams || []).map(entry => entry.code)].filter(Boolean))];
    if (!codes.length) {
        setSettingsNote('Star or save at least one team first.');
        return;
    }
    const url = `${location.origin}/event/${state.eventKey}/home#${HASH_KEY}=${encodeURIComponent(`my=${codes.join(',')}`)}`;
    const done = () => setSettingsNote(`Starter link copied with ${codes.length} team${codes.length === 1 ? '' : 's'}. Opening it adds them to that coach's saved teams.`);
    if (!navigator.clipboard?.writeText) {
        setSettingsNote(url);
        return;
    }
    navigator.clipboard.writeText(url).then(done, () => setSettingsNote(url));
}

