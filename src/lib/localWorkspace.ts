import { isCurrency, type Currency } from "./currencies";

export const LOCAL_WORKSPACE_STORAGE_KEY = "sheetlog.localWorkspace";

export type LocalWorkspaceMetadata = {
  version: 1;
  bootstrapId: string;
  userId: string;
  sheetId: string;
  countryCode: string;
  currency: Currency;
  createdAt: string;
};

type CreateLocalWorkspaceInput = {
  bootstrapId: string;
  countryCode: string;
  currency: Currency;
  createdAt: string;
};

function bounded(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    value.trim() === value
  );
}

function validateLocalWorkspace(value: unknown): LocalWorkspaceMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = value as Record<string, unknown>;
  if (
    parsed.version !== 1 ||
    !bounded(parsed.bootstrapId, 128) ||
    !bounded(parsed.userId, 256) ||
    !bounded(parsed.sheetId, 256) ||
    !bounded(parsed.countryCode, 2) ||
    !/^[A-Z]{2}$/.test(parsed.countryCode) ||
    !isCurrency(parsed.currency) ||
    !bounded(parsed.createdAt, 64) ||
    !Number.isFinite(Date.parse(parsed.createdAt))
  ) {
    return null;
  }
  return {
    version: 1,
    bootstrapId: parsed.bootstrapId,
    userId: parsed.userId,
    sheetId: parsed.sheetId,
    countryCode: parsed.countryCode,
    currency: parsed.currency,
    createdAt: parsed.createdAt,
  };
}

export function createLocalWorkspaceMetadata(
  input: CreateLocalWorkspaceInput,
): LocalWorkspaceMetadata {
  const bootstrapId = input.bootstrapId.trim();
  if (!bootstrapId || bootstrapId.length > 128) {
    throw new Error("Bootstrap ID is invalid");
  }
  return {
    version: 1,
    bootstrapId,
    userId: `local-user:${bootstrapId}`,
    sheetId: `local-workspace:${bootstrapId}`,
    countryCode: input.countryCode,
    currency: input.currency,
    createdAt: input.createdAt,
  };
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readLocalWorkspace(
  storage: Storage | null = browserStorage(),
): LocalWorkspaceMetadata | null {
  if (!storage) return null;
  try {
    const serialized = storage.getItem(LOCAL_WORKSPACE_STORAGE_KEY);
    return serialized
      ? validateLocalWorkspace(JSON.parse(serialized) as unknown)
      : null;
  } catch {
    return null;
  }
}

export function writeLocalWorkspace(
  metadata: LocalWorkspaceMetadata,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) throw new Error("Local storage is unavailable");
  const validated = validateLocalWorkspace(metadata);
  if (!validated) throw new Error("Local workspace metadata is invalid");
  storage.setItem(LOCAL_WORKSPACE_STORAGE_KEY, JSON.stringify(validated));
}

export function clearLocalWorkspace(
  storage: Storage | null = browserStorage(),
): void {
  storage?.removeItem(LOCAL_WORKSPACE_STORAGE_KEY);
}
