import { countryCodeOf } from '@betanal/shared';
import { flagUrl } from '@/lib/country-flags';

/**
 * A country as its flag. Written out, the name would be a column as wide as the
 * ones it sits beside, and the emoji flag Windows ships no glyph for draws as
 * two letters, so the picture is a file of its own.
 *
 * A group that is no country - "International", "Esports" - flies a world map,
 * a file of the same shape and size as the rest so the column stays a column.
 */
export const CountryFlag = ({ country }: { country: string }): JSX.Element => (
  <img src={flagUrl(countryCodeOf(country) ?? 'world')} alt="" className="h-3 w-4 shrink-0" />
);
