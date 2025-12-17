export type AnswerCategory = "good" | "evasive" | "bad";

export type ScoreContext = {
  category: AnswerCategory;
  isContradiction: boolean;
  evasiveStreakBefore: number;
  timeLeftMs: number;

  // Metrics bonus (optional)
  answerText?: string;
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

// Metrics heuristic: any number, % sign, currency, or common SaaS/unit-econ terms
function hasMetrics(text?: string) {
  if (!text) return false;
  return (
    /\d/.test(text) ||
    /%/.test(text) ||
    /[$€£]/.test(text) ||
    /\b(arr|mrr|cac|ltv|churn|margin|runway|growth|gmv|ebitda)\b/i.test(text)
  );
}

export function scoreAnswer(ctx: ScoreContext): ScoreResult {
  // contradiction override
  if (ctx.isContradiction) {
    return {
      delta: -1.5,
      microcopy: "Contradiction detected",
      flash: "red",
      tick: "down",
      nextEvasiveStreak: 0,
    };
  }

  const inFinal15s = ctx.timeLeftMs <= 15_000;
  const penaltyMultiplier = inFinal15s ? 1.1 : 1;

  // streak rule: two evasives in a row => next penalty +0.3
  const streakPenaltyBonus = ctx.evasiveStreakBefore >= 2 ? 0.3 : 0;

  if (ctx.category === "good") {
    return {
      delta: Number(rand(0.6, 1.1).toFixed(2)),
      microcopy: "Market reassured",
      tick: "up",
      nextEvasiveStreak: 0,
    };
  }

  if (ctx.category === "evasive") {
    const base = rand(-0.8, -0.3);
    let delta = (base - streakPenaltyBonus) * penaltyMultiplier;

    if (hasMetrics(ctx.answerText)) {
      delta += 0.8;
    }

    return {
      delta: Number(delta.toFixed(2)),
      microcopy: "Investors unconvinced",
      tick: "down",
      nextEvasiveStreak: ctx.evasiveStreakBefore + 1,
    };
  }

  // bad
  {
    const base = rand(-2.0, -1.2);
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
