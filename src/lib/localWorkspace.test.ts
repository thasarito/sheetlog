import { describe, expect, it } from "vitest";
import {
  createLocalWorkspaceMetadata,
  readLocalWorkspace,
  writeLocalWorkspace,
} from "./localWorkspace";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("local workspace metadata", () => {
  it("creates stable synthetic scope IDs from a bootstrap ID", () => {
    const first = createLocalWorkspaceMetadata({
      bootstrapId: "bootstrap-1",
      countryCode: "TH",
      currency: "THB",
      createdAt: "2026-08-26T10:00:00.000Z",
    });
    const second = createLocalWorkspaceMetadata({
      bootstrapId: "bootstrap-1",
      countryCode: "TH",
      currency: "THB",
      createdAt: "2026-08-26T10:00:00.000Z",
    });
    expect(first).toEqual(second);
    expect(first.userId).toContain("bootstrap-1");
    expect(first.sheetId).toContain("bootstrap-1");
  });

  it("round-trips valid metadata and ignores corrupt storage", () => {
    const storage = memoryStorage();
    const metadata = createLocalWorkspaceMetadata({
      bootstrapId: "bootstrap-2",
      countryCode: "JP",
      currency: "JPY",
      createdAt: "2026-08-26T10:00:00.000Z",
    });
    writeLocalWorkspace(metadata, storage);
    expect(readLocalWorkspace(storage)).toEqual(metadata);
    storage.setItem("sheetlog.localWorkspace", "not-json");
    expect(readLocalWorkspace(storage)).toBeNull();
  });
});
