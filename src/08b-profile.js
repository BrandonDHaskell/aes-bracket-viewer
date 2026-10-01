/* =========================================================================
 * 8b. Team profile: one set of per-team metrics, shared by Stats (and, in
 *     a later phase, Scouting) so both views always agree.
 * ======================================================================= */

function dateUtc(date) {
    const [year, month, day] = String(date).split('-').map(Number);
    return Date.UTC(year, month - 1, day);
}

const shortDateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

function weekendLabel(dates) {
    const first = new Date(dateUtc(dates[0]));
    const last = new Date(dateUtc(dates.at(-1)));
    if (dates.length === 1) return shortDateFormatter.format(first);
    return first.getUTCMonth() === last.getUTCMonth()
        ? `${shortDateFormatter.format(first)}-${last.getUTCDate()}`
        : `${shortDateFormatter.format(first)}-${shortDateFormatter.format(last)}`;
}

// League events span several weekends. Consecutive playdays form one weekend.
function eventWeekends() {
    const groups = [];
    for (const date of [...new Set(state.dailyPlays.map(day => day.date))].sort()) {
        const last = groups.at(-1);
        if (last && dateUtc(date) - dateUtc(last.at(-1)) <= 86400000) last.push(date);
        else groups.push([date]);
    }
    return groups.map(dates => ({ key: dates[0], dates, label: weekendLabel(dates) }));
}

function weekendByDate() {
    const map = new Map();
    for (const weekend of eventWeekends()) for (const date of weekend.dates) map.set(date, weekend);
    return map;
}

function matchDate(node) {
    if (node?.play?.__date) return node.play.__date;
    const epoch = parseEventTime(node?.match?.ScheduledStartDateTime);
    return Number.isFinite(epoch) ? eventDateString(epoch) : '';
}

// Every team's match record across the division, plus head-to-head splits, so an
// opponent's record can exclude the games it played against the selected team.
const recordsCache = { nodes: null, records: null };
function divisionRecords() {
    if (recordsCache.nodes === state.nodes) return recordsCache.records;
    const records = new Map();
    const entry = id => {
        if (!records.has(id)) records.set(id, { wins: 0, losses: 0, vs: new Map() });
        return records.get(id);
    };
    const bump = (record, opponentId, field) => {
        record[field] += 1;
        const split = record.vs.get(opponentId) || { wins: 0, losses: 0 };
        split[field] += 1;
        record.vs.set(opponentId, split);
    };
    for (const node of state.nodes.values()) {
        if (node.kind !== 'match' || !matchHasResult(node.match)) continue;
        const winner = matchWinnerSide(node.match);
        const first = directoryTeamForParticipant(matchParticipant(node.match, 'first'));
        const second = directoryTeamForParticipant(matchParticipant(node.match, 'second'));
        if (!winner || !first || !second) continue;
        const [won, lost] = winner === 'first' ? [first, second] : [second, first];
        bump(entry(won.id), lost.id, 'wins');
        bump(entry(lost.id), won.id, 'losses');
    }
    Object.assign(recordsCache, { nodes: state.nodes, records });
    return records;
}

function recordExcluding(teamId, excludedId) {
    const record = divisionRecords().get(teamId);
    if (!record) return { wins: 0, losses: 0 };
    const split = record.vs.get(excludedId) || { wins: 0, losses: 0 };
    return { wins: record.wins - split.wins, losses: record.losses - split.losses };
}

const emptyRecord = () => ({ wins: 0, losses: 0 });
const tally = (record, won) => { record[won ? 'wins' : 'losses'] += 1; };
const recordText = record => `${record.wins}-${record.losses}`;

