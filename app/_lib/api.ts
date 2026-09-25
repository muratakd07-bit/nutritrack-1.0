/**
 * İstemci tarafı API yardımcısı. Tüm yetkilendirme sunucuda (API route'ları)
 * yapılır; burası yalnızca yanıtı tipler ve 401'i ayrı bir hata olarak
 * işaretler ki sayfalar kullanıcıyı giriş sayfasına yönlendirebilsin.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error,
      body?.message ?? `İstek başarısız oldu (${response.status})`,
    );
  }
  return body.data as T;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
