import { describe, expect, it } from "vitest";
import { signInInputSchema, signUpInputSchema } from "./auth";

describe("signUpInputSchema", () => {
  it("geçerli e-posta ve şifreyi kabul eder", () => {
    const result = signUpInputSchema.safeParse({
      email: "user@example.com",
      password: "supersecret123",
    });
    expect(result.success).toBe(true);
  });

  it("geçersiz e-postayı reddeder", () => {
    const result = signUpInputSchema.safeParse({
      email: "not-an-email",
      password: "supersecret123",
    });
    expect(result.success).toBe(false);
  });

  it("8 karakterden kısa şifreyi reddeder", () => {
    const result = signUpInputSchema.safeParse({
      email: "user@example.com",
      password: "short1",
    });
    expect(result.success).toBe(false);
  });

  it("boş e-postayı reddeder", () => {
    const result = signUpInputSchema.safeParse({
      email: "",
      password: "supersecret123",
    });
    expect(result.success).toBe(false);
  });
});

describe("signInInputSchema", () => {
  it("geçerli girişi kabul eder", () => {
    const result = signInInputSchema.safeParse({
      email: "user@example.com",
      password: "x",
    });
    expect(result.success).toBe(true);
  });

  it("boş şifreyi reddeder", () => {
    const result = signInInputSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("geçersiz e-postayı reddeder", () => {
    const result = signInInputSchema.safeParse({
      email: "nope",
      password: "x",
    });
    expect(result.success).toBe(false);
  });
});
