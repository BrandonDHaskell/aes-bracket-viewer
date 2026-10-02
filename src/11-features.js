/* =========================================================================
 * 11. Calendar export, notifications, shareable links, startup
 * ======================================================================= */

function icsEscape(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

function icsFold(line) {
    const parts = [];
    let rest = line;
    while (rest.length > 73) {
        parts.push(rest.slice(0, 73));
        rest = ` ${rest.slice(73)}`;
    }
    parts.push(rest);
    return parts.join('\r\n');
}

function icsDate(epoch) {
    return new Date(epoch).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Times are exported in UTC (computed from event-local AES times), so every calendar app
// shows them correctly in the viewer's own zone.
function buildTeamIcs(team) {
    const stamp = icsDate(Date.now());
    const pageUrl = `${location.origin}/event/${state.eventKey}/home`;
    const eventName = state.event?.Name || state.event?.EventName || 'AES event';
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//local//AES Bracket Viewer//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${icsEscape(`${team.name}: ${eventName}`)}`
    ];
    let count = 0;
    const add = (node, kind) => {
        const start = parseEventTime(node.match?.ScheduledStartDateTime);
        if (!Number.isFinite(start)) return;
        let end = parseEventTime(node.match?.ScheduledEndDateTime);
        if (!Number.isFinite(end) || end <= start) end = start + DEFAULTS.matchMinutes * 60000;
        const first = matchParticipant(node.match, 'first').label;
        const second = matchParticipant(node.match, 'second').label;
        const summary = kind === 'work' ? `Work: ${first} vs ${second}` : `${team.name} vs ${teamResultForMatch(node, team).opponent}`;
        const description = [stageText(node), matchHasResult(node.match) ? `Result: ${matchResultSummary(node.match)}` : '', pageUrl]
            .filter(Boolean).join('\n');
        lines.push(
            'BEGIN:VEVENT',
            `UID:${icsEscape(`${state.eventKey}-${node.match?.MatchId ?? node.key}-${kind}`)}@aes-bracket-viewer`,
            `DTSTAMP:${stamp}`,
            `DTSTART:${icsDate(start)}`,
            `DTEND:${icsDate(end)}`,
            `SUMMARY:${icsEscape(summary)}`,
            `LOCATION:${icsEscape([courtName(node), eventName].filter(Boolean).join(', '))}`,
            `DESCRIPTION:${icsEscape(description)}`,
            `URL:${pageUrl}`,
            'END:VEVENT'
        );
        count += 1;
    };
    for (const node of selectedTeamMatches(team)) add(node, 'match');
    for (const node of teamWorkAssignments(team)) add(node, 'work');
    for (const entry of teamExtraWork(team)) {
        lines.push(
            'BEGIN:VEVENT',
            `UID:${icsEscape(`${state.eventKey}-${entry.play.PlayId}-${entry.schedule.start}-extra-work`)}@aes-bracket-viewer`,
            `DTSTAMP:${stamp}`,
            `DTSTART:${icsDate(entry.schedule.start)}`,
            `DTEND:${icsDate(entry.schedule.start + DEFAULTS.matchMinutes * 60000)}`,
            `SUMMARY:${icsEscape(`Work: ${entry.play.FullName || 'bracket match'}`)}`,
            `LOCATION:${icsEscape([entry.schedule.court, eventName].filter(Boolean).join(', '))}`,
            `DESCRIPTION:${icsEscape([entry.play.CompleteFullName, pageUrl].filter(Boolean).join('\n'))}`,
            `URL:${pageUrl}`,
            'END:VEVENT'
        );
        count += 1;
    }
    lines.push('END:VCALENDAR');
    return { text: `${lines.map(icsFold).join('\r\n')}\r\n`, count };
}

function downloadText(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportTeamCalendar() {
    const team = selectedFocusTeam();
    if (!team) return;
    const { text, count } = buildTeamIcs(team);
    if (!count) {
        setStatus(`No scheduled times for ${team.name} yet, so there is nothing to export.`);
        return;
    }
    downloadText(`${slugify(team.name)}-schedule.ics`, text, 'text/calendar;charset=utf-8');
    setStatus(`Exported ${count} calendar events for ${team.name}.`);
}

function slugify(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
}

function csvCell(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_RESULT = { win: 'W', loss: 'L', upcoming: 'Upcoming', current: 'Pending', unknown: 'Result posted' };

// One row per match in the Stats range, set scores from the selected team's side.
// A byte-order mark keeps Excel from mangling non-ASCII team names.
function exportTeamStatsCsv() {
    const team = selectedFocusTeam();
    if (!team) return;
    const profile = computeTeamProfile(team, { weekendKey: state.statsWeekendKey });
    const header = ['Date', 'Time', 'Weekend', 'Stage', 'Group', 'Play', 'Court', 'Opponent', 'Result', 'Sets',
        'Sets won', 'Sets lost', 'Points for', 'Points against', 'Close sets won', 'Close sets lost', 'Deciding set', 'Match of day'];
    const rows = profile.rows.map(row => {
        const epoch = parseEventTime(row.node.match?.ScheduledStartDateTime);
        const parts = Number.isFinite(epoch) ? zonedParts(epoch, effectiveTimeZone()) : null;
        const played = row.info.status === 'win' || row.info.status === 'loss';
        return [
            row.date,
            parts ? `${parts.hour}:${parts.minute}` : '',
            row.weekend?.label || '',
            row.node.stageLabel,
            row.node.groupName,
            row.node.play?.FullName || '',
            courtName(row.node),
            row.info.opponent,
            CSV_RESULT[row.info.status] || '',
            formatTeamSetScores(row.sets).replace(/, /g, ' '),
            played ? row.setWins : '',
            played ? row.setLosses : '',
            played ? row.pointsFor : '',
            played ? row.pointsAgainst : '',
            played ? row.close.wins : '',
            played ? row.close.losses : '',
            row.deciding,
            row.order || ''
        ];
    });
    const text = `\ufeff${[header, ...rows].map(line => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
    const scope = state.statsWeekendKey ? `-${state.statsWeekendKey}` : '';
    downloadText(`${slugify(team.name)}-stats${scope}.csv`, text, 'text/csv;charset=utf-8');
    setStatus(`Exported ${rows.length} matches for ${team.name}.`);
}

/* ---------- Match-day sharing: parent update and printable sheet ---------- */

function selectedMatchDay(team) {
    const dates = [...new Set(teamDayItems(team).map(item => item.date).filter(Boolean))].sort();
    return state.matchDayDate && dates.includes(state.matchDayDate) ? state.matchDayDate : defaultMatchDay(dates);
}

function matchDaySummary(team, date) {
    const items = teamDayItems(team).filter(item => item.date === date);
    const venues = [...new Set(items.map(item => splitCourtName(item.court).venue).filter(Boolean))];
    const where = item => (venues.length === 1 ? splitCourtName(item.court).court || item.court : item.court) || 'court TBD';
    const firstPlay = items.find(item => item.kind === 'match');
    const pools = teamPoolHistory(team).filter(pool => pool.play?.__date === date);
    return { items, venues, where, firstPlay, pools };
}

// "vs Opponent" plus "W 25-20, 25-18" once played; work items describe the match worked.
function itemParts(item, team) {
    if (item.kind !== 'match') {
        const what = item.node
            ? `Work: ${matchParticipant(item.node.match, 'first').label} vs ${matchParticipant(item.node.match, 'second').label}`
            : `Work: ${item.entry.play.FullName || 'bracket match'}`;
        return { what, result: '' };
    }
    const info = teamResultForMatch(item.node, team);
    const side = teamSideInMatch(item.node.match, team);
    const played = info.status === 'win' || info.status === 'loss';
    return {
        what: `vs ${info.opponent}`,
        result: played ? `${info.status === 'win' ? 'W' : 'L'} ${formatTeamSetScores(side ? teamSetScores(item.node.match, side) : [])}` : ''
    };
}

function itemLine(item, team, where) {
    if (item.kind !== 'match') return `${formatTime(item.start)} work, ${where(item)}`;
    const { what, result } = itemParts(item, team);
    return `${formatTime(item.start)} ${what}, ${where(item)}${result ? `: ${result}` : ''}`;
}

// Plain text sized for a team group chat.
function buildParentUpdate(team, date) {
    const { items, venues, where, firstPlay, pools } = matchDaySummary(team, date);
    const lines = [`${team.name}, ${formatDay(date)}${venues.length === 1 ? ` at ${venues[0]}` : ''}`];
    if (firstPlay && date >= eventDateString()) lines.push(`Arrive by ${formatTime(firstPlay.start - state.prefs.warmupMinutes * 60000)}`);
    for (const item of items) lines.push(itemLine(item, team, where));
    for (const pool of pools) {
        const routes = poolRoutes(pool, team).filter(route => route.match);
        if (!routes.length) continue;
        const row = poolTeamRow(pool, team);
        if (pool.complete && row) {
            const route = routes.find(entry => entry.place === row.rank);
            if (route) lines.push(`Finished ${ordinal(row.rank)} in ${pool.poolLabel}, next at ${formatTime(route.match.start)}, ${route.match.court}`);
        } else {
            lines.push(`After ${pool.poolLabel}: ${routes.map(route => `${ordinal(route.place)} plays ${formatTime(route.match.start)} ${splitCourtName(route.match.court).court || route.match.court}`).join(', ')}`);
        }
    }
    return lines.join('\n');
}

function copyParentUpdate() {
    const team = selectedFocusTeam();
    const date = team && selectedMatchDay(team);
    if (!date) return;
    const text = buildParentUpdate(team, date);
    const fallback = () => {
        const area = $('[data-role="parent-text"]');
        if (!area) return;
        area.hidden = false;
        area.value = text;
        area.focus();
        area.select();
        setStatus('Copy did not work here. The update is selected below; copy it from there.');
    };
    if (!navigator.clipboard?.writeText) {
        fallback();
        return;
    }
    navigator.clipboard.writeText(text).then(() => setStatus(`Parent update for ${formatDay(date)} copied.`), fallback);
}

function printDaySheet() {
    const team = selectedFocusTeam();
    const date = team && selectedMatchDay(team);
    if (!date) return;
    const { items, venues, firstPlay, pools } = matchDaySummary(team, date);
    const records = divisionRecords();
    const schedule = annotateTimeline(items).map(({ item, gap, move }) => {
        const { what: label, result } = itemParts(item, team);
        const what = result ? `${label} (${result})` : label;
        const note = gap == null ? '' : [gapText(gap).text, move?.text].filter(Boolean).join(', then ');
        return `<tr><td>${escapeHtml(formatTime(item.start))}</td><td>${escapeHtml(what)}</td><td>${escapeHtml(item.court || '')}</td><td>${escapeHtml(note)}</td></tr>`;
    }).join('');
    const routes = pools.map(pool => {
        const rows = poolRoutes(pool, team).map(route => `<tr><td>${ordinal(route.place)}</td><td>${escapeHtml(route.playName)}</td><td>${route.match ? `${escapeHtml(formatTime(route.match.start))}, ${escapeHtml(route.match.court)}` : '-'}</td><td>${escapeHtml(routeWorkText(route))}</td></tr>`).join('');
        return rows ? `<h2>After ${escapeHtml(pool.poolLabel)}</h2><table><thead><tr><th>Finish</th><th>Next</th><th>First match</th><th>Work</th></tr></thead><tbody>${rows}</tbody></table>` : '';
    }).join('');
    const opponents = [...new Map(items.filter(item => item.kind === 'match').map(item => {
        const side = teamSideInMatch(item.node.match, team);
        const opponent = directoryTeamForParticipant(matchParticipant(item.node.match, side === 'second' ? 'first' : 'second'));
        return [opponent?.id ?? item.node.key, opponent];
    })).values()].filter(Boolean).map(opponent => {
        const record = records.get(opponent.id) || { wins: 0, losses: 0 };
        return `<tr><td>${escapeHtml(opponent.name)}</td><td>${escapeHtml(opponent.clubName)}</td><td>${record.wins}-${record.losses}</td><td class="notes"></td></tr>`;
    }).join('');
    const arrive = firstPlay ? `<p><strong>Arrive by ${escapeHtml(formatTime(firstPlay.start - state.prefs.warmupMinutes * 60000))}</strong> (${state.prefs.warmupMinutes} min before the first match)</p>` : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(team.name)}, ${escapeHtml(formatDay(date))}</title>
            <style>
                body { font: 12px/1.4 system-ui, sans-serif; color: #111; margin: 18mm 14mm; }
                h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 16px 0 6px; }
                p { margin: 4px 0; } table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; vertical-align: top; }
                th { background: #eee; } td.notes { width: 40%; } .lines div { border-bottom: 1px solid #999; height: 24px; }
                @media print { button { display: none; } }
            </style></head><body>
            <button onclick="window.print()">Print</button>
            <h1>${escapeHtml(team.name)}</h1>
            <p>${escapeHtml(formatDay(date))}${venues.length ? `, ${escapeHtml(venues.join(' and '))}` : ''}. ${escapeHtml(state.event?.Name || '')}, ${escapeHtml(state.divisionName)}</p>
            ${arrive}
            <h2>Schedule</h2><table><thead><tr><th>Time</th><th>What</th><th>Court</th><th>Before this</th></tr></thead><tbody>${schedule}</tbody></table>
            ${routes}
            ${opponents ? `<h2>Opponents today</h2><table><thead><tr><th>Team</th><th>Club</th><th>Record at event</th><th>Notes</th></tr></thead><tbody>${opponents}</tbody></table>` : ''}
            <h2>Notes</h2><div class="lines">${'<div></div>'.repeat(8)}</div>
            <p style="margin-top:12px;color:#666">From AES results as of ${escapeHtml(formatDateTime(state.lastLoadedAt))}. Check AES for changes.</p>
            </body></html>`;
    const win = window.open('', '_blank');
    if (!win) {
        setStatus('The browser blocked the print window. Allow pop-ups for this site and try again.');
        return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch { /* the sheet has its own Print button */ } }, 300);
}

/* ---------- Notifications ---------- */

// Every one of "my teams" in the loaded division, plus the selected team.
function notificationTeams() {
    const teams = [...state.myTeams];
    const selected = selectedFocusTeam();
    if (selected && !teams.includes(selected)) teams.unshift(selected);
    return teams;
}

function snapshotOneTeam(team) {
    const entries = new Map();
    for (const node of selectedTeamMatches(team)) {
        const info = teamResultForMatch(node, team);
        entries.set(`m:${node.match?.MatchId ?? node.key}`, {
            kind: 'match',
            opponent: info.opponent,
            court: courtName(node),
            time: node.match?.ScheduledStartDateTime || '',
            hasResult: matchHasResult(node.match),
            label: info.label,
            summary: info.result
        });
    }
    for (const node of teamWorkAssignments(team)) {
        entries.set(`w:${node.match?.MatchId ?? node.key}`, {
            kind: 'work',
            court: courtName(node),
            time: node.match?.ScheduledStartDateTime || '',
            label: `${matchParticipant(node.match, 'first').label} vs ${matchParticipant(node.match, 'second').label}`
        });
    }
    return { teamKey: normName(team.code || team.name), teamName: team.name, entries };
}

function snapshotTeamSchedule() {
    const teams = notificationTeams();
    return teams.length ? new Map(teams.map(team => [String(team.id), snapshotOneTeam(team)])) : null;
}

function notifyScheduleChanges(previous) {
    if (!previous || !state.prefs.notify) return;
    const current = snapshotTeamSchedule();
    if (!current) return;
    const when = entry => [formatDateTime(entry.time), entry.court].filter(Boolean).join(', ');
    for (const [teamId, snapshot] of current) {
        const before = previous.get(teamId);
        if (!before || before.teamKey !== snapshot.teamKey) continue;
        const messages = [];
        for (const [key, now] of snapshot.entries) {
            const old = before.entries.get(key);
            if (now.kind === 'work') {
                if (!old) messages.push(`New work assignment: ${now.label}, ${when(now)}`);
                else if (old.court !== now.court || old.time !== now.time) messages.push(`Work assignment moved: ${now.label}, ${when(now)}`);
                continue;
            }
            if (!old) messages.push(`New match vs ${now.opponent}, ${when(now)}`);
            else if (!old.hasResult && now.hasResult) messages.push(`${now.label} vs ${now.opponent}${now.summary ? ` (${now.summary})` : ''}`);
            else if (!now.hasResult && (old.court !== now.court || old.time !== now.time || old.opponent !== now.opponent)) {
                messages.push(`Updated: vs ${now.opponent}, ${when(now)}`);
            }
        }
        if (!messages.length) continue;
        const body = messages.slice(0, 4).join('\n') + (messages.length > 4 ? `\nand ${messages.length - 4} more` : '');
        sendNotification(snapshot.teamName, body);
    }
}

function sendNotification(title, body) {
    try {
        if (typeof GM_notification === 'function') {
            GM_notification({ title, text: body });
            return;
        }
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, tag: `${APP_ID}-${state.eventKey}` });
        }
    } catch (error) {
        console.warn('[AES Bracket Viewer] notification failed', error);
    }
}

