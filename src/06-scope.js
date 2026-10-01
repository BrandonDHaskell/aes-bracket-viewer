/* =========================================================================
 * 6. Teams, filters, team scope, and tracing
 * ======================================================================= */

function matchParticipant(match, side) {
    const isFirst = side === 'first';
    const team = isFirst ? match?.FirstTeam : match?.SecondTeam;
    const rawId = isFirst
        ? (match?.FirstTeamId ?? team?.TeamId ?? team?.Id)
        : (match?.SecondTeamId ?? team?.TeamId ?? team?.Id);
    const id = Number(rawId) > 0 ? Number(rawId) : null;
    const label = team?.TeamName || team?.Name || team?.TeamText
        || (isFirst ? match?.FirstTeamName : match?.SecondTeamName)
        || (isFirst ? match?.FirstTeamText : match?.SecondTeamText)
        || 'TBD';
    return {
        id,
        label,
        won: normalizeBoolean(isFirst ? match?.FirstTeamWon : match?.SecondTeamWon),
        placeholder: looksLikeDependency(label) || /^TBD$/i.test(label)
    };
}

// One identity rule everywhere: compare team ids when both sides have one, otherwise
// compare normalized names exactly. No substring matching, so "Gold" never matches "Gold 2".
function isSameTeam(participant, team) {
    if (!participant || !team) return false;
    if (participant.id != null && team.id != null) return Number(participant.id) === Number(team.id);
    const label = normName(participant.label ?? participant.name);
    if (!label) return false;
    return label === normName(team.name) || (Boolean(team.text) && label === normName(team.text));
}

function teamSideInMatch(match, team) {
    if (isSameTeam(matchParticipant(match, 'first'), team)) return 'first';
    if (isSameTeam(matchParticipant(match, 'second'), team)) return 'second';
    return null;
}

function matchContainsTeam(match, team) {
    return Boolean(match && team && teamSideInMatch(match, team));
}

// Field names vary between AES payload versions; this checks the common spellings.
function matchWorkParticipant(match) {
    if (!match) return null;
    const work = match.WorkTeam || match.WorkingTeam || match.RefereeTeam || match.WorkTeamObject || null;
    const rawId = match.WorkTeamId ?? match.WorkingTeamId ?? match.RefereeTeamId ?? work?.TeamId ?? work?.Id;
    const id = Number(rawId) > 0 ? Number(rawId) : null;
    const label = work?.TeamName || work?.Name || work?.TeamText
        || match.WorkTeamName || match.WorkTeamText || match.WorkingTeamText || match.RefereeTeamText || '';
    if (id == null && !label) return null;
    return { id, label: label || `Team ${id}`, placeholder: looksLikeDependency(label) };
}

function selectedFocusTeam() {
    return state.teamFilterId == null ? null : state.teamById.get(Number(state.teamFilterId)) || null;
}

function isFocusParticipant(participant) {
    const selected = selectedFocusTeam();
    return selected ? isSameTeam(participant, selected) : isMyTeam(participant);
}

// The first of "my teams" (or a team picked from another division) is selected once per
// load. A refresh never re-applies it, so Reset filters stays reset.
function applyDefaultsOnce() {
    if (state.defaultsApplied) return;
    state.defaultsApplied = true;
    const pending = state.pendingTeamId != null ? state.teamById.get(Number(state.pendingTeamId)) : null;
    state.pendingTeamId = null;
    const team = pending || state.defaultTeam;
    if (!team) return;
    state.clubFilterId = team.clubId == null ? null : Number(team.clubId);
    state.teamFilterId = team.id;
    state.groupFilterPinned = false;
    state.pendingFocusScroll = true;
}

function populateClubFilter() {
    const select = $('[data-action="club"]');
    if (!select) return;
    select.innerHTML = '<option value="__all__">All clubs</option>'
        + state.clubOptions.map(club => `<option value="${club.id}">${escapeHtml(`${club.name} (${club.teamCount})`)}</option>`).join('');
    if (state.clubFilterId != null && !state.clubOptions.some(club => club.id === Number(state.clubFilterId))) state.clubFilterId = null;
    select.value = state.clubFilterId == null ? '__all__' : String(state.clubFilterId);
}

