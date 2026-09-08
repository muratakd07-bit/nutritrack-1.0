import { describe, expect, it } from "vitest";
import { createVerifiedFoodInputSchema } from "./foods";

const validFacts = {
  energy_kcal_per_100g: 165,
  protein_g_per_100g: 31,
  carbohydrates_g_per_100g: 0,
  fat_g_per_100g: 3.6,
  fiber_g_per_100g: 0,
};

describe("createVerifiedFoodInputSchema", () => {
  it("geçerli bir isteği kabul eder", () => {
    const result = createVerifiedFoodInputSchema.safeParse({
      name: "Tavuk Göğsü (çiğ)",
      facts: validFacts,
      source: "USDA_FDC",
      source_ref: "171077",
    });
    expect(result.success).toBe(true);
  });

  it("source_ref olmadan da geçerlidir", () => {
    const result = createVerifiedFoodInputSchema.safeParse({
      name: "Test",
      facts: validFacts,
      source: "MANUAL_VERIFIED",
    });
    expect(result.success).toBe(true);
  });

  it("boş name'i reddeder", () => {
    const result = createVerifiedFoodInputSchema.safeParse({
      name: "",
      facts: validFacts,
      source: "USDA_FDC",
    });
    expect(result.success).toBe(false);
  });

  it("boş source'u reddeder (izlenebilirlik zorunlu)", () => {
    const result = createVerifiedFoodInputSchema.safeParse({
      name: "Test",
      facts: validFacts,
      source: "",
    });
    expect(result.success).toBe(false);
  });

  it("negatif besin değerini reddeder", () => {
    const result = createVerifiedFoodInputSchema.safeParse({
      name: "Test",
      facts: { ...validFacts, energy_kcal_per_100g: -1 },
      source: "USDA_FDC",
    });
    expect(result.success).toBe(false);
  });
});