async function requestNotifications(checkbox) {
    const hasGm = typeof GM_notification === 'function';
    if (!hasGm && !('Notification' in window)) {
        checkbox.checked = false;
        setSettingsNote('This browser does not support notifications on this page.');
        return;
    }
    if (!hasGm && Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            checkbox.checked = false;
            savePrefs({ notify: false });
            setSettingsNote('Notifications are blocked for this site. Allow them in the browser\'s site settings to turn this on.');
            return;
        }
    }
    savePrefs({ notify: true });
    const teams = notificationTeams();
    const who = teams.length > 1 ? `your ${teams.length} teams` : (teams[0]?.name || 'your teams');
    setSettingsNote(`Notifications on for ${who}: new matches, results, court or time changes, and work assignments. Checks keep running while this tab stays open.`);
}

/* ---------- Shareable view links ---------- */

function readHashState() {
    const match = location.hash.match(new RegExp(`[#&]${HASH_KEY}=([^&]*)`));
    if (!match) return null;
    try {
        const params = new URLSearchParams(decodeURIComponent(match[1]));
        return {
            view: params.get('v'),
            division: params.get('d'),
            club: params.get('c'),
            team: params.get('t'),
            group: params.get('g'),
            pool: params.get('p'),
            scout: params.get('o'),
            myCodes: (params.get('my') || '').split(',').map(code => code.trim()).filter(Boolean)
        };
    } catch {
        return null;
    }
}

