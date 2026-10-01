/* =========================================================================
 * 3. Viewer shell, event wiring, settings, diagnostics
 * ======================================================================= */

const $ = selector => document.querySelector(`#${APP_ID} ${selector}`);
const isOpen = () => Boolean(document.getElementById(APP_ID)?.classList.contains('open'));
const emptyHtml = text => `<div class="abv-empty">${escapeHtml(text)}</div>`;

function createLauncher() {
    if (document.getElementById(BUTTON_ID)) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Bracket Viewer';
    button.hidden = !eventKeyFromLocation();
    button.addEventListener('click', () => { openViewer(); });
    document.body.appendChild(button);
}

function shortDivisionLabel(name) {
    const match = String(name || '').match(/^(\d+)\s*(boys|girls|b|g)\b/i);
    return match ? `${match[1]}${match[2][0].toUpperCase()}` : String(name || '').slice(0, 12);
}

function updateLauncher() {
    const button = document.getElementById(BUTTON_ID);
    if (button) button.textContent = state.divisionName ? `${shortDivisionLabel(state.divisionName)} Bracket` : 'Bracket Viewer';
    const title = $('[data-role="title"]');
    const subtitle = $('[data-role="subtitle"]');
    if (title) title.textContent = state.event?.Name || state.event?.EventName || 'AES Bracket Viewer';
    if (subtitle) subtitle.textContent = state.divisionName ? `${state.divisionName}: club, team, and group progression` : 'Loading';
}

function createViewer() {
    if (document.getElementById(APP_ID)) return;
    const app = document.createElement('section');
    app.id = APP_ID;
    app.setAttribute('role', 'dialog');
    app.setAttribute('aria-label', 'AES bracket viewer');
    const panel = (mode, heading, text) => `
            <section class="abv-view-panel" data-panel="${mode}" ${mode === 'tournament' ? '' : 'hidden'}>
                <div class="${mode === 'tournament' ? 'abv-graph-wrap' : 'abv-list-wrap'}">
                    <div class="${mode === 'tournament' ? 'abv-canvas' : 'abv-list-canvas'}" data-canvas="${mode}"></div>
                </div>
                <aside class="abv-detail" data-detail="${mode}"><h3>${heading}</h3><p class="abv-muted">${text}</p></aside>
            </section>`;
    app.innerHTML = `
            <div class="abv-header">
                <div class="abv-title"><strong data-role="title">AES Bracket Viewer</strong><small data-role="subtitle">Loading</small></div>
                <label class="abv-filter-control">Club <select data-action="club"><option value="__all__">All clubs</option></select></label>
                <label class="abv-filter-control">Team <select data-action="team"><option value="__all__">All teams</option></select></label>
                <label class="abv-filter-control">Group <select data-action="group"><option value="__all__">All groups</option></select></label>
                <button type="button" data-action="reset-filters">Reset filters</button>
                <button type="button" data-action="clear-trace" disabled>Clear trace</button>
                <button type="button" data-action="refresh">Refresh</button>
                <button type="button" data-action="toggle-settings" aria-expanded="false">Settings</button>
                <button type="button" data-action="close" aria-label="Close viewer (Esc)">Close</button>
            </div>
            <div class="abv-bar abv-my-teams" data-role="my-teams" hidden></div>
            <div class="abv-bar" data-role="settings" hidden>
                <label class="abv-filter-control">Division <select data-action="division"></select></label>
                <label class="abv-filter-control">Time zone <select data-action="timezone"></select></label>
                <label class="abv-filter-control">Arrive before first match
                    <select data-action="warmup">${[15, 30, 45, 60, 75, 90].map(m => `<option value="${m}">${m} min</option>`).join('')}</select>
                </label>
                <label class="abv-check"><input type="checkbox" data-action="notify"> Notify me about my team</label>
                <button type="button" data-action="remember-team">Save selected team</button>
                <button type="button" data-action="clear-saved-teams">Clear saved teams</button>
                <button type="button" data-action="copy-starter-link">Copy starter link</button>
                <button type="button" data-action="copy-link">Copy link to this view</button>
                <span class="abv-muted" data-role="settings-note"></span>
            </div>
            <div class="abv-view-tabs" role="tablist">
                <button type="button" role="tab" data-view="tournament" class="active">Tournament</button>
                <button type="button" role="tab" data-view="journey">Match Day</button>
                <button type="button" role="tab" data-view="performance">Standings &amp; Outlook</button>
                <button type="button" role="tab" data-view="stats">Stats</button>
                <button type="button" role="tab" data-view="scouting">Scouting</button>
            </div>
            <div class="abv-bar" data-role="tournament-tools">
                <label class="abv-check"><input type="checkbox" data-action="future-path" checked> Show future path</label>
                <label class="abv-check"><input type="checkbox" data-action="labels" checked> Edge labels</label>
                <label class="abv-filter-control">Node size
                    <select data-action="density"><option value="compact">Compact</option><option value="standard">Standard</option></select>
                </label>
                <span class="abv-muted">Select a node to trace every linked match before and after it. Select it again to clear.</span>
            </div>
            <div class="abv-status">
                <span class="abv-status-text" data-role="status-text">Open the viewer to load AES data.</span>
                <button type="button" data-action="toggle-diagnostics" aria-expanded="false">Details</button>
            </div>
            <div class="abv-diag" data-role="diagnostics" hidden></div>
            <div class="abv-body">
                ${panel('tournament', 'Tournament', 'Select a node to see how teams arrive there and where they go next.')}
                ${panel('journey', 'Match Day', 'Select a team to see its matches and work assignments in order.')}
                ${panel('performance', 'Standings &amp; Outlook', 'Select a team to compare it with the other teams in its pool.')}
                ${panel('stats', 'Stats', 'Select a team to see its results and patterns.')}
                ${panel('scouting', 'Scouting', 'Pick an opponent to see its results and how it compares with your team.')}
            </div>`;
    app.addEventListener('click', onAppClick);
    app.addEventListener('change', onAppChange);
    app.addEventListener('keydown', onAppKeydown);
    document.body.appendChild(app);
}

function onAppClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const view = target.closest('[data-view]');
    if (view) {
        setViewMode(view.dataset.view);
        return;
    }
    const action = target.closest('button[data-action]');
    if (action) {
        handleAction(action.dataset.action, action);
        return;
    }
    const node = target.closest('[data-node-key]');
    if (node) {
        selectNode(node.dataset.nodeKey);
        return;
    }
    const pool = target.closest('[data-perf-pool]');
    if (pool) selectPerformancePool(state.performancePools.get(pool.dataset.perfPool));
}

function onAppChange(event) {
    const control = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (control) handleChange(control.dataset.action, control);
}

function onAppKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.matches('[data-node-key]')) {
        event.preventDefault();
        selectNode(target.dataset.nodeKey);
    } else if (target.matches('[data-perf-pool]')) {
        event.preventDefault();
        selectPerformancePool(state.performancePools.get(target.dataset.perfPool));
    }
}

function handleAction(action, element = null) {
    switch (action) {
        case 'close': closeViewer(); break;
        case 'clear-trace': clearTrace(); break;
        case 'reset-filters': resetFilters(); break;
        case 'refresh': loadData({ full: true }); break;
        case 'toggle-settings':
            state.showSettings = !state.showSettings;
            if (state.showSettings) populateSettings();
            updateViewControls();
            break;
        case 'toggle-diagnostics':
            state.showDiagnostics = !state.showDiagnostics;
            renderDiagnostics();
            updateViewControls();
            break;
        case 'scout':
            state.scoutTeamId = Number(element?.dataset.teamId) || null;
            setViewMode('scouting');
            break;
        case 'pick-team': pickMyTeam(Number(element?.dataset.teamId), Number(element?.dataset.divisionId)); break;
        case 'remember-team': rememberSelectedTeam(); break;
        case 'clear-saved-teams': clearSavedTeams(); break;
        case 'copy-starter-link': copyStarterLink(); break;
        case 'copy-link': copyViewLink(); break;
        case 'export-ics': exportTeamCalendar(); break;
        case 'export-csv': exportTeamStatsCsv(); break;
        case 'copy-parent-update': copyParentUpdate(); break;
        case 'print-day-sheet': printDaySheet(); break;
        default: break;
    }
}

