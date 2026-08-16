import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check as CheckIcon, Download, Trash2 } from 'lucide-react';
import {
  accountKey,
  formatOdds,
  type AccountRef,
  type BalanceLayout,
  type BalanceSource,
  type NumberFormat,
  type OddsFormat,
  type SymbolPosition,
} from '@betanal/shared';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { Toast, Toasts } from '@/components/layout/toasts';
import { SegmentedToggle, type SegmentedOption } from '@/components/dashboard/segmented-toggle';
import { periodLabel, RANGE_OPTIONS } from '@/components/dashboard/time-range-toggle';
import { useTheme, type Theme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useDashboard } from '@/context/dashboard-context';
import { findAccount, useAccountNames, useAllKnownAccounts } from '@/data/accounts';
import { clearAll, exportAll, type ExportBundle } from '@/data/source';
import { useSettings } from '@/data/use-settings';
import { Section } from '@/pages/options/parts';
import { formatDate, symbolOf } from '@/lib/utils';

const THEMES: readonly SegmentedOption<Theme>[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Auto' },
];

const THEME_HINTS: Record<Theme, string> = {
  dark: 'Always dark, whatever your computer is set to.',
  light: 'Always light, whatever your computer is set to.',
  system: 'Follows your computer: light by day, dark by night.',
};

const ODDS_FORMATS: readonly SegmentedOption<OddsFormat>[] = [
  { value: 'decimal', label: 'Decimal' },
  { value: 'fractional', label: 'Fraction' },
  { value: 'american', label: 'American' },
];

const NUMBER_FORMATS: readonly SegmentedOption<NumberFormat>[] = [
  { value: 'eu', label: '1.234,56' },
  { value: 'us', label: '1,234.56' },
];

const BALANCE_SOURCES: readonly SegmentedOption<BalanceSource>[] = [
  { value: 'live', label: 'Live' },
  { value: 'derived', label: 'Net' },
];

const BALANCE_SOURCE_HINTS: Record<BalanceSource, string> = {
  live: 'The money in your accounts right now, as the bookmaker shows it.',
  derived: 'Whether you are up or down: everything you took out, less everything you paid in.',
};

const BALANCE_LAYOUTS: readonly SegmentedOption<BalanceLayout>[] = [
  { value: 'total', label: 'One total' },
  { value: 'accounts', label: 'Per account' },
];

const BALANCE_LAYOUT_HINTS: Record<BalanceLayout, string> = {
  total: 'Every account added up into one figure.',
  accounts: 'One figure per bookmaker, side by side.',
};

const CURRENCIES: readonly { value: string; label: string }[] = [
  { value: 'EUR', label: 'Euro (€)' },
  { value: 'USD', label: 'US dollar ($)' },
  { value: 'GBP', label: 'Pound sterling (£)' },
];

