const fs = require('fs');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(__dirname + '/smoke.test.cjs', 'utf8');
// Reuse fixtures from the main test.
const fixtureCode = src.slice(src.indexOf('const club ='), src.indexOf('let data = fixtures();'));
eval(fixtureCode + '; global.fixtures = fixtures;');
const script = fs.readFileSync(require('path').join(__dirname, '..', 'dist', 'aes-bracket-viewer.user.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function boot(url, mobile = false) {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url, pretendToBeVisual: true, runScripts: 'outside-only' });
    const w = dom.window; const errors = [];
    w.console.error = (...a) => errors.push(a.join(' '));
    w.matchMedia = q => ({ matches: mobile && /max-width/.test(q) });
    w.Element.prototype.scrollTo = () => {};
    const data = fixtures();
    w.fetch = async u => { const p = String(u).replace('/api/event/TESTKEY', ''); return p in data ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(data[p])) } : { ok: false, status: 404, json: async () => null }; };
    w.eval(script);
    return { w, d: w.document, errors };
}
(async () => {
    const out = [];
    const check = (n, ok, x = '') => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? `  [${x}]` : ''}`); };
    // 1. Trace click keeps the same DOM elements (class-only refresh).
    let { w, d } = await boot('https://results.advancedeventsystems.com/event/TESTKEY/home');
    d.getElementById('aes-bracket-viewer-button').click(); await sleep(300);
    d.querySelector('[data-action="reset-filters"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(30);
    const el = d.querySelector('[data-node-key="R2P1M1"]');
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(30);
    check('trace reuses DOM node (no re-layout)', d.querySelector('[data-node-key="R2P1M1"]') === el && /trace-/.test(el.className));
    const dimmed = d.querySelectorAll('.abv-node.trace-dim').length, edgesDim = d.querySelectorAll('path.abv-edge.trace-dim').length;
    check('unrelated nodes and edges dimmed in place', dimmed > 0 && edgesDim > 0, `${dimmed} nodes, ${edgesDim} edges`);
    const detail = d.querySelector('[data-detail="tournament"]').textContent;
    check('match detail copy has no dev notes', /Arrives from/.test(detail) && !/fixes|duplicate-result|three-team/i.test(detail));
    const standings = d.querySelector('[data-node-key="R1P1"]'); standings.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(30);
    const sd = d.querySelector('[data-detail="tournament"]').textContent;
    check('standings detail shows real team count', /3-team pool/.test(sd) && /Where each finish place goes/.test(sd));
    w.close();
    // 2. Shared link opens directly to Group Performance for team 4.
    ({ w, d } = await boot('https://results.advancedeventsystems.com/event/TESTKEY/home#abv=' + encodeURIComponent('v=performance&t=4')));
    await sleep(400);
    const app = d.getElementById('aes-bracket-viewer');
    check('hash link auto-opens viewer', app.classList.contains('open'));
    check('hash link selects team and view', d.querySelector('[data-action="team"]').value === '4' && /Delta 18/.test(d.querySelector('[data-canvas="performance"]').textContent));
    const perf = d.querySelector('[data-canvas="performance"]').textContent;
    check('incomplete pool uses calc ranks even with FinishRank present', /\(calc\.\)/.test(perf));
    w.close();
    // 3. Mobile default view + division switch.
    ({ w, d } = await boot('https://results.advancedeventsystems.com/event/TESTKEY/home', true));
    d.getElementById('aes-bracket-viewer-button').click(); await sleep(300);
    check('mobile defaults to Team Journey', d.querySelector('[data-view="journey"]').classList.contains('active'));
    const div = d.querySelector('[data-action="division"]');
    check('division select populated', div.options.length === 2, [...div.options].map(o => o.text).join(', '));
    div.value = '2'; div.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(300);
    check('empty division shows actionable message', /has not published playdays for 17 Boys/.test(d.querySelector('[data-role="status-text"]').textContent));
    check('division choice saved per event', /"TESTKEY":2/.test(w.localStorage.getItem('aes-bracket-viewer:prefs:v2')));
    // 4. Off-event page hides launcher (SPA navigation).
    w.history.pushState({}, '', '/');
    await sleep(1200);
    check('launcher hidden off event pages', d.getElementById('aes-bracket-viewer-button').hidden);
    w.close();
    console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
    process.exit(out.every(Boolean) ? 0 : 1);
})();
