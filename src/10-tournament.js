/* =========================================================================
 * 10. Tournament view: layout, rendering, details, status
 * ======================================================================= */

const SVG_NS = 'http://www.w3.org/2000/svg';
const LEGEND_HTML = `<div class="abv-legend">
        <span><i class="abv-swatch" style="background:#e8e0ff;border-color:#4e3a9c"></i>Team's matches</span>
        <span><i class="abv-swatch" style="background:#e6f2ee;border-color:#3f7567"></i>Current route</span>
        <span><i class="abv-swatch" style="background:#f3efff;border-color:#806ed1;border-style:dashed"></i>Still possible</span>
        <span><i class="abv-swatch" style="background:#eaf3f4;border-color:#39707c"></i>Traced: before</span>
        <span><i class="abv-swatch" style="background:#f0ebfb;border-color:#6b4cab"></i>Traced: after</span>
        <span><i class="abv-swatch" style="background:#fff4e6;border-color:#c77d1a"></i>Likely opponent</span>
        <span><i class="abv-swatch" style="background:#fff;border-color:#b03a2e;border-style:dotted"></i>Court may be late</span>
    </div>`;

function renderGraph() {
    updateViewControls();
    if (!state.loaded) return;
    const canvas = getViewCanvas(state.viewMode);
    if (!canvas) return;
    const renderStarted = performance.now();
    if (state.viewMode === 'journey') renderMatchDay(canvas);
    else if (state.viewMode === 'performance') renderGroupPerformance(canvas);
    else if (state.viewMode === 'stats') renderStats(canvas);
    else if (state.viewMode === 'scouting') renderScouting(canvas);
    else renderTournament(canvas);
    state.perf.renders[state.viewMode] = performance.now() - renderStarted;
    if (state.viewMode === 'tournament') {
        state.perf.tournamentElements = tournamentElements.nodes.size + [...tournamentElements.edges.values()].reduce((sum, list) => sum + list.length, 0);
    }
    updateStatus();
    renderDiagnostics();
    renderMyTeamsBar();
    writeHashState();
}

function renderTournament(canvas) {
    const { visibleKeys, groupCoreKeys, contextKeys } = getBaseVisibleKeys();
    const visibleNodes = [...state.nodes.values()].filter(node => visibleKeys.has(node.key));
    const visibleEdges = state.edges.filter(edge => visibleKeys.has(edge.from) && visibleKeys.has(edge.to));
    const compact = state.tournamentDensity === 'compact';
    state.renderedKeys = visibleKeys;
    canvas.classList.toggle('compact', compact);
    canvas.classList.toggle('tracing', Boolean(state.traceNodeKey));
    tournamentElements.nodes.clear();
    tournamentElements.edges.clear();
    if (!visibleNodes.some(node => node.kind === 'match')) {
        state.renderedSignature = null;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        const filtered = state.clubFilterId != null || state.teamFilterId != null || state.groupFilterKey;
        canvas.innerHTML = emptyHtml(filtered
            ? 'No published matches for this selection yet. Choose All groups or another team.'
            : 'AES has not published matches for this division yet.');
        return;
    }
    state.renderedSignature = visibleSignature(visibleKeys);
    state.likelyOpponents = likelyOpponentKeys();
    state.lateCourtNodes = new Set(visibleNodes.filter(node => node.kind === 'match' && !matchHasResult(node.match) && courtStatus(node)?.state === 'late').map(node => node.key));
    const layout = layoutNodes(visibleNodes);
    canvas.innerHTML = '';
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'abv-svg');
    svg.setAttribute('width', String(layout.width));
    svg.setAttribute('height', String(layout.height));
    canvas.appendChild(svg);
    for (const stage of layout.stages) {
        const label = document.createElement('div');
        label.className = 'abv-stage-label';
        label.style.left = `${stage.x}px`;
        label.textContent = stage.label;
        canvas.appendChild(label);
    }
    const ctx = { groupCoreKeys, contextKeys, compact };
    for (const edge of visibleEdges) drawEdge(svg, layout.positions.get(edge.from), layout.positions.get(edge.to), edge, ctx);
    for (const node of visibleNodes) {
        const position = layout.positions.get(node.key);
        if (!position) continue;
        const element = renderNodeElement(node, position, ctx);
        tournamentElements.nodes.set(node.key, element);
        canvas.appendChild(element);
    }
    const detailKey = state.selectedNodeKey && visibleKeys.has(state.selectedNodeKey)
        ? state.selectedNodeKey
        : visibleNodes.find(node => node.kind === 'match')?.key;
    if (detailKey) renderDetails(detailKey);
    // Scroll only after a real focus change (first load, filter change, tab switch),
    // never on label/density toggles, trace clicks, or background refreshes.
    if (state.pendingFocusScroll) {
        state.pendingFocusScroll = false;
        if ((state.clubFilterId != null || state.teamFilterId != null) && !state.traceNodeKey) requestAnimationFrame(scrollFocusIntoView);
    }
}

