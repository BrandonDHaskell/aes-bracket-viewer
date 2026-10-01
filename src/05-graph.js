/* =========================================================================
 * 5. Graph model: nodes, dependency edges, resolver, adjacency
 * ======================================================================= */

function buildGraphModel() {
    // Always create new containers so a snapshot taken before this call stays intact.
    Object.assign(state, {
        nodes: new Map(),
        edges: [],
        edgeByKey: new Map(),
        unresolved: [],
        outcomeConflicts: [],
        groupOptions: [],
        performancePools: new Map(),
        dateByPlayId: new Map()
    });
    for (const day of state.dailyPlays) {
        for (const play of day.plays || []) {
            if (play.PlayId != null) state.dateByPlayId.set(play.PlayId, day.date);
        }
    }
    const metaByPlayId = new Map(state.masterPlays.map(play => [play.PlayId, play]));
    const allPlays = state.dailyPlays.flatMap(day => (day.plays || []).map(play => ({ ...play, __date: day.date })));
    buildTeamDirectory(allPlays);

    const matchKeyByPlayAndShort = new Map();
    const poolMatchKeys = new Map();
    const bracketTreeLinks = [];
    const bracketSourceLinks = [];

    // Nodes. Every scheduled contest is a match node. Each round-robin pool also gets a
    // standings junction, because AES advances teams by finish place after all pool play.
    for (const play of allPlays) {
        const merged = { ...play, __meta: metaByPlayId.get(play.PlayId) || {} };
        if (play.Type === 0) {
            const poolSheet = state.poolSheets.get(play.PlayId) || null;
            const poolKey = play.CompleteShortName;
            state.nodes.set(poolKey, { key: poolKey, kind: 'standings', play: merged, poolSheet, match: null, poolGroupKey: poolKey, poolPlayId: play.PlayId });
            const keys = [];
            (poolSheet?.Matches || []).forEach((match, index) => {
                const shortName = getMatchShortName(match, index + 1);
                const key = `${poolKey}${shortName}`;
                state.nodes.set(key, {
                    key, kind: 'match', matchType: 'pool', play: merged, poolSheet, match,
                    poolGroupKey: poolKey, poolPlayId: play.PlayId, localX: 0, localY: index
                });
                matchKeyByPlayAndShort.set(`${poolKey}|${shortName}`, key);
                keys.push(key);
            });
            poolMatchKeys.set(poolKey, keys);
        } else if (play.Type === 1) {
            for (const root of play.Roots || []) walkBracketNodes(merged, root, matchKeyByPlayAndShort, bracketTreeLinks, bracketSourceLinks);
        }
    }
    buildResolverIndex();

    const pairs = new Set();
    const addEdge = (from, to, condition, sourceText, kind = 'advancement', slot = null) => {
        if (!from || !to) return;
        if (!state.nodes.has(from) || !state.nodes.has(to)) {
            state.unresolved.push({ from, to, condition, sourceText, reason: 'node-missing' });
            return;
        }
        const key = `${from}|${condition}|${to}|${kind}`;
        if (state.edgeByKey.has(key)) return;
        const edge = { key, from, to, condition, sourceText, kind, slot };
        state.edges.push(edge);
        state.edgeByKey.set(key, edge);
        pairs.add(`${from}\u0000${to}`);
    };

    for (const [poolKey, keys] of poolMatchKeys) {
        const standings = state.nodes.get(poolKey);
        for (const key of keys) addEdge(key, poolKey, 'STANDINGS', standings.play.FullName, 'aggregation');
    }

    // Participant placeholders ("1st R1P3", "Winner of M2") encode progression. A result
    // that feeds a round-robin pool is routed through ONE entry junction per pool, which then
    // fans out to that team's scheduled pool matches, so one crossover result never looks
    // like several WIN/LOSS branches. Each edge records the slot (first/second) it fills,
    // which lets team scoping follow only the selected team's own route.
    const entryByRoute = new Map();
    for (const node of [...state.nodes.values()]) {
        if (node.kind !== 'match') continue;
        const bySide = getMatchDependencyExpressionsBySide(node.match);
        for (const [slot, texts] of [['first', bySide.first], ['second', bySide.second], [null, bySide.unknown]]) {
            for (const sourceText of texts) {
                const source = parseSourceExpression(sourceText, node.play, matchKeyByPlayAndShort);
                if (!source) {
                    state.unresolved.push({ to: node.key, sourceText, reason: 'unparsed-match-slot' });
                    continue;
                }
                if (node.matchType !== 'pool') {
                    addEdge(source.from, node.key, source.condition, sourceText, 'advancement', slot);
                    continue;
                }
                const routeId = `${source.from}|${source.condition}|${node.poolGroupKey}`;
                let entryKey = entryByRoute.get(routeId);
                if (!entryKey) {
                    entryKey = `ENTRY|${routeId}`;
                    entryByRoute.set(routeId, entryKey);
                    state.nodes.set(entryKey, {
                        key: entryKey, kind: 'entry', play: node.play, poolSheet: node.poolSheet, match: null,
                        poolGroupKey: node.poolGroupKey, poolPlayId: node.poolPlayId,
                        sourceNodeKey: source.from, sourceCondition: source.condition, sourceText
                    });
                    addEdge(source.from, entryKey, source.condition, sourceText, 'advancement');
                }
                addEdge(entryKey, node.key, 'SCHEDULED', sourceText, 'membership', slot);
            }
        }
    }

    for (const link of bracketSourceLinks) {
        const source = parseSourceExpression(link.sourceText, link.destinationPlay, matchKeyByPlayAndShort);
        if (!source) {
            state.unresolved.push({ to: link.to, sourceText: link.sourceText, reason: 'unparsed-tree-source' });
            continue;
        }
        addEdge(source.from, link.to, source.condition, link.sourceText, 'advancement', link.slot);
    }

    // Bracket structure is only a fallback when no explicit source text connected the pair.
    for (const link of bracketTreeLinks) {
        if (!pairs.has(`${link.from}\u0000${link.to}`)) addEdge(link.from, link.to, 'FEEDS', 'AES bracket structure', 'advancement', link.slot);
    }

    // Future pools can exist before AES creates their matches. Connect them from their
    // placeholder team list so the route is visible early.
    for (const [poolKey, keys] of poolMatchKeys) {
        if (keys.length) continue;
        const standings = state.nodes.get(poolKey);
        const expressions = new Set();
        collectDependencyStrings(standings.play?.Teams || [], expressions, 0);
        collectDependencyStrings(standings.poolSheet?.Pool?.Teams || [], expressions, 0);
        for (const sourceText of expressions) {
            const source = parseSourceExpression(sourceText, standings.play, matchKeyByPlayAndShort);
            if (!source) {
                state.unresolved.push({ to: poolKey, sourceText, reason: 'unparsed-pool-source' });
                continue;
            }
            const entryKey = `ENTRY|${source.from}|${source.condition}|${poolKey}`;
            if (!state.nodes.has(entryKey)) {
                state.nodes.set(entryKey, {
                    key: entryKey, kind: 'entry', play: standings.play, poolSheet: standings.poolSheet, match: null,
                    poolGroupKey: poolKey, poolPlayId: standings.poolPlayId,
                    sourceNodeKey: source.from, sourceCondition: source.condition, sourceText
                });
            }
            addEdge(source.from, entryKey, source.condition, sourceText, 'advancement');
            addEdge(entryKey, poolKey, 'POOL', sourceText, 'membership');
        }
    }

    state.outcomeConflicts = findOutcomeConflicts();
    initializeNodeStageMetadata();
    initializeGroupMetadata();
    buildAdjacency();
    buildPoolPerformanceModel();
}