function computeTeamProfile(team, { weekendKey = null } = {}) {
    const weekends = weekendByDate();
    const all = selectedTeamMatches(team);
    // Match-of-day order counts every match the team has that day, whatever the scope.
    const orderOfDay = new Map();
    const byDate = new Map();
    for (const node of all) {
        const date = matchDate(node);
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date).push(node);
    }
    for (const nodes of byDate.values()) nodes.sort(compareNodeSchedule).forEach((node, index) => orderOfDay.set(node.key, index + 1));

    const matches = weekendKey ? all.filter(node => weekends.get(matchDate(node))?.key === weekendKey) : all;
    const profile = {
        team,
        weekendKey,
        rows: [],
        matchWins: 0,
        matchLosses: 0,
        setWins: 0,
        setLosses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        remaining: 0,
        missingSetScores: 0,
        close: emptyRecord(),
        deciding: emptyRecord(),
        afterWinningSet1: emptyRecord(),
        afterLosingSet1: emptyRecord(),
        margins: { close: emptyRecord(), competitive: emptyRecord(), decisive: emptyRecord() },
        byOrder: new Map(),
        opponents: emptyRecord(),
        qualityWins: 0,
        qualityMatches: 0
    };

    for (const node of matches) {
        const match = node.match;
        const side = teamSideInMatch(match, team);
        const info = teamResultForMatch(node, team);
        const sets = side ? teamSetScores(match, side) : [];
        const date = matchDate(node);
        const opponentTeam = side ? directoryTeamForParticipant(matchParticipant(match, side === 'second' ? 'first' : 'second')) : null;
        const row = {
            node, info, sets, date, opponentTeam,
            weekend: weekends.get(date) || null,
            order: orderOfDay.get(node.key) || 0,
            setWins: 0, setLosses: 0, pointsFor: 0, pointsAgainst: 0,
            close: emptyRecord(), deciding: ''
        };
        profile.rows.push(row);
        if (info.status !== 'win' && info.status !== 'loss') {
            if (!matchHasResult(match)) profile.remaining += 1;
            continue;
        }
        const won = info.status === 'win';
        won ? profile.matchWins += 1 : profile.matchLosses += 1;

        for (const set of sets) {
            row.pointsFor += set.mine;
            row.pointsAgainst += set.theirs;
            if (set.mine === set.theirs) continue;
            const setWon = set.mine > set.theirs;
            setWon ? row.setWins += 1 : row.setLosses += 1;
            const margin = setMarginClass(set.mine, set.theirs);
            tally(profile.margins[margin], setWon);
            if (margin === 'close') tally(row.close, setWon);
            if (set.deciding) {
                tally(profile.deciding, setWon);
                row.deciding = setWon ? 'W' : 'L';
            }
        }
        if (!sets.length) {
            profile.missingSetScores += 1;
            const totals = aggregateSetWinTotals(match);
            if (totals) {
                row.setWins = side === 'second' ? totals.second : totals.first;
                row.setLosses = side === 'second' ? totals.first : totals.second;
            }
        }
        profile.setWins += row.setWins;
        profile.setLosses += row.setLosses;
        profile.pointsFor += row.pointsFor;
        profile.pointsAgainst += row.pointsAgainst;

        const firstSet = sets.find(set => set.index === 0 && set.mine !== set.theirs);
        if (firstSet) tally(firstSet.mine > firstSet.theirs ? profile.afterWinningSet1 : profile.afterLosingSet1, won);

        const order = profile.byOrder.get(row.order) || { matches: emptyRecord(), setWins: 0, setLosses: 0, pointsFor: 0, pointsAgainst: 0 };
        tally(order.matches, won);
        order.setWins += row.setWins;
        order.setLosses += row.setLosses;
        order.pointsFor += row.pointsFor;
        order.pointsAgainst += row.pointsAgainst;
        profile.byOrder.set(row.order, order);

        const opponent = opponentTeam;
        if (opponent) {
            const record = recordExcluding(opponent.id, team.id);
            profile.opponents.wins += record.wins;
            profile.opponents.losses += record.losses;
            if (record.wins + record.losses > 0 && record.wins / (record.wins + record.losses) >= 0.5) {
                profile.qualityMatches += 1;
                if (won) profile.qualityWins += 1;
            }
        }
    }
    profile.close = profile.margins.close;
    profile.pointRatio = profile.pointsAgainst > 0 ? profile.pointsFor / profile.pointsAgainst : null;
    return profile;
}

// Seed = position in AES's pool listing. AES lists pool teams in seed order: every
// three-team pool follows the 1v3, 2v3, 1v2 schedule against that listing.
function teamSeedFinishes(team, weekendKey = null) {
    const weekends = weekendByDate();
    return teamPoolHistory(team)
        .filter(pool => !weekendKey || weekends.get(pool.play?.__date)?.key === weekendKey)
        .map(pool => {
            const listed = pool.play?.Teams || [];
            const index = listed.findIndex(entry => isSameTeam({ id: Number(entry.TeamId) > 0 ? Number(entry.TeamId) : null, label: entry.TeamName || entry.TeamText }, team));
            const row = poolTeamRow(pool, team);
            return {
                pool,
                seed: index >= 0 ? index + 1 : null,
                finish: pool.complete && row ? row.rank : null,
                official: pool.hasOfficialFinish,
                size: listed.length || pool.teams.size
            };
        });
}