function nodeClassName(node, ctx) {
    const filtered = state.clubFilterId != null || state.teamFilterId != null;
    const base = node.kind === 'standings'
        ? ['abv-standings']
        : node.kind === 'entry' ? ['abv-entry'] : ['abv-node', node.matchType === 'pool' ? 'pool-match' : 'bracket-match'];
    return [
        ...base,
        ctx.compact ? 'compact' : '',
        filtered && node.kind !== 'entry' && state.filterRelatedNodes.has(node.key) ? 'target-path' : '',
        node.kind === 'match' && state.filterDirectNodes.has(node.key) ? 'target-direct' : '',
        state.filterCurrentNodes.has(node.key) ? 'focus-current' : '',
        state.filterPossibleNodes.has(node.key) ? 'focus-possible' : '',
        ctx.groupCoreKeys.has(node.key) ? 'group-focus' : '',
        ctx.contextKeys.has(node.key) ? 'context-node' : '',
        nodeTraceClass(node.key),
        state.lateCourtNodes.has(node.key) ? 'court-late' : '',
        state.selectedNodeKey === node.key ? 'selected' : ''
    ].filter(Boolean).join(' ');
}

// Opponents the selected team faces or may face next, for highlighting on match cards.
function likelyOpponentKeys() {
    const team = selectedFocusTeam();
    if (!team) return { ids: new Set(), names: new Set() };
    const options = upcomingOpponents(team);
    return {
        ids: new Set(options.map(option => option.team.id)),
        names: new Set(options.flatMap(option => [normName(option.team.name), normName(option.team.text)]).filter(Boolean))
    };
}

function isLikelyOpponent(participant) {
    const likely = state.likelyOpponents;
    return participant.id != null ? likely.ids.has(participant.id) : likely.names.has(normName(participant.label));
}

function edgeClassNames(edge, ctx) {
    const filtered = state.clubFilterId != null || state.teamFilterId != null;
    const onPath = filtered && state.filterRelatedNodes.has(edge.from) && state.filterRelatedNodes.has(edge.to);
    const futureTeamEdge = state.showFuturePath && state.teamFilterId != null && onPath;
    let groupClass = '';
    if (state.groupFilterKey) {
        if (ctx.groupCoreKeys.has(edge.from) && ctx.groupCoreKeys.has(edge.to)) groupClass = 'group-focus';
        else if (!futureTeamEdge) groupClass = 'context-edge';
    }
    let focusClass = '';
    if (state.teamFilterId != null) {
        if (state.filterCurrentNodes.has(edge.from) && state.filterCurrentNodes.has(edge.to)) focusClass = 'focus-current';
        else if (onPath) focusClass = 'focus-possible';
    }
    const trace = edgeTraceClass(edge.key);
    return {
        path: ['abv-edge', edge.kind === 'aggregation' ? 'aggregation' : '', edge.kind === 'membership' ? 'membership' : '', onPath ? 'target-path' : '', groupClass, focusClass, trace].filter(Boolean).join(' '),
        label: ['abv-edge-label', focusClass, trace].filter(Boolean).join(' ')
    };
}

