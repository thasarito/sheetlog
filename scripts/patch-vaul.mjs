import { readFile, writeFile } from "node:fs/promises";

// Vaul 1.1.2 does not forward `modal` to its Radix Dialog root (upstream #496),
// and nested drawers overwrite a snapped parent drawer's transform. Keep these
// exact-version compatibility fixes until an upgraded Vaul release covers both.
const VAUL_VERSION = "1.1.2";
const vaulPackageUrl = new URL("../node_modules/vaul/package.json", import.meta.url);
const vaulPackage = JSON.parse(await readFile(vaulPackageUrl, "utf8"));

if (vaulPackage.version !== VAUL_VERSION) {
  throw new Error(
    `Expected vaul ${VAUL_VERSION}, found ${vaulPackage.version}. Verify whether these compatibility fixes are still needed before updating this patch.`,
  );
}

const unpatchedModalRoot = `        open: isOpen
    }, /*#__PURE__*/`;
const patchedModalRoot = `        open: isOpen,
        modal: modal
    }, /*#__PURE__*/`;
const unpatchedNestedOpen = `    function onNestedOpenChange(o) {
        const scale =`;
const patchedNestedOpen = `    function onNestedOpenChange(o) {
        if (snapPoints && activeSnapPointIndex !== null) {
            const snapPointOffset = snapPointsOffset[activeSnapPointIndex];
            if (typeof snapPointOffset === 'number') {
                if (nestedOpenChangeTimer.current) {
                    window.clearTimeout(nestedOpenChangeTimer.current);
                }
                set(drawerRef.current, {
                    transition: 'none',
                    transform: isVertical(direction) ? 'translate3d(0, ' + snapPointOffset + 'px, 0)' : 'translate3d(' + snapPointOffset + 'px, 0, 0)'
                });
                return;
            }
        }
        const scale =`;
const unpatchedNestedDrag = `    function onNestedDrag(_event, percentageDragged) {
        if (percentageDragged < 0) return;`;
const patchedNestedDrag = `    function onNestedDrag(_event, percentageDragged) {
        if (snapPoints) return;
        if (percentageDragged < 0) return;`;
const unpatchedNestedRelease = `    function onNestedRelease(_event, o) {
        const dim =`;
const patchedNestedRelease = `    function onNestedRelease(_event, o) {
        if (snapPoints) return;
        const dim =`;
const bundleUrls = [
  new URL("../node_modules/vaul/dist/index.js", import.meta.url),
  new URL("../node_modules/vaul/dist/index.mjs", import.meta.url),
];

for (const bundleUrl of bundleUrls) {
  let source = await readFile(bundleUrl, "utf8");
  if (!source.includes(patchedModalRoot)) {
    if (!source.includes(unpatchedModalRoot)) {
      throw new Error(
        `Could not find the expected vaul modal Root code in ${bundleUrl.pathname}.`,
      );
    }
    source = source.replace(unpatchedModalRoot, patchedModalRoot);
  }
  if (!source.includes(patchedNestedOpen)) {
    if (!source.includes(unpatchedNestedOpen)) {
      throw new Error(
        `Could not find the expected vaul nested-open code in ${bundleUrl.pathname}.`,
      );
    }
    source = source.replace(unpatchedNestedOpen, patchedNestedOpen);
  }
  if (!source.includes(patchedNestedDrag)) {
    if (!source.includes(unpatchedNestedDrag)) {
      throw new Error(
        `Could not find the expected vaul nested-drag code in ${bundleUrl.pathname}.`,
      );
    }
    source = source.replace(unpatchedNestedDrag, patchedNestedDrag);
  }
  if (!source.includes(patchedNestedRelease)) {
    if (!source.includes(unpatchedNestedRelease)) {
      throw new Error(
        `Could not find the expected vaul nested-release code in ${bundleUrl.pathname}.`,
      );
    }
    source = source.replace(unpatchedNestedRelease, patchedNestedRelease);
  }
  if (!source.includes(patchedModalRoot)) {
    throw new Error(
      `Failed to patch the vaul modal Root code in ${bundleUrl.pathname}.`,
    );
  }
  await writeFile(bundleUrl, source);
}

console.log("Applied vaul compatibility fixes.");
