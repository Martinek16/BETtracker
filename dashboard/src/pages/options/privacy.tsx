import type { ReactNode } from 'react';
import { Crumbs, Section } from '@/pages/options/parts';

/** One paragraph of the policy, in the same measure the About page reads at. */
const Prose = ({ children }: { children: string }): JSX.Element => (
  <p className="border-b border-border/60 py-2 text-sm leading-relaxed text-muted-foreground last:border-0">
    {children}
  </p>
);

/** A named fact: what it is called, then what it means. */
const Point = ({ term, children }: { term: string; children: string }): JSX.Element => (
  <div className="border-b border-border/60 py-2 last:border-0">
    <p className="text-sm font-medium text-foreground">{term}</p>
    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{children}</p>
  </div>
);

/**
 * The points of a wide section, side by side instead of one long list. The
 * dividers are dropped here: a line under a point in the left column with
 * nothing beside it on the right reads as a rule through the middle of the card.
 */
const Pair = ({ children }: { children: ReactNode }): JSX.Element => (
  <div className="grid gap-x-8 py-1 sm:grid-cols-2 [&>div]:border-0 [&>div]:py-2">{children}</div>
);

/**
 * The whole policy, in short sections a reader can jump between. It is written
 * from what the code does rather than from a template: every claim here is one
 * that can be checked against the extension's permissions.
 *
 * Two columns of unequal width rather than a grid of equal cells: sections in a
 * grid line up in rows, and a row is as tall as its tallest cell, so every
 * shorter neighbour ends in dead space. Stacking each column on its own lets a
 * section end where its text ends, and the wide column carries whatever reads
 * badly at a third of the page.
 */