// In-place class refresh used when a trace click does not change which nodes are visible.
// Rendered elements by key, rebuilt on every full Tournament render.
const tournamentElements = { nodes: new Map(), edges: new Map() };

// Restyles nodes and edges in place. `only` limits it to the given keys (a trace change);
// `visible` reuses getBaseVisibleKeys() when the caller already has it.
function refreshTournamentClasses(only = null, visible = null) {
    const canvas = getViewCanvas('tournament');
    if (!canvas) return;
    canvas.classList.toggle('tracing', Boolean(state.traceNodeKey));
    const { groupCoreKeys, contextKeys } = visible || getBaseVisibleKeys();
    const ctx = { groupCoreKeys, contextKeys, compact: state.tournamentDensity === 'compact' };
    for (const key of only ? only.nodes : tournamentElements.nodes.keys()) {
        const element = tournamentElements.nodes.get(key);
        const node = state.nodes.get(key);
        if (element && node) element.className = nodeClassName(node, ctx);
    }
    for (const key of only ? only.edges : tournamentElements.edges.keys()) {
        const edge = state.edgeByKey.get(key);
        if (!edge) continue;
        const classes = edgeClassNames(edge, ctx);
        for (const element of tournamentElements.edges.get(key) || []) {
            element.setAttribute('class', element.tagName.toLowerCase() === 'text' ? classes.label : classes.path);
        }
    }
}

function layoutMetrics() {
    return state.tournamentDensity === 'compact'
        ? { matchW: 210, matchH: 104, entryW: 86, entryH: 30, standingsW: 84, standingsH: 24, gapX: 26, gapY: 10, blockGap: 26, stageGap: 90, bracketGap: 40, top: 50, left: 20 }
        : { matchW: 270, matchH: 128, entryW: 100, entryH: 34, standingsW: 96, standingsH: 28, gapX: 34, gapY: 14, blockGap: 36, stageGap: 130, bracketGap: 56, top: 58, left: 28 };
}

// Stages are columns in AES round order. Inside a stage, each pool or bracket is a block,
// stacked in AES's published play order. Pools read left to right: entry routes, matches,
// standings. Brackets keep AES's X/Y geometry, scaled so cards never overlap.
function layoutNodes(nodes) {
    const m = layoutMetrics();
    const playOrder = new Map(state.masterPlays.map((play, index) => [play.PlayId, index]));
    const byStage = new Map();
    for (const node of nodes) {
        if (!byStage.has(node.stageId)) byStage.set(node.stageId, []);
        byStage.get(node.stageId).push(node);
    }
    const positions = new Map();
    const stages = [];
    let x = m.left;
    let bottom = m.top;
    for (const stage of buildStageDescriptors(nodes)) {
        const stageNodes = byStage.get(stage.id) || [];
        if (!stageNodes.length) continue;
        const blocks = new Map();
        for (const node of stageNodes) {
            const blockKey = node.poolGroupKey || `bracket|${node.play?.PlayId ?? node.play?.CompleteShortName ?? node.key}`;
            if (!blocks.has(blockKey)) blocks.set(blockKey, { key: blockKey, play: node.play, pool: Boolean(node.poolGroupKey), nodes: [] });
            blocks.get(blockKey).nodes.push(node);
        }
        const ordered = [...blocks.values()].sort((a, b) =>
            (playOrder.get(a.play?.PlayId) ?? Number.MAX_SAFE_INTEGER) - (playOrder.get(b.play?.PlayId) ?? Number.MAX_SAFE_INTEGER)
            || String(a.play?.FullName || a.key).localeCompare(String(b.play?.FullName || b.key), undefined, { numeric: true }));
        let y = m.top;
        let stageWidth = 0;
        for (const block of ordered) {
            const placed = block.pool ? layoutPoolBlock(block, m) : layoutBracketBlock(block, m);
            for (const [key, pos] of placed.positions) positions.set(key, { x: x + pos.x, y: y + pos.y, w: pos.w, h: pos.h });
            y += placed.height + m.blockGap;
            stageWidth = Math.max(stageWidth, placed.width);
        }
        stages.push({ id: stage.id, label: stage.label, x });
        bottom = Math.max(bottom, y);
        x += stageWidth + m.stageGap;
    }
    return { positions, stages, width: Math.max(400, x - m.stageGap + m.left), height: bottom + m.top };
}

