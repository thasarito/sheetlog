import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Keypad } from "./Keypad";

describe("Keypad", () => {
  it("renders DEL button with accessible label", () => {
    const handleChange = vi.fn();
    const html = renderToStaticMarkup(
      <Keypad value="123" onChange={handleChange} />
    );

    // Check if the DEL button has the aria-label
    expect(html).toContain('aria-label="Delete last digit"');
  });

  it("renders number buttons", () => {
    const handleChange = vi.fn();
    const html = renderToStaticMarkup(
      <Keypad value="123" onChange={handleChange} />
    );

    expect(html).toContain(">1</button>");
    expect(html).toContain(">9</button>");
    expect(html).toContain(">0</button>");
  });
});
