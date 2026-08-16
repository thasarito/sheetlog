/// <reference types="node" />

import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  ftruncateSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// Keep this browser project's DOM timer return type when Node types are loaded
// for the guard's process-level integration tests.
declare global {
  function setTimeout<TArgs extends unknown[]>(
    callback: (...args: TArgs) => void,
    delay?: number,
    ...args: TArgs
  ): number;
}

const PROJECT_ROOT = process.cwd();
const SCRIPT_PATH = resolve(
  PROJECT_ROOT,
  "scripts",
  "check-browser-oauth-boundary.mjs",
);
const BUILD_COMMAND = [
  "vite build",
  "node scripts/check-browser-oauth-boundary.mjs",
].join(" && ");
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
] as const;

const temporaryDirectories: string[] = [];

function makeTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "sheetlog-oauth-boundary-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeFixture(
  root: string,
  relativePath: string,
  contents: string | Uint8Array,
) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function runGuard(args: string[] = [], cwd = PROJECT_ROOT) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function processHasOpenFile(processId: number, filePath: string) {
  const descriptorRoot = `/proc/${processId}/fd`;
  try {
    return readdirSync(descriptorRoot).some((descriptor) => {
      try {
        return readlinkSync(join(descriptorRoot, descriptor)) === filePath;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function waitForOpenFile(processId: number, filePath: string) {
  const deadline = Date.now() + 5_000;
  const waiter = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < deadline) {
    if (processHasOpenFile(processId, filePath)) return;
    Atomics.wait(waiter, 0, 0, 1);
  }
  throw new Error("scanner did not reach the synchronization fixture");
}

async function runGuardWithEntrySwap(
  scanRoot: string,
  synchronizationFile: string,
  victimFile: string,
  symlinkTarget: string,
) {
  const child = spawn(process.execPath, [SCRIPT_PATH, "--root", scanRoot], {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const completion = new Promise<{
    status: number | null;
    stderr: string;
    stdout: string;
  }>((resolveCompletion, rejectCompletion) => {
    child.once("error", rejectCompletion);
    child.once("close", (status) => {
      resolveCompletion({ status, stderr, stdout });
    });
  });

  try {
    if (child.pid === undefined) throw new Error("scanner did not start");
    waitForOpenFile(child.pid, synchronizationFile);
    const replacement = `${victimFile}.replacement`;
    symlinkSync(symlinkTarget, replacement);
    renameSync(replacement, victimFile);
  } catch (error) {
    child.kill("SIGKILL");
    await completion.catch(() => undefined);
    throw error;
  }

  return completion;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("browser OAuth boundary guard", () => {
  it("accepts safe nested and binary build files without following symlinks", () => {
    const workspace = makeTemporaryDirectory();
    const scanRoot = join(workspace, "dist");
    writeFixture(scanRoot, "nested/app.js", "const boundary = 'safe';\n");
    writeFixture(
      scanRoot,
      "assets/chunk.bin",
      new Uint8Array([0, 255, 17, 32, 128, 10]),
    );

    const ignoredTarget = join(workspace, "outside-build.js");
    writeFileSync(ignoredTarget, MATERIALS[0].value);
    symlinkSync(ignoredTarget, join(scanRoot, "ignored-link.js"));

    const result = runGuard([], workspace);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("rejects a scan root with a symlinked ancestor", () => {
    const workspace = makeTemporaryDirectory();
    const realRoot = join(workspace, "real", "dist");
    writeFixture(realRoot, "unsafe.js", MATERIALS[1].value);
    const alias = join(workspace, "alias");
    symlinkSync(join(workspace, "real"), alias, "dir");

    const result = runGuard(["--root", join(alias, "dist")]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "OAuth boundary scan failed: unable to scan root.\n",
    );
  });

  it("does not follow an entry replaced with a symlink after enumeration", async () => {
    const workspace = makeTemporaryDirectory();
    const scanRoot = join(workspace, "dist");
    mkdirSync(scanRoot, { recursive: true });
    const synchronizationFile = join(scanRoot, "a-synchronization.bin");
    const descriptor = openSync(synchronizationFile, "w");
    try {
      ftruncateSync(descriptor, 64 * 1024 * 1024);
    } finally {
      closeSync(descriptor);
    }
    const victimFile = join(scanRoot, "z-victim.js");
    writeFileSync(victimFile, "safe");
    const symlinkTarget = join(workspace, "outside-build.js");
    writeFileSync(symlinkTarget, MATERIALS[0].value);

    const result = await runGuardWithEntrySwap(
      scanRoot,
      synchronizationFile,
      victimFile,
      symlinkTarget,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("reports every forbidden category in deterministic path order", () => {
    const workspace = makeTemporaryDirectory();
    const scanRoot = join(workspace, "browser-output");
    writeFixture(
      scanRoot,
      "z-environment.js",
      `${MATERIALS[0].value}=private-environment-value`,
    );
    writeFixture(
      scanRoot,
      "nested/m-field.json",
      `{"${MATERIALS[1].value}":"private-field-value"}`,
    );
    writeFixture(
      scanRoot,
      "a-token.bin",
      Buffer.concat([
        Buffer.from([0, 1, 2]),
        Buffer.from(MATERIALS[2].value),
        Buffer.from([3, 4, 5]),
      ]),
    );
    const expectedReport = [
      `${MATERIALS[2].label}: a-token.bin`,
      `${MATERIALS[1].label}: nested/m-field.json`,
      `${MATERIALS[0].label}: z-environment.js`,
      "",
    ].join("\n");

    const firstRun = runGuard(["--root", scanRoot]);
    const secondRun = runGuard(["--root", scanRoot]);

    expect(firstRun.status).toBe(1);
    expect(firstRun.stdout).toBe("");
    expect(firstRun.stderr).toBe(expectedReport);
    expect(secondRun.stderr).toBe(firstRun.stderr);
    expect(firstRun.stderr).not.toContain("private-environment-value");
    expect(firstRun.stderr).not.toContain("private-field-value");
    for (const material of MATERIALS) {
      expect(firstRun.stderr).not.toContain(material.value);
    }
  });

  it("escapes control characters so each violation stays on one line", () => {
    const workspace = makeTemporaryDirectory();
    const scanRoot = join(workspace, "dist");
    writeFixture(
      scanRoot,
      "nested\nsegment/bad\t\u001b.js",
      MATERIALS[1].value,
    );

    const result = runGuard(["--root", scanRoot]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      `${MATERIALS[1].label}: nested\\nsegment/bad\\t\\u001b.js\n`,
    );
    expect(result.stderr.split("\n")).toHaveLength(2);
  });

  it("fails safely when the scan root is missing", () => {
    const workspace = makeTemporaryDirectory();
    const missingRoot = join(workspace, "missing-output");

    const result = runGuard(["--root", missingRoot]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "OAuth boundary scan failed: unable to scan root.\n",
    );
    expect(result.stderr).not.toContain(missingRoot);
  });

  it("fails generically when a regular build file cannot be read", () => {
    const workspace = makeTemporaryDirectory();
    const scanRoot = join(workspace, "dist");
    const isolatedScript = join(workspace, "boundary-guard.mjs");
    const unreadableFile = join(scanRoot, "unreadable.js");
    copyFileSync(SCRIPT_PATH, isolatedScript);
    writeFixture(scanRoot, "unreadable.js", "safe");
    chmodSync(workspace, 0o755);
    chmodSync(isolatedScript, 0o644);
    chmodSync(scanRoot, 0o755);
    chmodSync(unreadableFile, 0o000);
    const identity =
      typeof process.getuid === "function" && process.getuid() === 0
        ? { gid: 65_534, uid: 65_534 }
        : {};

    const result = spawnSync(
      process.execPath,
      [isolatedScript, "--root", scanRoot],
      {
        ...identity,
        cwd: workspace,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "OAuth boundary scan failed: unable to scan root.\n",
    );
    expect(result.stderr).not.toContain(unreadableFile);
  });

  it.each([
    ["an unknown argument", ["--unknown"]],
    ["a missing root value", ["--root"]],
  ])("rejects %s with safe usage guidance", (_name, args) => {
    const result = runGuard(args);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      [
        "OAuth boundary scan failed: invalid arguments.",
        "Usage: node scripts/check-browser-oauth-boundary.mjs [--root <path>]",
        "",
      ].join("\n"),
    );
  });

  it("runs the boundary guard after the production build", () => {
    const packageJson = JSON.parse(
      readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"),
    ) as { scripts?: { build?: string } };

    expect(packageJson.scripts?.build).toBe(BUILD_COMMAND);
  });
});