function handleChange(action, control) {
    switch (action) {
        case 'club': {
            state.clubFilterId = control.value === '__all__' ? null : Number(control.value);
            const selected = selectedFocusTeam();
            if (selected && state.clubFilterId != null && Number(selected.clubId) !== state.clubFilterId) state.teamFilterId = null;
            populateTeamFilter();
            onFocusChanged();
            break;
        }
        case 'team':
            state.teamFilterId = control.value === '__all__' ? null : Number(control.value);
            onFocusChanged();
            break;
        case 'group':
            state.groupFilterKey = control.value === '__all__' ? null : control.value;
            state.groupFilterPinned = true;
            state.pendingFocusScroll = true;
            clearTrace(false);
            renderGraph();
            break;
        case 'labels':
            state.showEdgeLabels = control.checked;
            savePrefs({ showEdgeLabels: control.checked });
            renderGraph();
            break;
        case 'future-path':
            state.showFuturePath = control.checked;
            savePrefs({ showFuturePath: control.checked });
            clearTrace(false);
            renderGraph();
            break;
        case 'density':
            state.tournamentDensity = control.value === 'standard' ? 'standard' : 'compact';
            savePrefs({ density: state.tournamentDensity });
            renderGraph();
            break;
        case 'division': changeDivision(Number(control.value)); break;
        case 'timezone': changeTimeZone(control.value); break;
        case 'notify':
            if (control.checked) requestNotifications(control);
            else {
                savePrefs({ notify: false });
                setSettingsNote('Notifications are off.');
            }
            break;
        case 'performance-group':
            state.performanceGroupKey = control.value || null;
            state.performancePoolKey = null;
            renderGraph();
            break;
        case 'performance-pool': selectPerformancePool(state.performancePools.get(control.value)); break;
        case 'scout-team':
            state.scoutTeamId = control.value ? Number(control.value) : null;
            renderGraph();
            break;
        case 'match-day-all':
            state.matchDayAllTeams = control.checked;
            renderGraph();
            break;
        case 'match-day':
            state.matchDayDate = control.value || null;
            renderGraph();
            break;
        case 'warmup':
            savePrefs({ warmupMinutes: Number(control.value) || 45 });
            if (state.viewMode === 'journey') renderGraph();
            break;
        case 'stats-scope':
            state.statsWeekendKey = control.value === '__all__' ? null : control.value;
            renderGraph();
            break;
        default: break;
    }
}

// Club or team changed: follow the team's active group and scroll to it once.
function onFocusChanged() {
    state.groupFilterPinned = false;
    state.performanceGroupKey = null;
    state.performancePoolKey = null;
    recomputeFilterScope(true);
    const active = findActiveTeamMatch(state.filterDirectNodes);
    if (active) state.selectedNodeKey = active.key;
    populateGroupFilter();
    state.pendingFocusScroll = true;
    clearTrace(false);
    renderGraph();
}

const getViewCanvas = (mode = state.viewMode) => $(`[data-canvas="${mode}"]`);
const getViewDetail = (mode = state.viewMode) => $(`[data-detail="${mode}"]`);

function setViewMode(mode) {
    if (!VIEWS.includes(mode)) return;
    state.viewMode = mode;
    if (mode === 'tournament') state.pendingFocusScroll = true;
    clearTrace(false);
    renderGraph();
}

