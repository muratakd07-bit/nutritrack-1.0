import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Qwen3VLFoodRecognitionSource,
  Qwen3VLMalformedResponseError,
  Qwen3VLRequestError,
} from "./qwen3vlClient";
import { FoodRecognitionNotImplementedError } from "./foodRecognition";

const ORIGINAL_ENV = { ...process.env };

function chatCompletionResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

beforeEach(() => {
  process.env.QWEN3_VL_BASE_URL = "https://fake.example.com/compatible-mode/v1";
  process.env.QWEN3_VL_API_KEY = "test-key-not-real";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const INPUT = { image_base64: "ZmFrZQ==", mime_type: "image/jpeg" };

describe("Qwen3VLFoodRecognitionSource", () => {
  it("env değişkenleri eksikse NotImplementedError fırlatır", async () => {
    delete process.env.QWEN3_VL_BASE_URL;
    const source = new Qwen3VLFoodRecognitionSource();
    await expect(source.recognizeFood(INPUT)).rejects.toThrow(
      FoodRecognitionNotImplementedError,
    );
  });

  it("gerçek/doğrulanmış OpenAI-uyumlu istek şeklini gönderir", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(
          chatCompletionResponse(
            JSON.stringify({
              candidate_labels: [{ label: "chicken", confidence: 0.9 }],
              estimated_weight_g: 150,
              visual_description: "desc",
            }),
          ),
        ),
        { status: 200 },
      ),
    );

    const source = new Qwen3VLFoodRecognitionSource();
    await source.recognizeFood(INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fake.example.com/compatible-mode/v1/chat/completions");
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer test-key-not-real",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(options!.body as string);
    expect(body.messages[0].content[0]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,ZmFrZQ==" },
    });
    expect(body.messages[0].content[1].type).toBe("text");
    // Prompt AI'yi nutrition ÜRETMEMESİ konusunda uyarmalı.
    expect(body.messages[0].content[1].text).toMatch(/do not include any nutrition/i);
  });

  it("API key'i asla istek gövdesinde/URL'de göstermez (yalnızca Authorization header'ında)", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(
          chatCompletionResponse(
            JSON.stringify({ candidate_labels: [], estimated_weight_g: 1, visual_description: "x" }),
          ),
        ),
      ),
    );

    const source = new Qwen3VLFoodRecognitionSource();
    await source.recognizeFood(INPUT);

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("test-key-not-real");
    expect(options!.body as string).not.toContain("test-key-not-real");
  });

  it("model varsayılanı env ile override edilebilir", async () => {
    process.env.QWEN3_VL_MODEL = "qwen3-vl-flash";
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify(
          chatCompletionResponse(
            JSON.stringify({ candidate_labels: [], estimated_weight_g: 1, visual_description: "x" }),
          ),
        ),
      ),
    );

    await new Qwen3VLFoodRecognitionSource().recognizeFood(INPUT);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.model).toBe("qwen3-vl-flash");
  });

  it("```json kod bloğuna sarılmış yanıtı doğru ayrıştırır", async () => {
    const fetchMock = vi.mocked(fetch);
    const wrapped =
      "```json\n" +
      JSON.stringify({ candidate_labels: [{ label: "rice", confidence: 0.8 }], estimated_weight_g: 100, visual_description: "d" }) +
      "\n```";
    fetchMock.mockResolvedValue(new Response(JSON.stringify(chatCompletionResponse(wrapped))));

    const result = await new Qwen3VLFoodRecognitionSource().recognizeFood(INPUT);
    expect(result.candidate_labels[0].label).toBe("rice");
  });

  it("bozuk (JSON olmayan) model yanıtında Qwen3VLMalformedResponseError fırlatır", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(chatCompletionResponse("Sure! This looks like chicken.")))
    );

    await expect(new Qwen3VLFoodRecognitionSource().recognizeFood(INPUT)).rejects.toThrow(
      Qwen3VLMalformedResponseError,
    );
  });

  it("4xx hatasında YENİDEN DENEMEZ", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response("bad request", { status: 400 }));

    await expect(new Qwen3VLFoodRecognitionSource().recognizeFood(INPUT)).rejects.toThrow(
      Qwen3VLRequestError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("5xx hatasında bir kez YENİDEN DENER, sonra başarısız olursa fırlatır", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response("server error", { status: 503 }))
      .mockResolvedValueOnce(new Response("server error", { status: 503 }));

    await expect(new Qwen3VLFoodRecognitionSource().recognizeFood(INPUT)).rejects.toThrow(
      Qwen3VLRequestError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("5xx sonrası retry başarılı olursa sonucu döner", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response("server error", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            chatCompletionResponse(
              JSON.stringify({ candidate_labels: [], estimated_weight_g: 1, visual_description: "x" }),
            ),
          ),
        ),
      );

    const result = await new Qwen3VLFoodRecognitionSource().recognizeFood(INPUT);
    expect(result).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
