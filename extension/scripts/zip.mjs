import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const out = fileURLToPath(new URL('../bettracker.zip', import.meta.url));

const entries = readdirSync(dist);
if (!entries.includes('manifest.json')) {
  throw new Error('dist/manifest.json missing — run `pnpm package` first');
}

rmSync(out, { force: true });
// bsdtar picks the zip format from the extension; GNU tar (git bash) cannot,
// so on Windows address the System32 copy directly instead of trusting PATH.
const tar =
  process.platform === 'win32' ? `${process.env.SystemRoot}\\System32\\tar.exe` : 'tar';
execFileSync(tar, ['-a', '-c', '-f', out, ...entries], { cwd: dist, stdio: 'inherit' });
console.log(`[zip] extension/bettracker.zip (${entries.length} top-level entries)`);