function updateViewControls() {
    const app = document.getElementById(APP_ID);
    if (!app) return;
    app.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== state.viewMode; });
    app.querySelectorAll('[data-view]').forEach(button => {
        const active = button.dataset.view === state.viewMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });
    const tournament = state.viewMode === 'tournament';
    const set = (selector, apply) => { const element = $(selector); if (element) apply(element); };
    set('[data-action="group"]', el => { el.disabled = !tournament; });
    set('[data-action="clear-trace"]', el => { el.disabled = !tournament || !state.traceNodeKey; });
    set('[data-role="tournament-tools"]', el => { el.hidden = !tournament; });
    set('[data-action="future-path"]', el => { el.disabled = state.teamFilterId == null; el.checked = state.showFuturePath; });
    set('[data-action="labels"]', el => { el.checked = state.showEdgeLabels; });
    set('[data-action="density"]', el => { el.value = state.tournamentDensity; });
    set('[data-role="settings"]', el => { el.hidden = !state.showSettings; });
    set('[data-action="toggle-settings"]', el => {
        el.setAttribute('aria-expanded', String(state.showSettings));
        el.classList.toggle('active', state.showSettings);
    });
    set('[data-role="diagnostics"]', el => { el.hidden = !state.showDiagnostics; });
    set('[data-action="toggle-diagnostics"]', el => { el.setAttribute('aria-expanded', String(state.showDiagnostics)); });
}

async function openViewer() {
    createViewer();
    ensureContext();
    document.getElementById(APP_ID).classList.add('open');
    if (!state.viewInitialized) {
        state.viewInitialized = true;
        const hashView = state.hashState?.view;
        if (!VIEWS.includes(hashView) && window.matchMedia?.(MOBILE_QUERY).matches) state.viewMode = 'journey';
    }
    updateViewControls();
    state.lastCheckAt = Date.now();
    if (!state.loaded && !state.loading) {
        await loadData({ full: true });
    } else if (state.loaded) {
        renderGraph();
        refreshIfChanged();
    }
}

function closeViewer() {
    document.getElementById(APP_ID)?.classList.remove('open');
    clearHashState();
}

function resetFilters() {
    Object.assign(state, {
        clubFilterId: null,
        teamFilterId: null,
        groupFilterKey: null,
        groupFilterPinned: false,
        performanceGroupKey: null,
        performancePoolKey: null
    });
    populateClubFilter();
    populateTeamFilter();
    recomputeFilterScope(false);
    populateGroupFilter();
    clearTrace(false);
    renderGraph();
}

function setStatus(text, tone = '') {
    const bar = $('.abv-status');
    const textEl = $('[data-role="status-text"]');
    if (!bar || !textEl) return;
    textEl.textContent = text;
    textEl.title = text;
    bar.classList.toggle('error', tone === 'error');
}

function setRefreshDisabled(disabled) {
    const button = $('[data-action="refresh"]');
    if (button) button.disabled = disabled;
}

function setSettingsNote(text) {
    const note = $('[data-role="settings-note"]');
    if (note) note.textContent = text;
}

function populateSettings() {
    const division = $('[data-action="division"]');
    if (division) {
        const divisions = Array.isArray(state.event?.Divisions) ? state.event.Divisions : [];
        division.innerHTML = divisions.length
            ? divisions.map(d => `<option value="${escapeHtml(d.DivisionId)}">${escapeHtml(divisionLabel(d))}</option>`).join('')
            : '<option value="">Loading</option>';
        if (state.divisionId != null) division.value = String(state.divisionId);
    }
    const tz = $('[data-action="timezone"]');
    if (tz) {
        tz.innerHTML = TZ_CHOICES.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
        tz.value = TZ_CHOICES.some(([value]) => value === state.prefs.timeZone) ? state.prefs.timeZone : 'auto';
    }
    const notify = $('[data-action="notify"]');
    if (notify) notify.checked = Boolean(state.prefs.notify);
    const warmup = $('[data-action="warmup"]');
    if (warmup) warmup.value = String(state.prefs.warmupMinutes);
    const zoneSource = state.prefs.timeZone === 'auto' ? (state.detectedTimeZone ? ' (from the event)' : ' (this device)') : '';
    const saved = (state.prefs.savedTeams || []).length;
    const mine = state.myTeamSource === 'aes'
        ? `your ${state.favoriteIds.length} starred team${state.favoriteIds.length === 1 ? '' : 's'} on AES`
        : (saved ? `${saved} saved team${saved === 1 ? '' : 's'} (nothing starred on AES for this event)` : 'none yet; star teams on AES');
    setSettingsNote(`Times shown in ${effectiveTimeZone()}${zoneSource}. My teams: ${mine}.`);
}

