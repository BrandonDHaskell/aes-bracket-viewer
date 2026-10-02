// First load shows the current weekend before earlier weekends finish downloading.
// Run with TZ=America/Los_Angeles (scripts/test.mjs does this).
const fs = require('fs');
const boot = require('./replay.cjs');
const capture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).data;
const now = new Date('2026-10-17T07:00:00-07:00').getTime();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Play date for every pool sheet, so earlier-weekend downloads can be slowed down.
const dateOf = new Map();
for (const [date, plays] of Object.entries(capture.playsByDate)) for (const play of plays || []) dateOf.set(String(play.PlayId), date);
const earlier = Object.keys(capture.poolSheets).filter(id => dateOf.get(id) < '2026-10-17').length;

(async () => {
  const results = [];
  const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== '' ? `  [${got}]` : ''}`); };
  let gate;
  const released = new Promise(resolve => { gate = resolve; });
  const notes = [];
  const fetched = [];
  const onFetch = async path => {
    fetched.push(path);
    const id = path.match(/^\/poolsheet\/(-?\d+)$/)?.[1];
    if (id && dateOf.get(id) < '2026-10-17') await released;   // hold earlier weekends
  };
  const setup = w => {
    w.Notification = function (title, options) { notes.push(`${title}: ${options.body}`); };
    w.Notification.permission = 'granted';
  };
  const { w, doc, errors } = await boot({ now, onFetch, setup, wait: false, prefs: { notify: true } });
  const q = s => doc.querySelector('#aes-bracket-viewer ' + s);
  const status = () => q('[data-role="status-text"]').textContent;
  for (let i = 0; i < 100 && !/earlier pools/.test(status()); i++) await sleep(20);

  check(`current weekend shows while ${earlier} earlier pools load`, new RegExp(`loading ${earlier} earlier pools`).test(status()), status().slice(0, 140));
  q('[data-view="journey"]').click();
  const items = doc.querySelectorAll('#aes-bracket-viewer .abv-tl-item').length;
  check('Match Day is ready: 5 items on Oct 17', items === 5 && /Sat, Oct 17/.test(q('[data-canvas="journey"]').textContent), items);
  q('[data-view="stats"]').click();
  check('Stats says earlier weekends are still loading', /Earlier weekends are still loading/.test(q('[data-canvas="stats"]').textContent));
  q('[data-view="performance"]').click();
  check('Outlook is already available', /Win all 3 remaining pool matches to clinch Bronze A/.test(q('[data-canvas="performance"]').textContent));

  gate();
  for (let i = 0; i < 200 && /earlier pools/.test(status()); i++) await sleep(20);
  check('background fill-in completes', !/earlier pools/.test(status()), status().slice(0, 100));
  q('[data-view="stats"]').click();
  const stats = [...doc.querySelectorAll('#aes-bracket-viewer [data-canvas="stats"] .abv-stat b')].slice(0, 3).map(b => b.textContent).join(' / ');
  check('full stats after fill-in: 2-8 / 5-18 / 0.789', stats === '2-8 / 5-18 / 0.789' && !/still loading/.test(q('[data-canvas="stats"]').textContent), stats);
  check('fill-in sends no notifications', notes.length === 0, notes.join(' | '));
  q('[data-action="toggle-diagnostics"]').click();
  check('no stray routes from pools that were still loading', /Unresolved references\s*0(?!\d)/.test(q('[data-role="diagnostics"]').textContent));
  check('no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  w.close();

  // A division switch during the background phase starts a new load instead of being ignored.
  let release2;
  const held = new Promise(resolve => { release2 = resolve; });
  const fetched2 = [];
  const run2 = await boot({ now, wait: false, onFetch: async path => { fetched2.push(path); const id = path.match(/^\/poolsheet\/(-?\d+)$/)?.[1]; if (id && dateOf.get(id) < '2026-10-17') await held; } });
  const q2 = s => run2.doc.querySelector('#aes-bracket-viewer ' + s);
  for (let i = 0; i < 100 && !/earlier pools/.test(q2('[data-role="status-text"]').textContent); i++) await sleep(20);
  const division = q2('[data-action="division"]');
  division.value = '221873';
  division.dispatchEvent(new run2.w.Event('change', { bubbles: true }));
  await sleep(100);
  release2();
  await sleep(200);
  check('division switch mid-load starts loading 16 Boys', fetched2.includes('/division/221873/playdays'), fetched2.filter(p => /221873/.test(p)).join(', '));
  check('the abandoned 18 Boys load does not overwrite it', !/18 Boys/.test(q2('[data-role="status-text"]').textContent), q2('[data-role="status-text"]').textContent.slice(0, 100));
  run2.w.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
