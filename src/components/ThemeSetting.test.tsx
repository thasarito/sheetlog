import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "../theme";
import { THEME_STORAGE_KEY } from "../theme/themeConfig";
import { ThemeSetting } from "./ThemeSetting";

function renderSetting() {
  return render(
    <ThemeProvider>
      <ThemeSetting />
    </ThemeProvider>,
  );
}

describe("ThemeSetting", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-color-mode");
  });

  it("lists, switches, and persists every preset family", async () => {
    renderSetting();

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "SheetLog",
      "Dracula",
      "Monokai",
      "Wise",
      "X",
      "Pinterest",
    ]);

    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "pinterest" },
    });

    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute("data-theme", "pinterest"),
    );
    expect(JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY) ?? "{}")).toMatchObject({
      themeId: "pinterest",
    });
  });

  it("can override system appearance", async () => {
    renderSetting();

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute("data-color-mode", "dark"),
    );
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("keeps consecutive preset and mode updates together", async () => {
    renderSetting();

    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "monokai" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY) ?? "{}")).toEqual({
        themeId: "monokai",
        mode: "dark",
      }),
    );
  });
});
