import { readFileSync, writeFileSync } from 'node:fs';

function replaceIfPresent(source, before, after) {
  return source.includes(before) ? source.replace(before, after) : source;
}

const e2ePath = 'e2e/home-carousel.spec.ts';
let e2e = readFileSync(e2ePath, 'utf8');
e2e = replaceIfPresent(
  e2e,
  `    const accountName = editor.getByRole("textbox", {\n      name: "Account name",\n    });\n    await accountName.fill("Travel Wallet");`,
  `    const accountName = editor.getByRole("textbox", {\n      name: "Account name",\n    });\n    await expect(viewport).toHaveAttribute("data-navigation-locked", "true");\n    await accountName.fill("Travel Wallet");`,
);
writeFileSync(e2ePath, e2e);

const carouselTestPath = 'src/components/TransactionFlow/HomeDashboardCarousel.test.tsx';
let carouselTest = readFileSync(carouselTestPath, 'utf8');
const before = `    expect(viewport).toHaveAttribute("data-navigation-locked", "true");\n    expect(viewport).toHaveClass("overflow-x-hidden", "[touch-action:pan-y]");\n    viewport.focus();\n    scrollToMock.mockClear();\n    fireEvent.keyDown(viewport, { key: "ArrowLeft" });\n    expect(scrollToMock).not.toHaveBeenCalled();`;
const after = `    expect(viewport).toHaveAttribute("data-navigation-locked", "true");\n    expect(viewport).toHaveClass("overflow-x-hidden", "[touch-action:pan-y]");\n    viewport.focus();\n    scrollToMock.mockClear();\n    fireEvent.keyDown(viewport, { key: "ArrowLeft" });\n    expect(scrollToMock).not.toHaveBeenCalled();\n\n    viewport.scrollLeft = viewportWidth;\n    fireEvent.scroll(viewport);\n\n    expect(scrollToMock).toHaveBeenCalledWith({ left: viewportWidth * 2, behavior: "auto" });\n    expect(viewport.scrollLeft).toBe(viewportWidth * 2);\n    expect(screen.getByLabelText("Settings, slide 3 of 3")).not.toHaveAttribute(\n      "aria-hidden",\n      "true",\n    );\n    expect(viewport).toHaveAttribute("data-selected-snap", "2");`;
carouselTest = replaceIfPresent(carouselTest, before, after);
writeFileSync(carouselTestPath, carouselTest);
