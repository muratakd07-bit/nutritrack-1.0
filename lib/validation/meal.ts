import { z } from "zod";
import { MEAL_TYPES } from "@/types/meal";

/**
 * Kullanıcıdan (client) gelen meal item girdisinin backend'e ulaşan İLK
 * doğrulama katmanı. API route'ları bu şemayı geçmeyen hiçbir isteği
 * domain katmanına iletmemelidir.
 *
 * Not: Burada yalnızca girdi şekli/sınırları doğrulanır — food_id'nin
 * gerçekten var olup olmadığı (ör. ADIM 16 kaynağında) domain katmanının
 * sorumluluğundadır.
 */
export const mealItemInputSchema = z.object({
  food_id: z
    .string()
    .trim()
    .min(1, "food_id boş olamaz")
    .max(128, "food_id çok uzun"),
  consumed_weight_g: z
    .number()
    .finite()
    .positive("consumed_weight_g pozitif olmalı")
    .max(10000, "consumed_weight_g gerçekçi bir aralıkta olmalı"),
  meal_type: z.enum(MEAL_TYPES),
  idempotency_key: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .optional(),
});

export type MealItemInputParsed = z.infer<typeof mealItemInputSchema>;

/** İlişkili kaynaklara erişim için gereken kullanıcı bağlamının doğrulaması. */
export const userContextSchema = z.object({
  user_id: z.string().trim().min(1, "user_id boş olamaz"),
});

export type UserContextParsed = z.infer<typeof userContextSchema>;
