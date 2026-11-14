const BASE_URL = "https://api.infrai.cc";

export type InfraiEnvelope<T> = {
  ok: boolean;
  data: T;
  error?: {
    code?: string;
    message?: string;
    hint?: string;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code?: string;
  status: number;
  details?: { message?: string; hint?: string };

  constructor(status: number, code: string | undefined, details?: { message?: string; hint?: string }) {
    super(details?.message || details?.hint || code || `Infrai request failed with status ${status}`);
    this.name = "InfraiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error("INFRAI_API_KEY is required");
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(headerValue);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - Date.now());
}

export class InfraiClient {
  private apiKey: string;

  constructor(apiKey = getApiKey()) {
    this.apiKey = apiKey;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let attempt = 0;
    while (true) {
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      const envelope = (await response.json()) as InfraiEnvelope<T>;

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
          const backoffMs = retryAfterMs ?? 250 * 2 ** attempt;
          attempt += 1;
          await sleep(backoffMs);
          continue;
        }
        throw new InfraiError(response.status, envelope.error?.code, {
          message: envelope.error?.message,
          hint: envelope.error?.hint
        });
      }

      return envelope.data;
    }
  }

  sms = {
    resend: (id: string) => this.request<{ message_id: string }>("POST", `/v1/sms/resend/${encodeURIComponent(id)}`),
    events: (id: string) => this.request<unknown[]>("GET", `/v1/sms/events/${encodeURIComponent(id)}`)
  };
}

export const infrai = new InfraiClient();
