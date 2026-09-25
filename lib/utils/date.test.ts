import { describe, expect, it } from "vitest";
import { addDaysUTC, parseIsoDateUTC, toIsoDateUTC } from "./date";

describe("parseIsoDateUTC", () => {
  it("geçerli bir tarihi UTC gün başlangıcına çevirir", () => {
    expect(parseIsoDateUTC("2026-09-25")?.toISOString()).toBe(
      "2026-09-25T00:00:00.000Z",
    );
  });

  it("takvimde olmayan bir günü reddeder", () => {
    expect(parseIsoDateUTC("2026-02-30")).toBeNull();
  });

  it("yanlış biçimi reddeder", () => {
    expect(parseIsoDateUTC("25.09.2026")).toBeNull();
    expect(parseIsoDateUTC("2026-9-25")).toBeNull();
    expect(parseIsoDateUTC("")).toBeNull();
  });
});

describe("toIsoDateUTC / addDaysUTC", () => {
  it("UTC gününü döner ve ay sınırını doğru geçer", () => {
    const date = new Date("2026-09-30T23:59:00.000Z");
    expect(toIsoDateUTC(date)).toBe("2026-09-30");
    expect(toIsoDateUTC(addDaysUTC(date, 1))).toBe("2026-10-01");
    expect(toIsoDateUTC(addDaysUTC(date, -30))).toBe("2026-08-31");
  });
});
