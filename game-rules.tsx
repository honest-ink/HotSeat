export type AnswerCategory = "good" | "evasive" | "bad";

export type ScoreContext = {
  category: AnswerCategory;
  isContradiction: boolean;
  evasiveStreakBefore: number;
  timeLeftMs: number;
};

export type ScoreResult = {
  delta: number;
  microcopy: string;
  flash?: "red";
  tick?: "up" | "down";
  nextEvasiveStreak: number;
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number) {
  return Number(n.toFixed(2));
}

export function scoreAnswer(ctx: ScoreContext): ScoreResult {
  const inFinal15s = ctx.timeLeftMs <= 15_000;

  // Light pressure in the final stretch, not a spike.
  const pressureMultiplier = inFinal15s ? 1.1 : 1;

  // Evasive streak should hurt, but not snowball into instant failure.
  // Adds up to -0.30 max.
  const streakPenalty = clamp(ctx.evasiveStreakBefore * 0.1, 0, 0.3);

  // Contradictions should sting, but not end the run instantly.
  if (ctx.isContradiction) {
    const delta = round2(clamp(-1.25 * pressureMultiplier, -1.4, -1.1));
    return {
      delta,
      microcopy: "Contradiction detected",
      flash: "red",
      tick: "down",
      nextEvasiveStreak: 0,
    };
  }

  if (ctx.category === "good") {
    // Positive moves are modest so the player can't trivialise the stock.
    const delta = round2(rand(0.25, 0.75) * (inFinal15s ? 1.05 : 1));
    return {
      delta,
      microcopy: "Market reassured",
      tick: "up",
      nextEvasiveStreak: 0,
    };
  }

  if (ctx.category === "evasive") {
    // Evasive answers should be a manageable drain.
    // With streakPenalty + pressure this lands roughly -0.45 to -1.20.
    const base = rand(-0.9, -0.4);
    const delta = round2(clamp((base - streakPenalty) * pressureMultiplier, -1.25, -0.25));
    return {
      delta,
      microcopy: "Investors unconvinced",
      tick: "down",
      nextEvasiveStreak: ctx.evasiveStreakBefore + 1,
    };
  }

  // bad
  {
    // Bad answers hurt more than evasive, but still survivable.
    // Roughly -0.75 to -1.25 after caps.
    const base = rand(-1.35, -0.85);
    const delta = round2(clamp((base - streakPenalty) * pressureMultiplier, -1.5, -0.5));
    return {
      delta,
      microcopy: "Confidence shaken",
      flash: "red",
      tick: "down",
      nextEvasiveStreak: 0,
    };
  }
}

