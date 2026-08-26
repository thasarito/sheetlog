import {
  type BootstrapPayload,
  validateBootstrapPayload,
  validateBootstrapStageInput,
} from "../../src/lib/bootstrapPayload";

interface BootstrapEnv {
  BOOTSTRAP_ENCRYPTION_KEY?: string;
}

interface BootstrapContext {
  request: Request;
  env: BootstrapEnv;
}

type BootstrapHandler = (context: BootstrapContext) => Promise<Response>;

type BootstrapHandlerOptions = {
  now?: () => number;
};

const COOKIE_NAME = "__Host-sheetlog_bootstrap";
const COOKIE_MAX_AGE_SECONDS = 30 * 60;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_SECRET_LENGTH = 4096;
const ADDITIONAL_DATA = new TextEncoder().encode("sheetlog-bootstrap-v1");

function responseHeaders(extra: HeadersInit = {}) {
  return new Headers({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    ...Object.fromEntries(new Headers(extra).entries()),
  });
}

function jsonResponse(
  value: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
) {
  return Response.json(value, {
    status,
    headers: responseHeaders(extraHeaders),
  });
}

function jsonError(status: number, error: string, description: string) {
  return jsonResponse({ error, error_description: description }, status);
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function bootstrapCookie(token: string) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function readCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return value.join("=") || null;
  }
  return null;
}

function isJson(contentType: string | null) {
  return (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

function readSecret(env: BootstrapEnv): string | null {
  const value = env.BOOTSTRAP_ENCRYPTION_KEY;
  return typeof value === "string" &&
    value.length >= 32 &&
    value.length <= MAX_SECRET_LENGTH &&
    value.trim() === value
    ? value
    : null;
}

async function readJsonWithLimit(request: Request): Promise<unknown | null> {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return null;
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    return undefined;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + 0x8000),
    );
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function sealPayload(
  payload: BootstrapPayload,
  secret: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: ADDITIONAL_DATA },
    await encryptionKey(secret),
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(
    new Uint8Array(ciphertext),
  )}`;
}

async function unsealPayload(
  token: string,
  secret: string,
): Promise<unknown | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const iv = base64UrlToBytes(parts[0]);
  const ciphertext = base64UrlToBytes(parts[1]);
  if (!iv || iv.byteLength !== 12 || !ciphertext) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: ADDITIONAL_DATA },
      await encryptionKey(secret),
      ciphertext,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  } catch {
    return null;
  }
}

export function createBootstrapHandler(
  options: BootstrapHandlerOptions = {},
): BootstrapHandler {
  return async ({ request, env }) => {
    if (request.method !== "POST") {
      return jsonError(
        405,
        "method_not_allowed",
        "Use POST for bootstrap requests.",
      );
    }
    const requestOrigin = new URL(request.url).origin;
    if (request.headers.get("Origin") !== requestOrigin) {
      return jsonError(
        403,
        "invalid_origin",
        "Bootstrap requests must be same-origin.",
      );
    }
    if (!isJson(request.headers.get("Content-Type"))) {
      return jsonError(
        415,
        "unsupported_media_type",
        "Use application/json.",
      );
    }
    const secret = readSecret(env);
    if (!secret) {
      return jsonError(
        503,
        "server_configuration_error",
        "Bootstrap handoff is not configured.",
      );
    }
    const body = await readJsonWithLimit(request);
    if (body === null) {
      return jsonError(
        413,
        "request_too_large",
        "Bootstrap request is too large.",
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError(
        400,
        "invalid_request",
        "Bootstrap request is invalid.",
      );
    }
    const action = (body as Record<string, unknown>).action;
    const now = options.now?.() ?? Date.now();

    if (action === "stage") {
      const parsed = validateBootstrapStageInput(body);
      if (!parsed) {
        return jsonError(
          400,
          "invalid_request",
          "Bootstrap setup is invalid.",
        );
      }
      const payload: BootstrapPayload = {
        version: 1,
        bootstrapId: crypto.randomUUID(),
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(
          now + COOKIE_MAX_AGE_SECONDS * 1000,
        ).toISOString(),
        setup: parsed.setup,
        transaction: {
          id: crypto.randomUUID(),
          ...parsed.transaction,
        },
      };
      const token = await sealPayload(payload, secret);
      return jsonResponse(
        {
          bootstrapId: payload.bootstrapId,
          transactionId: payload.transaction.id,
          expiresAt: payload.expiresAt,
        },
        201,
        { "Set-Cookie": bootstrapCookie(token) },
      );
    }

    if (action === "consume") {
      const token = readCookie(request);
      if (!token) {
        return jsonResponse(
          {
            error: "bootstrap_not_found",
            error_description: "No pending bootstrap was found.",
          },
          404,
          { "Set-Cookie": clearCookie() },
        );
      }
      const payload = validateBootstrapPayload(
        await unsealPayload(token, secret),
        now,
      );
      if (!payload) {
        return jsonResponse(
          {
            error: "invalid_bootstrap",
            error_description:
              "The pending bootstrap is invalid or expired.",
          },
          400,
          { "Set-Cookie": clearCookie() },
        );
      }
      return jsonResponse(
        { payload },
        200,
        { "Set-Cookie": clearCookie() },
      );
    }

    if (action === "cancel") {
      return new Response(null, {
        status: 204,
        headers: responseHeaders({ "Set-Cookie": clearCookie() }),
      });
    }

    return jsonError(
      400,
      "invalid_action",
      "Unsupported bootstrap action.",
    );
  };
}

export const onRequest = createBootstrapHandler();
