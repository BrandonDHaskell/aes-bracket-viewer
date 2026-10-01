// Set-score parsing: the numbered-field fallback still works, and a payload with both a Sets
// array and numbered fields counts each set once.
const fs = require('fs'); const { JSDOM } = require('jsdom');
const src = fs.readFileSync(__dirname + '/smoke.test.cjs', 'utf8');
eval(src.slice(src.indexOf('const club ='), src.indexOf('let data = fixtures();')) + '; global.fixtures = fixtures;');
const script = fs.readFileSync(require('path').join(__dirname, '..', 'dist', 'aes-bracket-viewer.user.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function statsFor(mutate) {
  const data = fixtures();
  mutate(data['/poolsheet/101'].Matches[0]);   // SF Elite B 18 Gold beat Bay Spikers 25-20, 25-18
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://results.advancedeventsystems.com/event/TESTKEY/home', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window; const errors = [];
  w.console.error = (...a) => errors.push(a.join(' ')); w.matchMedia = () => ({ matches: false }); w.Element.prototype.scrollTo = () => {};
  w.localStorage.setItem('aes/favorite/teams/TESTKEY', JSON.stringify({ TeamIds: [1] }));
  w.fetch = async u => { const p = String(u).replace('/api/event/TESTKEY', ''); return p in data ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(data[p])) } : { ok: false, status: 404, json: async () => null }; };
  w.eval(script);
  w.document.getElementById('aes-bracket-viewer-button').click();
  await sleep(300);
  w.document.querySelector('#aes-bracket-viewer [data-view="stats"]').click();
  const cards = [...w.document.querySelectorAll('#aes-bracket-viewer [data-canvas="stats"] .abv-stat')].map(c => `${c.querySelector('span').textContent}=${c.querySelector('b').textContent}`);
  const row = [...w.document.querySelectorAll('#aes-bracket-viewer [data-canvas="stats"] tbody tr')].map(tr => tr.textContent.replace(/\s+/g, ' ')).find(t => /Bay Spikers/.test(t)) || '';
  w.close();
  return { cards, row, errors };
}

(async () => {
  const results = [];
  const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== '' ? `  [${got}]` : ''}`); };
  const numbered = await statsFor(m => {
    delete m.Sets;
    Object.assign(m, { FirstTeamSet1Score: 25, SecondTeamSet1Score: 20, FirstTeamSet2Score: 25, SecondTeamSet2Score: 18 });
  });
  check('numbered set fields still parse (sets 2-0, 25-20, 25-18)', numbered.cards.includes('Set record=2-0') && /25-20, 25-18/.test(numbered.row), `${numbered.cards.slice(0, 3).join(' ')} | ${numbered.row.slice(0, 90)}`);
  const both = await statsFor(m => {
    Object.assign(m, { FirstTeamSet1Score: 25, SecondTeamSet1Score: 20, FirstTeamSet2Score: 25, SecondTeamSet2Score: 18 });
  });
  check('Sets array plus numbered fields counts each set once (2-0, not 4-0)', both.cards.includes('Set record=2-0'), both.cards.slice(0, 3).join(' '));
  check('no runtime errors', numbered.errors.length === 0 && both.errors.length === 0, [...numbered.errors, ...both.errors].slice(0, 2).join(' | '));
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
