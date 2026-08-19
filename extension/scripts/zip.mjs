import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

const entries = readdirSync(dist);
if (!entries.includes('manifest.json')) {
  throw new Error('dist/manifest.json missing - run `pnpm package` first');
}

// Named after what is in it rather than after the command that was run: the
// two builds differ only by one file, and a store upload that quietly carries
// a recorder - or a release download that quietly lacks one - looks identical
// from the outside.
const name = entries.includes('recorder.js') ? 'bettracker.zip' : 'bettracker-store.zip';
const out = fileURLToPath(new URL(`../${name}`, import.meta.url));

rmSync(out, { force: true });
// bsdtar picks the zip format from the extension; GNU tar (git bash) cannot,
// so on Windows address the System32 copy directly instead of trusting PATH.
const tar = process.platform === 'win32' ? `${process.env.SystemRoot}\\System32\\tar.exe` : 'tar';
execFileSync(tar, ['-a', '-c', '-f', out, ...entries], { cwd: dist, stdio: 'inherit' });
console.log(`[zip] extension/${name} (${entries.length} top-level entries)`);
