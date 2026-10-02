/* =========================================================================
 * 4d. Adaptive update checks
 * ======================================================================= */

// The viewer polls AES's /timestamp. The interval starts at CHECK_BASE_MS, doubles after every
// check that finds nothing new (or fails), and resets when data changes or the user returns.
// How far it may grow depends on what the loaded division's schedule says is happening now.
const CHECK_BASE_MS = 60000;
const CHECK_JITTER = 0.1;
const CHECK_CAPS = { overdue: 2 * 60000, window: 3 * 60000, idle: 60 * 60000 };
const CHECK_WINDOW_BEFORE_MS = 3600000;
const CHECK_WINDOW_AFTER_MS = 2 * 3600000;

// What the loaded schedule says about today: is a match window open, and are results overdue?
function checkContext(model, now) {
    const today = eventDateString(now);
    let first = Infinity;
    let last = -Infinity;
    const todays = [];
    for (const node of model.nodes.values()) {
        if (node.kind !== 'match' || matchDate(node) !== today) continue;
        const start = nodeStart(node);
        if (!Number.isFinite(start)) continue;
        const end = nodeEnd(node);
        first = Math.min(first, start);
        last = Math.max(last, end);
        todays.push({ node, end });
    }
    const windowStart = todays.length ? first - CHECK_WINDOW_BEFORE_MS : null;
    const windowEnd = todays.length ? last + CHECK_WINDOW_AFTER_MS : null;
    const inWindow = todays.length > 0 && now >= windowStart && now <= windowEnd;
    const overdue = inWindow && todays.some(({ node, end }) => end < now && !matchHasResult(node.match));
    const reason = overdue ? 'overdue' : (inWindow ? 'window' : 'idle');
    return { reason, capMs: CHECK_CAPS[reason], windowStart };
}

// Pure: how long to wait before the next check, given `model.checkIntervalMs` (the current
// backed-off interval), the schedule, and `now`. `random` supplies the +/-10% jitter.
function nextCheckDelay(model, now, random = Math.random) {
    const context = checkContext(model, now);
    const intervalMs = Math.min(Math.max(model.checkIntervalMs || CHECK_BASE_MS, CHECK_BASE_MS), context.capMs);
    let delayMs = Math.round(intervalMs * (1 - CHECK_JITTER + 2 * CHECK_JITTER * random()));
    // Never sleep through the start of today's match window.
    if (context.windowStart != null && context.windowStart > now) delayMs = Math.min(delayMs, Math.max(context.windowStart - now, CHECK_BASE_MS));
    return { delayMs, intervalMs, ...context };
}

// Called when a check or load finishes. 'reset' (data changed or a fresh load) returns to the
// base interval; 'unchanged' and 'failed' back off, up to the cap for the current context.
function scheduleNextCheck(outcome, now = Date.now()) {
    if (outcome === 'reset') state.checkIntervalMs = CHECK_BASE_MS;
    else state.checkIntervalMs = Math.min((state.checkIntervalMs || CHECK_BASE_MS) * 2, checkContext(state, now).capMs);
    state.checkInfo = nextCheckDelay(state, now);
    state.nextCheckAt = now + state.checkInfo.delayMs;
    renderStatusChip();
}

// Back to the base interval, due now: opening the viewer or returning to the tab.
function resetChecks() {
    state.checkIntervalMs = CHECK_BASE_MS;
    state.nextCheckAt = 0;
}

function formatDelay(ms) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
}

function checkReasonText(info) {
    if (info?.reason === 'overdue') return 'results overdue';
    if (info?.reason === 'window') return 'match window';
    const since = state.lastUpdatedTimestamp ? formatStamp(state.lastUpdatedTimestamp).slice(0, 10) : '';
    return since ? `idle since ${since}` : 'idle';
}