// replaceState keeps the AES single-page router from treating this as navigation.
function writeHashState() {
    if (!isOpen() || !state.loaded) return;
    const params = new URLSearchParams();
    params.set('v', state.viewMode);
    if (state.divisionId != null) params.set('d', String(state.divisionId));
    if (state.clubFilterId != null) params.set('c', String(state.clubFilterId));
    if (state.teamFilterId != null) params.set('t', String(state.teamFilterId));
    if (state.groupFilterKey && state.groupFilterPinned) params.set('g', state.groupFilterKey);
    if (state.viewMode === 'performance' && state.performancePoolKey) params.set('p', state.performancePoolKey);
    if (state.viewMode === 'scouting' && state.scoutTeamId != null) params.set('o', String(state.scoutTeamId));
    const hash = `#${HASH_KEY}=${encodeURIComponent(params.toString())}`;
    if (location.hash === hash) return;
    history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
}

function clearHashState() {
    if (!location.hash.includes(`${HASH_KEY}=`)) return;
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
}

function applyHashState() {
    state.hashApplied = true;
    const hash = state.hashState;
    if (!hash) return;
    if (VIEWS.includes(hash.view)) state.viewMode = hash.view;
    const team = hash.team != null ? state.teamById.get(Number(hash.team)) : null;
    if (team) {
        state.teamFilterId = team.id;
        state.clubFilterId = team.clubId == null ? null : Number(team.clubId);
    } else if (hash.club != null && state.clubOptions.some(club => club.id === Number(hash.club))) {
        state.clubFilterId = Number(hash.club);
        state.teamFilterId = null;
    }
    if (hash.group) {
        state.groupFilterKey = hash.group;
        state.groupFilterPinned = true;
    }
    if (hash.pool) state.performancePoolKey = hash.pool;
    if (hash.scout) state.scoutTeamId = Number(hash.scout) || null;
    state.pendingFocusScroll = true;
}

