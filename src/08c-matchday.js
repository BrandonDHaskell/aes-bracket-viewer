/* =========================================================================
 * 8c. Match day: day timeline, court status, post-pool routes, extra work
 * ======================================================================= */

const HOUR_MS = 3600000;

function nodeStart(node) {
    return parseEventTime(node?.match?.ScheduledStartDateTime);
}

function nodeEnd(node) {
    const start = nodeStart(node);
    const end = parseEventTime(node?.match?.ScheduledEndDateTime);
    return Number.isFinite(end) && end > start ? end : start + DEFAULTS.matchMinutes * 60000;
}

// AES court names carry the venue: "Oakland CC Ct.8" -> venue "Oakland CC", court "Ct.8".
function splitCourtName(name) {
    const text = String(name || '').trim();
    const match = text.match(/^(.*?)\s*((?:Ct|Court)\.?\s*[\w-]+)$/i);
    return match && match[1] ? { venue: match[1].trim(), court: match[2].replace(/\s+/g, ' ') } : { venue: '', court: text };
}

function courtKeyOf(node) {
    const court = node?.match?.Court;
    if (court?.CourtId != null) return `id:${court.CourtId}`;
    const name = courtName(node);
    return name ? `name:${normName(name)}` : '';
}

// "Oakland CC Ct.1 at 10/17 3:00 PM", the format of AES's text-only work assignments.
function parseScheduleText(text) {
    const match = String(text || '').trim().match(/^(.*?)\s+at\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
    if (!match) return null;
    const [, court, month, day, yearText, hourText, minute, meridiem] = match;
    const monthDay = `${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const known = state.dailyPlays.map(entry => entry.date).find(date => date.slice(5) === monthDay);
    const year = yearText
        ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText))
        : Number(String(known || state.event?.StartDate || new Date().getFullYear()).slice(0, 4));
    const hour = (Number(hourText) % 12) + (meridiem.toUpperCase() === 'P' ? 12 : 0);
    return {
        court: court.trim(),
        date: `${year}-${monthDay}`,
        start: zonedWallClockToEpoch(year, Number(month), Number(day), hour, Number(minute), 0, effectiveTimeZone())
    };
}

// Work duties AES lists only as text on bracket plays, e.g. "Loser of <match>" or
// "3rd-<pool> (18 Boys)". Each is resolved to a graph source when it is a placeholder.
const extraWorkCache = { nodes: null, tz: null, entries: [] };
function extraWorkEntries() {
    const tz = effectiveTimeZone();
    if (extraWorkCache.nodes === state.nodes && extraWorkCache.tz === tz) return extraWorkCache.entries;
    const entries = [];
    for (const day of state.dailyPlays) {
        for (const play of day.plays || []) {
            if (play.Type !== 1) continue;
            for (const item of play.ExtraWorkAssignments || []) {
                const text = String(item?.WorkTeamText || '').trim();
                if (!text) continue;
                let source = null;
                if (looksLikeDependency(text)) {
                    source = parseSourceExpression(text, play, new Map())
                        || parseSourceExpression(text.replace(/\s*\([^)]*\)\s*$/, ''), play, new Map());
                }
                entries.push({ play, text, scheduleText: item.ScheduleText || '', schedule: parseScheduleText(item.ScheduleText), source });
            }
        }
    }
    Object.assign(extraWorkCache, { nodes: state.nodes, tz, entries });
    return entries;
}

function teamExtraWork(team) {
    return extraWorkEntries().filter(entry => !entry.source && entry.schedule && isSameTeam({ id: null, label: entry.text }, team));
}

function nodeItem(kind, node) {
    return { kind, node, start: nodeStart(node), end: nodeEnd(node), date: matchDate(node), court: courtName(node) };
}

// Everything on the team's schedule: its matches, its work assignments, and text-only work.
function teamDayItems(team) {
    const items = [
        ...selectedTeamMatches(team).map(node => nodeItem('match', node)),
        ...teamWorkAssignments(team).map(node => nodeItem('work', node)),
        ...teamExtraWork(team).map(entry => ({
            kind: 'extra-work', node: null, entry,
            start: entry.schedule.start,
            end: entry.schedule.start + DEFAULTS.matchMinutes * 60000,
            date: entry.schedule.date,
            court: entry.schedule.court
        }))
    ];
    return items
        .filter(item => Number.isFinite(item.start))
        .sort((a, b) => a.start - b.start || (a.kind === 'match' ? -1 : 1));
}

function defaultMatchDay(dates) {
    const today = eventDateString();
    return dates.find(date => date >= today) || dates.at(-1) || null;
}

// An item is over once its result posts, once the team's next scheduled item has started
// (it can't play and work at once), or once it is staleMatchMinutes past its end. So a slow
// results desk never keeps an old match showing as "next".
function itemIsDone(item, now = Date.now(), following = null) {
    if (item.node && matchHasResult(item.node.match)) return true;
    if (following && now >= following.start) return true;
    return item.end + DEFAULTS.staleMatchMinutes * 60000 < now;
}

function pendingItems(items, now = Date.now()) {
    return items.filter((item, index) => !itemIsDone(item, now, items[index + 1]));
}

function annotateTimeline(items) {
    return items.map((item, index) => {
        const previous = items[index - 1];
        if (!previous) return { item, gap: null, move: null };
        const gap = Math.round((item.start - previous.end) / 60000);
        let move = null;
        if (item.court && previous.court && normName(item.court) !== normName(previous.court)) {
            const from = splitCourtName(previous.court);
            const to = splitCourtName(item.court);
            move = from.venue && to.venue && normName(from.venue) !== normName(to.venue)
                ? { venue: true, text: `venue change to ${to.venue}` }
                : { venue: false, text: `move to ${to.court || item.court}` };
        }
        return { item, gap, move };
    });
}

function gapText(gap) {
    if (gap < -1) return { warn: true, text: 'Overlaps the previous item' };
    if (gap <= 5) return { warn: false, text: 'No break' };
    if (gap >= DEFAULTS.mealBreakMinutes) return { warn: false, meal: true, text: `${formatDuration(gap)} break, time to eat` };
    return { warn: false, text: `${formatDuration(gap)} break` };
}

const courtIndexCache = { nodes: null, index: null };
function courtScheduleIndex() {
    if (courtIndexCache.nodes === state.nodes) return courtIndexCache.index;
    const index = new Map();
    for (const node of state.nodes.values()) {
        if (node.kind !== 'match') continue;
        const key = `${courtKeyOf(node)}|${matchDate(node)}`;
        if (!courtKeyOf(node)) continue;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(node);
    }
    for (const list of index.values()) list.sort(compareNodeSchedule);
    Object.assign(courtIndexCache, { nodes: state.nodes, index });
    return index;
}

// Only meaningful close to match time: earlier matches on the same court that are past
// their scheduled end with no result posted suggest the court is behind.
function courtStatus(node, now = Date.now()) {
    const start = nodeStart(node);
    if (!Number.isFinite(start) || now < start - 4 * HOUR_MS || now > start + HOUR_MS) return null;
    const court = splitCourtName(courtName(node)).court || 'This court';
    const earlier = (courtScheduleIndex().get(`${courtKeyOf(node)}|${matchDate(node)}`) || [])
        .filter(other => other !== node && nodeStart(other) < start);
    if (!earlier.length) return { state: 'first', text: `First match on ${court} today.` };
    const overdue = earlier.filter(other => !matchHasResult(other.match) && nodeEnd(other) + DEFAULTS.lateGraceMinutes * 60000 < now);
    if (overdue.length) {
        const count = overdue.length === 1 ? '1 earlier match has' : `${overdue.length} earlier matches have`;
        return { state: 'late', text: `${court} may be running late: ${count} passed the scheduled end with no result posted (latest ${formatTime(nodeStart(overdue.at(-1)))}).` };
    }
    const previous = earlier.at(-1);
    return matchHasResult(previous.match)
        ? { state: 'ontime', text: `${court} looks on time: the ${formatTime(nodeStart(previous))} match has posted its result.` }
        : { state: 'pending', text: `The ${formatTime(nodeStart(previous))} match on ${court} is scheduled to end at ${formatTime(nodeEnd(previous))}.` };
}

function nodeByMatchId(id) {
    if (id == null) return null;
    const keys = state.resolverIndex.byMatchId.get(String(id)) || [];
    return keys.length === 1 ? state.nodes.get(keys[0]) : null;
}

const sameSlot = (a, b) => Number.isFinite(a?.start) && a.start === b?.start && normName(a.court) === normName(b.court);

// AES's own routing for each finish place: next play, first match, and work, including
// text-only work that depends on the next match's result ("Loser of ...").
function poolRoutes(pool, team) {
    const routes = [];
    for (const entry of pool?.poolSheet?.FutureRoundMatches || []) {
        const place = Number(String(entry?.RankText || '').match(/^\s*(\d+)/)?.[1]);
        if (!place) continue;
        const holder = String(entry.RankText).replace(/^\s*\d+\s*-\s*/, '').trim();
        const holderIsTeam = Boolean(holder) && !looksLikeDependency(holder);
        const matchNode = nodeByMatchId(entry.Match?.MatchId);
        const route = {
            place,
            holder: holderIsTeam ? holder : '',
            holderIsSelected: holderIsTeam && isSameTeam({ id: null, label: holder }, team),
            playName: entry.Play?.CompleteFullName || entry.Play?.FullName || '',
            match: entry.Match ? { start: parseEventTime(entry.Match.ScheduledStartDateTime), court: entry.Match.Court?.Name || '', node: matchNode } : null,
            work: entry.WorkMatch ? { start: parseEventTime(entry.WorkMatch.ScheduledStartDateTime), court: entry.WorkMatch.Court?.Name || '', condition: null } : null,
            workDecided: entry.WorkTeamAssignmentDecided !== false,
            reseed: Boolean(entry.NextPendingReseed),
            extra: []
        };
        for (const extra of extraWorkEntries()) {
            if (!extra.schedule || !extra.source) continue;
            const onResult = matchNode && extra.source.from === matchNode.key && (extra.source.condition === 'WIN' || extra.source.condition === 'LOSS');
            const onPlace = extra.source.from === pool.key && placementConditionOrder(extra.source.condition) === place;
            if (!onResult && !onPlace) continue;
            const condition = onResult ? extra.source.condition : null;
            if (route.work && sameSlot(route.work, extra.schedule)) route.work.condition = condition;
            else route.extra.push({ ...extra.schedule, condition });
        }
        routes.push(route);
    }
    return routes.sort((a, b) => a.place - b.place);
}

function routeWorkText(route) {
    const parts = [];
    if (route.work) {
        const when = `${formatTime(route.work.start)}, ${route.work.court}`;
        if (route.work.condition === 'LOSS') parts.push(`${when}, only if you lose that match`);
        else if (route.work.condition === 'WIN') parts.push(`${when}, only if you win that match`);
        else parts.push(route.workDecided ? when : `${when} (not final)`);
    }
    for (const extra of route.extra) {
        const when = `${formatTime(extra.start)}, ${extra.court}`;
        parts.push(extra.condition === 'LOSS' ? `${when}, if you lose` : extra.condition === 'WIN' ? `${when}, if you win` : when);
    }
    return parts.length ? parts.join('; ') : 'None';
}

