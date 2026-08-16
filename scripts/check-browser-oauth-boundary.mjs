import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";

const USAGE =
  "Usage: node scripts/check-browser-oauth-boundary.mjs [--root <path>]";
const ROOT_OPEN_FLAGS =
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const ENTRY_OPEN_FLAGS =
  constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW;
const UNSAFE_DIAGNOSTIC_CHARACTERS =
  /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\\]/gu;
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

function escapeDiagnosticPath(filePath) {
  return filePath.replace(UNSAFE_DIAGNOSTIC_CHARACTERS, (character) => {
    if (character === "\\") return "\\\\";
    if (character === "\b") return "\\b";
    if (character === "\t") return "\\t";
    if (character === "\n") return "\\n";
    if (character === "\f") return "\\f";
    if (character === "\r") return "\\r";

    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return "";
    const hexadecimal = codePoint.toString(16).padStart(4, "0");
    return codePoint <= 0xffff
      ? `\\u${hexadecimal}`
      : `\\u{${hexadecimal}}`;
  });
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

function descriptorPath(handle, name) {
  const directory = `/proc/self/fd/${handle.fd}`;
  return name === undefined ? directory : `${directory}/${name}`;
}

function isSymlinkOpenError(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ELOOP"
  );
}

async function openRootDirectory(root) {
  const components = root.split(sep).filter(Boolean);
  let currentHandle;
  try {
    currentHandle = await open(sep, ROOT_OPEN_FLAGS);
    for (const component of components) {
      const parentHandle = currentHandle;
      const nextHandle = await open(
        descriptorPath(parentHandle, component),
        ROOT_OPEN_FLAGS,
      );
      currentHandle = nextHandle;
      try {
        await parentHandle.close();
      } catch (error) {
        await nextHandle.close().catch(() => undefined);
        throw error;
      }
    }
    return currentHandle;
  } catch (error) {
    await currentHandle?.close().catch(() => undefined);
    throw error;
  }
}

async function scanDirectory(directoryHandle, relativeParts, violations) {
  const entries = await readdir(descriptorPath(directoryHandle), {
    withFileTypes: true,
  });
  entries.sort((left, right) => compareText(left.name, right.name));

  for (const entry of entries) {
    let entryHandle;
    try {
      entryHandle = await open(
        descriptorPath(directoryHandle, entry.name),
        ENTRY_OPEN_FLAGS,
      );
    } catch (error) {
      if (isSymlinkOpenError(error)) continue;
      throw error;
    }

    try {
      const entryStat = await entryHandle.stat();
      if (entryStat.isDirectory()) {
        await scanDirectory(
          entryHandle,
          [...relativeParts, entry.name],
          violations,
        );
        continue;
      }
      if (!entryStat.isFile()) continue;

      const file = await entryHandle.readFile();
      const filePath = [...relativeParts, entry.name].join("/");
      for (const material of MATERIALS) {
        if (file.includes(material.bytes)) {
          violations.push({
            filePath,
            label: material.label,
            materialIndex: material.index,
          });
        }
      }
    } finally {
      await entryHandle.close();
    }
  }
}

async function scanRoot(root, violations) {
  const rootHandle = await openRootDirectory(root);
  try {
    await scanDirectory(rootHandle, [], violations);
  } finally {
    await rootHandle.close();
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
    await scanRoot(root, violations);
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
        .map(
          ({ filePath, label }) =>
            `${label}: ${escapeDiagnosticPath(filePath)}`,
        )
        .join("\n")}\n`,
    );
    process.exitCode = 1;
  }
}

await main();