function layoutPoolBlock(block, m) {
    const positions = new Map();
    const matches = block.nodes.filter(node => node.kind === 'match').sort(compareMatchNodes);
    const entries = block.nodes.filter(node => node.kind === 'entry');
    const standings = block.nodes.find(node => node.kind === 'standings');
    const matchX = entries.length ? m.entryW + m.gapX : 0;
    matches.forEach((node, index) => positions.set(node.key, { x: matchX, y: index * (m.matchH + m.gapY), w: m.matchW, h: m.matchH }));
    const matchesHeight = matches.length ? matches.length * (m.matchH + m.gapY) - m.gapY : 0;
    // Each entry route sits beside the matches it feeds, pushed down only to avoid overlap.
    const desired = entries.map(entry => {
        const targets = (state.outgoing.get(entry.key) || [])
            .filter(edge => edge.kind === 'membership')
            .map(edge => positions.get(edge.to))
            .filter(Boolean);
        const center = targets.length ? targets.reduce((sum, pos) => sum + pos.y + pos.h / 2, 0) / targets.length : 0;
        return { entry, y: Math.max(0, center - m.entryH / 2) };
    }).sort((a, b) => a.y - b.y || a.entry.key.localeCompare(b.entry.key));
    let cursor = 0;
    for (const item of desired) {
        const y = Math.max(cursor, item.y);
        positions.set(item.entry.key, { x: 0, y, w: m.entryW, h: m.entryH });
        cursor = y + m.entryH + m.gapY;
    }
    const entriesHeight = desired.length ? cursor - m.gapY : 0;
    let width = matches.length ? matchX + m.matchW : (entries.length ? m.entryW : 0);
    if (standings) {
        const sx = width ? width + m.gapX : 0;
        const sy = Math.max(0, (matchesHeight - m.standingsH) / 2);
        positions.set(standings.key, { x: sx, y: sy, w: m.standingsW, h: m.standingsH });
        width = sx + m.standingsW;
    }
    return { positions, width, height: Math.max(matchesHeight, entriesHeight, standings ? m.standingsH : 0) };
}

function layoutBracketBlock(block, m) {
    const positions = new Map();
    const matches = block.nodes.filter(node => node.kind === 'match');
    const columns = [...new Set(matches.map(node => Number(node.x) || 0))].sort((a, b) => a - b);
    const byColumn = new Map(columns.map(column => [column, matches.filter(node => (Number(node.x) || 0) === column)]));
    let minDelta = Infinity;
    for (const columnNodes of byColumn.values()) {
        const ys = columnNodes.map(node => Number(node.y) || 0).sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i += 1) if (ys[i] > ys[i - 1]) minDelta = Math.min(minDelta, ys[i] - ys[i - 1]);
    }
    const scale = Number.isFinite(minDelta) ? (m.matchH + m.gapY) / minDelta : 1;
    const minY = matches.length ? Math.min(...matches.map(node => Number(node.y) || 0)) : 0;
    let height = 0;
    columns.forEach((column, columnIndex) => {
        const columnNodes = byColumn.get(column).sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0) || compareMatchNodes(a, b));
        let floor = 0;
        for (const node of columnNodes) {
            const y = Math.max(floor, ((Number(node.y) || 0) - minY) * scale);
            positions.set(node.key, { x: columnIndex * (m.matchW + m.bracketGap), y, w: m.matchW, h: m.matchH });
            floor = y + m.matchH + m.gapY;
            height = Math.max(height, y + m.matchH);
        }
    });
    const width = columns.length ? columns.length * (m.matchW + m.bracketGap) - m.bracketGap : 0;
    return { positions, width, height };
}

function compareMatchNodes(a, b) {
    return (a.localY ?? 0) - (b.localY ?? 0) || compareNodeSchedule(a, b);
}

