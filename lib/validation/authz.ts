import { z } from "zod";

/** Admin-only: bir trainer'ı bir client'a atama isteği. */
export const createTrainerAssignmentInputSchema = z.object({
  trainer_user_id: z.string().trim().min(1, "trainer_user_id boş olamaz"),
  client_user_id: z.string().trim().min(1, "client_user_id boş olamaz"),
});

export type CreateTrainerAssignmentInput = z.infer<
  typeof createTrainerAssignmentInputSchema
>;
