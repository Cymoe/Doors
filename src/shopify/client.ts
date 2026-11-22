/**
 * Minimal Shopify Admin GraphQL client using Node's built-in fetch.
 *
 * Auth, from the environment:
 *   SHOPIFY_STORE_DOMAIN   your-store.myshopify.com
 *   SHOPIFY_API_VERSION    defaults to 2025-10
 *   SHOPIFY_ADMIN_TOKEN    an Admin API access token, or
 *   SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET for an app on your own store
 *     (exchanged for a token with the client credentials grant).
 */

export interface ShopifyConfig {
  domain: string;
  apiVersion: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
}

export function configFromEnv(env = process.env): ShopifyConfig {
  const domain = env.SHOPIFY_STORE_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN is not set (see .env.example)");
  const cfg: ShopifyConfig = {
    domain,
    apiVersion: env.SHOPIFY_API_VERSION || "2025-10",
    token: env.SHOPIFY_ADMIN_TOKEN || undefined,
    clientId: env.SHOPIFY_CLIENT_ID || undefined,
    clientSecret: env.SHOPIFY_CLIENT_SECRET || undefined,
  };
  if (!cfg.token && !(cfg.clientId && cfg.clientSecret)) {
    throw new Error("Set SHOPIFY_ADMIN_TOKEN, or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET");
  }
  return cfg;
}

export class ShopifyClient {
  private token?: string;

  constructor(private cfg: ShopifyConfig) {
    this.token = cfg.token;
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const res = await fetch(`https://${this.cfg.domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.cfg.clientId!,
        client_secret: this.cfg.clientSecret!,
      }),
    });
    if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { access_token: string };
    this.token = body.access_token;
    return this.token;
  }

  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const url = `https://${this.cfg.domain}/admin/api/${this.cfg.apiVersion}/graphql.json`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await this.getToken() },
        body: JSON.stringify({ query, variables }),
      });
      const retryable = res.status === 429 || res.status >= 500;
      const body = retryable ? undefined : ((await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] });
      const throttled = body?.errors?.some((e) => e.extensions?.code === "THROTTLED");
      if ((retryable || throttled) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      if (!res.ok) throw new Error(`Shopify ${res.status}: ${JSON.stringify(body)}`);
      if (body?.errors?.length) throw new Error(`Shopify GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`);
      return body!.data as T;
    }
  }
}