// Stage order follows AES's master play list. Missing RoundIds fall back to the playday
// date the play was published under, not a guess from its name.
function buildStageDescriptors(nodes) {
    const needed = new Map();
    for (const node of nodes) if (!needed.has(node.stageId)) needed.set(node.stageId, node.stageLabel);
    const result = [];
    const seen = new Set();
    for (const play of state.masterPlays) {
        const id = String(play.RoundId ?? `date:${state.dateByPlayId.get(play.PlayId) ?? 'unknown'}`);
        if (seen.has(id)) continue;
        seen.add(id);
        if (needed.has(id)) {
            result.push({ id, label: needed.get(id) || play.RoundName || id });
            needed.delete(id);
        }
    }
    const rest = [...needed.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [id, label] of rest) result.push({ id, label });
    return result;
}

function drawEdge(svg, from, to, edge, ctx) {
    if (!from || !to) return;
    const startX = from.x + from.w;
    const startY = from.y + from.h / 2;
    const endX = to.x;
    const endY = to.y + to.h / 2;
    const mid = Math.max(startX + 22, (startX + endX) / 2);
    const classes = edgeClassNames(edge, ctx);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M ${startX} ${startY} C ${mid} ${startY}, ${mid} ${endY}, ${endX} ${endY}`);
    path.setAttribute('class', classes.path);
    path.setAttribute('data-edge-key', edge.key);
    svg.appendChild(path);
    const elements = [path];
    tournamentElements.edges.set(edge.key, elements);
    if (state.showEdgeLabels && edge.kind !== 'aggregation' && edge.kind !== 'membership') {
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', String(mid + 4));
        text.setAttribute('y', String((startY + endY) / 2 - 3));
        text.setAttribute('class', classes.label);
        text.setAttribute('data-edge-key', edge.key);
        text.textContent = edge.condition === 'FEEDS' ? 'next' : edge.condition;
        svg.appendChild(text);
        elements.push(text);
    }
}

function participantHtml(participant, won) {
    const classes = ['n-team', isFocusParticipant(participant) ? 'target-team' : '', isMyTeam(participant) ? 'mine' : '', isLikelyOpponent(participant) ? 'likely' : '', participant.placeholder ? 'placeholder' : '', won ? 'winner' : '']
        .filter(Boolean).join(' ');
    return `<span class="${classes}" title="${escapeHtml(participant.label)}">${escapeHtml(participant.label)}</span>`;
}

function renderNodeElement(node, position, ctx) {
    const element = document.createElement('div');
    element.className = nodeClassName(node, ctx);
    element.dataset.nodeKey = node.key;
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    Object.assign(element.style, { left: `${position.x}px`, top: `${position.y}px`, width: `${position.w}px`, height: `${position.h}px` });
    if (node.kind === 'standings') {
        element.textContent = 'Standings';
        element.title = `${node.play?.FullName || node.key} standings`;
    } else if (node.kind === 'entry') {
        element.innerHTML = `${escapeHtml(node.sourceCondition || 'Route')}<br>${escapeHtml(node.sourceNodeKey || '')}`;
        element.title = `${node.sourceText || node.key} goes to ${node.play?.FullName || node.poolGroupKey}`;
    } else {
        const match = node.match || {};
        const first = matchParticipant(match, 'first');
        const second = matchParticipant(match, 'second');
        const hasResult = matchHasResult(match);
        const winner = hasResult ? matchWinnerSide(match) : null;
        const meta = [formatDateTime(match.ScheduledStartDateTime), courtName(node)].filter(Boolean).join(' / ') || node.stageLabel;
        element.innerHTML = `<div class="n-title">${escapeHtml(node.key)} / ${escapeHtml(node.play?.FullName || '')}</div>
                <div class="n-sub">${participantHtml(first, winner === 'first')}<span class="n-vs">vs</span>${participantHtml(second, winner === 'second')}</div>
                <div class="n-result">${escapeHtml(hasResult ? matchResultSummary(match) : 'No result yet')}</div>
                <div class="n-meta">${state.lateCourtNodes.has(node.key) ? '<span class="late">Court may be late</span> / ' : ''}${escapeHtml(meta)}</div>`;
        element.title = `${node.key}: ${first.label} vs ${second.label}`;
    }
    element.setAttribute('aria-label', element.title);
    return element;
}

function shortNodeName(key) {
    const node = state.nodes.get(key);
    if (!node) return String(key || '');
    if (node.kind === 'entry') return `${node.sourceCondition} ${node.sourceNodeKey} into ${node.play?.FullName || node.poolGroupKey}`;
    if (node.kind === 'standings') return `${node.play?.FullName || node.key} standings`;
    return `${node.key}${node.play?.FullName ? ` (${node.play.FullName})` : ''}`;
}

function edgeListHtml(edges, direction, withCondition = false) {
    if (!edges.length) return '<p class="abv-muted">None published.</p>';
    return `<ul>${edges.map(edge => {
        const label = shortNodeName(direction === 'from' ? edge.from : edge.to);
        const condition = withCondition && edge.condition ? `<span class="abv-pill">${escapeHtml(edge.condition === 'FEEDS' ? 'next' : edge.condition)}</span> ` : '';
        return `<li>${condition}${escapeHtml(label)}</li>`;
    }).join('')}</ul>`;
}

function renderDetails(nodeKey) {
    const detail = getViewDetail('tournament');
    const node = state.nodes.get(nodeKey);
    if (!detail || !node) return;
    const incoming = state.incoming.get(nodeKey) || [];
    const outgoing = state.outgoing.get(nodeKey) || [];
    const traceHtml = state.traceNodeKey === nodeKey
        ? `<p><span class="abv-pill">Tracing</span> ${state.traceUpstreamNodes.size - 1} nodes before, ${state.traceDownstreamNodes.size - 1} after.</p>`
        : '<p class="abv-muted">Select this node again to trace every linked match before and after it.</p>';
    const pills = `<p><span class="abv-pill">${escapeHtml(node.stageLabel)}</span><span class="abv-pill">${escapeHtml(node.groupName)}</span>`;
    let html;
    if (node.kind === 'standings') {
        const pool = state.performancePools.get(node.poolGroupKey);
        const teamCount = pool?.teams.size || (node.poolSheet?.Pool?.Teams || []).length;
        const members = incoming.filter(edge => edge.kind === 'aggregation');
        const routes = outgoing.filter(edge => edge.kind === 'advancement');
        html = `<h3>${escapeHtml(node.play?.FullName || node.key)} standings</h3>
                <p class="abv-muted">Every match in this pool counts toward these standings. When pool play ends, AES sends each finish place to the destination listed below.</p>
                ${traceHtml}
                ${pills}${teamCount ? `<span class="abv-pill">${teamCount}-team pool</span>` : ''}</p>
                <h4>Pool matches (${members.length})</h4>${edgeListHtml(members, 'from')}
                <h4>Where each finish place goes</h4>${edgeListHtml(routes, 'to', true)}`;
    } else if (node.kind === 'entry') {
        const members = outgoing.filter(edge => edge.kind === 'membership');
        html = `<h3>Route into ${escapeHtml(node.play?.FullName || node.poolGroupKey)}</h3>
                <p class="abv-muted">The team that fills this slot comes from the source below, then plays each match listed under Scheduled matches.</p>
                ${traceHtml}
                ${pills}</p>
                <p><strong>Source:</strong> ${escapeHtml(node.sourceText || `${node.sourceCondition} ${node.sourceNodeKey}`)}</p>
                <h4>Arrives from</h4>${edgeListHtml(incoming, 'from', true)}
                <h4>Scheduled matches (${members.length})</h4>${edgeListHtml(members, 'to')}`;
    } else {
        const match = node.match || {};
        const first = matchParticipant(match, 'first');
        const second = matchParticipant(match, 'second');
        const work = matchWorkParticipant(match);
        const court = courtName(node);
        html = `<h3>${escapeHtml(node.key)}</h3>
                <p class="abv-muted">${escapeHtml(node.play?.FullName || '')}</p>
                ${traceHtml}
                ${pills}<span class="abv-pill">${escapeHtml(matchCategoryLabel(node))}</span></p>
                <h4>Teams</h4><ul><li>${escapeHtml(first.label)}</li><li>${escapeHtml(second.label)}</li></ul>
                <p>${[first, second].map(participant => scoutButtonHtml(directoryTeamForParticipant(participant))).join(' ')}</p>
                <h4>Result</h4><p>${escapeHtml(matchHasResult(match) ? matchResultSummary(match) : 'No result yet')}</p>
                <h4>Schedule</h4><p>${escapeHtml(formatDateTime(match.ScheduledStartDateTime) || 'Not posted')}${court ? `<br>${escapeHtml(court)}` : ''}${work ? `<br>Work team: ${escapeHtml(work.label)}` : ''}</p>
                <h4>Arrives from</h4>${edgeListHtml(incoming, 'from', true)}
                <h4>Counts toward</h4>${edgeListHtml(outgoing.filter(edge => edge.kind === 'aggregation'), 'to')}
                <h4>Leads to</h4>${edgeListHtml(outgoing.filter(edge => edge.kind === 'advancement'), 'to', true)}
                <p class="abv-muted">AES PlayId ${escapeHtml(node.play?.PlayId ?? '-')}, MatchId ${escapeHtml(match.MatchId ?? '-')}</p>`;
    }
    detail.innerHTML = html + LEGEND_HTML;
}

function updateStatus() {
    if (!state.loaded) return;
    const team = selectedFocusTeam();
    const club = state.clubFilterId == null ? null : state.clubOptions.find(option => option.id === Number(state.clubFilterId));
    const parts = [state.divisionName, team ? team.name : (club ? club.name : 'All teams')];
    if (state.viewMode === 'tournament') {
        const total = [...state.nodes.values()].filter(node => node.kind === 'match').length;
        const shown = [...state.renderedKeys].filter(key => state.nodes.get(key)?.kind === 'match').length;
        const group = state.groupFilterKey ? state.groupOptions.find(option => option.key === state.groupFilterKey)?.label : 'All groups';
        parts.push(group, `${shown} of ${total} matches`);
        if (state.traceNodeKey) parts.push(`tracing ${state.traceNodeKey}`);
    }
    if (state.pendingPoolSheets.size) parts.push(`loading ${state.pendingPoolSheets.size} earlier pools`);
    parts.push(state.lastUpdatedTimestamp ? `AES updated ${formatDateTime(state.lastUpdatedTimestamp)}` : `loaded ${formatDateTime(state.lastLoadedAt)}`);
    const prefix = state.loadError ? `Last refresh failed (${state.loadError}). ` : '';
    const failures = state.poolSheetFailures.length;
    const banner = state.loadError
        ? `Refresh failed (${state.loadError}). Showing data loaded ${formatDateTime(state.lastLoadedAt)}.`
        : (failures ? `${failures} pool sheet${failures === 1 ? '' : 's'} could not be loaded. Open Details for the list.` : '');
    setStatus(prefix + parts.filter(Boolean).join(' \u00b7 '), state.loadError || failures ? 'error' : '', { banner, summary: true });
}

function scrollFocusIntoView() {
    const wrap = $('.abv-graph-wrap');
    const canvas = getViewCanvas('tournament');
    if (!wrap || !canvas) return;
    const target = canvas.querySelector('.abv-node.selected.target-direct')
        || canvas.querySelector('.abv-node.target-direct')
        || canvas.querySelector('.abv-node.focus-current')
        || canvas.querySelector('.group-focus');
    if (!target) return;
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    wrap.scrollTo({
        left: Math.max(0, target.offsetLeft - wrap.clientWidth / 2 + target.offsetWidth / 2),
        top: Math.max(0, target.offsetTop - wrap.clientHeight / 2 + target.offsetHeight / 2),
        behavior: smooth ? 'smooth' : 'auto'
    });
}

