/**
 * Whether the popup offers to record the page in front of the reader.
 *
 * The offer is made on one site only: the one the dashboard was told is being
 * added. Every other site the reader happens to open is a site they are not
 * adding, and an offer there is noise standing in front of an answer.
 */

export interface AddingSite {
  /** The site as the browser knows it, `www.` and all. */
  host: string;
  /** The folder and the id the project will know it by. */
  id: string;
}

export type RecordOffer =
  | { offer: true }
  /** A store copy, which ships without the recorder and cannot be built on. */
  | { offer: false; because: 'store-copy' }
  /** Nothing has been named yet, so there is nothing this page could be. */
  | { offer: false; because: 'nothing-named' }
  /** Some other site: naming the one being added is the useful answer. */
  | { offer: false; because: 'another-site' };

export const recordOffer = (
  host: string,
  adding: AddingSite | null,
  storeCopy: boolean,
): RecordOffer => {
  // Asked first: a recording is only the first of six steps, and the rest need
  // the checkout a store reader does not have. Offering it there records a
  // history that then has nowhere to go.
  if (storeCopy) return { offer: false, because: 'store-copy' };
  if (adding === null) return { offer: false, because: 'nothing-named' };
  // By id rather than by host: a bookmaker is browsed on whichever mirror the
  // browser was sent to, and `m.e-stave.com` is still e-stave.
  return host.includes(adding.id) ? { offer: true } : { offer: false, because: 'another-site' };
};
