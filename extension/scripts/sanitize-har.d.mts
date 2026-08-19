/** Enough of the sanitiser for the recorder's test to prove the two agree. */
export declare const sanitizeHar: (har: unknown) => {
  har: unknown;
  kept: number;
  dropped: number;
  rendered: number;
  redactions: number;
};
export declare const findLeaks: (text: string) => string[];
