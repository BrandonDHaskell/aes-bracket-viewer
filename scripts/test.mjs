// Runs every test suite against dist/aes-bracket-viewer.user.js (run `npm run build` first).
// Replay suites need a real AES capture: tests/fixtures/capture.json, or AES_CAPTURE=path.
// They are skipped, with a notice, when no capture is present.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const capture = process.env.AES_CAPTURE || 'tests/fixtures/capture.json';
const suites = [
    ['tests/smoke.test.cjs'],
    ['tests/extra.test.cjs'],
    ['tests/refresh.test.cjs'],
    ['tests/favorites.test.cjs'],
    ['tests/sets.test.cjs'],
    ...['phase1', 'phase2', 'phase3', 'phase4', 'header', 'cache', 'progressive', 'trace', 'shell', 'diagnostics'].map(name => [`tests/${name}.replay.test.cjs`, capture, 'replay'])
];
let failed = 0;
for (const [file, arg, kind] of suites) {
    if (kind === 'replay' && !existsSync(capture)) {
        console.log(`SKIP  ${file} (no capture at ${capture})`);
        continue;
    }
    const run = spawnSync(process.execPath, arg ? [file, arg] : [file], {
        encoding: 'utf8',
        env: { ...process.env, TZ: 'America/Los_Angeles' },
        timeout: 300000
    });
    const summary = (run.stdout.match(/^\d+\/\d+ passed.*$/m) || [`exit ${run.status}`])[0];
    const ok = run.status === 0;
    if (!ok) {
        failed += 1;
        process.stdout.write(run.stdout.split('\n').filter(line => line.startsWith('FAIL')).join('\n') + '\n' + (run.stderr || ''));
    }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${file}  ${summary}`);
}
process.exit(failed ? 1 : 0);