function buildTeamDirectory(allPlays) {
    const teams = new Map();
    const addTeam = (team, play) => {
        if (!team || team.TeamId == null) return;
        const id = Number(team.TeamId);
        if (!Number.isFinite(id)) return;
        if (!teams.has(id)) {
            teams.set(id, {
                id,
                name: team.TeamName || team.Name || team.TeamText || `Team ${id}`,
                text: team.TeamText || '',
                code: team.TeamCode || '',
                clubId: team.Club?.ClubId ?? null,
                clubName: team.Club?.Name || 'Unknown club',
                playIds: new Set()
            });
        }
        if (play?.PlayId != null) teams.get(id).playIds.add(play.PlayId);
    };
    for (const play of allPlays) {
        for (const team of play.Teams || []) addTeam(team, play);
        const sheet = state.poolSheets.get(play.PlayId);
        for (const team of sheet?.Pool?.Teams || []) addTeam(team, play);
    }
    state.teamDirectory = [...teams.values()].sort((a, b) => a.name.localeCompare(b.name));
    state.teamById = new Map(state.teamDirectory.map(team => [team.id, team]));
    const clubs = new Map();
    for (const team of state.teamDirectory) {
        if (team.clubId == null) continue;
        if (!clubs.has(team.clubId)) clubs.set(team.clubId, { id: Number(team.clubId), name: team.clubName, teamCount: 0 });
        clubs.get(team.clubId).teamCount += 1;
    }
    state.clubOptions = [...clubs.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function walkBracketNodes(play, treeNode, matchKeyByPlayAndShort, bracketTreeLinks, bracketSourceLinks, parentKey = null, parentSlot = null) {
    if (!treeNode) return;
    const match = treeNode.Match;
    let currentKey = null;
    if (match) {
        const shortName = getMatchShortName(match, null);
        currentKey = `${play.CompleteShortName}${shortName}`;
        if (!state.nodes.has(currentKey)) {
            state.nodes.set(currentKey, {
                key: currentKey, kind: 'match', matchType: 'bracket', play, match,
                x: treeNode.X ?? treeNode.x ?? 0, y: treeNode.Y ?? treeNode.y ?? 0,
                court: match.Court?.Name || ''
            });
        }
        matchKeyByPlayAndShort.set(`${play.CompleteShortName}|${shortName}`, currentKey);
        if (match.MatchId != null) matchKeyByPlayAndShort.set(`${play.CompleteShortName}|id:${match.MatchId}`, currentKey);
        if (parentKey && parentKey !== currentKey) bracketTreeLinks.push({ from: currentKey, to: parentKey, slot: parentSlot });
        for (const [slot, sourceNode] of [['first', treeNode.TopSource], ['second', treeNode.BottomSource]]) {
            for (const sourceText of collectTreeSourceDependencyExpressions(sourceNode)) {
                bracketSourceLinks.push({ to: currentKey, destinationPlay: play, sourceText, slot });
            }
        }
    }
    const nextParent = currentKey || parentKey;
    walkBracketNodes(play, treeNode.TopSource, matchKeyByPlayAndShort, bracketTreeLinks, bracketSourceLinks, nextParent, currentKey ? 'first' : parentSlot);
    walkBracketNodes(play, treeNode.BottomSource, matchKeyByPlayAndShort, bracketTreeLinks, bracketSourceLinks, nextParent, currentKey ? 'second' : parentSlot);
}

function collectTreeSourceDependencyExpressions(sourceNode) {
    const results = new Set();
    if (!sourceNode || sourceNode.Match) return results;
    for (const field of ['Text', 'TeamText', 'SourceText', 'Name', 'Description']) {
        const value = sourceNode[field];
        if (typeof value === 'string' && looksLikeDependency(value)) results.add(value.trim());
    }
    return results;
}

function getMatchShortName(match, fallbackIndex) {
    if (match?.MatchShortName) return match.MatchShortName;
    if (match?.ShortName) return match.ShortName;
    if (match?.MatchName && /^M\d+$/i.test(match.MatchName)) return match.MatchName.toUpperCase();
    if (fallbackIndex != null) return `M${fallbackIndex}`;
    return `M${match?.MatchId ?? 'X'}`;
}

// Resolution targets are real matches and pool standings only; routing junctions are never
// valid sources. The index replaces a linear scan per placeholder.
function buildResolverIndex() {
    const byNormalized = new Map();
    const byMatchId = new Map();
    const push = (map, key, value) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(value);
    };
    for (const node of state.nodes.values()) {
        if (node.kind !== 'match' && node.kind !== 'standings') continue;
        push(byNormalized, normalizeNodeReference(node.key), node.key);
        if (node.kind === 'match' && node.match?.MatchId != null) push(byMatchId, String(node.match.MatchId), node.key);
    }
    state.resolverIndex = { byNormalized, byMatchId };
}

function normalizeNodeReference(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/^THE\s+/, '')
        .replace(/[\s_\u2013\u2014:\-.#()]+/g, '');
}

function resolveSourceNodeKey(reference, destinationPlay, matchKeyByPlayAndShort) {
    let value = String(reference || '').trim();
    if (!value) return null;
    value = value.replace(/\s*\(\s*\d+\s*\)\s*$/, '').replace(/^the\s+/i, '').trim();
    const resolvable = key => {
        const kind = state.nodes.get(key)?.kind;
        return kind === 'match' || kind === 'standings';
    };
    for (const candidate of [value, value.replace(/\s+/g, ''), value.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, '')]) {
        if (resolvable(candidate)) return candidate;
    }
    const local = value.match(/^(?:Match\s*#?\s*|M)?(\d+)$/i);
    if (local) {
        const key = matchKeyByPlayAndShort.get(`${destinationPlay.CompleteShortName}|M${local[1]}`);
        if (key) return key;
    }
    const numericId = value.match(/(?:match\s*#?\s*)?(\d{4,})/i)?.[1];
    if (numericId) {
        const byId = state.resolverIndex.byMatchId.get(numericId) || [];
        if (byId.length === 1) return byId[0];
    }
    const wanted = normalizeNodeReference(value);
    if (!wanted) return null;
    const exact = state.resolverIndex.byNormalized.get(wanted) || [];
    if (exact.length === 1) return exact[0];
    if (exact.length > 1 || wanted.length < 5) return null;
    // Suffix match only when exactly one node matches; ambiguity resolves to nothing.
    let found = null;
    for (const [normalized, keys] of state.resolverIndex.byNormalized) {
        if (normalized.length < 4) continue;
        if (!normalized.endsWith(wanted) && !wanted.endsWith(normalized)) continue;
        if (found || keys.length > 1) return null;
        found = keys[0];
    }
    return found;
}

function parseSourceExpression(text, destinationPlay, matchKeyByPlayAndShort) {
    const value = String(text || '').trim();
    const outcome = value.match(/^(winner|loser)\s+(?:of\s+)?(.+)$/i);
    if (outcome) {
        const from = resolveSourceNodeKey(outcome[2], destinationPlay, matchKeyByPlayAndShort);
        return from ? { from, condition: outcome[1].toLowerCase() === 'winner' ? 'WIN' : 'LOSS' } : null;
    }
    const placement = value.match(/^(\d+(?:st|nd|rd|th))(?:\s+place)?\s*(?:-|\u2013|\u2014|:|from\s+|of\s+)?\s*(.+?)\s*(?:\(\s*\d+\s*\))?$/i);
    if (placement) {
        const from = resolveSourceNodeKey(placement[2], destinationPlay, matchKeyByPlayAndShort);
        return from ? { from, condition: placement[1].toUpperCase() } : null;
    }
    return null;
}

function looksLikeDependency(text) {
    const value = String(text || '').trim();
    return /^(winner|loser)\s+(?:of\s+)?\S+/i.test(value)
        || /^\d+(?:st|nd|rd|th)(?:\s+place)?\s*(?:-|\u2013|\u2014|:|from\s+|of\s+)?\s*\S+/i.test(value);
}

function collectDependencyStrings(value, output, depth) {
    if (value == null || depth > 3) return;
    if (typeof value === 'string') {
        if (looksLikeDependency(value)) output.add(value.trim());
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) collectDependencyStrings(item, output, depth + 1);
        return;
    }
    if (typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        if (depth > 0 || /team|text|name|source|seed|participant|winner|loser|display/i.test(key)) {
            collectDependencyStrings(child, output, depth + 1);
        }
    }
}

const SIDE_FIELDS = {
    first: ['FirstTeamText', 'FirstTeamName', 'FirstTeamSourceText', 'FirstTeamSource', 'TopTeamText', 'TopSourceText'],
    second: ['SecondTeamText', 'SecondTeamName', 'SecondTeamSourceText', 'SecondTeamSource', 'BottomTeamText', 'BottomSourceText']
};

// Placeholder expressions grouped by the slot they fill. Expressions found only in
// side-neutral fields (participant/winner/loser keys) are returned as "unknown".
function getMatchDependencyExpressionsBySide(match) {
    const result = { first: new Set(), second: new Set(), unknown: new Set() };
    if (!match) return result;
    for (const side of ['first', 'second']) {
        for (const field of SIDE_FIELDS[side]) {
            const value = match[field];
            if (typeof value === 'string' && looksLikeDependency(value)) result[side].add(value.trim());
        }
        collectDependencyStrings(side === 'first' ? match.FirstTeam : match.SecondTeam, result[side], 0);
    }
    for (const [key, value] of Object.entries(match)) {
        if (/^(first|top)/i.test(key) && /(team|source|seed)/i.test(key)) collectDependencyStrings(value, result.first, 0);
        else if (/^(second|bottom)/i.test(key) && /(team|source|seed)/i.test(key)) collectDependencyStrings(value, result.second, 0);
        else if (/participant|winner|loser/i.test(key)) collectDependencyStrings(value, result.unknown, 0);
    }
    for (const text of [...result.first, ...result.second]) result.unknown.delete(text);
    return result;
}

function findOutcomeConflicts() {
    const grouped = new Map();
    for (const edge of state.edges) {
        if (edge.condition !== 'WIN' && edge.condition !== 'LOSS') continue;
        const key = `${edge.from}|${edge.condition}`;
        if (!grouped.has(key)) grouped.set(key, new Set());
        grouped.get(key).add(edge.to);
    }
    return [...grouped.entries()]
        .filter(([, destinations]) => destinations.size > 1)
        .map(([key, destinations]) => {
            const [from, condition] = key.split('|');
            return { from, condition, destinations: [...destinations] };
        });
}

function initializeNodeStageMetadata() {
    for (const node of state.nodes.values()) {
        const roundId = node.play?.__meta?.RoundId;
        node.stageId = String(roundId ?? `date:${node.play?.__date ?? 'unknown'}`);
        node.stageLabel = node.play?.__meta?.RoundName || node.play?.__date || 'Published play';
    }
}

function initializeGroupMetadata() {
    for (const node of state.nodes.values()) {
        const groupId = node.play?.__meta?.GroupId ?? node.play?.GroupId ?? null;
        const groupName = node.play?.__meta?.GroupName || node.play?.GroupName || 'Ungrouped';
        node.groupId = groupId;
        node.groupName = groupName;
        node.groupKey = `${node.stageId}|${groupId ?? groupName}`;
        node.groupLabel = `${node.stageLabel} / ${groupName}`;
    }
}

function buildAdjacency() {
    const outgoing = new Map();
    const incoming = new Map();
    const poolMembers = new Map();
    const push = (map, key, value) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(value);
    };
    for (const edge of state.edges) {
        push(outgoing, edge.from, edge);
        push(incoming, edge.to, edge);
    }
    for (const node of state.nodes.values()) {
        if (node.poolGroupKey && (node.kind === 'match' || node.kind === 'standings')) push(poolMembers, node.poolGroupKey, node.key);
    }
    Object.assign(state, { outgoing, incoming, poolMembers });
}

