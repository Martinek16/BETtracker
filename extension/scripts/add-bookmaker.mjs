/**
 * The whole of adding a bookmaker, from one terminal: `pnpm add-bookmaker <url>`.
 *
 * Every step here existed already. What did not exist was an order to do them
 * in, and that is what people got lost in: the doc asked for a folder the
 * browser does not offer to save into, then for a command in a terminal they
 * had closed, then for a prompt to be pasted somewhere else. Three context
 * switches, none of them the actual work.
 *
 * So this opens the folder, waits for the file to land in it - wherever the
 * browser actually put it - cleans it, and hands the result to the assistant
 * without anybody typing a path. The contributor's side is: sign in, click
 * through their history, press save.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { coverage, findRecording, tooThin } from './sanitize-har.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HAR_DIR = join(ROOT, 'har');

/** Poll rather than ask for a keypress: the file landing IS the confirmation. */
const POLL_MS = 2000;
const GIVE_UP_MS = 45 * 60 * 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Labels that name a section of a site rather than the site. A contributor
 * copies the address out of the browser, where they are signed in and three
 * pages deep, so `sports.bet365.com` is the normal input and `sports` is the
 * wrong name for a bookmaker, a folder and an id.
 */
const GENERIC_LABEL =
  /^(www\d?|m|mobile|app|apps|web|secure|live|sports?|betting|my|en|account|members?)$/i;

/**
 * A host is turned into the id the whole project keys off. Validated rather
 * than trusted: it ends up in a folder name and in a command line below.
 */
export const parseSite = (input) => {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  const host = url.hostname.replace(/^www\./i, '');
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host)) throw new Error(`not a site: ${input}`);
  const labels = host.split('.');
  const brand = labels.slice(0, -1).find((label) => !GENERIC_LABEL.test(label)) ?? labels[0];
  return withId(host, brand);
};

const withId = (host, brand) => {
  const id = brand.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { host, id, name: id.charAt(0).toUpperCase() + id.slice(1) };
};

const ask = async (question) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
};

/**
 * The id is shown before anything is named after it. Guessing it from the host
 * is right often enough to offer, and wrong often enough that a contributor who
 * finds out later has a folder, a JSON id and a storage key to rename.
 */
const confirmId = async (site) => {
  const answer = await ask(`Folder and id for this bookmaker [${site.id}]: `);
  return answer === '' ? site : withId(site.host, answer);
};

/**
 * The site has to come from the contributor, and there is no sensible default:
 * an example address left in place would name the folder, the id and the whole
 * bookmaker folder after somebody else's site. So ask until it parses, rather
 * than exiting with a usage line that reads as a failure.
 */
const askForSite = async () => {
  for (;;) {
    const answer = await ask('Which bookmaker are you adding? Its address: ');
    if (answer === '') continue;
    try {
      return parseSite(answer);
    } catch {
      console.log('  That is not a site address. Something like www.yourbookmaker.com.');
    }
  }
};

/** Show the folder, because "save it into har/" is not something a browser offers. */
const openFolder = (folder) => {
  const opener =
    process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  // explorer exits 1 even when it worked, so the result is deliberately ignored.
  spawnSync(opener, [folder], { stdio: 'ignore', shell: process.platform === 'win32' });
};

/**
 * The newest recording saved since we started looking, from the site's folder
 * or from wherever the browser defaulted to. Older files are ignored on
 * purpose: a recording from last week's site would otherwise be picked up and
 * silently parsed as this one.
 */
const waitForRecording = async (id, since) => {
  const until = Date.now() + GIVE_UP_MS;
  while (Date.now() < until) {
    // The site's own folder first, then everywhere a browser saves. Both, and
    // not just the first: this command creates `har/<id>/`, and `findRecording`
    // stops at a folder that exists - so on its own it would never look in
    // Downloads, which is exactly where most browsers put the file.
    const found = findRecording(id) ?? findRecording();
    if (found !== undefined && statSync(found).mtimeMs >= since) return found;
    await wait(POLL_MS);
  }
  return undefined;
};

const run = (args) =>
  spawnSync(process.execPath, args, { stdio: 'inherit', cwd: ROOT }).status === 0;

/** The calls that survived cleaning, which is what the coverage check reads. */
const readEntries = (path) => JSON.parse(readFileSync(path, 'utf8')).log?.entries ?? [];

/** What the contributor does while this waits. Their whole side of the step. */
export const instructions = ({ folder, host, name }) => `
Adding ${name} (${host}).

A folder has just opened: ${folder}
That is where the recording goes.

  1. Sign in to ${host} in your browser, as you normally do.
  2. Start recording. If BETtracker is installed in that browser, click its
     icon in the toolbar and press "Record this site" - no DevTools at all.
     Otherwise press F12, go to the Network tab and tick Preserve log.
  3. Open every one of these, and wait for each to finish before the next.
     A page you do not open cannot be read later, and an empty one still
     counts - it shows where the site would have put the figures.

       - your settled bets, paging back to the oldest bet you have
       - your open bets
       - your balance
       - deposits and withdrawals
       - bonuses and free bets

  4. Save it. From the extension: its icon again, then "Save recording".
     From DevTools: right-click the request list and export the log, taking
     the export WITH sensitive data if your browser offers both - the
     sanitised one has the sign-in headers already stripped, which are the
     part an adapter is written against.
     Either file can land in the folder above or in Downloads; this finds it
     either way.

Waiting for the file. Leave this window open; it carries on by itself.
The moment it lands, this says what the recording holds and what it lacks.
`;