/** Label plus one line of plain-language help, control right-aligned. */
const Setting = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}): JSX.Element => (
  <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-0">
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

/**
 * A heading switch over the rows it covers. It holds no setting of its own - it
 * only ever reflects its children, so silencing a whole subject is one tap
 * instead of hunting down every message it can send.
 */
const SettingGroup = ({
  label,
  hint,
  on,
  onToggle,
  children,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  children: ReactNode;
}): JSX.Element => (
  <div className="border-b border-border/60 py-3 last:border-0">
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={on} onCheckedChange={onToggle} />
    </div>
    {/* Only shown while the subject is on: the rows under a silenced heading
        change nothing, and reading them as live choices is misleading. */}
    {on ? <div className="pl-4">{children}</div> : null}
  </div>
);

const PreferencesSection = ({ notify }: { notify: Notify }): JSX.Element => {
  const { settings, patch } = useSettings();
  const currency = settings?.currency ?? 'EUR';
  const symbol = symbolOf(currency);
  const symbolPositions: readonly SegmentedOption<SymbolPosition>[] = [
    { value: 'before', label: `${symbol}10` },
    { value: 'after', label: `10 ${symbol}` },
  ];

  return (
    <Section title="Preferences" tour="settings-preferences">
      <Setting
        label="Timeline"
        hint={`Pages open on the ${periodLabel(settings?.defaultRange ?? '7d')}.`}
      >
        <SegmentedToggle
          className="text-xs"
          value={settings?.defaultRange ?? '7d'}
          options={RANGE_OPTIONS}
          onChange={(defaultRange) => void patch({ defaultRange })}
        />
      </Setting>
      <Setting
        label="Odds"
        hint={`A 1.85 price is written ${formatOdds(1.85, settings?.oddsFormat)}.`}
      >
        <SegmentedToggle
          className="text-xs"
          value={settings?.oddsFormat ?? 'decimal'}
          options={ODDS_FORMATS}
          onChange={(oddsFormat) => void patch({ oddsFormat })}
        />
      </Setting>
      <Setting
        label="Currency"
        hint={`Every amount is shown in ${
          CURRENCIES.find((option) => option.value === currency)?.label ?? currency
        }.`}
      >
        <Select
          value={currency}
          onValueChange={(next) => {
            void patch({ currency: next });
            notify(
              `Every amount is now shown in ${
                CURRENCIES.find((option) => option.value === next)?.label ?? next
              }.`,
            );
          }}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Setting>
      <Setting
        label="Currency symbol"
        hint={`Ten ${currency} reads ${
          settings?.symbolPosition === 'before' ? `${symbol}10` : `10 ${symbol}`
        }.`}
      >
        <SegmentedToggle
          className="text-xs"
          value={settings?.symbolPosition ?? 'after'}
          options={symbolPositions}
          onChange={(symbolPosition) => void patch({ symbolPosition })}
        />
      </Setting>
      <Setting
        label="Number format"
        hint={
          settings?.numberFormat === 'us'
            ? 'A comma between thousands, a dot before the cents.'
            : 'A dot between thousands, a comma before the cents.'
        }
      >
        <SegmentedToggle
          className="text-xs"
          value={settings?.numberFormat ?? 'eu'}
          options={NUMBER_FORMATS}
          onChange={(numberFormat) => void patch({ numberFormat })}
        />
      </Setting>
    </Section>
  );
};

const AppearanceSection = (): JSX.Element => {
  const { settings, patch } = useSettings();
  const { theme, setTheme } = useTheme();
  const monoIcons = settings?.monoIcons ?? true;

  return (
    <Section title="Appearance" tour="settings-appearance">
      <Setting label="Theme" hint={THEME_HINTS[theme]}>
        <SegmentedToggle className="text-xs" value={theme} options={THEMES} onChange={setTheme} />
      </Setting>
      <Setting
        label="Bookmaker logos"
        hint={
          monoIcons
            ? 'Drawn in the app colours, so they follow the theme.'
            : 'Each bookmaker in its own brand colours.'
        }
      >
        <Switch checked={monoIcons} onCheckedChange={(next) => void patch({ monoIcons: next })} />
      </Setting>
    </Section>
  );
};

/** Everything that decides what the figure at the top of the page counts. */
const BalanceSection = ({ notify }: { notify: Notify }): JSX.Element => {
  const { settings, patch } = useSettings();
  const source = settings?.balanceSource ?? 'live';
  const layout = settings?.balanceLayout ?? 'total';
  const includeBonus = settings?.includeBonus ?? true;
  const showClaimable = settings?.showClaimable ?? true;

  return (
    <Section title="Balance" tour="settings-balance">
      <Setting label="What it shows" hint={BALANCE_SOURCE_HINTS[source]}>
        <SegmentedToggle
          className="text-xs"
          value={source}
          options={BALANCE_SOURCES}
          onChange={(balanceSource) => {
            void patch({ balanceSource });
            notify(
              balanceSource === 'live'
                ? 'The balance now shows the money in your accounts.'
                : 'The balance now shows what you took out, less what you paid in.',
            );
          }}
        />
      </Setting>
      <Setting label="How it is split" hint={BALANCE_LAYOUT_HINTS[layout]}>
        <SegmentedToggle
          className="text-xs"
          value={layout}
          options={BALANCE_LAYOUTS}
          onChange={(balanceLayout) => void patch({ balanceLayout })}
        />
      </Setting>
      <Setting
        label="Count bonus money"
        hint={
          includeBonus
            ? 'Bonus money is counted in, the way the bookmaker counts it.'
            : 'Only the money you could withdraw today is counted.'
        }
      >
        <Switch
          checked={includeBonus}
          onCheckedChange={(next) => void patch({ includeBonus: next })}
        />
      </Setting>
      <Setting
        label="Show rewards waiting to be claimed"
        hint={
          showClaimable
            ? 'Rakeback the bookmaker is holding is shown beside the balance until you claim it.'
            : 'Only money already in the account is shown.'
        }
      >
        <Switch
          checked={showClaimable}
          onCheckedChange={(next) => void patch({ showClaimable: next })}
        />
      </Setting>
    </Section>
  );
};

/**
 * Two subjects, each with its own heading switch, because that is the choice
 * people actually make: bonuses are worth an interruption or they are not. The
 * single rows under a heading are for narrowing it down afterwards.
 */
const NotificationsSection = ({ notify }: { notify: Notify }): JSX.Element => {
  const { settings, patch } = useSettings();

  const expiryAlerts = settings?.expiryAlerts ?? true;
  const syncAlerts = settings?.syncAlerts ?? true;
  const connectionAlerts = settings?.connectionAlerts ?? true;

  return (
    <Section title="Notifications" tour="settings-notifications">
      <Setting
        label="Bonus expiry"
        hint="A note when a bonus balance already granted reaches its end date."
      >
        <Switch
          checked={expiryAlerts}
          onCheckedChange={(on) => {
            void patch({ expiryAlerts: on });
            notify(on ? 'Bonus messages are back on.' : 'Bonus messages are off.');
          }}
        />
      </Setting>
      <SettingGroup
        label="Accounts"
        hint="Messages about what came in from a bookmaker, and what stopped coming in."
        on={syncAlerts || connectionAlerts}
        onToggle={(on) => {
          void patch({ syncAlerts: on, connectionAlerts: on });
          notify(on ? 'Account messages are back on.' : 'Account messages are off.');
        }}
      >
        <Setting label="New data" hint="What each bookmaker brought in since your last visit.">
          <Switch checked={syncAlerts} onCheckedChange={(on) => void patch({ syncAlerts: on })} />
        </Setting>
        <Setting label="Signed out" hint="When an account quietly stops updating.">
          <Switch
            checked={connectionAlerts}
            onCheckedChange={(on) => void patch({ connectionAlerts: on })}
          />
        </Setting>
      </SettingGroup>
    </Section>
  );
};

/**
 * What an action just did, in the corner the app already speaks from, so a
 * confirmation and a sync message never arrive in two different places. Only
 * the changes worth noticing say anything - a theme or a date format shows its
 * own result on screen, and announcing it as well is noise.
 */
const ActionNote = ({ text, onDone }: { text: string; onDone: () => void }): JSX.Element => {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 4000);
    return () => window.clearTimeout(timer);
  }, [text, onDone]);

  return (
    <Toasts>
      <Toast
        key={text}
        icon={<CheckIcon size={15} strokeWidth={1.75} className="text-primary" />}
        title={text}
      />
    </Toasts>
  );
};

