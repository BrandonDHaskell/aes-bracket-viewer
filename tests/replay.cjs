const fs = require('fs'); const { JSDOM } = require('jsdom');
const cap = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const script = fs.readFileSync(process.argv[3] || require('path').join(__dirname, '..', 'dist', 'aes-bracket-viewer.user.js'), 'utf8');
const d = cap.data, div = cap.division.id, key = cap.eventKey;
const routes = { '': d.event, '/timestamp': d.timestamp, [`/division/${div}/playdays`]: d.playdays, [`/division/${div}/plays`]: d.plays };
for (const [date, v] of Object.entries(d.playsByDate)) routes[`/division/${div}/plays/${date}`] = v;
for (const [id, v] of Object.entries(d.poolSheets)) routes[`/poolsheet/${id}`] = v;
module.exports = async function boot(extra = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: `https://results.advancedeventsystems.com/event/${key}/home${extra.hash || ''}`, pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window; const errors = [];
  w.console.error = (...a) => errors.push(a.map(String).join(' ')); w.console.warn = () => {};
  w.matchMedia = () => ({ matches: false }); w.Element.prototype.scrollTo = () => {};
  w.URL.createObjectURL = b => { w.__blob = b; return 'blob:x'; }; w.URL.revokeObjectURL = () => {}; w.HTMLAnchorElement.prototype.click = () => {};
  const favorites = extra.favorites === undefined ? [150886, 138490, 238635, 24843] : extra.favorites;
  if (favorites) w.localStorage.setItem(`aes/favorite/teams/${key}`, JSON.stringify({ TeamIds: favorites }));
  if (extra.prefs) w.localStorage.setItem('aes-bracket-viewer:prefs:v2', JSON.stringify(extra.prefs));
  if (extra.indexedDB) { w.indexedDB = extra.indexedDB; w.IDBKeyRange = require('fake-indexeddb').IDBKeyRange; }
  if (extra.setup) extra.setup(w);
  if (extra.now) { const real = w.Date; const t = extra.now; w.Date = class extends real { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } }; }
  // Optional mutation of a private copy of the capture, e.g. to post results for a scenario.
  const table = extra.mutate ? (extra.mutate(JSON.parse(JSON.stringify(routes))) || routes) : routes;
  w.fetch = async u => { const p = decodeURIComponent(String(u)).replace(`/api/event/${key}`, ''); if (extra.onFetch) await extra.onFetch(p); return p in table ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(table[p])) } : { ok: false, status: 404, json: async () => null }; };
  const t0 = Date.now(); w.eval(script);
  const doc = w.document; doc.getElementById('aes-bracket-viewer-button').click();
  for (let i = 0; i < 200 && !/AES updated|could not/.test(doc.querySelector('[data-role="status-text"]')?.textContent || ''); i++) await new Promise(r => setTimeout(r, 50));
  return { w, doc, errors, ms: Date.now() - t0 };
};
if (require.main === module) (async () => {
  const { w, doc, errors, ms } = await module.exports();
  const q = s => doc.querySelector('#aes-bracket-viewer ' + s);
  console.log('load ms', ms, '| status:', q('[data-role="status-text"]').textContent);
  console.log('clubs:', q('[data-action="club"]').options.length - 1, '| teams:', q('[data-action="team"]').options.length - 1, '| selected team:', q('[data-action="team"]').selectedOptions[0]?.text);
  q('[data-action="toggle-diagnostics"]').click();
  console.log('diag:', q('[data-role="diagnostics"]').innerText || q('[data-role="diagnostics"]').textContent.slice(0, 1500));
  console.log('errors:', errors.slice(0, 3));
  process.exit(0);
})();