function populateTeamFilter() {
    const select = $('[data-action="team"]');
    if (!select) return;
    const teams = state.clubFilterId == null
        ? state.teamDirectory
        : state.teamDirectory.filter(team => Number(team.clubId) === Number(state.clubFilterId));
    const option = team => `<option value="${team.id}">${escapeHtml(team.name)}</option>`;
    const mine = teams.filter(team => state.myTeams.includes(team));
    select.innerHTML = '<option value="__all__">All teams</option>'
        + (mine.length
            ? `<optgroup label="My teams">${mine.map(option).join('')}</optgroup><optgroup label="All teams">${teams.map(option).join('')}</optgroup>`
            : teams.map(option).join(''));
    if (state.teamFilterId != null && !teams.some(team => team.id === Number(state.teamFilterId))) state.teamFilterId = null;
    select.value = state.teamFilterId == null ? '__all__' : String(state.teamFilterId);
}

function populateGroupFilter() {
    const select = $('[data-action="group"]');
    const optionsByKey = new Map();
    for (const node of state.nodes.values()) {
        if (!node.groupKey || !node.groupName || node.groupName === 'Ungrouped' || optionsByKey.has(node.groupKey)) continue;
        optionsByKey.set(node.groupKey, { key: node.groupKey, label: node.groupLabel, stageId: node.stageId, groupName: node.groupName });
    }
    const stageOrder = new Map(buildStageDescriptors([...state.nodes.values()]).map((stage, index) => [stage.id, index]));
    const groupNumber = option => Number(String(option.groupName).match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
    state.groupOptions = [...optionsByKey.values()].sort((a, b) =>
        (stageOrder.get(a.stageId) ?? 999) - (stageOrder.get(b.stageId) ?? 999)
        || groupNumber(a) - groupNumber(b)
        || a.label.localeCompare(b.label));
    if (state.groupFilterKey && !optionsByKey.has(state.groupFilterKey)) state.groupFilterKey = null;
    if (!select) return;
    const focusGroups = new Set([...state.filterDirectNodes].map(key => state.nodes.get(key)?.groupKey).filter(Boolean));
    select.innerHTML = '<option value="__all__">All groups</option>'
        + state.groupOptions.map(option => {
            const label = focusGroups.has(option.key) ? `\u2605 ${option.label}` : option.label;
            return `<option value="${escapeHtml(option.key)}">${escapeHtml(label)}</option>`;
        }).join('');
    select.value = state.groupFilterKey || '__all__';
}

function compareNodeSchedule(a, b) {
    return eventTime(a?.match?.ScheduledStartDateTime) - eventTime(b?.match?.ScheduledStartDateTime)
        || String(a?.key || '').localeCompare(String(b?.key || ''), undefined, { numeric: true });
}

function latestTeamNode(directKeys) {
    let latest = null;
    for (const key of directKeys) {
        const node = state.nodes.get(key);
        if (node && (!latest || compareNodeSchedule(node, latest) > 0)) latest = node;
    }
    return latest;
}

// current  = the team's matches, their pools, and the route that actually brought the team
//            to each one (walked back only along the team's own slot);
// possible = where the team can still go, starting from its latest appearance, with
//            WIN/LOSS branches pruned once a bracket result is known.
function computeTeamScope(team) {
    const direct = new Set();
    const teamPools = new Set();
    for (const node of teamMatchNodes(team)) {
        direct.add(node.key);
        if (node.poolGroupKey) teamPools.add(node.poolGroupKey);
    }
    const current = new Set(direct);
    for (const poolKey of teamPools) {
        for (const key of state.poolMembers.get(poolKey) || []) current.add(key);
    }

    const isTeamRelevant = key => {
        const node = state.nodes.get(key);
        if (!node) return false;
        if (node.kind === 'match') return direct.has(key);
        if (node.kind === 'standings') return teamPools.has(node.poolGroupKey);
        if (node.kind === 'entry') {
            const source = state.nodes.get(node.sourceNodeKey);
            return Boolean(source) && (direct.has(source.key) || (source.kind === 'standings' && teamPools.has(source.poolGroupKey)));
        }
        return false;
    };
    const queue = [...direct];
    const seen = new Set(queue);
    for (let i = 0; i < queue.length; i += 1) {
        const node = state.nodes.get(queue[i]);
        if (!node) continue;
        let previous = [];
        if (node.kind === 'match' && direct.has(node.key)) {
            const side = teamSideInMatch(node.match, team);
            for (const edge of state.incoming.get(node.key) || []) {
                if (edge.kind === 'aggregation') continue;
                if (edge.slot ? edge.slot === side : isTeamRelevant(edge.from)) previous.push(edge.from);
            }
        } else if (node.kind === 'entry') {
            previous = (state.incoming.get(node.key) || []).map(edge => edge.from);
        }
        for (const key of previous) {
            if (seen.has(key)) continue;
            seen.add(key);
            current.add(key);
            queue.push(key);
        }
    }

    const related = new Set(current);
    const latest = latestTeamNode(direct);
    const frontier = [];
    if (latest?.poolGroupKey) frontier.push(...(state.poolMembers.get(latest.poolGroupKey) || []));
    else if (latest) frontier.push(latest.key);
    const forwardSeen = new Set(frontier);
    const enqueue = key => {
        if (forwardSeen.has(key)) return;
        forwardSeen.add(key);
        related.add(key);
        frontier.push(key);
    };
    for (let i = 0; i < frontier.length; i += 1) {
        const key = frontier[i];
        const node = state.nodes.get(key);
        related.add(key);
        if (node?.poolGroupKey) {
            for (const member of state.poolMembers.get(node.poolGroupKey) || []) enqueue(member);
        }
        let edges = state.outgoing.get(key) || [];
        if (node?.kind === 'match' && !node.poolGroupKey && direct.has(key)) {
            const result = teamResultForMatch(node, team);
            if (result.status === 'win') edges = edges.filter(edge => edge.condition !== 'LOSS');
            if (result.status === 'loss') edges = edges.filter(edge => edge.condition !== 'WIN');
        }
        for (const edge of edges) enqueue(edge.to);
    }
    const possible = new Set([...related].filter(key => !current.has(key)));
    return { direct, current, related, possible };
}

function recomputeFilterScope(autoGroup = false) {
    let direct = new Set();
    let current = new Set();
    let related = new Set(state.nodes.keys());
    let possible = new Set();
    const team = selectedFocusTeam();
    const teams = team
        ? [team]
        : (state.clubFilterId != null ? state.teamDirectory.filter(t => Number(t.clubId) === Number(state.clubFilterId)) : []);
    if (team || state.clubFilterId != null) {
        related = new Set();
        for (const scopedTeam of teams) {
            const scope = computeTeamScope(scopedTeam);
            scope.direct.forEach(key => direct.add(key));
            scope.current.forEach(key => current.add(key));
            scope.related.forEach(key => related.add(key));
            scope.possible.forEach(key => possible.add(key));
        }
        possible = new Set([...possible].filter(key => !current.has(key)));
    }
    Object.assign(state, { filterDirectNodes: direct, filterCurrentNodes: current, filterRelatedNodes: related, filterPossibleNodes: possible });
    if (autoGroup && direct.size) {
        const active = findActiveTeamMatch(direct);
        // Only move the view when the team's active group actually changed.
        if (active?.groupKey && active.groupKey !== state.groupFilterKey) {
            state.groupFilterKey = active.groupKey;
            state.selectedNodeKey = active.key;
            state.pendingFocusScroll = true;
        }
    }
}

function findActiveTeamMatch(nodeKeys) {
    const now = Date.now();
    const items = [...nodeKeys]
        .map(key => state.nodes.get(key))
        .filter(node => node?.kind === 'match' && node.groupKey)
        .map(node => ({ node, time: parseEventTime(node.match?.ScheduledStartDateTime), hasResult: matchHasResult(node.match) }))
        .filter(item => Number.isFinite(item.time));
    const current = items
        .filter(item => item.time <= now && !item.hasResult)
        .sort((a, b) => b.time - a.time || b.node.key.localeCompare(a.node.key))[0];
    if (current) return current.node;
    const upcoming = items
        .filter(item => item.time >= now)
        .sort((a, b) => a.time - b.time || a.node.key.localeCompare(b.node.key))[0];
    if (upcoming) return upcoming.node;
    return items.sort((a, b) => b.time - a.time || b.node.key.localeCompare(a.node.key))[0]?.node || null;
}

// Every match each team plays or works, built once per model instead of scanning all match
// nodes on every lookup. Uses the isSameTeam rule: the team id when the match carries one,
// otherwise an exact name (or AES display text) match.
const teamIndexCache = { nodes: null, tz: null, plays: new Map(), work: new Map(), sorted: new Map() };
function teamMatchIndex() {
    const tz = effectiveTimeZone();
    if (teamIndexCache.nodes === state.nodes && teamIndexCache.tz === tz) return teamIndexCache;
    const byName = new Map();
    const addName = (name, team) => {
        const key = normName(name);
        if (!key) return;
        if (!byName.has(key)) byName.set(key, new Set());
        byName.get(key).add(team);
    };
    for (const team of state.teamDirectory) {
        addName(team.name, team);
        if (team.text) addName(team.text, team);
    }
    const teamsFor = participant => {
        if (!participant) return [];
        if (participant.id != null) {
            const team = state.teamById.get(Number(participant.id));
            return team ? [team] : [];
        }
        return [...(byName.get(normName(participant.label ?? participant.name)) || [])];
    };
    const plays = new Map();
    const work = new Map();
    const add = (map, team, node) => {
        if (!map.has(team.id)) map.set(team.id, []);
        const list = map.get(team.id);
        if (list.at(-1) !== node) list.push(node);
    };
    for (const node of state.nodes.values()) {
        if (node.kind !== 'match') continue;
        for (const side of ['first', 'second']) {
            for (const team of teamsFor(matchParticipant(node.match, side))) add(plays, team, node);
        }
        for (const team of teamsFor(matchWorkParticipant(node.match))) add(work, team, node);
    }
    Object.assign(teamIndexCache, { nodes: state.nodes, tz, plays, work, sorted: new Map() });
    return teamIndexCache;
}

// Teams outside the directory (never expected) fall back to scanning every match.
const isDirectoryTeam = team => state.teamById.get(Number(team?.id)) === team;

function teamMatchNodes(team) {
    if (!isDirectoryTeam(team)) return [...state.nodes.values()].filter(node => node.kind === 'match' && matchContainsTeam(node.match, team));
    return teamMatchIndex().plays.get(team.id) || [];
}

function selectedTeamMatches(team = selectedFocusTeam()) {
    if (!team) return [];
    const index = isDirectoryTeam(team) ? teamMatchIndex() : null;
    const cacheKey = `plays:${team.id}`;
    if (index?.sorted.has(cacheKey)) return [...index.sorted.get(cacheKey)];
    const seen = new Set();
    const list = teamMatchNodes(team)
        .filter(node => {
            const id = node.match?.MatchId ?? node.key;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .sort(compareNodeSchedule);
    if (index) index.sorted.set(cacheKey, list);
    return [...list];
}

function teamWorkAssignments(team = selectedFocusTeam()) {
    if (!team) return [];
    if (!isDirectoryTeam(team)) {
        return [...state.nodes.values()]
            .filter(node => node.kind === 'match' && isSameTeam(matchWorkParticipant(node.match), team))
            .sort(compareNodeSchedule);
    }
    const index = teamMatchIndex();
    const cacheKey = `work:${team.id}`;
    if (!index.sorted.has(cacheKey)) index.sorted.set(cacheKey, [...(index.work.get(team.id) || [])].sort(compareNodeSchedule));
    return [...index.sorted.get(cacheKey)];
}

function getBaseVisibleKeys() {
    const filtered = state.clubFilterId != null || state.teamFilterId != null;
    const modeKeys = filtered ? state.filterRelatedNodes : new Set(state.nodes.keys());
    const traceKeys = state.traceNodeKey ? [...state.traceUpstreamNodes, ...state.traceDownstreamNodes] : [];
    if (!state.groupFilterKey) {
        const visibleKeys = new Set(modeKeys);
        const contextKeys = new Set();
        for (const key of traceKeys) {
            visibleKeys.add(key);
            if (!modeKeys.has(key)) contextKeys.add(key);
        }
        return { visibleKeys, groupCoreKeys: new Set(), contextKeys };
    }
    const groupCoreKeys = new Set([...modeKeys].filter(key => state.nodes.get(key)?.groupKey === state.groupFilterKey));
    const visibleKeys = new Set(groupCoreKeys);
    const contextKeys = new Set();
    for (const edge of state.edges) {
        const fromCore = groupCoreKeys.has(edge.from);
        const toCore = groupCoreKeys.has(edge.to);
        if (fromCore === toCore) continue;
        const boundary = fromCore ? edge.to : edge.from;
        visibleKeys.add(boundary);
        contextKeys.add(boundary);
    }
    if (state.showFuturePath && state.teamFilterId != null && groupCoreKeys.size) {
        const queue = [...groupCoreKeys];
        const seen = new Set(queue);
        for (let i = 0; i < queue.length; i += 1) {
            for (const edge of state.outgoing.get(queue[i]) || []) {
                if (seen.has(edge.to)) continue;
                seen.add(edge.to);
                visibleKeys.add(edge.to);
                contextKeys.add(edge.to);
                queue.push(edge.to);
            }
        }
    }
    for (const key of traceKeys) {
        visibleKeys.add(key);
        if (!groupCoreKeys.has(key)) contextKeys.add(key);
    }
    return { visibleKeys, groupCoreKeys, contextKeys };
}

function computeTrace(nodeKey) {
    const walk = (start, adjacency, nextKey) => {
        const nodes = new Set([start]);
        const edges = new Set();
        const queue = [start];
        for (let i = 0; i < queue.length; i += 1) {
            for (const edge of adjacency.get(queue[i]) || []) {
                edges.add(edge.key);
                const next = nextKey(edge);
                if (nodes.has(next)) continue;
                nodes.add(next);
                queue.push(next);
            }
        }
        return { nodes, edges };
    };
    const upstream = walk(nodeKey, state.incoming, edge => edge.from);
    const downstream = walk(nodeKey, state.outgoing, edge => edge.to);
    Object.assign(state, {
        traceNodeKey: nodeKey,
        traceUpstreamNodes: upstream.nodes,
        traceUpstreamEdges: upstream.edges,
        traceDownstreamNodes: downstream.nodes,
        traceDownstreamEdges: downstream.edges
    });
}

function clearTrace(render = true) {
    Object.assign(state, {
        traceNodeKey: null,
        traceUpstreamNodes: new Set(),
        traceDownstreamNodes: new Set(),
        traceUpstreamEdges: new Set(),
        traceDownstreamEdges: new Set()
    });
    if (render) applyTraceChange();
}

function selectNode(nodeKey) {
    if (!state.nodes.has(nodeKey)) return;
    state.selectedNodeKey = nodeKey;
    if (state.viewMode !== 'tournament') {
        renderGraph();
        return;
    }
    if (state.traceNodeKey === nodeKey) clearTrace(false);
    else computeTrace(nodeKey);
    applyTraceChange();
}

// Tracing usually only changes highlighting. When the visible node set is unchanged,
// update classes in place instead of rebuilding and re-laying out the whole canvas.
function applyTraceChange() {
    if (state.viewMode === 'tournament' && state.renderedSignature) {
        const { visibleKeys } = getBaseVisibleKeys();
        if (visibleSignature(visibleKeys) === state.renderedSignature) {
            refreshTournamentClasses();
            if (state.selectedNodeKey) renderDetails(state.selectedNodeKey);
            updateViewControls();
            updateStatus();
            writeHashState();
            return;
        }
    }
    renderGraph();
}

function visibleSignature(keys) {
    return [...keys].sort().join('\u0001');
}

function nodeTraceClass(nodeKey) {
    if (!state.traceNodeKey) return '';
    const up = state.traceUpstreamNodes.has(nodeKey);
    const down = state.traceDownstreamNodes.has(nodeKey);
    if (up && down) return 'trace-both';
    if (up) return 'trace-upstream';
    if (down) return 'trace-downstream';
    return 'trace-dim';
}

function edgeTraceClass(edgeKey) {
    if (!state.traceNodeKey) return '';
    const up = state.traceUpstreamEdges.has(edgeKey);
    const down = state.traceDownstreamEdges.has(edgeKey);
    if (up && down) return 'trace-both';
    if (up) return 'trace-upstream';
    if (down) return 'trace-downstream';
    return 'trace-dim';
}

