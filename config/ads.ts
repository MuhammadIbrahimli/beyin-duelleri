// Monetisation switches. Everything is OFF until a provider approves the site and identifiers are configured.
// No ad is shown and no payment is taken while these are off. Nothing here is a real integration yet.
export const ADS = {
  /** master switch: when false, no ad code runs and no reward is given for watching */
  enabled: false,
  /** Google AdSense H5 Games Ads / own ads / direct / sponsor are separate providers; each stays off until approved */
  providers: { h5: false, own: false, direct: false, sponsor: false },
  /** never shown in the middle of a match, at most this many times per hour */
  maxPerHour: 3,
  /** categories that are never allowed (gambling, bookmakers, casinos, interest loans, alcohol, adult content, scams) */
  blockedCategories: ["gambling", "bookmaker", "casino", "loan_interest", "alcohol", "adult", "financial_scam"],
};

export const PAYMENTS = {
  /** orders are written and confirmed by the server; no real payment provider is connected */
  enabled: false,
  provider: null as string | null,
};
