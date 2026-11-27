// One shared queue for the main competitive mode. Players are matched by rating; the allowed difference grows while they wait.
export const MATCHMAKING = {
  /** Rating difference allowed at the start of the search. */
  baseRange: 100,
  /** Every `widenStepMs` of waiting adds `widenStep` to the allowed difference, up to `maxRange`. */
  widenStepMs: 5000,
  widenStep: 50,
  maxRange: 600,
  /** After this long without an opponent the player is offered a training match with a bot (never shown as a real player). */
  botOfferMs: 20000,
  /** After this long the search ends by itself. */
  timeoutMs: 90000,
  /** A player who was just matched cannot be queued again for this long (the first match is still being played). */
  matchLockMs: 120000,
  /** A rematch request waits this long for the other player to accept it. */
  rematchWaitMs: 60000,
};