/** Passed to the sections that change something a user would want confirmed. */
type Notify = (text: string) => void;

/** Rows carry the account they were read from, so a backup can be narrowed to it. */
const ofAccounts = <T extends AccountRef>(rows: readonly T[], keys: Set<string>): T[] =>
  rows.filter((row) => keys.has(accountKey(row)));

const KINDS = ['bets', 'payments', 'bonuses'] as const;
type Kind = (typeof KINDS)[number];

const KIND_LABELS: Record<Kind, string> = {
  bets: 'Bets',
  payments: 'Deposits and withdrawals',
  bonuses: 'Bonuses',
};

const Check = ({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}): JSX.Element => (
  <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-foreground">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-3.5 w-3.5 accent-primary"
    />
    {children}
  </label>
);

const without = <T,>(list: readonly T[], value: T, on: boolean): T[] =>
  on ? list.filter((item) => item !== value) : [...list, value];

/**
 * A backup of whatever you pick. Everything is on to begin with, because a
 * backup of part of the history is the exception. It only goes one way: the
 * records come from the bookmakers themselves, and a file that could be edited
 * and read back in would make every figure in the app a claim rather than a fact.
 */
const SaveBackup = ({ onSaved }: { onSaved: (note: string) => void }): JSX.Element => {
  const logins = useAllKnownAccounts();
  const { nameFor } = useAccountNames();
  const [open, setOpen] = useState(false);
  // Held as what was turned off, so an account that arrives after the dialog is
  // built is included without a second piece of state to keep in step with it.
  const [skipped, setSkipped] = useState<string[]>([]);
  const [dropped, setDropped] = useState<Kind[]>([]);

  const onSave = async (): Promise<void> => {
    const keys = new Set(
      logins.map((login) => accountKey(login)).filter((key) => !skipped.includes(key)),
    );
    const stored = await exportAll();
    const bundle: ExportBundle = {
      ...stored,
      bets: dropped.includes('bets') ? [] : ofAccounts(stored.bets, keys),
      transactions: dropped.includes('payments') ? [] : ofAccounts(stored.transactions, keys),
      bonuses: dropped.includes('bonuses') ? [] : ofAccounts(stored.bonuses, keys),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(bundle)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `bettracker-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setOpen(false);
    onSaved(
      `Saved ${bundle.bets.length} bets and ${bundle.transactions.length} payments to a file.`,
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download size={13} strokeWidth={1.75} />
          Save
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save a backup</DialogTitle>
          <DialogDescription>
            Pick what goes into the file. It is a copy for you to keep - nothing can be loaded back
            in, so every figure in the app stays exactly what the bookmaker said it was.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Accounts
            </p>
            {logins.length === 0 ? (
              <p className="text-xs text-muted-foreground">No account is connected yet.</p>
            ) : (
              logins.map((login) => {
                const key = accountKey(login);
                return (
                  <Check
                    key={key}
                    checked={!skipped.includes(key)}
                    onChange={(on) => setSkipped(without(skipped, key, on))}
                  >
                    <AccountIcon bookmaker={login.bookmaker} className="h-4 w-4 rounded" />
                    <span className="truncate">
                      {nameFor(key) || findAccount(login.bookmaker)?.name || login.bookmaker}
                    </span>
                  </Check>
                );
              })
            )}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              What to include
            </p>
            {KINDS.map((kind) => (
              <Check
                key={kind}
                checked={!dropped.includes(kind)}
                onChange={(on) => setDropped(without(dropped, kind, on))}
              >
                {KIND_LABELS[kind]}
              </Check>
            ))}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={() => void onSave()}>
            Save file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DeleteEverything = ({ onDeleted }: { onDeleted: (note: string) => void }): JSX.Element => {
  const { reload } = useDashboard();
  const [open, setOpen] = useState(false);

  const onConfirm = async (): Promise<void> => {
    await clearAll();
    setOpen(false);
    reload();
    onDeleted('Everything stored in this browser was deleted.');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-loss hover:text-loss">
          <Trash2 size={13} strokeWidth={1.75} />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete everything?</DialogTitle>
          <DialogDescription>
            Every bet, payment and setting in this browser goes. Save a backup first if you might
            want any of it back - this cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Keep my data
            </Button>
          </DialogClose>
          <Button variant="destructive" size="sm" onClick={() => void onConfirm()}>
            Delete everything
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One sentence saying how far back the stored history reaches and how big it is. */
const storedSummary = (
  bets: number,
  transactions: number,
  bookmakers: number,
  earliest: string | null,
): string => {
  if (earliest === null) return 'Nothing stored yet.';
  return `From ${formatDate(earliest)}: ${count(bets, 'bet')} and ${count(
    transactions,
    'transaction',
  )} across ${count(bookmakers, 'bookmaker')}.`;
};

const DataSection = ({ notify }: { notify: Notify }): JSX.Element => {
  const { betCount, transactions, activeBookmakers, earliestRecord } = useDashboard();
  const { patch } = useSettings();
  const navigate = useNavigate();

  const replayTour = (): void => {
    void patch({ tourSeen: false }).then(() => navigate('/'));
  };

  return (
    <Section title="Your data" tour="settings-data">
      <Setting label="Guided tour" hint="Walk through the dashboard again, page by page.">
        <Button variant="outline" size="sm" onClick={replayTour}>
          Replay
        </Button>
      </Setting>
      <Setting
        label="Backup"
        hint="A copy of what is stored here, for you to keep. It cannot be loaded back in."
      >
        <SaveBackup onSaved={notify} />
      </Setting>
      <Setting
        label="Delete everything"
        hint={storedSummary(betCount, transactions.length, activeBookmakers.length, earliestRecord)}
      >
        <DeleteEverything onDeleted={notify} />
      </Setting>
    </Section>
  );
};

/**
 * Two columns so the whole page is one screenful - settings are read by
 * scanning for the one you came to change, and scrolling hides half of them.
 * Paired by height rather than by theme, so neither column runs long.
 */
export const GeneralPage = (): JSX.Element => {
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="grid w-full grid-cols-1 items-start gap-x-5 gap-y-3 pb-1 lg:grid-cols-2">
      {note === null ? null : <ActionNote text={note} onDone={() => setNote(null)} />}
      <div className="flex flex-col gap-3">
        <PreferencesSection notify={setNote} />
        <AppearanceSection />
        <DataSection notify={setNote} />
      </div>
      <div className="flex flex-col gap-3">
        <BalanceSection notify={setNote} />
        <NotificationsSection notify={setNote} />
      </div>
    </div>
  );
};
