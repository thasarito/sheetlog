import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage";
import { TermsPage } from "./TermsPage";

vi.mock("../components/LegalLayout", () => ({
  LegalLayout: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));

describe("Places legal disclosures", () => {
  it("explains what Google receives and what SheetLog stores", () => {
    render(<PrivacyPolicyPage />);

    const copy = document.body.textContent ?? "";
    expect(copy).toContain("Effective date: 2026-08-15");
    expect(copy).toContain("precise location");
    expect(copy).toContain("place-search text");
    expect(copy).toContain("directly from your browser to Google Maps");
    expect(copy).toContain(
      "selected place display name into your transaction note and Google Sheet",
    );
    expect(copy).toContain("raw coordinates");
    expect(copy).toContain("location history");
    expect(copy).toContain("unselected place suggestions");
    expect(copy).toContain("browser's location permission prompt");

    expect(screen.getByRole("link", { name: "Google Privacy Policy" })).toHaveAttribute(
      "href",
      "https://policies.google.com/privacy",
    );
  });

  it("applies Google's Maps terms and warns about provider accuracy", () => {
    render(<TermsPage />);

    const copy = document.body.textContent ?? "";
    expect(copy).toContain("Effective date: 2026-08-15");
    expect(copy).toContain("Google Maps content");
    expect(copy).toContain("accuracy or availability");

    expect(
      screen.getByRole("link", {
        name: "Google Maps/Google Earth Additional Terms of Service",
      }),
    ).toHaveAttribute("href", "https://maps.google.com/help/terms_maps/");
  });
});
