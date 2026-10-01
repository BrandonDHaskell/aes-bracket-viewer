// Saved copies of finished pools: a second visit reuses them instead of downloading again.
// Run with TZ=America/Los_Angeles (scripts/test.mjs does this).
const { IDBFactory } = require('fake-indexeddb');
const boot = require('./replay.cjs');
const now = new Date('2026-10-17T07:00:00-07:00').getTime();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function countSaved(profile) {
  return new Promise(resolve => {
    const request = profile.open('aes-bracket-viewer');
    request.onsuccess = () => {
      const db = request.result;
      const count = db.transaction('poolSheets', 'readonly').objectStore('poolSheets').count();
      count.onsuccess = () => { resolve(count.result); db.close(); };
    };
  });
}

(async () => {
  const results = [];
  const check = (name, ok, got = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${got !== '' ? `  [${got}]` : ''}`); };
  const profile = new IDBFactory();
  let downloads = 0;
  const onFetch = async path => { if (path.startsWith('/poolsheet/')) downloads += 1; };
  const summary = doc => {
    const q = s => doc.querySelector('#aes-bracket-viewer ' + s);
    q('[data-view="stats"]').click();
    const stats = [...doc.querySelectorAll('#aes-bracket-viewer [data-canvas="stats"] .abv-stat b')].slice(0, 3).map(b => b.textContent).join(' / ');
    q('[data-view="performance"]').click();
    return `${stats} | ${q('[data-canvas="performance"] .abv-scenario-summary')?.textContent || ''}`;
  };

  // First visit: everything is downloaded; finished earlier pools are saved.
  let { w, doc, errors } = await boot({ now, indexedDB: profile, onFetch });
  const first = summary(doc);
  check('first visit downloads all 165 pool sheets', downloads === 165, downloads);
  await sleep(300);
  const saved = await countSaved(profile);
  check('saves only finished pools from earlier days (103)', saved === 103, saved);
  check('no errors on first visit', errors.length === 0, errors.slice(0, 2).join(' | '));
  w.close();

  // Second visit, same browser: saved copies replace 103 downloads.
  downloads = 0;
  ({ w, doc, errors } = await boot({ now, indexedDB: profile, onFetch }));
  check('second visit downloads only 62 pool sheets', downloads === 62, downloads);
  const second = summary(doc);
  check('same stats and outlook as the first visit', second === first, second.slice(0, 120));
  doc.querySelector('#aes-bracket-viewer [data-action="toggle-diagnostics"]').click();
  const diag = doc.querySelector('#aes-bracket-viewer [data-role="diagnostics"]').textContent;
  check('Details shows 103 from saved copies', /165 loaded: 103 from saved copies/.test(diag), (diag.match(/Pool sheets[^A-Z]*/) || [''])[0]);

  // Refresh ignores saved copies and downloads everything.
  downloads = 0;
  doc.querySelector('#aes-bracket-viewer [data-action="refresh"]').click();
  for (let i = 0; i < 100 && downloads < 165; i++) await sleep(20);
  await sleep(100);
  check('Refresh downloads every pool sheet again', downloads === 165, downloads);
  check('no errors on second visit', errors.length === 0, errors.slice(0, 2).join(' | '));
  w.close();

  // Browsers without IndexedDB still work (download everything).
  downloads = 0;
  ({ w, doc, errors } = await boot({ now, onFetch }));
  check('without IndexedDB: downloads everything, no errors', downloads === 165 && errors.length === 0, downloads);
  w.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