function changeDivision(divisionId, { teamId = null } = {}) {
    if (!Number.isFinite(divisionId) || divisionId === state.divisionId) return;
    const division = (state.event?.Divisions || []).find(d => Number(d.DivisionId) === divisionId);
    savePrefs({
        divisionByEvent: { ...state.prefs.divisionByEvent, [state.eventKey]: divisionId },
        divisionName: division ? divisionLabel(division) : state.prefs.divisionName
    });
    const event = state.event;
    resetEventState(state.eventKey);
    state.event = event;
    state.divisionId = divisionId;
    state.pendingTeamId = teamId;
    for (const mode of VIEWS) {
        const canvas = getViewCanvas(mode);
        if (canvas) canvas.innerHTML = emptyHtml('Loading division');
    }
    loadData({ full: true });
}

function changeTimeZone(value) {
    savePrefs({ timeZone: value });
    clearTimeCaches();
    if (state.loaded) {
        buildPoolPerformanceModel();
        recomputeFilterScope(false);
        renderGraph();
    }
    populateSettings();
}

function copyViewLink() {
    writeHashState();
    const url = location.href;
    if (!navigator.clipboard?.writeText) {
        setSettingsNote('Copy the address bar to share this view.');
        return;
    }
    navigator.clipboard.writeText(url).then(
        () => setSettingsNote('Link copied. It opens the viewer with this team and view selected.'),
        () => setSettingsNote('Copy failed. Copy the address bar instead.')
    );
}

function renderDiagnostics() {
    const panel = $('[data-role="diagnostics"]');
    if (!panel || !state.showDiagnostics) return;
    if (!state.loaded) {
        panel.innerHTML = '<p>No AES data loaded yet.</p>';
        return;
    }
    const nodes = [...state.nodes.values()];
    const count = kind => nodes.filter(node => node.kind === kind).length;
    const advancement = state.edges.filter(edge => edge.kind === 'advancement').length;
    const feeds = state.edges.filter(edge => edge.condition === 'FEEDS').length;
    const zoneSource = state.prefs.timeZone === 'auto' ? (state.detectedTimeZone ? 'detected from event' : 'device fallback') : 'set in Settings';
    const rows = [
        ['Event key', state.eventKey],
        ['Division', `${state.divisionName} (${state.divisionId})`],
        ['Time zone', `${effectiveTimeZone()} (${zoneSource})`],
        ['Playdays', state.dailyPlays.map(day => day.date).join(', ')],
        ['Pool sheets', `${state.poolSheets.size} loaded, ${state.poolSheetsReused} reused from cache, ${state.poolSheetFailures.length} failed`],
        ['Graph', `${count('match')} matches, ${count('standings')} pools, ${count('entry')} routes, ${advancement} result/placement edges (${feeds} from bracket structure)`],
        ['Unresolved references', state.unresolved.length],
        ['Duplicate WIN/LOSS branches', state.outcomeConflicts.length],
        ['AES last update', formatDateTime(state.lastUpdatedTimestamp) || 'unknown'],
        ['Last loaded', formatDateTime(state.lastLoadedAt)],
        ['Update checks', `every ${DEFAULTS.freshnessCheckMs / 1000}s while open${state.prefs.notify ? `, every ${DEFAULTS.backgroundCheckMs / 60000} min in the background` : ''}`]
    ];
    const list = (title, items, describe) => items.length
        ? `<h4>${escapeHtml(title)}</h4><ul>${items.slice(0, 25).map(item => `<li>${escapeHtml(describe(item))}</li>`).join('')}${items.length > 25 ? `<li>and ${items.length - 25} more</li>` : ''}</ul>`
        : '';
    panel.innerHTML = `<dl>${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>`
        + list('Unresolved references', state.unresolved, u => `${u.reason}: "${u.sourceText || ''}" into ${u.to || 'unknown'}`)
        + list('Duplicate WIN/LOSS branches', state.outcomeConflicts, c => `${c.from} ${c.condition} goes to ${c.destinations.join(', ')}`)
        + list('Pool sheet failures', state.poolSheetFailures, f => `Play ${f.playId}: ${f.error}`);
}

