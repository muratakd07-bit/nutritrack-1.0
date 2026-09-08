import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUserRole = vi.fn();
const mockGetTrainerProfileIdForUser = vi.fn();
const mockIsTrainerAssignmentActive = vi.fn();
const mockListAssignedClientIds = vi.fn();
const mockCreateTrainerAssignment = vi.fn();

vi.mock("./repository", () => ({
  authzRepository: {
    getUserRole: (...args: unknown[]) => mockGetUserRole(...args),
    getTrainerProfileIdForUser: (...args: unknown[]) =>
      mockGetTrainerProfileIdForUser(...args),
    isTrainerAssignmentActive: (...args: unknown[]) =>
      mockIsTrainerAssignmentActive(...args),
    listAssignedClientIds: (...args: unknown[]) =>
      mockListAssignedClientIds(...args),
    createTrainerAssignment: (...args: unknown[]) =>
      mockCreateTrainerAssignment(...args),
  },
}));

import {
  canAccessUserData,
  createTrainerAssignment,
  ForbiddenError,
  getRoleForUser,
  listAssignedClientIds,
  requireRole,
  resolveAssignedTrainerId,
} from "./service";

const USER_A = "user-a";
const USER_B = "user-b";
const TRAINER_1 = "trainer-user-1";
const TRAINER_2 = "trainer-user-2";
const ADMIN = "admin-user";

beforeEach(() => {
  mockGetUserRole.mockReset();
  mockGetTrainerProfileIdForUser.mockReset();
  mockIsTrainerAssignmentActive.mockReset();
  mockListAssignedClientIds.mockReset();
  mockCreateTrainerAssignment.mockReset();
});

function roleMap(map: Record<string, "USER" | "TRAINER" | "ADMIN">) {
  mockGetUserRole.mockImplementation(async (userId: string) => map[userId] ?? null);
}

describe("getRoleForUser", () => {
  it("kayıt yoksa en düşük yetkiye (USER) düşer", async () => {
    mockGetUserRole.mockResolvedValue(null);
    expect(await getRoleForUser("ghost")).toBe("USER");
  });
});

describe("requireRole", () => {
  it("izin verilen rolde ise geçer", async () => {
    roleMap({ [ADMIN]: "ADMIN" });
    await expect(requireRole(ADMIN, ["ADMIN"])).resolves.toBe("ADMIN");
  });

  it("izin verilmeyen rolde ForbiddenError fırlatır", async () => {
    roleMap({ [USER_A]: "USER" });
    await expect(requireRole(USER_A, ["ADMIN"])).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("canAccessUserData — senaryolar", () => {
  it("user A kendi verisine erişebilir", async () => {
    roleMap({ [USER_A]: "USER" });
    expect(await canAccessUserData(USER_A, USER_A)).toBe(true);
  });

  it("user A, user B'nin verisine ERİŞEMEZ", async () => {
    roleMap({ [USER_A]: "USER" });
    expect(await canAccessUserData(USER_A, USER_B)).toBe(false);
  });

  it("admin, herhangi bir kullanıcının verisine erişebilir", async () => {
    roleMap({ [ADMIN]: "ADMIN" });
    expect(await canAccessUserData(ADMIN, USER_A)).toBe(true);
    expect(await canAccessUserData(ADMIN, USER_B)).toBe(true);
  });

  it("trainer, atanmadığı kullanıcının verisine ERİŞEMEZ", async () => {
    roleMap({ [TRAINER_1]: "TRAINER" });
    mockGetTrainerProfileIdForUser.mockResolvedValue("trainer-profile-1");
    mockIsTrainerAssignmentActive.mockResolvedValue(false);

    expect(await canAccessUserData(TRAINER_1, USER_A)).toBe(false);
  });

  it("trainer, atandığı kullanıcının verisine erişebilir", async () => {
    roleMap({ [TRAINER_1]: "TRAINER" });
    mockGetTrainerProfileIdForUser.mockResolvedValue("trainer-profile-1");
    mockIsTrainerAssignmentActive.mockResolvedValue(true);

    expect(await canAccessUserData(TRAINER_1, USER_A)).toBe(true);
  });

  it("trainer, BAŞKA bir trainer'ın kullanıcısına ERİŞEMEZ", async () => {
    // trainer-2, user-A'ya atanmış olsa da (trainer-1'in ataması değil),
    // trainer-1 için ayrı bir sorgu yapılır ve trainer-1'in kendi ataması
    // olmadığı için reddedilir.
    roleMap({ [TRAINER_1]: "TRAINER", [TRAINER_2]: "TRAINER" });
    mockGetTrainerProfileIdForUser.mockImplementation(async (userId: string) =>
      userId === TRAINER_1 ? "trainer-profile-1" : "trainer-profile-2",
    );
    mockIsTrainerAssignmentActive.mockImplementation(
      async (trainerId: string) => trainerId === "trainer-profile-2",
    );

    expect(await canAccessUserData(TRAINER_1, USER_A)).toBe(false);
    expect(await canAccessUserData(TRAINER_2, USER_A)).toBe(true);
  });

  it("henüz Trainer profili olmayan bir TRAINER rolü erişemez (fail-closed)", async () => {
    roleMap({ [TRAINER_1]: "TRAINER" });
    mockGetTrainerProfileIdForUser.mockResolvedValue(null);

    expect(await canAccessUserData(TRAINER_1, USER_A)).toBe(false);
  });
});

describe("resolveAssignedTrainerId", () => {
  it("TRAINER olmayan biri için null döner", async () => {
    roleMap({ [USER_A]: "USER" });
    expect(await resolveAssignedTrainerId(USER_A, USER_B)).toBeNull();
  });

  it("atanmış trainer için Trainer.id döner", async () => {
    roleMap({ [TRAINER_1]: "TRAINER" });
    mockGetTrainerProfileIdForUser.mockResolvedValue("trainer-profile-1");
    mockIsTrainerAssignmentActive.mockResolvedValue(true);

    expect(await resolveAssignedTrainerId(TRAINER_1, USER_A)).toBe(
      "trainer-profile-1",
    );
  });
});

describe("listAssignedClientIds", () => {
  it("trainer profili yoksa boş liste döner", async () => {
    mockGetTrainerProfileIdForUser.mockResolvedValue(null);
    expect(await listAssignedClientIds(TRAINER_1)).toEqual([]);
    expect(mockListAssignedClientIds).not.toHaveBeenCalled();
  });

  it("trainer'ın atanmış client id'lerini döner", async () => {
    mockGetTrainerProfileIdForUser.mockResolvedValue("trainer-profile-1");
    mockListAssignedClientIds.mockResolvedValue([USER_A, USER_B]);
    expect(await listAssignedClientIds(TRAINER_1)).toEqual([USER_A, USER_B]);
  });
});

describe("createTrainerAssignment", () => {
  it("hedef TRAINER rolünde değilse reddeder", async () => {
    roleMap({ [USER_A]: "USER" });
    await expect(
      createTrainerAssignment(USER_A, USER_B),
    ).rejects.toThrow(ForbiddenError);
    expect(mockCreateTrainerAssignment).not.toHaveBeenCalled();
  });

  it("hedef TRAINER rolündeyse atamayı oluşturur", async () => {
    roleMap({ [TRAINER_1]: "TRAINER" });
    await createTrainerAssignment(TRAINER_1, USER_A);
    expect(mockCreateTrainerAssignment).toHaveBeenCalledWith(TRAINER_1, USER_A);
  });
});
