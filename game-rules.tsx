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

export function scoreAnswer(ctx: ScoreContext): ScoreResult {
  // contradiction override
  if (ctx.isContradiction) {
    return {
      delta: -2.0,
      microcopy: "Contradiction detected",
      flash: "red",
      tick: "down",
      nextEvasiveStreak: 0,
    };
  }

  const inFinal15s = ctx.timeLeftMs <= 15_000;
  const penaltyMultiplier = inFinal15s ? 1.25 : 1;

  // streak rule: two evasives in a row => next penalty +0.5
  const streakPenaltyBonus = ctx.evasiveStreakBefore >= 2 ? 0.5 : 0;

  if (ctx.category === "good") {
    return {
      delta: Number(rand(0.5, 1.0).toFixed(2)),
      microcopy: "Market reassured",
      tick: "up",
      nextEvasiveStreak: 0,
    };
  }

  if (ctx.category === "evasive") {
    const base = rand(-1.5, -0.75);
    const delta = (base - streakPenaltyBonus) * penaltyMultiplier;
    return {
      delta: Number(delta.toFixed(2)),
      microcopy: "Investors unconvinced",
      tick: "down",
      nextEvasiveStreak: ctx.evasiveStreakBefore + 1,
    };
  }

  // bad
  {
    const base = rand(-3.0, -2.0);
    const delta = (base - streakPenaltyBonus) * penaltyMultiplier;
    return {
      delta: Number(delta.toFixed(2)),
      microcopy: "Confidence shaken",
      flash: "red",
      tick: "down",
      nextEvasiveStreak: 0,
    };
  }
}
