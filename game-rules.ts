export type AnswerCategory = "good" | "ok" | "evasive" | "bad";

export type ScoreContext = {
  category: AnswerCategory;
  isContradiction: boolean;
  evasiveStreakBefore: number;

  // Optional now (your turn-based version doesn’t use a countdown)
  timeLeftMs?: number;

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

  const timeLeft = typeof ctx.timeLeftMs === "number" ? ctx.timeLeftMs : Infinity;
  const inFinal15s = timeLeft <= 15_000;
  const penaltyMultiplier = inFinal15s ? 1.1 : 1;

  // streak rule: two evasives in a row => next penalty +0.3
  const streakPenaltyBonus = ctx.evasiveStreakBefore >= 2 ? 0.3 : 0;

  if (ctx.category === "good") {
    return {
      delta: Number(rand(1.5, 2.8).toFixed(2)),
      microcopy: "Market reassured",
      tick: "up",
      nextEvasiveStreak: 0,
    };
  }

  if (ctx.category === "ok") {
    // small positive movement
    let delta = rand(0.2, 0.9);

    // Optional: tiny bonus if the option includes metrics (keeps the old flavour)
    if (hasMetrics(ctx.answerText)) {
      delta += 0.3;
    }

    return {
      delta: Number(delta.toFixed(2)),
      microcopy: "Investors cautiously optimistic",
      tick: "up",
      nextEvasiveStreak: 0,
    };
  }

  if (ctx.category === "evasive") {
    const base = rand(-1.5, -0.5);
    let delta = (base - streakPenaltyBonus) * penaltyMultiplier;

    // Metrics can soften evasiveness a bit, but keep it negative overall
    if (hasMetrics(ctx.answerText)) {
      delta += 0.6;
    }
    delta = Math.min(delta, -0.1);

    return {
      delta: Number(delta.toFixed(2)),
      microcopy: "Investors unconvinced",
      tick: "down",
      nextEvasiveStreak: ctx.evasiveStreakBefore + 1,
    };
  }

  // bad
  {
    const base = rand(-3.5, -2.0);
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
