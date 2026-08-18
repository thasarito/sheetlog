import { readFile, writeFile } from "node:fs/promises";

// Vaul 1.1.2 does not forward `modal` to its Radix Dialog root (upstream #496).
// Keep this exact-version patch until a Vaul release includes that merged fix.
const VAUL_VERSION = "1.1.2";
const vaulPackageUrl = new URL("../node_modules/vaul/package.json", import.meta.url);
const vaulPackage = JSON.parse(await readFile(vaulPackageUrl, "utf8"));

if (vaulPackage.version !== VAUL_VERSION) {
  throw new Error(
    `Expected vaul ${VAUL_VERSION}, found ${vaulPackage.version}. Verify whether the non-modal Root fix is released before updating this patch.`,
  );
}

const unpatched = `        open: isOpen
    }, /*#__PURE__*/`;
const patched = `        open: isOpen,
        modal: modal
    }, /*#__PURE__*/`;
const bundleUrls = [
  new URL("../node_modules/vaul/dist/index.js", import.meta.url),
  new URL("../node_modules/vaul/dist/index.mjs", import.meta.url),
];

for (const bundleUrl of bundleUrls) {
  const source = await readFile(bundleUrl, "utf8");
  if (source.includes(patched)) continue;
  if (!source.includes(unpatched)) {
    throw new Error(
      `Could not find the expected vaul non-modal Root code in ${bundleUrl.pathname}.`,
    );
  }
  await writeFile(bundleUrl, source.replace(unpatched, patched));
}

console.log("Applied vaul non-modal Root fix.");
