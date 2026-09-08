import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "E-posta boş olamaz")
  .email("Geçerli bir e-posta adresi girin");

export const passwordSchema = z
  .string()
  .min(8, "Şifre en az 8 karakter olmalı")
  .max(72, "Şifre çok uzun");

export const signUpInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signInInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Şifre boş olamaz"),
});

export type SignUpInput = z.infer<typeof signUpInputSchema>;
export type SignInInput = z.infer<typeof signInInputSchema>;
