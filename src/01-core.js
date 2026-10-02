(() => {
    'use strict';

    /* =========================================================================
     * 1. Configuration, preferences, shared state, small helpers
     * ======================================================================= */

    // No club, team, or division is built in. "My teams" come from each coach's AES favorites
    // (see section 4b); division and view options are chosen in the viewer and saved locally.
    const DEFAULTS = {
        freshnessCheckMs: 60000,      // viewer open and tab visible
        backgroundCheckMs: 120000,    // viewer closed or tab hidden, notifications on
        fetchTimeoutMs: 15000,
        poolSheetConcurrency: 6,
        matchMinutes: 60,             // calendar event length when AES publishes no end time
        lateGraceMinutes: 5,          // a court counts as late this long after a match's scheduled end
        staleMatchMinutes: 60,        // an unposted match this long past its end is treated as over
        mealBreakMinutes: 60,         // gaps this long are marked as time to eat
        scenarioMaxRemaining: 8       // 2^8 = 256 outcome combinations
    };

    const APP_ID = 'aes-bracket-viewer';
    const BUTTON_ID = `${APP_ID}-button`;
    const PREFS_KEY = `${APP_ID}:prefs:v2`;
    const HASH_KEY = 'abv';
    const VIEWS = ['tournament', 'journey', 'performance', 'stats', 'scouting'];
    const MOBILE_QUERY = '(max-width: 700px)';

    const DEFAULT_PREFS = {
        savedTeams: [],               // [{ code, name }], remembered from favorites or saved by hand
        teamDivisions: {},            // eventKey -> teamId -> { divisionId, name, code }
        divisionName: '',             // last division chosen, used when nothing better is known
        divisionByEvent: {},
        timeZone: 'auto',
        density: 'compact',
        showEdgeLabels: true,
        showFuturePath: true,
        notify: false,
        detailCollapsed: false,       // wide screens: Tournament detail panel hidden
        warmupMinutes: 45
    };

    // Everything derived from one AES load. loadData() snapshots these fields and restores
    // them if a rebuild throws, so a failed refresh never leaves a half-built model behind.
    function freshDataState() {
        return {
            loaded: false,
            event: null,
            divisionId: null,
            divisionName: '',
            detectedTimeZone: null,
            playdays: [],
            masterPlays: [],
            dailyPlays: [],
            poolSheets: new Map(),
            poolSheetFailures: [],
            poolSheetsReused: 0,
            lastUpdatedTimestamp: null,
            lastLoadedAt: null,
            nodes: new Map(),
            edges: [],
            edgeByKey: new Map(),
            outgoing: new Map(),
            incoming: new Map(),
            poolMembers: new Map(),
            dateByPlayId: new Map(),
            resolverIndex: { byNormalized: new Map(), byMatchId: new Map() },
            unresolved: [],
            outcomeConflicts: [],
            teamDirectory: [],
            teamById: new Map(),
            clubOptions: [],
            groupOptions: [],
            performancePools: new Map(),
            defaultTeam: null,
            favoritesRaw: null,
            favoriteIds: [],
            myTeamSource: 'none',
            myTeamRefs: [],
            myTeams: [],
            probedDivisions: new Set()
        };
    }
    const DATA_FIELDS = Object.keys(freshDataState()).filter(key => key !== 'loaded');

    // What the user has selected, plus sets derived from that selection.
    function freshSelectionState() {
        return {
            clubFilterId: null,
            teamFilterId: null,
            groupFilterKey: null,
            groupFilterPinned: false,
            performanceGroupKey: null,
            performancePoolKey: null,
            statsWeekendKey: null,
            matchDayDate: null,
            matchDayAllTeams: false,
            pendingTeamId: null,
            scoutTeamId: null,
            selectedNodeKey: null,
            defaultsApplied: false,
            pendingFocusScroll: false,
            loadError: null,
            filterDirectNodes: new Set(),
            filterCurrentNodes: new Set(),
            filterRelatedNodes: new Set(),
            filterPossibleNodes: new Set(),
            traceNodeKey: null,
            traceUpstreamNodes: new Set(),
            traceDownstreamNodes: new Set(),
            traceUpstreamEdges: new Set(),
            traceDownstreamEdges: new Set(),
            renderedKeys: new Set(),
            renderedSignature: null
        };
    }

    const state = {
        eventKey: null,
        prefs: { ...DEFAULT_PREFS },
        loading: false,
        viewMode: 'tournament',
        viewInitialized: false,
        showEdgeLabels: true,
        showFuturePath: true,
        tournamentDensity: 'compact',
        showSettings: false,
        toolsOpen: false,
        statusKind: 'loading',
        statusNotice: '',
        bannerText: '',
        dismissedBanner: '',
        compact: false,
        showDiagnostics: false,
        hashState: null,
        hashApplied: false,
        locatingTeams: false,
        likelyOpponents: { ids: new Set(), names: new Set() },
        lateCourtNodes: new Set(),
        notice: '',
        schedulerTimer: null,
        lastCheckAt: 0,
        lastCountdownAt: 0,
        ...freshDataState(),
        ...freshSelectionState()
    };

    function loadPrefs() {
        let stored = {};
        try {
            stored = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
        } catch {
            stored = {};
        }
        // v2.0-2.2 kept one team in teamCode/teamName; it becomes the first saved team.
        if (!Array.isArray(stored.savedTeams)) {
            stored.savedTeams = stored.teamCode ? [{ code: stored.teamCode, name: stored.teamName || stored.teamCode }] : [];
        }
        delete stored.teamCode;
        delete stored.teamName;
        state.prefs = {
            ...DEFAULT_PREFS,
            ...stored,
            divisionByEvent: { ...(stored.divisionByEvent || {}) },
            teamDivisions: { ...(stored.teamDivisions || {}) }
        };
        state.tournamentDensity = state.prefs.density === 'standard' ? 'standard' : 'compact';
        state.showEdgeLabels = state.prefs.showEdgeLabels !== false;
        state.showFuturePath = state.prefs.showFuturePath !== false;
    }

    function savePrefs(patch = {}) {
        Object.assign(state.prefs, patch);
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
        } catch {
            // Storage blocked or full; preferences stay in memory for this session.
        }
    }

    function resetEventState(eventKey) {
        Object.assign(state, freshDataState(), freshSelectionState(), { eventKey });
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    // Team names are compared exactly after normalization. A trailing "(12)" seed suffix,
    // which AES appends to some participant text, is ignored.
    function normName(value) {
        return String(value ?? '')
            .replace(/\s*\(\s*\d+\s*\)\s*$/, '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    }

    function ordinal(value) {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) return '-';
        const mod100 = n % 100;
        if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
        if (n % 10 === 1) return `${n}st`;
        if (n % 10 === 2) return `${n}nd`;
        if (n % 10 === 3) return `${n}rd`;
        return `${n}th`;
    }

    function numericValue(value) {
        if (value == null || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function firstNumericField(object, names) {
        if (!object || typeof object !== 'object') return null;
        for (const name of names) {
            const value = numericValue(object[name]);
            if (value != null) return value;
        }
        const lower = new Map(Object.keys(object).map(key => [key.toLowerCase(), key]));
        for (const name of names) {
            const key = lower.get(name.toLowerCase());
            if (!key) continue;
            const value = numericValue(object[key]);
            if (value != null) return value;
        }
        return null;
    }

    function normalizeBoolean(value) {
        if (value === true || value === 1) return true;
        if (value === false || value === 0 || value == null) return false;
        return ['true', '1', 'yes', 'y', 'won', 'winner'].includes(String(value).trim().toLowerCase());
    }

    /* -------------------------------------------------------------------------
     * Event-local time. AES schedule strings usually carry no UTC offset
     * ("2026-10-03T08:00:00"), meaning wall-clock time at the venue. They are
     * parsed in the event's time zone rather than the browser's, so "upcoming"
     * and "pending" stay correct when you follow an out-of-zone tournament.
     * ----------------------------------------------------------------------- */

    const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const TZ_ALIASES = {
        'pacific standard time': 'America/Los_Angeles',
        'pacific time': 'America/Los_Angeles',
        'mountain standard time': 'America/Denver',
        'mountain time': 'America/Denver',
        'us mountain standard time': 'America/Phoenix',
        'central standard time': 'America/Chicago',
        'central time': 'America/Chicago',
        'eastern standard time': 'America/New_York',
        'eastern time': 'America/New_York',
        'alaskan standard time': 'America/Anchorage',
        'hawaiian standard time': 'Pacific/Honolulu'
    };
    const TZ_CHOICES = [
        ['auto', 'Automatic (event, else this device)'],
        ['browser', `This device (${BROWSER_TZ})`],
        ['America/Los_Angeles', 'Pacific'],
        ['America/Denver', 'Mountain'],
        ['America/Phoenix', 'Arizona'],
        ['America/Chicago', 'Central'],
        ['America/New_York', 'Eastern'],
        ['America/Anchorage', 'Alaska'],
        ['Pacific/Honolulu', 'Hawaii']
    ];

    function toIanaZone(value) {
        if (typeof value !== 'string' || !value.trim()) return null;
        const candidate = TZ_ALIASES[value.trim().toLowerCase()] || value.trim();
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: candidate });
            return candidate;
        } catch {
            return null;
        }
    }

    function detectEventTimeZone(event) {
        if (!event || typeof event !== 'object') return null;
        const holders = [event, event.Location, event.Venue, ...(Array.isArray(event.Locations) ? event.Locations : [])]
            .filter(holder => holder && typeof holder === 'object');
        for (const holder of holders) {
            for (const [key, value] of Object.entries(holder)) {
                if (!/time\s*zone|timezone|^tz/i.test(key)) continue;
                const zone = toIanaZone(value);
                if (zone) return zone;
            }
        }
        return null;
    }

    function effectiveTimeZone() {
        const pref = state.prefs?.timeZone || 'auto';
        if (pref === 'browser') return BROWSER_TZ;
        if (pref !== 'auto') return toIanaZone(pref) || BROWSER_TZ;
        return state.detectedTimeZone || BROWSER_TZ;
    }

    const formatterCache = new Map();
    function cachedFormatter(kind, tz) {
        const key = `${kind}|${tz}`;
        if (!formatterCache.has(key)) {
            const options = {
                parts: { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' },
                display: { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
                time: { timeZone: tz, hour: 'numeric', minute: '2-digit' }
            }[kind];
            formatterCache.set(key, new Intl.DateTimeFormat(kind === 'parts' ? 'en-US' : undefined, options));
        }
        return formatterCache.get(key);
    }

    function zonedParts(epoch, tz) {
        const parts = {};
        for (const part of cachedFormatter('parts', tz).formatToParts(new Date(epoch))) parts[part.type] = part.value;
        return parts;
    }

    function tzOffsetMs(epoch, tz) {
        const base = Math.floor(epoch / 1000) * 1000;
        const p = zonedParts(base, tz);
        return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - base;
    }

    function zonedWallClockToEpoch(year, month, day, hour, minute, second, tz) {
        const guess = Date.UTC(year, month - 1, day, hour, minute, second);
        const first = guess - tzOffsetMs(guess, tz);
        return guess - tzOffsetMs(first, tz);
    }

    const NAIVE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
    const epochCache = new Map();

    function parseEventTime(value) {
        if (value == null || value === '') return NaN;
        if (typeof value === 'number') return value;
        if (value instanceof Date) return value.getTime();
        const text = String(value).trim();
        const tz = effectiveTimeZone();
        const cacheKey = `${tz}|${text}`;
        if (epochCache.has(cacheKey)) return epochCache.get(cacheKey);
        const m = text.match(NAIVE_DATETIME);
        const epoch = m
            ? zonedWallClockToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0), tz)
            : Date.parse(text);
        if (epochCache.size > 5000) epochCache.clear();
        epochCache.set(cacheKey, epoch);
        return epoch;
    }

    // Sort-friendly variant: missing or unparseable times sort first.
    function eventTime(value) {
        const epoch = parseEventTime(value);
        return Number.isFinite(epoch) ? epoch : 0;
    }

    function clearTimeCaches() {
        epochCache.clear();
    }

    function formatDateTime(value) {
        const epoch = parseEventTime(value);
        if (!Number.isFinite(epoch)) return value ? String(value) : '';
        return cachedFormatter('display', effectiveTimeZone()).format(new Date(epoch));
    }

    function formatTime(epoch) {
        return Number.isFinite(epoch) ? cachedFormatter('time', effectiveTimeZone()).format(new Date(epoch)) : '';
    }

    const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
    function formatDay(date) {
        const [year, month, day] = String(date || '').split('-').map(Number);
        return year ? dayFormatter.format(new Date(Date.UTC(year, month - 1, day))) : '';
    }

    function formatDuration(minutes) {
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        if (!hours) return `${rest} min`;
        return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
    }

    function eventDateString(epoch = Date.now()) {
        const p = zonedParts(epoch, effectiveTimeZone());
        return `${p.year}-${p.month}-${p.day}`;
    }

    function formatRelative(epoch, now = Date.now()) {
        if (!Number.isFinite(epoch)) return '';
        const diff = epoch - now;
        const minutes = Math.round(Math.abs(diff) / 60000);
        if (minutes < 1) return 'now';
        const hours = Math.floor(minutes / 60);
        if (hours >= 48) {
            const days = Math.round(hours / 24);
            return diff > 0 ? `in ${days} days` : `${days} days ago`;
        }
        const span = hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
        return diff > 0 ? `in ${span}` : `${span} ago`;
    }