/** What the assistant is told, in a file it can read rather than an argument. */
export const promptFor = ({ host, id, name }, clean) =>
  [
    `# Add ${name} to BETtracker`,
    '',
    `Add the bookmaker https://${host} to BETtracker.`,
    '',
    `The sanitised recording is at \`${clean}\`.`,
    '',
    'Read `AGENTS.md` and follow it - it is beside this file at the top of the',
    'checkout, and at https://github.com/Martinek16/BETtracker/blob/main/AGENTS.md',
    'if you are reading this pasted somewhere else. Work out the hosts, the',
    'authentication, the fingerprint, the endpoints, the paging and the shape of',
    'a bet from that recording, then run',
    `\`pnpm new-bookmaker ${id} ${host} "${name}"\`, write the folder,`,
    'then run `pnpm check` until it is green.',
    '',
    'Ask me for whatever you cannot get yourself.',
    '',
  ].join('\n');

/**
 * One short argument with no newlines in it. The prompt itself used to be the
 * argument, and a shell took it apart on the spaces: the assistant was started
 * on six words of it and never saw which file to read.
 */
export const assistantCommand = (id) => `claude "Follow har/${id}/PROMPT.md"`;

const main = async () => {
  const [input] = process.argv.slice(2);
  const { host, id, name } = await confirmId(
    input === undefined ? await askForSite() : parseSite(input),
  );
  const folder = join(HAR_DIR, id);
  mkdirSync(folder, { recursive: true });

  // Asked before the waiting starts, because it is a question about the
  // contributor and not about the recording. What the key names give away is
  // redacted without it; a site that answers `{"r4":"MIHA MARTINEK"}` gives away
  // nothing, and no shape tells a name from a team.
  const personal = await ask(
    '\nYour name, your username there and your account number, as that site\n' +
      'writes them, separated by commas. They are cut out of the recording, and\n' +
      'they are the part no tool can recognise on its own.\n' +
      'Enter to skip: ',
  );

  // A recording made before this command was started is the likeliest case of
  // all - the doc used to ask for one - and waiting three quarters of an hour
  // for it to be saved again is not a sane answer to it. Downloads is looked in
  // as well: `har/<id>/` was created a line ago, so narrowing to it finds an
  // empty folder and nothing else, which is how a browser's own save location
  // came to be ignored.
  const already = findRecording(id) ?? findRecording();
  let found = already;
  if (already !== undefined) {
    const answer = await ask(`Use the recording already saved, ${already}? [Y/n] `);
    if (/^n/i.test(answer)) found = undefined;
  }

  // Looped rather than run once: the sanitiser now says whether the recording
  // holds enough to write a folder from, and the answer to "it does not" is
  // another recording. Finding that out an hour later, from a parser that had
  // nothing to parse, is the failure this command exists to prevent.
  let clean;
  for (;;) {
    if (found === undefined) {
      const since = Date.now();
      openFolder(folder);
      console.log(instructions({ folder, host, name }));
      found = await waitForRecording(id, since);
    }

    if (found === undefined) {
      console.error('No recording appeared. Run the command again when you have saved one.');
      process.exit(1);
    }

    // Into the site's own folder, so the raw file and the clean one stay
    // together and the next contributor is not left guessing which site
    // Downloads held.
    let recording = found;
    if (dirname(found) !== folder) {
      recording = join(folder, basename(found));
      copyFileSync(found, recording);
      console.log(
        `copied ${basename(found)} into har/${id}/\n` +
          `  The original is still where your browser saved it. It holds your live\n` +
          `  session, so delete it once this is done.`,
      );
    }

    console.log('\nCleaning it.\n');
    const args = [join(ROOT, 'extension/scripts/sanitize-har.mjs'), recording];
    if (personal !== '') args.push(`--me=${personal}`);
    if (!run(args)) {
      console.error('\nsanitize-har failed. Nothing was shared; fix that before going on.');
      process.exit(1);
    }

    clean = `har/${id}/${basename(recording, '.har')}.sanitized.har`;
    if (!tooThin(coverage(readEntries(join(ROOT, clean))))) break;

    // Offered rather than enforced: a site can genuinely answer everything from
    // two endpoints, and the contributor is the one who knows whether they
    // opened every page.
    const answer = await ask('\nRecord it again? I will wait for the new file. [Y/n] ');
    if (/^n/i.test(answer)) break;
    found = undefined;
  }

  // The instructions go in a file rather than on the command line. A prompt is
  // eight lines with quotes in it, a shell is not asked to carry that, and a
  // contributor whose assistant is not `claude` opens the file instead.
  const promptFile = join(folder, 'PROMPT.md');
  writeFileSync(promptFile, promptFor({ host, id, name }, clean));

  console.log(`\nWrote the instructions to har/${id}/PROMPT.md. Starting the assistant on it.\n`);
  const claude = spawnSync(assistantCommand(id), { stdio: 'inherit', shell: true, cwd: ROOT });
  if (claude.error !== undefined || claude.status !== 0) {
    console.log(
      `\nThe assistant did not finish here. Nothing is lost: the instructions are in\n` +
        `  ${promptFile}\n` +
        `Open your own assistant in this folder - Claude Code, Cursor, anything that\n` +
        `can read the repository - and give it that file. Or do it by hand:\n` +
        `docs/ADD_A_BOOKMAKER.md, from step 3.`,
    );
  }

  console.log(
    `\nWhen the folder is written: pnpm check, then pnpm build, load extension/dist\n` +
      `at chrome://extensions and go through step 6 of docs/ADD_A_BOOKMAKER.md.`,
  );
};

if (process.argv[1]?.endsWith('add-bookmaker.mjs')) main();
