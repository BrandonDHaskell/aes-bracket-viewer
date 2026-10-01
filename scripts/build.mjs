// Builds dist/aes-bracket-viewer.user.js (the installable script) and
// dist/aes-bracket-viewer.meta.js (header only, which userscript managers poll for updates).
//
// The version comes from package.json. The update URLs point at this repository's GitHub
// Releases "latest" assets, so every install updates to the newest published release.
// In GitHub Actions the repository is detected automatically; locally it comes from
// package.json "userscript.repository" or the GITHUB_REPOSITORY environment variable.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const repository = process.env.GITHUB_REPOSITORY || pkg.userscript?.repository || '';
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    console.error('Set package.json "userscript.repository" to "owner/repo" (or GITHUB_REPOSITORY).');
    process.exit(1);
}
if (repository.startsWith('YOUR-')) console.warn(`Warning: building with placeholder repository "${repository}".`);

const home = `https://github.com/${repository}`;
const latest = name => `${home}/releases/latest/download/${name}`;
const tokens = {
    VERSION: pkg.version,
    HOMEPAGE_URL: home,
    SUPPORT_URL: `${home}/issues`,
    UPDATE_URL: latest('aes-bracket-viewer.meta.js'),
    DOWNLOAD_URL: latest('aes-bracket-viewer.user.js')
};
let header = readFileSync('src/00-header.js', 'utf8');
for (const [key, value] of Object.entries(tokens)) header = header.replaceAll(`{{${key}}}`, value);
const leftover = header.match(/\{\{\w+\}\}/);
if (leftover) {
    console.error(`Unreplaced header token ${leftover[0]}`);
    process.exit(1);
}

const sections = readdirSync('src').filter(name => name.endsWith('.js') && name !== '00-header.js').sort();
const body = sections.map(name => readFileSync(`src/${name}`, 'utf8')).join('');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/aes-bracket-viewer.user.js', header + body);
writeFileSync('dist/aes-bracket-viewer.meta.js', header);
execFileSync(process.execPath, ['--check', 'dist/aes-bracket-viewer.user.js'], { stdio: 'inherit' });
console.log(`Built v${pkg.version} for ${repository} from ${sections.length} sections.`);
