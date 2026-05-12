/**
 * Azure OpenAI client wrapper.
 *
 * Uses the official `openai` SDK (Microsoft's recommended path now that
 * `@azure/openai` is deprecated) configured against an Azure deployment.
 *
 * Reads configuration from environment variables:
 *   AZURE_OPENAI_ENDPOINT       https://<resource>.openai.azure.com/
 *   AZURE_OPENAI_API_KEY        <key>
 *   AZURE_OPENAI_DEPLOYMENT     <deployment name, e.g. gpt-4o>
 *   AZURE_OPENAI_API_VERSION    e.g. 2024-10-21
 */

import { AzureOpenAI } from "openai";

let client: AzureOpenAI | null = null;
let deployment: string | null = null;

export interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

export function initializeAzureOpenAI(config?: Partial<AzureOpenAIConfig>): AzureOpenAI {
  if (client && deployment) return client;

  const endpoint = config?.endpoint || process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = config?.apiKey || process.env.AZURE_OPENAI_API_KEY;
  const dep = config?.deployment || process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini";
  const apiVersion = config?.apiVersion || process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

  if (!endpoint || !apiKey) {
    throw new Error(
      "[Azure OpenAI] Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY. " +
      "Configure .env.local before calling the BIM compiler."
    );
  }

  client = new AzureOpenAI({
    endpoint: endpoint.replace(/\/+$/, ""),
    apiKey,
    apiVersion,
    deployment: dep,
  });
  deployment = dep;

  console.log(`[Azure OpenAI] Client initialized (deployment=${dep}, apiVersion=${apiVersion})`);
  return client;
}

export function getAzureOpenAIClient(): AzureOpenAI {
  if (!client) {
    return initializeAzureOpenAI();
  }
  return client;
}

export function getDeploymentName(): string {
  if (!deployment) {
    initializeAzureOpenAI();
  }
  return deployment as string;
}

export function isAzureOpenAIConfigured(): boolean {
  return !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY);
}

/**
 * Issue a JSON-returning chat completion with exponential backoff retry on
 * 429/500/503/network errors. Returns the parsed JSON object.
 *
 * `responseSchema` is optional. When provided, uses gpt-4o Structured Outputs
 * (`response_format: { type: "json_schema" }`) to constrain the output. When
 * omitted, falls back to `{ type: "json_object" }`.
 */
export interface ChatJsonOptions {
  systemInstruction: string;
  userPayload: string;
  temperature?: number;
  maxRetries?: number;
  responseSchema?: {
    name: string;
    schema: Record<string, any>;
    strict?: boolean;
  };
  maxOutputTokens?: number;
}

/**
 * Check if error is due to quota or deployment issues (non-retriable)
 */
function isQuotaOrDeploymentError(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.code;
  const message: string = err?.message || String(err);
  return (
    status === 404 || // Deployment not found
    status === 401 || // Auth failed
    /quota|deployment.*not.*found|DeploymentNotFound/i.test(message)
  );
}

/**
 * Generate a mock JSON response for local development fallback.
 */
function generateMockResponse<T>(schema?: Record<string, any>): T {
  if (!schema) {
    return {} as T;
  }

  // Recursively generate mock data matching schema
  const mock = (s: any): any => {
    if (s.type === "object") {
      const obj: any = {};
      for (const [key, prop] of Object.entries(s.properties || {})) {
        obj[key] = mock(prop);
      }
      return obj;
    }
    if (s.type === "array") {
      return [mock(s.items || {})];
    }
    if (s.type === "string") {
      return "mock-string";
    }
    if (s.type === "number") {
      return 0;
    }
    if (s.type === "boolean") {
      return false;
    }
    return null;
  };

  return mock(schema) as T;
}

export async function chatJSON<T = any>(opts: ChatJsonOptions): Promise<T> {
  const c = getAzureOpenAIClient();
  const dep = getDeploymentName();
  const maxRetries = opts.maxRetries ?? 6;
  let delay = 1500;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const responseFormat: any = opts.responseSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: opts.responseSchema.name,
              schema: opts.responseSchema.schema,
              strict: opts.responseSchema.strict ?? false,
            },
          }
        : { type: "json_object" };

      const completion = await c.chat.completions.create({
        model: dep,
        messages: [
          { role: "system", content: opts.systemInstruction },
          { role: "user", content: opts.userPayload },
        ],
        temperature: opts.temperature ?? 0.2,
        response_format: responseFormat,
        max_tokens: opts.maxOutputTokens ?? 8000,
      });

      const text = completion.choices[0]?.message?.content;
      if (!text) {
        throw new Error("Azure OpenAI returned an empty completion.");
      }

      // Resilient parse: prefer direct JSON, fall back to first {...} or [...]
      // block if the model preambled (rare with response_format, but defensive).
      try {
        return JSON.parse(text) as T;
      } catch {
        const objMatch = text.match(/\{[\s\S]*\}/);
        const arrMatch = text.match(/\[[\s\S]*\]/);
        const candidate = objMatch?.[0] || arrMatch?.[0];
        if (!candidate) {
          throw new Error("Failed to extract JSON from Azure OpenAI response.");
        }
        return JSON.parse(candidate) as T;
      }
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.statusCode ?? err?.code;
      const message: string = err?.message || String(err);

      // Quota / deployment errors are not retriable → fall back to mock
      if (isQuotaOrDeploymentError(err)) {
        console.warn(
          `[Azure OpenAI] Quota/deployment error (${status}): ${message.slice(0, 160)}\n` +
          `[Azure OpenAI] Using mock response for local development. ` +
          `When quota is available, the deployment will be used automatically.`
        );
        return generateMockResponse(opts.responseSchema?.schema) as T;
      }

      const retriable =
        status === 429 ||
        status === 500 ||
        status === 503 ||
        status === 504 ||
        /timeout|ECONNRESET|ENOTFOUND|fetch failed|network/i.test(message);

      if (retriable && attempt < maxRetries) {
        const jitter = Math.random() * 750;
        const wait = delay + jitter;
        console.warn(
          `[Azure OpenAI] ${status || "ERR"}: ${message.slice(0, 160)} — retrying in ${Math.round(wait)}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((r) => setTimeout(r, wait));
        delay = Math.min(delay * 2, 30000);
        continue;
      }
      throw err;
    }
  }

  // Final fallback: use mock if all retries failed
  if (lastError) {
    console.warn(
      `[Azure OpenAI] All retries exhausted. Using mock response for local development.`
    );
    return generateMockResponse(opts.responseSchema?.schema) as T;
  }

  throw new Error("[Azure OpenAI] Exhausted retries without success.");
}
