import { z } from "zod";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** İstemciden gelen fotoğraf analizi isteği. */
export const photoAnalysisInputSchema = z.object({
  image_base64: z.string().trim().min(1, "image_base64 boş olamaz"),
  mime_type: z.enum(ALLOWED_IMAGE_MIME_TYPES),
});

export type PhotoAnalysisInput = z.infer<typeof photoAnalysisInputSchema>;

/**
 * AI sağlayıcısından dönen HAM çıktının doğrulaması.
 *
 * KRİTİK GÜVENLİK KATMANI: AI çıktısı (gerçek bir modelden ya da
 * manipüle edilmiş bir görselden gelen "prompt injection" sonucundan)
 * ASLA olduğu gibi güvenilmez. Bu şema:
 *  - confidence'ı [0,1] aralığına SIKIŞTIRIR (modelin "1000% eminim" gibi
 *    saçma bir değer döndürmesini engeller),
 *  - estimated_weight_g'yi gerçekçi bir üst sınıra (5kg) SIKIŞTIRIR (bir
 *    görseldeki gizli metnin "50000g" gibi bir değeri modele "söyletmeye"
 *    çalışmasına karşı savunma),
 *  - candidate_labels sayısını ve uzunluğunu sınırlar (aşırı büyük/çok
 *    sayıda etiketle sistemi yormaya karşı).
 * Bu doğrulamadan geçmeyen bir yanıt REDDEDİLİR (ZodError fırlatılır),
 * asla "en iyi çaba" ile düzeltilip kullanılmaz.
 */
export const rawCandidateLabelSchema = z.object({
  label: z.string().trim().min(1).max(200),
  confidence: z.number().min(0).max(1),
});

export const rawFoodRecognitionResultSchema = z.object({
  candidate_labels: z.array(rawCandidateLabelSchema).max(10),
  estimated_weight_g: z.number().finite().positive().max(5000),
  visual_description: z.string().trim().max(1000),
});

export type ValidatedFoodRecognitionResult = z.infer<
  typeof rawFoodRecognitionResultSchema
>;
