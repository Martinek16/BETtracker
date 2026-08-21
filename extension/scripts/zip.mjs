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

// Both, not only the one being written: the other is last week's build, it sits
// beside this one under a name that says nothing about its age, and loading it
// is how you end up testing a bookmaker that was removed two commits ago.
for (const stale of ['bettracker.zip', 'bettracker-store.zip']) {
  rmSync(fileURLToPath(new URL(`../${stale}`, import.meta.url)), { force: true });
}
// bsdtar picks the zip format from the extension; GNU tar (git bash) cannot,
// so on Windows address the System32 copy directly instead of trusting PATH.
const tar = process.platform === 'win32' ? `${process.env.SystemRoot}\\System32\\tar.exe` : 'tar';
execFileSync(tar, ['-a', '-c', '-f', out, ...entries], { cwd: dist, stdio: 'inherit' });
console.log(`[zip] extension/${name} (${entries.length} top-level entries)`);