/* ---------- Startup ---------- */

function init() {
    loadPrefs();
    state.hashState = readHashState();
    if (state.hashState?.myCodes?.length) {
        const added = mergeSavedTeams(state.hashState.myCodes.map(code => ({ code, name: code })));
        state.notice = added
            ? `Added ${added} team${added === 1 ? '' : 's'} from a shared link to your saved teams.`
            : 'The shared link\'s teams were already in your saved teams.';
    }
    injectStyles();
    createLauncher();
    createViewer();
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && isOpen()) {
            // An open Tournament toolbar handles its own Escape (see onAppKeydown).
            if (state.prefs.toolsOpen && event.target instanceof Element && event.target.closest('[data-role="graph-tools"]')) return;
            event.stopPropagation();
            // On phones Escape closes the open detail sheet before it closes the viewer.
            if (!closeSheet()) closeViewer();
        }
    }, true);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isOpen() && state.loaded) {
            resetChecks();
            updateCountdowns();
            refreshIfChanged();
        }
    });
    // Tests read the model and call the pure scheduling function through this hook.
    if (window.__ABV_TEST__ && typeof window.__ABV_TEST__ === 'object') Object.assign(window.__ABV_TEST__, { state, nextCheckDelay, checkContext });
    startScheduler();
    if (state.hashState && eventKeyFromLocation()) openViewer();
}

init();
})();
