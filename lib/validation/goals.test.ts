import { describe, expect, it } from "vitest";
import { setGoalsInputSchema } from "./goals";

const validGoals = {
  energy_kcal: 2200,
  protein_g: 160,
  carbohydrates_g: 220,
  fat_g: 70,
  fiber_g: 30,
  water_ml: 2500,
};

describe("setGoalsInputSchema", () => {
  it("geçerli bir isteği kabul eder", () => {
    const result = setGoalsInputSchema.safeParse({
      user_id: "user-1",
      goals: validGoals,
    });
    expect(result.success).toBe(true);
  });

  it("boş user_id'yi reddeder", () => {
    const result = setGoalsInputSchema.safeParse({
      user_id: "",
      goals: validGoals,
    });
    expect(result.success).toBe(false);
  });

  it("negatif energy_kcal'i reddeder", () => {
    const result = setGoalsInputSchema.safeParse({
      user_id: "user-1",
      goals: { ...validGoals, energy_kcal: -100 },
    });
    expect(result.success).toBe(false);
  });

  it("eksik bir alanı reddeder", () => {
    const incomplete: Partial<typeof validGoals> = { ...validGoals };
    delete incomplete.fiber_g;
    const result = setGoalsInputSchema.safeParse({
      user_id: "user-1",
      goals: incomplete,
    });
    expect(result.success).toBe(false);
  });
});
