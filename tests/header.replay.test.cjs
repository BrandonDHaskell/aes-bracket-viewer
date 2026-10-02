// Header, status, bottom navigation, and Tournament toolbar regression test against the real
// AES capture. Run with TZ=America/Los_Angeles.
const boot = require('./replay.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// matchMedia stub whose max-width query can be flipped, so the change listener is exercised too.
const media = initial => w => {
    const listeners = [];
    let narrow = initial;
    w.matchMedia = q => ({
        get matches() { return /max-width/.test(q) && narrow; },
        addEventListener: (type, fn) => { if (/max-width/.test(q)) listeners.push(fn); },
        removeEventListener() {}
    });
    w.__setNarrow = value => { narrow = value; listeners.forEach(fn => fn({ matches: value })); };
};
(async () => {
    const results = [];
    const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== '' ? `  [${got}]` : ''}`); };
    const open = async extra => {
        const t = await boot(extra);
        const q = s => t.doc.querySelector('#aes-bracket-viewer ' + s);
        const qa = s => [...t.doc.querySelectorAll('#aes-bracket-viewer ' + s)];
        const click = el => el.dispatchEvent(new t.w.MouseEvent('click', { bubbles: true }));
        const change = (el, value) => { el.value = value; el.dispatchEvent(new t.w.Event('change', { bubbles: true })); };
        return { ...t, q, qa, click, change, app: q('') || t.doc.getElementById('aes-bracket-viewer') };
    };

    // Wide layout.
    let t = await open({ setup: media(false) });
    const league = t.q('[data-role="title"]').textContent;
    const division = t.q('[data-role="title-division"]');
    check('title shows the league name', /Power League/.test(league), league);
    check('title shows the division', !division.hidden && /18 Boys/.test(division.textContent), division.textContent);
    check('settings start closed', t.q('[data-role="settings"]').hidden);
    t.click(division);
    check('division label opens Settings', !t.q('[data-role="settings"]').hidden);
    check('division label focuses the Division select', t.doc.activeElement === t.q('[data-action="division"]'));
    check('icon buttons have names', ['refresh', 'toggle-settings', 'close'].every(a => /\S/.test(t.q(`[data-action="${a}"]`).getAttribute('aria-label') || '')));

    // Club and Team filters, Reset.
    const clubs = [...t.q('[data-action="club"]').options].filter(o => o.value !== '__all__');
    const club = clubs.find(o => o.text.includes('SF Elite')) || clubs[0];
    t.change(t.q('[data-action="club"]'), club.value);
    const teamOptions = [...t.q('[data-action="team"]').options].filter(o => o.value !== '__all__');
    check('club narrows the team list', teamOptions.length >= 1 && teamOptions.length < 30, teamOptions.length);
    t.change(t.q('[data-action="team"]'), teamOptions[0].value);
    check('team selection applies', t.q('[data-action="team"]').value === teamOptions[0].value);
    t.click(t.q('[data-action="reset-filters"]'));
    check('Reset filters clears club and team', t.q('[data-action="club"]').value === '__all__' && t.q('[data-action="team"]').value === '__all__');

    // Wide: tabs sit with the status chip; no compact classes.
    check('wide: not compact', !t.app.classList.contains('abv-compact'));
    check('wide: tabs share a row with the status chip', t.q('[data-role="view-tabs"]').parentElement === t.q('[data-role="subbar"]') && t.q('[data-role="status-chip"]').parentElement === t.q('[data-role="subbar"]'));
    check('wide: bottom navigation hidden', t.q('[data-role="bottom-nav"]').hidden);
    check('wide: tab labels are the full names', t.q('[data-view="performance"]').textContent === 'Standings & Outlook');
    const chip = t.q('[data-role="status-chip"]');
    const updated = t.q('[data-role="updated-label"]');
    check('left label shows the AES update time', /^Last updated: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(updated.textContent), updated.textContent);
    check('left label sits before the chip', updated.nextElementSibling === chip);
    check('label tooltip names the time zone', /America\/Los_Angeles/.test(updated.title), updated.title);
    check('chip reads Last checked: Ns ago', /^Last checked: \d+s ago$/.test(chip.textContent), chip.textContent);
    // The age can restart when a background load confirms the data, so look for change, not a fixed count.
    const seen = new Set([chip.textContent]);
    for (let i = 0; i < 3; i += 1) { await sleep(1100); seen.add(chip.textContent); }
    check('chip ticks every second', seen.size >= 3, [...seen].join(' | '));
    check('chip not in warning style when fresh', !chip.classList.contains('warn'));
    // With AES unreachable the scheduler's check fails, so the last check keeps ageing.
    const realFetch = t.w.fetch;
    t.w.fetch = async () => { throw new Error('offline'); };
    const RealDate = t.w.Date;
    t.w.Date = class extends RealDate { static now() { return super.now() + 4 * 60000; } };
    await sleep(1100);
    check('chip warns and shows minutes when checks are stale', chip.classList.contains('warn') && /^Last checked: 4m ago$/.test(chip.textContent), chip.textContent);
    t.w.Date = RealDate;
    t.w.fetch = realFetch;

    // Group select lives only in the Tournament toolbar.
    const groups = t.qa('[data-action="group"]');
    check('Group select exists once, in the Tournament toolbar', groups.length === 1 && groups[0].closest('[data-role="graph-tools"]') && groups[0].closest('[data-panel="tournament"]'));
    check('Group not in the header', !t.q('.abv-header [data-action="group"]'));
    check('Group visible on Tournament', !groups[0].closest('[data-panel]').hidden);
    t.click(t.q('[data-view="journey"]'));
    check('Group hidden off the Tournament view', groups[0].closest('[data-panel]').hidden);
    t.click(t.q('[data-view="tournament"]'));

    // Toolbar is collapsed by default and the choice is remembered.
    const tools = t.q('[data-role="graph-tools"]');
    const pill = t.q('[data-action="toggle-tools"]');
    check('toolbar starts collapsed', !tools.classList.contains('tools-open') && pill.getAttribute('aria-expanded') === 'false');
    t.click(pill);
    check('Options opens the toolbar', tools.classList.contains('tools-open') && pill.getAttribute('aria-expanded') === 'true');
    const groupOption = [...t.q('[data-action="group"]').options].find(o => o.value !== '__all__');
    t.change(t.q('[data-action="group"]'), groupOption.value);
    check('pill names the selected group', pill.textContent.includes(groupOption.text.replace(/^\u2605 /, '')), pill.textContent);
    tools.querySelector('select').focus();
    tools.querySelector('select').dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Escape collapses the toolbar and keeps the viewer open', !tools.classList.contains('tools-open') && t.app.classList.contains('open') && t.doc.activeElement === pill);
    t.click(pill);
    t.change(t.q('[data-action="group"]'), '__all__');

    // Clear trace only while tracing.
    check('Clear trace hidden without a trace', t.q('[data-action="clear-trace"]').hidden);
    t.click(t.q('[data-node-key]'));
    check('Clear trace shown while tracing', !t.q('[data-action="clear-trace"]').hidden);
    t.click(t.q('[data-action="clear-trace"]'));
    check('Clear trace hidden after clearing', t.q('[data-action="clear-trace"]').hidden);

    // Status chip opens Details; failed refresh shows a dismissible banner.
    check('Details start closed', t.q('[data-role="diagnostics"]').hidden && chip.getAttribute('aria-expanded') === 'false');
    t.click(chip);
    check('chip opens Details', !t.q('[data-role="diagnostics"]').hidden && chip.getAttribute('aria-expanded') === 'true' && /Time zone/.test(t.q('[data-role="diagnostics"]').textContent));
    t.click(chip);
    check('no banner while healthy', t.q('[data-role="banner"]').hidden);
    check('no runtime errors (wide, before the forced failure)', t.errors.length === 0, t.errors.slice(0, 2).join(' | '));
    t.w.fetch = async () => { throw new Error('network down'); };
    t.click(t.q('[data-action="refresh"]'));
    await sleep(300);
    const banner = t.q('[data-role="banner"]');
    check('failed refresh shows the banner', !banner.hidden && /Refresh failed/.test(banner.textContent) && banner.getAttribute('role') === 'alert', banner.textContent.trim().slice(0, 60));
    t.click(t.q('[data-action="dismiss-banner"]'));
    check('banner can be dismissed', banner.hidden);

    // Detail panel collapse.
    const panel = t.q('[data-panel="tournament"]');
    check('detail panel starts expanded', !panel.classList.contains('detail-collapsed'));
    t.click(t.q('[data-action="toggle-detail"]'));
    check('toggle collapses the detail panel', panel.classList.contains('detail-collapsed') && t.q('[data-action="toggle-detail"]').getAttribute('aria-expanded') === 'false');
    const stored = t.w.localStorage.getItem('aes-bracket-viewer:prefs:v2');
    t.w.close();

    // The collapse survives a reload.
    t = await open({ setup: media(false), prefs: JSON.parse(stored) });
    check('toolbar open state is remembered across reloads', t.q('[data-role="graph-tools"]').classList.contains('tools-open'));
    check('collapse is remembered across reloads', t.q('[data-panel="tournament"]').classList.contains('detail-collapsed'));
    t.click(t.q('[data-action="toggle-detail"]'));
    check('toggle expands again', !t.q('[data-panel="tournament"]').classList.contains('detail-collapsed'));
    t.w.close();

    // Compact layout.
    t = await open({ setup: media(true) });
    const nav = t.q('[data-role="bottom-nav"]');
    check('compact: class set', t.app.classList.contains('abv-compact'));
    check('compact: bottom navigation holds the five views', !nav.hidden && nav.querySelectorAll('[data-view]').length === 5);
    check('compact: short labels', [...nav.querySelectorAll('[data-view]')].map(b => b.textContent).join(',') === 'Map,Day,Outlook,Stats,Scout', [...nav.querySelectorAll('[data-view]')].map(b => b.textContent).join(','));
    t.click(nav.querySelector('[data-view="stats"]'));
    check('compact: bottom navigation switches views', t.q('[data-panel="stats"]') && !t.q('[data-panel="stats"]').hidden && nav.querySelector('[data-view="stats"]').getAttribute('aria-selected') === 'true' && nav.querySelector('[data-view="journey"]').getAttribute('aria-selected') === 'false');
    // Tournament detail panel is a bottom sheet on phones: closed until a node is tapped.
    t.click(nav.querySelector('[data-view="tournament"]'));
    const mapPanel = t.q('[data-panel="tournament"]');
    const escape = () => t.doc.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    check('compact: sheet is closed until a node is tapped', !mapPanel.classList.contains('sheet-open'));
    const cardKey = 'Lg2Oct17-18XOBronze B2v2M1';
    t.click(t.q(`[data-node-key="${cardKey}"]`));
    check('compact: tapping a node opens the sheet with its details', mapPanel.classList.contains('sheet-open') && t.q('[data-detail="tournament"]').textContent.includes(cardKey));
    check('compact: sheet has a close button with a name', /\S/.test(t.q('[data-action="close-sheet"]').getAttribute('aria-label') || ''));
    escape();
    check('compact: Escape closes the sheet first, viewer stays open', !mapPanel.classList.contains('sheet-open') && t.app.classList.contains('open'));
    t.click(t.q(`[data-node-key="${cardKey}"]`));
    t.click(t.q('[data-action="close-sheet"]'));
    check('compact: close button closes the sheet', !mapPanel.classList.contains('sheet-open') && t.app.classList.contains('open'));
    t.click(t.q(`[data-node-key="${cardKey}"]`));
    t.click(nav.querySelector('[data-view="journey"]'));
    t.click(nav.querySelector('[data-view="tournament"]'));
    check('compact: switching views closes the sheet', !mapPanel.classList.contains('sheet-open'));
    escape();
    check('compact: Escape with no sheet closes the viewer', !t.app.classList.contains('open'));
    t.click(t.doc.getElementById('aes-bracket-viewer-button'));
    await sleep(100);
    const mine = t.q('[data-role="my-teams"]');
    check('compact: My teams is one row of chips', mine.querySelectorAll('.abv-chip').length >= 2 && mine.parentElement === t.app && !mine.hidden);
    check('compact: short label and chip', /^Updated \d{2}-\d{2} \d{2}:\d{2}$/.test(t.q('[data-role="updated-label"]').textContent) && /^Checked \d+s ago$/.test(t.q('[data-role="status-chip"]').textContent), `${t.q('[data-role="updated-label"]').textContent} / ${t.q('[data-role="status-chip"]').textContent}`);
    const css = t.doc.getElementById('aes-bracket-viewer-styles').textContent;
    check('compact: detail panels are hidden by the compact class', /\.abv-compact \.abv-detail[^{]*\{ display: none/.test(css) && t.q('[data-detail="tournament"]').closest('.abv-compact'));
    t.w.__setNarrow(false);
    check('change event returns to wide layout', !t.app.classList.contains('abv-compact') && t.q('[data-role="bottom-nav"]').hidden && t.q('[data-role="view-tabs"]').parentElement === t.q('[data-role="subbar"]'));
    check('no runtime errors (compact)', t.errors.length === 0, t.errors.slice(0, 2).join(' | '));
    t.w.close();

    console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
    process.exit(results.every(Boolean) ? 0 : 1);
})();
