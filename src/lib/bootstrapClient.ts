import {
  type BootstrapPayload,
  type BootstrapStageInput,
  validateBootstrapPayload,
} from "./bootstrapPayload";

export type BootstrapStageResult = {
  bootstrapId: string;
  transactionId: string;
  expiresAt: string;
};

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const description = body.error_description;
    if (typeof description === "string" && description.length <= 300) {
      return new Error(description);
    }
  } catch {
    // Fall through to a local bounded message.
  }
  return new Error(`Bootstrap request failed (${response.status})`);
}

async function postBootstrap(body: unknown): Promise<Response> {
  return fetch("/api/bootstrap", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function stageBootstrap(
  input: BootstrapStageInput,
): Promise<BootstrapStageResult> {
  const response = await postBootstrap({ action: "stage", ...input });
  if (!response.ok) throw await responseError(response);
  const body = (await response.json()) as Record<string, unknown>;
  if (
    typeof body.bootstrapId !== "string" ||
    typeof body.transactionId !== "string" ||
    typeof body.expiresAt !== "string"
  ) {
    throw new Error("Bootstrap response is invalid");
  }
  return {
    bootstrapId: body.bootstrapId,
    transactionId: body.transactionId,
    expiresAt: body.expiresAt,
  };
}

export async function consumeBootstrap(): Promise<BootstrapPayload | null> {
  const response = await postBootstrap({ action: "consume" });
  if (response.status === 404) return null;
  if (!response.ok) throw await responseError(response);
  const body = (await response.json()) as Record<string, unknown>;
  const payload = validateBootstrapPayload(body.payload);
  if (!payload) throw new Error("Bootstrap payload is invalid");
  return payload;
}

export async function cancelBootstrap(): Promise<void> {
  const response = await postBootstrap({ action: "cancel" });
  if (!response.ok) throw await responseError(response);
}
