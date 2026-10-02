/* =========================================================================
 * 2. Styles
 * ======================================================================= */

function injectStyles() {
    if (document.getElementById(`${APP_ID}-styles`)) return;
    const A = `#${APP_ID}`;
    const style = document.createElement('style');
    style.id = `${APP_ID}-styles`;
    style.textContent = `
#${BUTTON_ID} { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000; border: 0; border-radius: 999px; padding: 11px 16px; background: #342b55; color: #fff; font: 600 14px/1.2 system-ui, sans-serif; box-shadow: 0 6px 22px rgba(0,0,0,.25); cursor: pointer; }
#${BUTTON_ID}:hover { background: #44366f; }
#${BUTTON_ID}[hidden] { display: none; }

${A} { position: fixed; inset: 3vh 2vw; z-index: 2147483001; display: none; flex-direction: column; background: #f6f7f9; color: #17181b; border: 1px solid #b9bdc6; border-radius: 12px; box-shadow: 0 18px 70px rgba(0,0,0,.35); overflow: hidden; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
${A}.open { display: flex; }
${A} [hidden] { display: none !important; }
${A} :focus-visible { outline: 2px solid #51427f; outline-offset: 2px; }

${A} .abv-header { display: flex; flex-direction: column; gap: 6px; padding: 8px 14px; background: #fff; border-bottom: 1px solid #d7dae0; }
${A} .abv-header-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
${A} .abv-title { flex: 1 1 auto; min-width: 0; display: flex; align-items: baseline; gap: 6px; overflow: hidden; white-space: nowrap; }
${A} .abv-title strong { font-size: 16px; overflow: hidden; text-overflow: ellipsis; }
${A} button.abv-title-division { flex: none; min-height: 28px; padding: 2px 6px; border-color: transparent; background: transparent; color: #342b55; font-size: 14px; text-decoration: underline dotted; text-underline-offset: 3px; }
${A} button.abv-title-division:hover { background: #eee9ff; }
${A} .abv-header-actions { display: flex; gap: 4px; flex: none; }
${A} button.abv-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; min-width: 36px; padding: 0; }
${A} .abv-header-filters { display: flex; align-items: center; gap: 8px; min-width: 0; }
${A} .abv-header-filters .abv-filter-control { flex: 1 1 0; min-width: 0; }
${A} .abv-header-filters .abv-filter-control select { flex: 1 1 auto; min-width: 0; max-width: none; width: 100%; }
${A} button.abv-text-btn { flex: none; min-height: 28px; padding: 2px 6px; border-color: transparent; background: transparent; color: #4e3a9c; font-size: 12px; text-decoration: underline; }
${A} button, ${A} select { min-height: 34px; border-radius: 7px; border: 1px solid #b8bdc7; background: #fff; color: #22252a; padding: 6px 10px; font: 600 13px/1 system-ui, sans-serif; }
${A} button { cursor: pointer; }
${A} button.active { background: #342b55; border-color: #342b55; color: #fff; }
${A} button:disabled, ${A} select:disabled { opacity: .55; cursor: default; }
${A} .abv-filter-control { display: inline-flex; align-items: center; gap: 6px; color: #4d5360; font-size: 12px; font-weight: 700; }
${A} .abv-filter-control select { max-width: 260px; min-width: 140px; cursor: pointer; }
${A} .abv-check { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #4d5360; user-select: none; }
${A} .abv-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 7px 14px; background: #fafbfc; border-bottom: 1px solid #d7dae0; }
${A} .abv-bar .abv-muted { font-size: 11px; }
${A} .abv-view-tabs { display: flex; gap: 6px; overflow-x: auto; }
${A} .abv-view-tabs button { min-height: 32px; padding: 6px 12px; white-space: nowrap; }
${A} .abv-bottomnav { flex: none; background: #fff; border-top: 1px solid #d7dae0; padding-bottom: env(safe-area-inset-bottom, 0px); }
${A}.abv-compact .abv-bottomnav .abv-view-tabs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0; overflow: visible; }
${A}.abv-compact .abv-bottomnav .abv-view-tabs button { min-height: 52px; padding: 6px 2px; border: 0; border-radius: 0; background: #fff; font-size: 12px; }
${A}.abv-compact .abv-bottomnav .abv-view-tabs button.active { background: #342b55; color: #fff; }
${A}.abv-compact .abv-subbar { padding: 0 8px; justify-content: space-between; min-height: 30px; }
${A}.abv-compact button.abv-status-chip { max-width: none; flex: none; }

${A} .abv-subbar { display: flex; align-items: center; gap: 10px; padding: 0 14px; background: #fafbfc; border-bottom: 1px solid #d7dae0; min-width: 0; }
${A} .abv-subbar .abv-view-tabs { flex: 1 1 auto; min-width: 0; padding: 6px 0; border: 0; background: transparent; }
${A} .abv-updated { flex: 0 1 auto; min-width: 0; margin-left: auto; color: #505662; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${A} button.abv-status-chip { flex: 0 1 auto; min-width: 0; max-width: 45%; min-height: 28px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; color: #505662; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${A} button.abv-status-chip.warn { border-color: #d6b36a; background: #fff7e8; color: #76531b; }
${A} .abv-banner { display: flex; align-items: center; gap: 10px; padding: 6px 14px; background: #fff0f0; border-bottom: 1px solid #e3b9b9; color: #8b1e1e; font-size: 12px; }
${A} .abv-banner span { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
${A} .abv-status { color: #505662; font-size: 12px; margin: 0 0 8px; }
${A} .abv-status.error { color: #8b1e1e; }
${A} .abv-status-text { overflow-wrap: anywhere; }
${A} .abv-diag { max-height: 32vh; overflow: auto; padding: 10px 14px; background: #fff; border-bottom: 1px solid #d7dae0; font-size: 11px; color: #4d5360; }
${A} .abv-diag dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; margin: 0 0 8px; }
${A} .abv-diag dt { font-weight: 700; }
${A} .abv-diag dd { margin: 0; overflow-wrap: anywhere; }
${A} .abv-diag h4 { margin: 10px 0 4px; font-size: 12px; }
${A} .abv-diag ul { margin: 0; padding-left: 18px; }

${A} .abv-body { min-height: 0; flex: 1; display: flex; overflow: hidden; }
${A} .abv-view-panel { min-height: 0; min-width: 0; flex: 1 1 auto; display: flex; overflow: hidden; }
${A} .abv-graph-frame, ${A} .abv-list-frame { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; }
${A} .abv-graph-tools { position: absolute; top: 8px; right: 14px; z-index: 5; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; max-width: calc(100% - 28px); }
${A}.abv-compact .abv-detail-toggle, ${A}.abv-compact .abv-detail { display: none; }
${A}:not(.abv-compact) .abv-view-panel.detail-collapsed .abv-detail { display: none; }
${A} .abv-detail-toggle, ${A} .abv-tools-toggle { box-shadow: 0 2px 8px rgba(0,0,0,.15); }
${A} .abv-tools-toggle { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${A} .abv-tools-body { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; max-height: 60vh; overflow-y: auto; padding: 6px 10px; border: 1px solid #d7dae0; border-radius: 9px; background: rgba(255,255,255,.95); box-shadow: 0 2px 10px rgba(0,0,0,.12); }
${A} .abv-graph-wrap, ${A} .abv-list-wrap { position: relative; flex: 1 1 0; min-width: 0; min-height: 0; overflow: auto; }
${A} .abv-graph-wrap { background: linear-gradient(#f6f7f9 1px, transparent 1px), linear-gradient(90deg, #f6f7f9 1px, transparent 1px), #fff; background-size: 24px 24px; }
${A} .abv-list-wrap { background: #f6f7f9; }
${A} .abv-canvas { position: relative; min-width: 100%; min-height: 100%; }
${A} .abv-list-canvas { box-sizing: border-box; width: 100%; min-width: 0; min-height: 100%; }
${A} .abv-svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
${A} .abv-stage-label { position: absolute; top: 12px; padding: 7px 10px; border-radius: 7px; background: #22252a; color: #fff; font-weight: 700; font-size: 12px; white-space: nowrap; z-index: 3; }
${A} .abv-canvas.compact .abv-stage-label { top: 9px; padding: 5px 7px; font-size: 10px; }

${A} .abv-node { position: absolute; box-sizing: border-box; border: 1px solid #b8bdc7; border-left: 4px solid #8b6742; border-radius: 8px; padding: 7px 9px; background: rgba(255,255,255,.97); box-shadow: 0 1px 3px rgba(0,0,0,.08); cursor: pointer; z-index: 2; overflow: hidden; }
${A} .abv-node.pool-match { border-left-color: #5b7396; }
${A} .abv-standings { position: absolute; box-sizing: border-box; padding: 6px 8px; border: 1px solid #b8bdc7; border-radius: 999px; background: #eef0f4; color: #515865; font: 800 10px/14px system-ui, sans-serif; text-align: center; z-index: 2; cursor: pointer; white-space: nowrap; overflow: hidden; }
${A} .abv-entry { position: absolute; box-sizing: border-box; padding: 7px 8px; border: 1px solid #aeb5c0; border-radius: 7px; background: #f5f6f8; color: #535b68; font: 800 9px/1.2 system-ui, sans-serif; text-align: center; z-index: 2; cursor: pointer; overflow: hidden; }
${A} .abv-node:hover, ${A} .abv-node.selected, ${A} .abv-entry:hover, ${A} .abv-entry.selected, ${A} .abv-standings:hover, ${A} .abv-standings.selected { border-color: #51427f; box-shadow: 0 0 0 2px rgba(81,66,127,.16); }
${A} .abv-node.target-path { background: #f3efff; border-color: #806ed1; }
${A} .abv-standings.target-path { border-color: #806ed1; background: #eee9ff; color: #4e3a9c; }
${A} .abv-node.target-direct { background: #e8e0ff; border-color: #4e3a9c; border-left-color: #4e3a9c; box-shadow: 0 0 0 2px rgba(78,58,156,.16); }
${A} .abv-node.focus-current, ${A} .abv-standings.focus-current, ${A} .abv-entry.focus-current { background: #e6f2ee; border-color: #3f7567; }
${A} .abv-node.focus-current { border-left-color: #3f7567; box-shadow: 0 0 0 2px rgba(63,117,103,.14); }
${A} .abv-node.focus-possible, ${A} .abv-standings.focus-possible, ${A} .abv-entry.focus-possible { background: #f3efff; border-color: #806ed1; border-style: dashed; }
${A} .abv-node.group-focus { box-shadow: 0 0 0 2px rgba(50,72,108,.13); }
${A} .abv-entry.group-focus, ${A} .abv-standings.group-focus { background: #eef2f7; border-color: #8797ad; }
${A} .abv-node.context-node, ${A} .abv-entry.context-node, ${A} .abv-standings.context-node { opacity: .58; }
${A} .abv-canvas.tracing :is(.abv-node, .abv-entry, .abv-standings):not(.trace-upstream, .trace-downstream, .trace-both) { opacity: .16; filter: grayscale(.55); }
${A} .abv-node.trace-upstream, ${A} .abv-entry.trace-upstream, ${A} .abv-standings.trace-upstream { opacity: 1; border-color: #39707c; box-shadow: 0 0 0 2px rgba(57,112,124,.16); }
${A} .abv-entry.trace-upstream, ${A} .abv-standings.trace-upstream { background: #eaf3f4; }
${A} .abv-node.trace-downstream, ${A} .abv-entry.trace-downstream, ${A} .abv-standings.trace-downstream { opacity: 1; border-color: #6b4cab; box-shadow: 0 0 0 2px rgba(107,76,171,.16); }
${A} .abv-entry.trace-downstream, ${A} .abv-standings.trace-downstream { background: #f0ebfb; }
${A} .abv-node.trace-both, ${A} .abv-entry.trace-both, ${A} .abv-standings.trace-both { opacity: 1; border-color: #4d5968; box-shadow: 0 0 0 2px rgba(77,89,104,.18); }

${A} .abv-node .n-title { font-size: 12px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${A} .abv-node .n-sub { margin-top: 5px; color: #4e5562; font-size: 11px; }
${A} .abv-node .n-team { display: block; padding: 2px 5px; margin: 2px 0; border-radius: 4px; background: #f5f6f8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${A} .abv-node .n-team.target-team { background: #ddd4ff; color: #2e2363; font-weight: 800; }
${A} .abv-node .n-team.placeholder { font-style: italic; color: #69717e; background: #f8f8f9; }
${A} .abv-node .n-team.winner { font-weight: 800; outline: 1px solid #95a69a; }
${A} .abv-node .n-vs { display: block; text-align: center; color: #8a909b; font-size: 9px; line-height: 1; }
${A} .abv-node .n-meta { margin-top: 5px; color: #747b88; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${A} .abv-node .n-result { margin-top: 5px; padding-top: 4px; border-top: 1px solid #eceef2; color: #4d5360; font-size: 10px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${A} .abv-node.compact { padding: 5px 7px; border-left-width: 3px; border-radius: 6px; }
${A} .abv-node.compact .n-title { font-size: 10px; }
${A} .abv-node.compact .n-sub { margin-top: 3px; }
${A} .abv-node.compact .n-team { padding: 1px 4px; margin: 1px 0; font-size: 9px; }
${A} .abv-node.compact .n-vs { font-size: 8px; }
${A} .abv-node.compact .n-result { margin-top: 3px; padding-top: 3px; font-size: 8px; }
${A} .abv-node.compact .n-meta { margin-top: 3px; font-size: 8px; }
${A} .abv-standings.compact { padding: 4px 5px; font-size: 8px; line-height: 10px; }
${A} .abv-entry.compact { padding: 4px; font-size: 8px; line-height: 1.05; }

${A} .abv-edge { fill: none; stroke: #a8adb7; stroke-width: 1.25; opacity: .62; }
${A} .abv-edge.aggregation, ${A} .abv-edge.membership { stroke-dasharray: 4 4; opacity: .42; }
${A} .abv-edge.target-path { stroke: #6f58c9; stroke-width: 2; opacity: .9; }
${A} .abv-edge.focus-current { stroke: #3f7567; stroke-width: 2.5; stroke-dasharray: none; opacity: .96; }
${A} .abv-edge.focus-possible { stroke: #806ed1; stroke-width: 2; stroke-dasharray: 7 5; opacity: .82; }
${A} .abv-edge.group-focus { stroke: #77869c; stroke-width: 1.8; opacity: .82; }
${A} .abv-edge.context-edge { opacity: .22; }
${A} .abv-canvas.tracing .abv-edge:not(.trace-upstream, .trace-downstream, .trace-both) { opacity: .08; }
${A} .abv-edge.trace-upstream { stroke: #39707c; stroke-width: 2.4; opacity: .96; }
${A} .abv-edge.trace-downstream { stroke: #6b4cab; stroke-width: 2.4; opacity: .96; }
${A} .abv-edge.trace-both { stroke: #4d5968; stroke-width: 2.4; opacity: .96; }
${A} .abv-edge-label { font: 10px system-ui, sans-serif; fill: #4d5360; paint-order: stroke; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; }
${A} .abv-canvas.compact .abv-edge-label { font-size: 8px; }
${A} .abv-edge-label.focus-current { fill: #315f54; }
${A} .abv-edge-label.focus-possible { fill: #654daf; }
${A} .abv-canvas.tracing .abv-edge-label:not(.trace-upstream, .trace-downstream, .trace-both) { opacity: .08; }
${A} .abv-edge-label.trace-upstream { fill: #2f616b; }
${A} .abv-edge-label.trace-downstream { fill: #5b3f95; }

${A} .abv-detail { flex: 0 0 330px; width: 330px; min-width: 280px; max-width: min(34vw, 360px); box-sizing: border-box; border-left: 1px solid #d7dae0; background: #fff; overflow: auto; overflow-wrap: anywhere; padding: 13px; }
${A} .abv-detail h3 { margin: 0 0 4px; font-size: 15px; }
${A} .abv-detail h4 { margin: 14px 0 5px; font-size: 12px; color: #626976; }
${A} .abv-detail p, ${A} .abv-detail li { font-size: 12px; line-height: 1.45; }
${A} .abv-detail p { margin: 4px 0; }
${A} .abv-detail ul { margin: 5px 0 0; padding-left: 18px; }
${A} .abv-muted { color: #737a87; }
${A} .abv-pill { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 6px; border-radius: 999px; background: #eef0f4; font-size: 10px; }
${A} .abv-legend { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 14px; font-size: 10px; color: #606774; }
${A} .abv-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 3px; vertical-align: -1px; border: 1px solid #aaa; }
${A} .abv-empty { padding: 22px; color: #666d79; }

${A} .abv-list-view { box-sizing: border-box; width: 100%; max-width: 1100px; padding: 18px; }
${A} .abv-journey-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
${A} .abv-journey-head h2 { margin: 0 0 4px; font-size: 18px; }
${A} .abv-journey-head p { margin: 0; color: #68707d; font-size: 12px; }
${A} .abv-next-card { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin: 0 0 16px; }
${A} .abv-next-cell { display: grid; gap: 3px; padding: 12px 14px; border: 1px solid #d8dce3; border-left: 4px solid #3f7567; border-radius: 9px; background: #fff; font-size: 12px; }
${A} .abv-next-cell.work { border-left-color: #8b6742; }
${A} .abv-next-cell strong { font-size: 15px; }
${A} .abv-next-cell .abv-when { font-weight: 700; color: #3f4652; }
${A} .abv-journey-item { display: grid; grid-template-columns: 130px minmax(240px, 1fr) 90px; gap: 14px; align-items: center; padding: 12px 14px; margin-bottom: 10px; border: 1px solid #d8dce3; border-radius: 9px; background: #fff; }
${A} .abv-journey-item.current { border-left: 4px solid #3f7567; }
${A} .abv-journey-item.upcoming { border-left: 4px solid #806ed1; }
${A} .abv-journey-item.work { border-left: 4px solid #8b6742; background: #fcfaf7; }
${A} .abv-journey-date { color: #5d6572; font-size: 11px; font-weight: 700; }
${A} .abv-journey-match strong { display: block; font-size: 13px; }
${A} .abv-journey-match small { display: block; margin-top: 3px; color: #737b87; }
${A} .abv-badge { justify-self: end; min-width: 58px; padding: 5px 8px; border-radius: 999px; text-align: center; font-size: 11px; font-weight: 800; background: #eef0f4; }
${A} .abv-badge.win { background: #e6f2ee; color: #315f54; }
${A} .abv-badge.loss { background: #f8eaea; color: #8b3434; }
${A} .abv-badge.upcoming { background: #f3efff; color: #654daf; }
${A} .abv-badge.work { background: #f5ede3; color: #6f5134; }

${A} .abv-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 14px 0 18px; }
${A} .abv-stat { padding: 12px; border: 1px solid #d8dce3; border-radius: 9px; background: #fff; }
${A} .abv-stat b { display: block; font-size: 22px; }
${A} .abv-stat b small { color: #777f8b; font-size: 10px; font-weight: 600; }
${A} .abv-stat span { color: #6f7783; font-size: 11px; }
${A} .abv-stat .abv-stat-sub { display: block; margin-top: 3px; color: #8a909b; font-size: 10px; }
${A} .abv-head-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
${A} .abv-table td.num, ${A} .abv-table th.num { text-align: right; white-space: nowrap; }
${A} .abv-table-wrap { overflow-x: auto; }
${A} .abv-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d8dce3; font-size: 12px; }
${A} .abv-table th, ${A} .abv-table td { padding: 8px 10px; border-bottom: 1px solid #eceef2; text-align: left; vertical-align: top; }
${A} .abv-table th { background: #f5f6f8; white-space: nowrap; }
${A} .abv-table tr.selected-team td { background: #eee9ff; font-weight: 700; }
${A} .abv-table tr.mine td { background: #faf8ff; }
${A} .abv-table tr.route-possible td { background: #fbfaff; }
${A} .abv-table tr.route-assigned td { background: #f0f8f5; }
${A} .abv-route-status { display: inline-block; padding: 2px 6px; border-radius: 999px; background: #eef0f4; font-size: 10px; font-weight: 800; white-space: nowrap; }
${A} tr.route-assigned .abv-route-status { background: #e6f2ee; color: #315f54; }

${A} .abv-breadcrumb { margin: 5px 0 14px; color: #5f6876; font-size: 12px; font-weight: 700; }
${A} .abv-note { margin: 8px 0 16px; color: #737b87; font-size: 11px; line-height: 1.45; }
${A} .abv-section { margin-top: 20px; }
${A} .abv-section h3 { margin: 0 0 9px; font-size: 14px; }
${A} .abv-subtitle { margin: 0 0 8px; color: #626976; font-size: 12px; font-weight: 800; }
${A} .abv-perf-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; margin: 0 0 14px; padding: 10px 12px; border: 1px solid #d8dce3; border-radius: 9px; background: #fff; }
${A} .abv-perf-control { display: grid; gap: 5px; min-width: 220px; color: #5d6572; font-size: 11px; font-weight: 700; }
${A} .abv-perf-control select { width: 100%; min-width: 220px; }
${A} .abv-progress-track { display: grid; gap: 8px; margin: 10px 0 18px; }
${A} .abv-progress-item { display: grid; grid-template-columns: minmax(220px, 1fr) auto auto auto; gap: 12px; align-items: center; padding: 9px 11px; border: 1px solid #d8dce3; border-radius: 8px; background: #fff; font-size: 11px; cursor: pointer; }
${A} .abv-progress-item:hover { border-color: #51427f; box-shadow: 0 0 0 2px rgba(81,66,127,.12); }
${A} .abv-progress-item.current { border-left: 4px solid #3f7567; background: #f7fbf9; }
${A} .abv-progress-item strong { font-size: 12px; }
${A} .abv-warning { margin: 8px 0 14px; padding: 8px 10px; border-radius: 7px; background: #fff7e8; color: #76531b; font-size: 11px; }
${A} .abv-timeline { display: grid; gap: 0; }
${A} .abv-tl-item { display: grid; grid-template-columns: 86px minmax(200px, 1fr) 120px 84px; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid #d8dce3; border-left: 4px solid #3f7567; border-radius: 9px; background: #fff; }
${A} .abv-tl-item.work { border-left-color: #8b6742; background: #fcfaf7; }
${A} .abv-tl-item.done { opacity: .72; }
${A} .abv-tl-time { font-weight: 800; font-size: 13px; }
${A} .abv-tl-time small, ${A} .abv-tl-court small, ${A} .abv-tl-body small { display: block; font-weight: 500; color: #737b87; font-size: 11px; margin-top: 2px; }
${A} .abv-tl-body strong { font-size: 13px; }
${A} .abv-tl-court { font-weight: 700; font-size: 12px; }
${A} .abv-tl-gap { margin: 0 0 0 40px; padding: 5px 10px; border-left: 2px dashed #c3c8d0; color: #5d6572; font-size: 11px; }
${A} .abv-tl-gap.meal { color: #315f54; font-weight: 700; }
${A} .abv-tl-gap.warn { color: #8b3434; font-weight: 700; border-left-color: #d49b9b; }
${A} .abv-arrive { font-weight: 700; color: #342b55; }
${A} .abv-court-status { font-size: 11px; color: #4d5360; }
${A} .abv-court-status.late { color: #8b3434; font-weight: 700; }
${A} .abv-court-status.ontime { color: #315f54; }
${A} .abv-copy-fallback { width: 100%; min-height: 120px; margin: 0 0 12px; font: 12px/1.4 system-ui, sans-serif; }
${A} .abv-all-items summary { cursor: pointer; font-weight: 700; font-size: 13px; margin-bottom: 10px; }
${A} .abv-my-teams { gap: 6px; padding: 5px 14px; flex-wrap: nowrap; overflow-x: auto; white-space: nowrap; }
${A} .abv-my-teams > * { flex: none; }
${A} .abv-my-teams > .abv-muted { overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; }
${A} .abv-my-label { font-size: 12px; font-weight: 800; color: #342b55; margin-right: 4px; }
${A} .abv-chip { min-height: 28px; padding: 4px 10px; border-radius: 999px; font-size: 12px; }
${A} .abv-chip small { font-weight: 600; opacity: .75; }
${A} .abv-node .n-team.mine::before { content: '\u2605\u00a0'; color: #a07a14; }
${A} .abv-tl-team { display: inline-block; margin-right: 6px; padding: 1px 7px; border-radius: 999px; background: #eee9ff; color: #342b55; font-size: 10px; font-weight: 800; }
${A} .abv-timeline-multi { gap: 6px; }
${A} .abv-node .n-team.likely { background: #fff4e6; box-shadow: inset 3px 0 0 #c77d1a; }
${A} .abv-node.court-late { border-style: dotted; border-color: #b03a2e; }
${A} .abv-node .n-meta .late { color: #8b3434; font-weight: 800; }
${A} .abv-outlook-line { margin: -4px 0 14px; font-size: 12px; }
${A} .abv-table tr.unreachable td { color: #9aa0aa; }
${A} .abv-link-button { justify-self: start; min-height: 26px; margin-top: 4px; padding: 3px 9px; border-color: #806ed1; color: #4e3a9c; font-size: 11px; }
${A} .abv-tl-item.conflict { box-shadow: 0 0 0 2px rgba(139,52,52,.35); }
${A} .abv-scenario-summary { margin: 0 0 10px; padding: 10px 12px; border: 1px solid #d8dce3; border-left: 4px solid #342b55; border-radius: 8px; background: #fff; font-size: 12px; line-height: 1.5; }

${A}.abv-compact .abv-header-filters .abv-label-text { display: none; }
${A} .abv-graph-tools:not(.tools-open) .abv-tools-body { display: none; }

@media ${MOBILE_QUERY} {
    ${A} { inset: 0; border-radius: 0; border: 0; }
    ${A} .abv-header { padding: 6px 8px; gap: 4px; }
    ${A} .abv-my-teams { padding: 4px 8px; }
    ${A} .abv-bar { padding: 6px 8px; }
    ${A} .abv-view-panel { flex-direction: column; }
    ${A} .abv-list-view { padding: 10px; }
    ${A} .abv-journey-item { grid-template-columns: 1fr; gap: 6px; }
    ${A} .abv-tl-item { grid-template-columns: 70px 1fr; }
    ${A} .abv-tl-court { grid-column: 2; }
    ${A} .abv-tl-item .abv-badge { grid-column: 2; justify-self: start; }
    ${A} .abv-tl-gap { margin-left: 20px; }
    ${A} .abv-badge { justify-self: start; }
    ${A} .abv-stats-grid { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
    ${A} .abv-progress-item { grid-template-columns: 1fr 1fr; }
    ${A} .abv-perf-control, ${A} .abv-perf-control select { min-width: 0; width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
    ${A} * { scroll-behavior: auto !important; }
}
`;
    document.head.appendChild(style);
}

