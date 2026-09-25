import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthenticatedUserId = vi.fn();
const mockDeleteMealItemForUser = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedUserId: () => mockGetAuthenticatedUserId(),
}));

vi.mock("@/domain/meal/service", () => ({
  deleteMealItemForUser: (...args: unknown[]) => mockDeleteMealItemForUser(...args),
}));

import { DELETE } from "./route";

function call(id: string) {
  return DELETE(new Request(`http://localhost/api/meals/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  mockGetAuthenticatedUserId.mockReset();
  mockDeleteMealItemForUser.mockReset();
});

describe("DELETE /api/meals/[id]", () => {
  it("oturum yoksa 401 döner ve hiçbir şey silmez", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null);
    const response = await call("item-1");
    expect(response.status).toBe(401);
    expect(mockDeleteMealItemForUser).not.toHaveBeenCalled();
  });

  it("yalnızca ÇAĞIRANIN kendi userId'siyle siler ve 204 döner", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockDeleteMealItemForUser.mockResolvedValue(true);
    const response = await call("item-1");
    expect(response.status).toBe(204);
    expect(mockDeleteMealItemForUser).toHaveBeenCalledWith("user-1", "item-1");
  });

  it("kayıt bulunamazsa veya başkasınınsa 404 döner", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockDeleteMealItemForUser.mockResolvedValue(false);
    const response = await call("someone-elses-item");
    expect(response.status).toBe(404);
  });
});
