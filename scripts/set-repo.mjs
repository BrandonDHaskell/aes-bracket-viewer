// One-time setup: node scripts/set-repo.mjs <github-owner>/<repo>
// Points package.json and the README install links at your GitHub repository.
import { readFileSync, writeFileSync } from 'node:fs';

const repository = process.argv[2] || '';
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    console.error('Usage: node scripts/set-repo.mjs <github-owner>/<repo>');
    process.exit(1);
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const previous = pkg.userscript?.repository || 'YOUR-GITHUB-USERNAME/aes-bracket-viewer';
pkg.userscript = { ...pkg.userscript, repository };
pkg.repository = { type: 'git', url: `https://github.com/${repository}.git` };
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const readme = readFileSync('README.md', 'utf8');
const updated = readme.replaceAll(`github.com/${previous}`, `github.com/${repository}`).replaceAll(`github/v/release/${previous}`, `github/v/release/${repository}`);
writeFileSync('README.md', updated);
const changed = readme.split(previous).length - 1;
console.log(`Repository set to ${repository} (${changed} README link${changed === 1 ? '' : 's'} updated).`);
