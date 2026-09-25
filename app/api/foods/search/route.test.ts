import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthenticatedUserId = vi.fn();
const mockSearchFoods = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedUserId: () => mockGetAuthenticatedUserId(),
}));

vi.mock("@/domain/foods/service", () => ({
  searchFoods: (...args: unknown[]) => mockSearchFoods(...args),
}));

import { GET } from "./route";

function call(q: string) {
  return GET(new Request(`http://localhost/api/foods/search?q=${encodeURIComponent(q)}`));
}

beforeEach(() => {
  mockGetAuthenticatedUserId.mockReset();
  mockSearchFoods.mockReset();
});

describe("GET /api/foods/search", () => {
  it("oturum yoksa 401 döner", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null);
    expect((await call("rice")).status).toBe(401);
    expect(mockSearchFoods).not.toHaveBeenCalled();
  });

  it("çok kısa sorguyu 400 ile reddeder", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
    expect((await call(" a ")).status).toBe(400);
    expect(mockSearchFoods).not.toHaveBeenCalled();
  });

  it("geçerli sorguda sonuçları döner", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockSearchFoods.mockResolvedValue([{ food_id: "food-1" }]);
    const response = await call(" rice ");
    expect(response.status).toBe(200);
    expect(mockSearchFoods).toHaveBeenCalledWith("rice");
    expect(await response.json()).toEqual({ data: [{ food_id: "food-1" }] });
  });
});