export const PrivacyPage = (): JSX.Element => (
  <div className="flex flex-1 flex-col gap-4 pb-4">
    <Crumbs to="/options/about" parent="About" title="Privacy" />

    <div className="grid items-start gap-4 lg:grid-cols-[1.85fr_1fr]">
      <div className="flex flex-col gap-4">
        <Section title="The short version">
          <Prose>
            BETtracker keeps your betting history in your own browser and sends it nowhere. No
            account, no server behind it, and nobody but you can read what it stores.
          </Prose>
          <Prose>
            There is no company collecting anything here. Whoever installed the extension is the
            only person with access to the data, because the data never leaves their machine.
          </Prose>
        </Section>

        <Section title="What is stored">
          <Pair>
            <Point term="Your bets">
              Date, sport, league, teams, your pick, the odds, the stake and how it finished.
            </Point>
            <Point term="Money in and out">
              Deposits and withdrawals, so your betting result can be told apart from your balance.
            </Point>
            <Point term="Bonuses">
              Bonuses your account was already granted, what is left of one, and when it runs out.
            </Point>
            <Point term="Casino rounds, at a site that records them">
              The game, when it resolved, the stake and what came back. A site that keeps no round
              history has none of this read.
            </Point>
            <Point term="Your balance">
              The figure shown on the site, and a note of it each time it changes, so the chart has
              something to draw.
            </Point>
            <Point term="Which account it belongs to">
              The account number or username the site itself reports, so two logins at one bookmaker
              stay apart.
            </Point>
            <Point term="An activity log">
              The last 500 lines of what the extension did - synced, paused, failed - so you can see
              why something is missing. Readable under Settings.
            </Point>
            <Point term="Your settings">
              Currency, theme, accounts you renamed or hid, and which messages you want.
            </Point>
          </Pair>
        </Section>

        <Section title="What leaves your computer">
          <Pair>
            <Point term="The bookmaker's own site">
              Requests carrying the session you are already signed in with - the same calls the site
              makes when you open your bet history. For bet-at-home those run through its own
              backends, sports-api.everymatrix.com and betathomecom.nwacdn.com.
            </Point>
            <Point term="A public exchange-rate feed">
              For an account in another currency: it sends a date and a currency code, nothing about
              you. Served by frankfurter.dev from European Central Bank rates.
            </Point>
            <Point term="A public crypto price feed">
              For a wallet held in coin: it sends the coin's symbol and a date range to Binance's
              public price list. No account, no wallet, no amount.
            </Point>
            <Point term="A live score feed">
              While a bet of yours is running, the bookmaker's public score feed is opened to show
              the score. It carries no sign-in and says nothing about your bet.
            </Point>
            <Point term="Nothing else, ever">
              No analytics, no crash reports, no telemetry, no ads. Your bets, your balance and your
              payments are sent to no one.
            </Point>
          </Pair>
        </Section>

        <Section title="Keeping it, or ending it">
          <Pair>
            <Point term="Until you delete it">
              Records stay until you remove them. Nothing expires.
            </Point>
            <Point term="Delete one bookmaker">
              Settings, the account, Forget. Its data goes, and the site is treated as never
              answered for again.
            </Point>
            <Point term="Delete everything">
              Settings, Your data, Delete. Clears every bet, payment and setting here - it cannot be
              undone.
            </Point>
            <Point term="Uninstalling">
              Removing the extension or clearing site data wipes the store with it.
            </Point>
            <Point term="Your backup file">
              Written to your computer and yours alone. It cannot be loaded back in.
            </Point>
          </Pair>
        </Section>

        {/* Two short sections that read as a pair anyway: what you granted, and
            what happens on an address the extension has never seen. */}
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Section title="Only when you say so">
            <Prose>
              Each bookmaker is asked about separately, and nothing is read or stored for a site
              until you answer yes. Saying no leaves that site untouched.
            </Prose>
            <Prose>
              Say yes and the extension reads that account on its own from then on: while you have
              the site open, and every ten minutes in the background.
            </Prose>
          </Section>

          <Section title="Sites you add yourself">
            <Prose>
              Bookmakers change the address of their site often. On one the extension does not
              recognise it asks first, and the browser asks you to grant that address separately.
            </Prose>
            <Prose>
              Nothing is read on an address you did not grant. Removing a site in Settings ends it.
            </Prose>
          </Section>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Section title="What is never stored">
          <Point term="Passwords and card details">
            It reads pages you are already signed in to - it never asks for a login, fills one in,
            or sees a payment detail.
          </Point>
          <Point term="Anything from a site that does not hand it over">
            Where a bookmaker records casino rounds one by one, those rounds are read too. Where it
            does not, nothing about the casino is stored and it shows up only as a smaller balance.
          </Point>
          <Point term="Anything about you as a person">
            No name, no email, no address, no device fingerprint, no advertising identifier.
          </Point>
          <Point term="Anything from other sites">
            The extension only runs on the bookmakers you switched on. It cannot see the rest of
            your browsing.
          </Point>
        </Section>

        <Section title="Your login session">
          <Prose>
            To read your history the extension needs the same sign-in the site is already using. It
            takes it from the requests the site itself makes - it never asks for a password, never
            fills a login form in, and never signs in on your behalf.
          </Prose>
          <Point term="Held in memory only">
            The session is kept for as long as the browser is running and is never written to disk.
            Closing the browser drops it.
          </Point>
          <Point term="Sent to one place">
            Back to the bookmaker it came from, and nowhere else.
          </Point>
        </Section>

        <Section title="Where it is kept">
          <Prose>
            In the browser profile you installed the extension in. Another browser, machine or
            profile starts empty.
          </Prose>
          <Prose>
            It is stored the way a browser stores any site's data: unencrypted, protected by your
            computer's own account. Anyone who can use your profile can read it, the same as your
            browsing history.
          </Prose>
        </Section>

        <Section title="What each permission is for">
          <Point term="The bookmakers you grant">
            To read your bets, payments and bonuses off pages you have open. Only the sites you
            answered yes to; the browser asks for each one.
          </Point>
          <Point term="Storage and alarms">
            To keep the records in this browser, and to look for new ones every ten minutes.
          </Point>
          <Point term="Scripting and the active tab">
            To run the reader inside the bookmaker's page you are on. It reads what the page already
            shows you and never types into it.
          </Point>
        </Section>

        <Section title="This policy">
          <Prose>
            Version 1.1.0, in force from August 2026. It is written from what the code does, and
            every claim in it can be checked against the permissions the extension asks for. What
            changed since 1.0.0: casino rounds are read at a site that records them one by one.
          </Prose>
          <Prose>
            Your data is never sold, never used for advertising, never used to train anything, and
            never handed to anyone. There is nothing to request access to or ask to be deleted,
            because nobody but you ever holds it - deleting it is the buttons under Settings.
          </Prose>
          <Prose>
            For adults only, and not for anyone under 18. If a later version ever collects more than
            this, the policy changes with it and the new version asks before it starts.
          </Prose>
          <Prose>Questions about any of this: info.m04studio@gmail.com.</Prose>
        </Section>
      </div>
    </div>
  </div>
);
