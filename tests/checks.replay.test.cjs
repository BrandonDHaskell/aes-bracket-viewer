// Adaptive update checks: backoff, caps by schedule context, resets, and failures.
// Uses a controllable clock: tests advance it past the next due check and wait for the
// scheduler's one-second tick. Run with TZ=America/Los_Angeles (scripts/test.mjs does this).
const boot = require('./replay.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const at = (day, h, m = 0) => new Date(`2026-10-${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-07:00`).getTime();
const MIN = 60000;

(async () => {
  const results = [];
  const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== '' ? `  [${got}]` : ''}`); };

  // Opens the viewer at a mocked time and returns helpers to advance that clock.
  async function open(base, { fail = false, prefs, hidden = false } = {}) {
    const counts = { timestamp: 0 };
    const flags = { fail, hidden };
    let table;
    const run = await boot({
      now: base, prefs,
      setup: w => { w.__ABV_TEST__ = {}; w.Notification = function () {}; w.Notification.permission = 'granted'; },
      mutate: routes => { table = routes; return routes; },
      onFetch: async path => { if (path === '/timestamp') { counts.timestamp += 1; if (flags.fail) throw new Error('offline'); } }
    });
    const { w, doc } = run;
    const hook = w.__ABV_TEST__;
    let offset = 0;
    const Real = w.Date;
    w.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [base + offset])); } static now() { return base + offset; } };
    Object.defineProperty(doc, 'hidden', { configurable: true, get: () => flags.hidden });
    const S = hook.state;
    const clock = () => base + offset;
    // Move the clock past the next due check and wait for that check to finish and reschedule.
    const step = async () => {
      for (let i = 0; i < 200 && !Number.isFinite(S.nextCheckAt); i++) await sleep(20);
      const before = counts.timestamp;
      offset += Math.max(0, S.nextCheckAt - clock()) + 500;
      for (let i = 0; i < 600 && !(counts.timestamp > before && S.nextCheckAt > clock() && !S.loading); i++) await sleep(25);
      return S.checkIntervalMs;
    };
    return { ...run, hook, S, counts, flags, table: () => table, step, clock, advance: ms => { offset += ms; }, q: s => doc.querySelector('#aes-bracket-viewer ' + s) };
  }
  const details = async t => {
    if (t.q('[data-role="diagnostics"]').hidden) t.q('[data-role="status-chip"]').click();
    await sleep(30);
    const rows = Object.fromEntries([...t.q('[data-role="diag-body"]').querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]));
    return rows['Update checks'] || '';
  };

  // A. The pure function, on the loaded schedule (first match Oct 17 8:00, no results posted).
  let t = await open(at(17, 7, 30));
  const model = interval => ({ nodes: t.S.nodes, checkIntervalMs: interval });
  const d = (when, interval, random = () => 0.5) => t.hook.nextCheckDelay(model(interval), when, random);
  check('window: capped at 3 min even from a 60 min interval', d(at(17, 7, 30), 60 * MIN).intervalMs === 3 * MIN && d(at(17, 7, 30), 60 * MIN).reason === 'window');
  check('overdue results: capped at 2 min', d(at(17, 12), 60 * MIN).intervalMs === 2 * MIN && d(at(17, 12), 60 * MIN).reason === 'overdue');
  check('idle (no matches today): capped at 60 min', d(at(16, 12), 24 * 60 * MIN).intervalMs === 60 * MIN && d(at(16, 12), 24 * 60 * MIN).reason === 'idle');
  check('idle again once the window has closed (10 PM on Oct 17)', d(at(17, 22), 60 * MIN).reason === 'idle' && d(at(17, 22), 60 * MIN).intervalMs === 60 * MIN);
  check('interval never drops below 60 s', d(at(16, 12), 5000).intervalMs === MIN);
  check('jitter spans +/-10%', d(at(17, 7, 30), 3 * MIN, () => 0).delayMs === 162000 && d(at(17, 7, 30), 3 * MIN, () => 1).delayMs === 198000 && d(at(17, 7, 30), 3 * MIN, () => 0.5).delayMs === 180000);
  check('never sleeps through the start of the match window', d(at(17, 6, 30), 60 * MIN).delayMs === 30 * MIN, d(at(17, 6, 30), 60 * MIN).delayMs);
  check('schedule is known 1 h before the first match (7:00 starts the window)', d(at(17, 6, 59), 60 * MIN).reason === 'idle' && d(at(17, 7, 1), 60 * MIN).reason === 'window');
  check('chip shows the next check', /^Last checked: \d+s ago · next in \d+[smh]/.test(t.q('[data-role="status-chip"]').textContent), t.q('[data-role="status-chip"]').textContent);
  check('Details: match window with the current interval', /^every \d+m? ?\d*s? \(match window\), next in/.test(await details(t)), await details(t));

  // B. Match window on Oct 17: backs off but holds at 3 min.
  const window3 = [await t.step(), await t.step(), await t.step(), await t.step()];
  check('match window: 2 min, then 3 min and holds', window3.join() === [2 * MIN, 3 * MIN, 3 * MIN, 3 * MIN].join(), window3.map(x => x / MIN).join(', '));
  t.w.close();

  // C. Results overdue (12:00, nothing posted): holds at 2 min.
  t = await open(at(17, 12));
  const overdue = [await t.step(), await t.step(), await t.step()];
  check('overdue results: 2 min and holds', overdue.join() === [2 * MIN, 2 * MIN, 2 * MIN].join(), overdue.map(x => x / MIN).join(', '));
  check('Details: results overdue', /\(results overdue\)/.test(await details(t)), await details(t));
  t.w.close();

  // D. Idle: doubles to 60 min and stops there. A timestamp change resets to 60 s. Refresh resets.
  t = await open(at(16, 12));
  const idle = [];
  for (let i = 0; i < 7; i++) idle.push(await t.step());
  check('idle: 2, 4, 8, 16, 32, 60 min, then holds', idle.join() === [2, 4, 8, 16, 32, 60, 60].map(x => x * MIN).join(), idle.map(x => x / MIN).join(', '));
  check('Details: idle since the last AES change', /\(idle since 2026-09-27\)/.test(await details(t)), await details(t));
  t.table()['/timestamp'] = { LastUpdatedTimestamp: '2026-10-16T18:00:00.0000000Z' };
  await t.step();
  for (let i = 0; i < 400 && !(t.S.checkIntervalMs === MIN && !t.S.loading); i++) await sleep(25);
  check('a timestamp change reloads and resets the interval to 60 s', t.S.checkIntervalMs === MIN && t.S.lastUpdatedTimestamp === '2026-10-16T18:00:00.0000000Z', `${t.S.checkIntervalMs / MIN} min`);
  await t.step(); await t.step();
  const beforeRefresh = t.S.checkIntervalMs;
  t.q('[data-action="refresh"]').click();
  for (let i = 0; i < 400 && !(t.S.checkIntervalMs === MIN && !t.S.loading); i++) await sleep(25);
  check('Refresh resets the interval to 60 s', beforeRefresh > MIN && t.S.checkIntervalMs === MIN, `${beforeRefresh / MIN} -> ${t.S.checkIntervalMs / MIN} min`);

  // E. Tab visibility: no checks while hidden (notifications off); returning checks immediately.
  await t.step(); await t.step();
  t.flags.hidden = true;
  t.advance(3 * 60 * MIN);
  const hiddenBefore = t.counts.timestamp;
  await sleep(1500);
  check('hidden tab with notifications off does not check', t.counts.timestamp === hiddenBefore);
  t.flags.hidden = false;
  t.doc.dispatchEvent(new t.w.Event('visibilitychange'));
  await sleep(300);
  check('returning to the tab checks immediately', t.counts.timestamp === hiddenBefore + 1, `${t.counts.timestamp - hiddenBefore} checks`);
  check('returning to the tab restarts at the base interval', t.S.checkIntervalMs <= 2 * MIN, `${t.S.checkIntervalMs / MIN} min`);
  t.w.close();

  // F. Failed checks back off with the same caps.
  t = await open(at(16, 12));
  t.flags.fail = true;
  const failed = [await t.step(), await t.step(), await t.step()];
  check('failures double the interval (idle: 2, 4, 8 min)', failed.join() === [2, 4, 8].map(x => x * MIN).join(), failed.map(x => x / MIN).join(', '));
  t.w.close();
  t = await open(at(17, 7, 30));
  t.flags.fail = true;
  const failedWindow = [await t.step(), await t.step(), await t.step()];
  check('failures hold at the match-window cap', failedWindow.join() === [2 * MIN, 3 * MIN, 3 * MIN].join(), failedWindow.map(x => x / MIN).join(', '));
  t.w.close();

  // G. Notifications on: background checks follow the same schedule while the tab is hidden.
  t = await open(at(17, 7, 30), { prefs: { notify: true } });
  t.flags.hidden = true;
  const bgBefore = t.counts.timestamp;
  const bg = [await t.step(), await t.step()];
  check('background checks (notifications on) use the adaptive schedule', t.counts.timestamp >= bgBefore + 2 && bg.join() === [2 * MIN, 3 * MIN].join(), bg.map(x => x / MIN).join(', '));
  check('no runtime errors', t.errors.length === 0, t.errors.slice(0, 2).join(' | '));
  t.w.close();

  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
