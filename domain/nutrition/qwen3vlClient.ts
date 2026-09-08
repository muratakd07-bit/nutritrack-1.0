import type {
  FoodRecognitionInput,
  FoodRecognitionRawResult,
  FoodRecognitionSource,
} from "./foodRecognition";
import { FoodRecognitionNotImplementedError } from "./foodRecognition";

/**
 * Qwen3-VL (Alibaba Cloud Model Studio / DashScope) tabanlı gerçek besin
 * tanıma istemcisi.
 *
 * DOĞRULANMIŞ FORMAT: Aşağıdaki istek/yanıt şekli, USDA entegrasyonuyla
 * (ADIM 26) AYNI titizlikle, 2026-09-09'da Alibaba Cloud'un resmi
 * dokümantasyonundan (alibabacloud.com/help/en/model-studio/vision)
 * CANLI olarak doğrulanmıştır — varsayılmamıştır:
 *  - OpenAI-uyumlu `chat/completions` uç noktası (`{base_url}/chat/completions`).
 *  - Görsel, `content: [{ type: "image_url", image_url: { url: "data:image/{fmt};base64,{data}" } }]`
 *    şeklinde, standart OpenAI vision veri-URI formatıyla gönderilir.
 *  - Kimlik doğrulama: `Authorization: Bearer <API_KEY>`.
 *  - Yanıt: standart `choices[0].message.content` — SERBEST METİN (yapılı
 *    JSON değil). Bu yüzden modelin YALNIZCA JSON döndürmesini isteyen bir
 *    prompt kullanılır ve dönen metin burada ayrıştırılıp (markdown kod
 *    bloğu temizlenerek) JSON.parse edilir.
 *
 * Bu istemci HENÜZ GERÇEK BİR ENDPOINT'E KARŞI ÇALIŞTIRILAMADI (API key
 * yok) — format dokümantasyona karşı doğrulandı ama canlı davranış
 * (gerçek modelin prompt'a nasıl yanıt verdiği) doğrulanamadı. Bu farkı
 * gizlemiyoruz — bkz. ADIM 27 raporu.
 *
 * Ortam değişkenleri:
 *  - QWEN3_VL_BASE_URL (zorunlu) — ör. "https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
 *  - QWEN3_VL_API_KEY (zorunlu)
 *  - QWEN3_VL_MODEL (opsiyonel, varsayılan "qwen3-vl-plus")
 */

const DEFAULT_MODEL = "qwen3-vl-plus";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 1;

const RECOGNITION_PROMPT = `You are a food recognition assistant for a nutrition tracking app.
Look at the image and identify the food shown. Respond with ONLY a raw JSON object
(no markdown code fences, no explanation, no extra text) in EXACTLY this shape:

{
  "candidate_labels": [{"label": "<food name in English>", "confidence": <number 0-1>}],
  "estimated_weight_g": <number, your best estimate of the visible portion weight in grams>,
  "visual_description": "<one short sentence describing what you see>"
}

Rules:
- List at most 3 candidate_labels, ordered from most to least likely.
- If you cannot identify any food, return an empty candidate_labels array.
- Do NOT include any nutrition information (calories, protein, fat, carbohydrates, fiber) —
  you are only responsible for identifying the food and estimating its weight.`;

export class Qwen3VLMalformedResponseError extends Error {
  constructor(rawContent: string, cause?: unknown) {
    super(
      `Qwen3-VL yanıtı geçerli JSON olarak ayrıştırılamadı. İlk 200 karakter: ` +
        `${rawContent.slice(0, 200)}`,
    );
    this.name = "Qwen3VLMalformedResponseError";
    this.cause = cause;
  }
}

export class Qwen3VLRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "Qwen3VLRequestError";
  }
}

/** Modelin bazen JSON'u ```json ... ``` kod bloğuna sarmasına karşı savunma. */
function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Qwen3VLFoodRecognitionSource implements FoodRecognitionSource {
  async recognizeFood(
    input: FoodRecognitionInput,
  ): Promise<FoodRecognitionRawResult> {
    const baseUrl = process.env.QWEN3_VL_BASE_URL;
    const apiKey = process.env.QWEN3_VL_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new FoodRecognitionNotImplementedError();
    }
    const model = process.env.QWEN3_VL_MODEL || DEFAULT_MODEL;

    const requestBody = {
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${input.mime_type};base64,${input.image_base64}`,
              },
            },
            { type: "text", text: RECOGNITION_PROMPT },
          ],
        },
      ],
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // GÜVENLİK: apiKey ASLA loglanmaz/hataya dahil edilmez.
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          // 4xx hatalarında (ör. geçersiz key, kötü istek) yeniden denemek
          // anlamsız — yalnızca 5xx/ağ hatalarında retry yapılır.
          if (response.status < 500) {
            throw new Qwen3VLRequestError(
              `Qwen3-VL API hatası: ${response.status} ${response.statusText}`,
              response.status,
            );
          }
          throw new Qwen3VLRequestError(
            `Qwen3-VL API sunucu hatası: ${response.status}`,
            response.status,
          );
        }

        const body = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const rawContent = body.choices?.[0]?.message?.content;
        if (typeof rawContent !== "string") {
          throw new Qwen3VLMalformedResponseError(JSON.stringify(body));
        }

        try {
          return JSON.parse(stripMarkdownFence(rawContent));
        } catch (parseError) {
          throw new Qwen3VLMalformedResponseError(rawContent, parseError);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;

        const isRetryable =
          error instanceof Qwen3VLRequestError
            ? (error.status ?? 500) >= 500
            : error instanceof DOMException && error.name === "AbortError"; // timeout

        if (!isRetryable || attempt === MAX_RETRIES) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw new Qwen3VLRequestError("Qwen3-VL isteği zaman aşımına uğradı");
          }
          throw error;
        }
        await sleep(500 * (attempt + 1));
      }
    }

    throw lastError;
  }
}
