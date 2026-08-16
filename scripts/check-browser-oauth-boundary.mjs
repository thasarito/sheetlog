import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const USAGE =
  "Usage: node scripts/check-browser-oauth-boundary.mjs [--root <path>]";
const MATERIALS = [
  {
    label: "environment secret marker",
    value: ["VITE", "GOOGLE", "CLIENT", "SECRET"].join("_"),
  },
  {
    label: "OAuth secret field",
    value: ["client", "secret"].join("_"),
  },
  {
    label: "Google token endpoint",
    value: ["https://oauth2.googleapis.com", "token"].join("/"),
  },
].map((material, index) => ({
  ...material,
  bytes: Buffer.from(material.value),
  index,
}));

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function parseRoot(args) {
  if (args.length === 0) return "dist";
  if (
    args.length === 2 &&
    args[0] === "--root" &&
    args[1].length > 0 &&
    !args[1].startsWith("--")
  ) {
    return args[1];
  }
  return undefined;
}

function relativeFilePath(root, filePath) {
  return relative(root, filePath).split(sep).join("/");
}

async function scanDirectory(root, directory, violations) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareText(left.name, right.name));

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;

    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(root, entryPath, violations);
      continue;
    }
    if (!entry.isFile()) continue;

    const file = await readFile(entryPath);
    const filePath = relativeFilePath(root, entryPath);
    for (const material of MATERIALS) {
      if (file.includes(material.bytes)) {
        violations.push({
          filePath,
          label: material.label,
          materialIndex: material.index,
        });
      }
    }
  }
}

async function main() {
  const rootArgument = parseRoot(process.argv.slice(2));
  if (rootArgument === undefined) {
    process.stderr.write(
      `OAuth boundary scan failed: invalid arguments.\n${USAGE}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const root = resolve(process.cwd(), rootArgument);
  const violations = [];
  try {
    const rootStat = await lstat(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new Error("invalid scan root");
    }
    await scanDirectory(root, root, violations);
  } catch {
    process.stderr.write(
      "OAuth boundary scan failed: unable to scan root.\n",
    );
    process.exitCode = 1;
    return;
  }

  violations.sort(
    (left, right) =>
      compareText(left.filePath, right.filePath) ||
      left.materialIndex - right.materialIndex,
  );
  if (violations.length > 0) {
    process.stderr.write(
      `${violations
        .map(({ filePath, label }) => `${label}: ${filePath}`)
        .join("\n")}\n`,
    );
    process.exitCode = 1;
  }
}

await main();
