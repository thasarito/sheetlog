import { describe, expect, it } from "vitest";
import {
  detectBankCountry,
  getCountryCatalog,
  searchBankCatalog,
  SUPPORTED_CURRENCIES,
} from "./bankCatalog";

describe("bank catalog", () => {
  it("prefers a supported timezone country when locale and timezone disagree", () => {
    expect(detectBankCountry(["en-US"], "Asia/Bangkok")).toBe("TH");
  });

  it("falls back to a supported locale region", () => {
    expect(detectBankCountry(["ja-JP"], "Etc/UTC")).toBe("JP");
  });

  it("returns exactly eight featured banks for every supported country", () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(currency).toMatch(/^[A-Z]{3}$/);
    }
    expect(getCountryCatalog("TH").banks).toHaveLength(8);
    expect(getCountryCatalog("US").banks).toHaveLength(8);
  });

  it("matches Thai aliases without requiring an English bank name", () => {
    const [result] = searchBankCatalog("กสิกร", "TH");
    expect(result).toMatchObject({
      countryCode: "TH",
      bank: { id: "kbank", name: "KBank" },
    });
  });

  it("searches globally while ranking the preferred country first", () => {
    const results = searchBankCatalog("HSBC", "SG");
    expect(results[0]?.countryCode).toBe("SG");
    expect(new Set(results.map((result) => result.countryCode))).toEqual(
      new Set(["SG", "AE", "GB", "MX"]),
    );
  });
});
