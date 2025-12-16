// Game rules
export const STARTING_STOCK_PRICE = 100.0;
export const FAIL_STOCK_PRICE = 95.0;

// Interview timing
export const INTERVIEW_DURATION_MS = 60_000; // 60 seconds total
export const SILENCE_MS = 10_000; // if player hasn't answered within 5s of a question

// Question pacing (after an answer resolves)
export const NEXT_QUESTION_MIN_MS = 6_000;
export const NEXT_QUESTION_MAX_MS = 8_000;

// Interviewer silence callouts
export const SILENCE_LINES = [
  "That’s not an answer.",
  "You’re avoiding the question.",
  "Are you going to respond?",
  "Silence isn’t reassuring.",
  "The market’s noticing.",
];

// UI copy / flavour
export const NEWS_TICKER_HEADLINES = [
  "MARKETS RALLY AS TECH SECTOR BOOMS",
  "BREAKING: LIVE INTERVIEW IN PROGRESS",
  "INVESTORS WATCHING CLOSELY",
  "RUMORS OF ACQUISITION SWIRL",
  "CONSUMER CONFIDENCE HITS 5-YEAR HIGH",
  "BREAKING NEWS: SCANDAL IN THE MAKING?",
  "LOCAL CAT SAVED FROM TREE BY FIREFIGHTERS",
  "WEATHER: SUNNY SPELLS WITH CHANCE OF MARKET CRASH",
];

export const JOURNALIST_NAME = "Diane Sawyer-bot";
export const SHOW_NAME = "THE HOT SEAT";
