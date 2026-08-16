const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface OAuthEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OAUTH_REDIRECT_PATH?: string;
}

interface OAuthTokenContext {
  request: Request;
  env: OAuthEnv;
}

type OAuthTokenHandler = (context: OAuthTokenContext) => Promise<Response>;

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectPath: string;
}

const AUTHORIZATION_CODE_FIELDS = [
  "code",
  "client_id",
  "redirect_uri",
  "grant_type",
  "code_verifier",
] as const;

const REFRESH_TOKEN_FIELDS = [
  "client_id",
  "grant_type",
  "refresh_token",
] as const;

const MAX_BODY_BYTES = 8 * 1024;
const MAX_FIELD_LENGTHS: Record<string, number> = {
  client_id: 256,
  code: 4096,
  code_verifier: 128,
  grant_type: 64,
  redirect_uri: 2048,
  refresh_token: 4096,
};

function jsonError(
  status: number,
  error: string,
  description: string,
  headers: Record<string, string> = {},
) {
  return Response.json(
    { error, error_description: description },
    {
      status,
      headers: {
        ...headers,
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

function isBoundedConfigValue(
  value: unknown,
  maximumLength?: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    (maximumLength === undefined || value.length <= maximumLength)
  );
}

function isCanonicalRedirectPath(value: unknown): value is string {
  if (
    !isBoundedConfigValue(value, MAX_FIELD_LENGTHS.redirect_uri) ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return false;
  }

  try {
    const validationOrigin = "https://oauth-proxy.invalid";
    const parsed = new URL(value, `${validationOrigin}/`);
    return (
      parsed.origin === validationOrigin &&
      parsed.pathname === value &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

function readConfig(env: OAuthEnv): OAuthConfig | null {
  if (
    !isBoundedConfigValue(
      env.GOOGLE_CLIENT_ID,
      MAX_FIELD_LENGTHS.client_id,
    ) ||
    !isBoundedConfigValue(env.GOOGLE_CLIENT_SECRET, 4096) ||
    !isCanonicalRedirectPath(env.OAUTH_REDIRECT_PATH)
  ) {
    return null;
  }

  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectPath: env.OAUTH_REDIRECT_PATH,
  };
}

function isFormUrlEncoded(contentType: string | null) {
  return (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/x-www-form-urlencoded"
  );
}

async function cancelBody(body: ReadableStream<Uint8Array> | null) {
  try {
    await body?.cancel("OAuth token request exceeded the body limit.");
  } catch {
    // The body is already rejected; a cancellation failure is not actionable.
  }
}

async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<string | null> {
  if (!body) {
    return "";
  }

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let result = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        return result + decoder.decode();
      }

      byteLength += chunk.value.byteLength;
      if (byteLength > limit) {
        try {
          await reader.cancel("OAuth token request exceeded the body limit.");
        } catch {
          // The size rejection still takes precedence if cancellation fails.
        }
        return null;
      }

      result += decoder.decode(chunk.value, { stream: true });
    }
  } catch (error) {
    try {
      await reader.cancel("OAuth token request body is invalid.");
    } catch {
      // Preserve the original read or decode failure.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function createOAuthTokenHandler(
  upstreamFetch: typeof fetch = fetch,
): OAuthTokenHandler {
  return async ({ request, env }) => {
    if (request.method !== "POST") {
      return jsonError(
        405,
        "method_not_allowed",
        "Use POST for OAuth token requests.",
        { Allow: "POST" },
      );
    }

    const requestOrigin = new URL(request.url).origin;
    if (request.headers.get("Origin") !== requestOrigin) {
      return jsonError(
        403,
        "invalid_origin",
        "OAuth token requests must be same-origin.",
      );
    }

    if (!isFormUrlEncoded(request.headers.get("Content-Type"))) {
      return jsonError(
        415,
        "unsupported_media_type",
        "Use application/x-www-form-urlencoded.",
      );
    }

    const config = readConfig(env);
    if (!config) {
      return jsonError(
        503,
        "server_configuration_error",
        "OAuth token service is not configured.",
      );
    }

    const contentLength = request.headers.get("Content-Length");
    if (contentLength !== null) {
      const declaredLength = Number(contentLength);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        await cancelBody(request.body);
        return jsonError(
          413,
          "request_too_large",
          "OAuth token request is too large.",
        );
      }
    }

    let inputText: string | null;
    try {
      inputText = await readBodyWithLimit(request.body, MAX_BODY_BYTES);
    } catch {
      return jsonError(
        400,
        "invalid_request",
        "OAuth token request body is invalid.",
      );
    }

    if (inputText === null) {
      return jsonError(
        413,
        "request_too_large",
        "OAuth token request is too large.",
      );
    }

    const input = new URLSearchParams(inputText);
    const grantType = input.get("grant_type");
    const fields =
      grantType === "authorization_code"
        ? AUTHORIZATION_CODE_FIELDS
        : grantType === "refresh_token"
          ? REFRESH_TOKEN_FIELDS
          : null;

    if (!fields) {
      return jsonError(
        400,
        "unsupported_grant_type",
        "Unsupported OAuth grant type.",
      );
    }

    for (const field of fields) {
      const values = input.getAll(field);
      if (values.length === 0 || !values[0]?.trim()) {
        return jsonError(
          400,
          "invalid_request",
          `Missing required field: ${field}.`,
        );
      }
      if (values.length !== 1) {
        return jsonError(
          400,
          "invalid_request",
          `Duplicate field: ${field}.`,
        );
      }
      if (values[0].length > MAX_FIELD_LENGTHS[field]) {
        return jsonError(
          400,
          "invalid_request",
          `Invalid field length: ${field}.`,
        );
      }
    }

    if (input.get("client_id") !== config.clientId) {
      return jsonError(
        400,
        "invalid_client",
        "OAuth client does not match this deployment.",
      );
    }

    const expectedRedirectUri = `${requestOrigin}${config.redirectPath}`;
    if (
      grantType === "authorization_code" &&
      input.get("redirect_uri") !== expectedRedirectUri
    ) {
      return jsonError(
        400,
        "invalid_request",
        "OAuth redirect does not match this deployment.",
      );
    }

    const body = new URLSearchParams();
    for (const field of fields) {
      body.set(field, input.get(field) as string);
    }
    body.set("client_id", config.clientId);
    if (grantType === "authorization_code") {
      body.set("redirect_uri", expectedRedirectUri);
    }
    body.set("client_secret", config.clientSecret);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await upstreamFetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: request.signal,
      });
    } catch {
      return jsonError(
        502,
        "upstream_unavailable",
        "OAuth provider is unavailable.",
      );
    }

    let payload: unknown;
    try {
      payload = await upstreamResponse.json();
    } catch {
      return jsonError(
        502,
        "invalid_upstream_response",
        "OAuth provider returned invalid JSON.",
      );
    }

    return Response.json(payload, {
      status: upstreamResponse.status,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    });
  };
}

export const onRequest = createOAuthTokenHandler();
