/* =========================================================================
 * 3b. Status: status line, chip, banner, relative ages
 * ======================================================================= */

// `summary` marks the routine one-line status from updateStatus; anything else is a
// progress or one-off message that the chip shows only while it applies.
function setStatus(text, tone = '', { banner, summary = false } = {}) {
    const bar = $('.abv-status');
    const textEl = $('[data-role="status-text"]');
    if (!bar || !textEl) return;
    textEl.textContent = text;
    textEl.title = text;
    bar.classList.toggle('error', tone === 'error');
    if (tone === 'error') showBanner(banner ?? text);
    else if (banner === '') showBanner('');
    state.statusKind = summary || tone === 'error' ? 'summary' : (state.loading ? 'loading' : 'notice');
    state.statusNotice = state.statusKind === 'notice' ? text : '';
    clearTimeout(state.noticeTimer);
    if (state.statusKind === 'notice') state.noticeTimer = setTimeout(() => { state.statusKind = 'summary'; renderStatusChip(); }, 6000);
    renderStatusChip();
}

function showBanner(text) {
    const banner = $('[data-role="banner"]');
    if (!banner) return;
    state.bannerText = text;
    if (!text) state.dismissedBanner = '';
    // The banner is an alert region: rewriting the same text would make screen readers repeat it,
    // so write only on a change and let visibility alone show or hide it.
    const textEl = $('[data-role="banner-text"]');
    if (textEl.textContent !== text) textEl.textContent = text;
    banner.hidden = !text || state.dismissedBanner === text;
}

const STALE_CHECK_MS = 180000;

// Seconds under a minute, then minutes, hours, days.
function relativeAge(epoch) {
    const seconds = Math.floor((Date.now() - epoch) / 1000);
    if (!Number.isFinite(seconds)) return '';
    if (seconds < 60) return `${Math.max(0, seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 48 * 3600) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// YYYY-MM-DD HH:mm:ss in the effective time zone; short is MM-DD HH:mm for phones.
function formatStamp(value, short = false) {
    const epoch = parseEventTime(value);
    if (!Number.isFinite(epoch)) return '';
    const parts = Object.fromEntries(cachedFormatter('parts', effectiveTimeZone()).formatToParts(new Date(epoch)).map(part => [part.type, part.value]));
    return short
        ? `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
        : `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function renderStatusChip() {
    const chip = $('[data-role="status-chip"]');
    const label = $('[data-role="updated-label"]');
    if (!chip) return;
    const ready = state.loaded && !state.loading;
    // The first load shows the current weekend, then fills in earlier ones in the background.
    const loadingMore = state.loaded && state.pendingPoolSheets.size > 0;
    const notes = state.loaded ? state.unresolved.length + state.outcomeConflicts.length + state.poolSheetFailures.length : 0;
    const changedAt = state.lastUpdatedTimestamp || state.lastLoadedAt;
    const syncedAt = state.lastSyncedAt || state.lastLoadedAt;
    if (label) {
        const full = state.loaded ? formatStamp(changedAt) : '';
        label.hidden = !full;
        label.textContent = full ? (state.compact ? `Updated ${formatStamp(changedAt, true)}` : `Last updated: ${full}`) : '';
        label.title = full ? `${state.lastUpdatedTimestamp ? 'AES data last changed' : 'AES did not report a change time. Data loaded'} ${full} (${effectiveTimeZone()}).` : '';
    }
    let text = 'Loading...';
    if (state.statusKind === 'notice' && state.statusNotice) text = state.statusNotice;
    else if (!state.loaded && state.loadError && !state.loading) text = 'Not loaded';
    else if (ready || loadingMore) {
        const age = relativeAge(syncedAt);
        text = `${state.compact ? 'Checked' : 'Last checked:'} ${age || 'just now'}`;
        if (loadingMore) text += ` \u00b7 loading earlier weekends (${state.pendingPoolSheets.size})`;
    }
    chip.textContent = notes ? `${text} (${notes})` : text;
    chip.title = ready
        ? `The viewer last checked AES ${relativeAge(syncedAt) || 'just now'}. It checks every ${DEFAULTS.freshnessCheckMs / 1000}s while open. Select for details.`
        : ($('[data-role="status-text"]')?.textContent || text);
    const stale = ready && Date.now() - syncedAt > STALE_CHECK_MS;
    chip.classList.toggle('warn', notes > 0 || stale);
}
