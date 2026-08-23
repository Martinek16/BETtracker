# Questions people ask

**Can it bet with my money?**
No. It only reads pages you have already opened, and never sees your password.
It cannot place a bet, deposit or withdraw.

**Which bookmakers does it read?**
Two: bet-at-home and Stake. That is the whole list, and it is not a shortlist
of the big names - it is the two the author plays at. A site is written from a
recording of a real signed-in session there, so the list grows by who turns up.

**How many accounts can I track at once?**
As many as you like, across those two sites. They are added up together, and
any one of them can be renamed, hidden, or deleted on its own.

**My bookmaker is not on the list - what now?**
Three routes. They differ in what they cost you, not in what you get.

- **Ask for it.**
  [Open a request](https://github.com/Martinek16/BETtracker/issues/new?template=new-bookmaker.yml).
  Free, and honest about what it is: a note in a list. Nothing happens until
  somebody with an account there picks it up, and that may be nobody.
- **Record it, and let somebody else write the code.** This is the useful one,
  and it needs no terminal and no programming. You click through your own
  history at that site while it is being recorded, run one command that strips
  your tokens and your name out of the file, and attach the cleaned result to
  the request. Somebody who has never had an account there can write the
  adapter from it. Budget an hour or so, most of it clicking slowly through
  your own bet history.
- **Add it yourself.** You record it *and* build it, with an AI coding tool
  doing most of the writing. You need an account at the site, a terminal, and
  the willingness to check every figure on screen against the bookmaker's own
  pages afterwards. Half a day is a fair estimate for a site that behaves, and
  longer for one that does not.

Whichever route, somebody with an account there is unavoidable: there is no way
to write support for a site from the outside, and no way to verify it is
telling the truth without a real history to compare against.
[The whole process](ADD_A_BOOKMAKER.md).

**Why is an old bet missing?**
Long histories are read backwards, one page at a time. Open the bookmaker and
leave the tab a moment.

**Why did an account stop updating?**
Usually the bookmaker signed you out. Open its site again and it picks up where
it left off.

The other reason is the site changing its API. The account card says so in as
many words, and the extension stops rather than write a figure it had guessed
at - so what is on screen is old, not wrong. That one needs an adapter update,
not another visit to the site.

**Is casino play counted?**
No. Only sports bets. Casino money shows up as a smaller balance.

**What about currencies, and crypto?**
Everything is converted on the day the bet was placed, not today, so last
year's profit does not move because a rate did. Crypto stakes go through the
coin's own daily close.

**Where is my data kept, and can I take it with me?**
In your browser, on your disk. Export the lot to a file whenever you like, or
delete it in one click.

**Do two computers share anything?**
No. There is no account and no sync, so each browser keeps its own history.
The export file is how you move it.

**Will my bookmaker mind?**
It reads the same pages your browser already loaded, with your own session,
slower than you clicking. That said, plenty of bookmakers write their terms
broadly enough to cover anything they dislike. Your account, your call.

**What does it cost?**
Nothing. It is MIT licensed and there is nothing to buy.
