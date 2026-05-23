#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWingetManifests } from "./generate-winget-manifests.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const modeArg = args.find((arg) => arg.startsWith("--mode="));
const mode = modeArg ? modeArg.split("=")[1] : "aftercheck";
const json = args.includes("--json");

const VALID_MODES = new Set(["preflight", "dry-run", "aftercheck"]);
if (!VALID_MODES.has(mode)) {
  throw new Error(
    `Invalid mode "${mode}". Use preflight, dry-run, or aftercheck.`,
  );
}

const results = [];

function read(relPath) {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

function record(status, area, message, detail = "") {
  results.push({ status, area, message, detail });
}

function pass(area, message, detail) {
  record("pass", area, message, detail);
}

function warn(area, message, detail) {
  record("warn", area, message, detail);
}

function fail(area, message, detail) {
  record("fail", area, message, detail);
}

function expectIncludes(area, content, needle, message = `contains ${needle}`) {
  if (content.includes(needle)) pass(area, message);
  else fail(area, message, `Missing: ${needle}`);
}

function expectNotIncludes(
  area,
  content,
  needle,
  message = `does not contain ${needle}`,
) {
  if (!content.includes(needle)) pass(area, message);
  else fail(area, message, `Unexpected: ${needle}`);
}

function checkPackage() {
  const pkg = JSON.parse(read("package.json"));
  const area = "package";

  if (pkg.name === "activi-desktop")
    pass(area, "package name is activi-desktop");
  else fail(area, "package name must be activi-desktop", pkg.name);

  if (/^\d+\.\d+\.\d+/.test(pkg.version))
    pass(area, "package version is release-like", pkg.version);
  else fail(area, "package version must be semver-like", pkg.version);

  if (pkg.homepage === "https://github.com/dsactivi-2/activi-agent-desktop") {
    pass(area, "homepage points to Activi desktop repo");
  } else {
    fail(area, "homepage must point to Activi desktop repo", pkg.homepage);
  }

  expectIncludes(
    area,
    JSON.stringify(pkg.scripts),
    "release:windows:preflight",
  );
  expectIncludes(area, JSON.stringify(pkg.scripts), "release:windows:dry-run");
  expectIncludes(
    area,
    JSON.stringify(pkg.scripts),
    "release:windows:aftercheck",
  );
}

function checkElectronBuilder() {
  const yml = read("electron-builder.yml");
  const area = "electron-builder";

  expectIncludes(area, yml, "productName: Activi Agent");
  expectIncludes(area, yml, "appId: com.activi.agent");
  expectIncludes(area, yml, "win:");
  expectIncludes(area, yml, "executableName: activi-agent");
  expectIncludes(area, yml, "icon: build/icon.ico");
  expectIncludes(area, yml, "nsis:");
  expectIncludes(area, yml, "artifactName: ${name}-${version}-setup.${ext}");
  expectIncludes(area, yml, "shortcutName: ${productName}");
  expectIncludes(area, yml, "provider: github");
  expectIncludes(area, yml, "owner: dsactivi-2");
  expectIncludes(area, yml, "repo: activi-agent-desktop");
}

function checkWorkflow() {
  const workflow = read(".github/workflows/release.yml");
  const area = "workflow";

  expectIncludes(area, workflow, "release_windows:");
  expectIncludes(area, workflow, "runs-on: windows-latest");
  expectIncludes(area, workflow, "arch: [x64]");
  expectIncludes(area, workflow, "WINDOWS_CSC_LINK");
  expectIncludes(area, workflow, "WINDOWS_CSC_KEY_PASSWORD");
  expectIncludes(area, workflow, "windows-${{ matrix.arch }}-artifacts");
  expectIncludes(area, workflow, "windows-x64-artifacts");
  expectIncludes(area, workflow, "RELEASE_OWNER: dsactivi-2");
  expectIncludes(area, workflow, "RELEASE_REPO: activi-agent-desktop");
  expectIncludes(
    area,
    workflow,
    "WINGET_PACKAGE_IDENTIFIER: Activi.ActiviAgent",
  );
  expectIncludes(
    area,
    workflow,
    "name: Activi Agent ${{ needs.prepare.outputs.tag }}",
  );
  expectIncludes(
    area,
    workflow,
    "name.startsWith(`activi-desktop-${version}-`)",
  );
  expectNotIncludes(area, workflow, "PUBLISH_OWNER: fathah");
  expectNotIncludes(area, workflow, "name: Hermes Desktop");
  expectNotIncludes(area, workflow, "windows-artifacts\n");
}

function checkWingetTemplates() {
  const area = "winget-templates";
  const templates = [
    "build/winget/Installer.template.yaml",
    "build/winget/Locale.en-US.template.yaml",
    "build/winget/Version.template.yaml",
  ];

  for (const template of templates) {
    const content = read(template);
    expectIncludes(
      area,
      content,
      "PackageIdentifier: {{PACKAGE_IDENTIFIER}}",
      template,
    );
    expectIncludes(area, content, "PackageVersion: {{VERSION}}", template);
    expectNotIncludes(area, content, "NousResearch.HermesDesktop", template);
    expectNotIncludes(area, content, "fathah/hermes-desktop", template);
    expectNotIncludes(area, content, "Hermes Agent", template);
  }

  const locale = read("build/winget/Locale.en-US.template.yaml");
  expectIncludes(area, locale, "Publisher: Activi");
  expectIncludes(area, locale, "PackageName: Activi Agent");
  expectIncludes(
    area,
    locale,
    "PackageUrl: https://github.com/dsactivi-2/activi-agent-desktop",
  );
}

function checkGeneratorScript() {
  const script = read("scripts/generate-winget-manifests.mjs");
  const area = "winget-generator";

  expectIncludes(area, script, "releaseOwner");
  expectIncludes(area, script, "releaseRepo");
  expectIncludes(area, script, "packageIdentifier");
  expectIncludes(area, script, "Activi.ActiviAgent");
  expectIncludes(area, script, "dsactivi-2");
  expectIncludes(area, script, "activi-agent-desktop");
  expectNotIncludes(area, script, "publishOwner");
  expectNotIncludes(area, script, "PUBLISH_OWNER");
  expectNotIncludes(area, script, "NousResearch");
}

async function copyTemplate(relPath, tmpRoot) {
  const target = join(tmpRoot, relPath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(ROOT, relPath), target);
}

async function runWingetDryRun() {
  const area = "winget-dry-run";
  const tmpRoot = mkdtempSync(join(tmpdir(), "activi-winget-dry-run-"));

  try {
    await copyTemplate("build/winget/Installer.template.yaml", tmpRoot);
    await copyTemplate("build/winget/Locale.en-US.template.yaml", tmpRoot);
    await copyTemplate("build/winget/Version.template.yaml", tmpRoot);

    const distDir = join(tmpRoot, "dist");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      join(distDir, "activi-desktop-9.9.9-setup.exe"),
      "fake installer",
    );

    const result = generateWingetManifests({
      rootDir: tmpRoot,
      version: "9.9.9",
      name: "activi-desktop",
      releaseOwner: "dsactivi-2",
      releaseRepo: "activi-agent-desktop",
      packageIdentifier: "Activi.ActiviAgent",
    });

    const expectedDir = join(
      tmpRoot,
      "dist",
      "winget",
      "manifests",
      "a",
      "Activi",
      "ActiviAgent",
      "9.9.9",
    );

    if (result.outDir === expectedDir)
      pass(area, "output directory uses Activi winget layout");
    else
      fail(area, "output directory uses Activi winget layout", result.outDir);

    const installer = readFileSync(
      join(expectedDir, "Activi.ActiviAgent.installer.yaml"),
      "utf-8",
    );
    const locale = readFileSync(
      join(expectedDir, "Activi.ActiviAgent.locale.en-US.yaml"),
      "utf-8",
    );
    const version = readFileSync(
      join(expectedDir, "Activi.ActiviAgent.yaml"),
      "utf-8",
    );

    for (const [name, content] of [
      ["installer", installer],
      ["locale", locale],
      ["version", version],
    ]) {
      if (content.includes("{{"))
        fail(area, `${name} manifest has unresolved placeholders`);
      else pass(area, `${name} manifest has no unresolved placeholders`);
      if (content.includes("Activi.ActiviAgent"))
        pass(area, `${name} manifest has Activi package id`);
      else fail(area, `${name} manifest has Activi package id`);
    }

    if (
      installer.includes(
        "https://github.com/dsactivi-2/activi-agent-desktop/releases/download/v9.9.9/activi-desktop-9.9.9-setup.exe",
      )
    ) {
      pass(area, "installer URL points to Activi GitHub release");
    } else {
      fail(area, "installer URL points to Activi GitHub release");
    }

    if (/InstallerSha256: [A-F0-9]{64}/.test(installer)) {
      pass(area, "installer SHA256 is generated");
    } else {
      fail(area, "installer SHA256 is generated");
    }

    if (locale.includes("Publisher: Activi"))
      pass(area, "locale publisher is Activi");
    else fail(area, "locale publisher is Activi");
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function checkDocs() {
  const area = "docs";
  const readme = read("README.md");
  const runbook = read("docs/runbooks/windows-release.md");

  expectIncludes(area, readme, "winget install Activi.ActiviAgent");
  expectIncludes(
    area,
    readme,
    "https://github.com/dsactivi-2/activi-agent-desktop/releases/",
  );
  expectIncludes(area, runbook, "npm run release:windows:preflight");
  expectIncludes(area, runbook, "npm run release:windows:dry-run");
  expectIncludes(area, runbook, "npm run release:windows:aftercheck");
  expectIncludes(area, runbook, "WINDOWS_CSC_LINK");
  expectIncludes(area, runbook, "WINDOWS_CSC_KEY_PASSWORD");
  expectIncludes(area, runbook, "workflow_dispatch");
  expectIncludes(area, runbook, "dry_run: true");
  expectIncludes(area, runbook, "Activi.ActiviAgent");
}

async function main() {
  checkPackage();
  checkElectronBuilder();
  checkWorkflow();
  checkWingetTemplates();
  checkGeneratorScript();

  if (mode === "dry-run" || mode === "aftercheck") {
    await runWingetDryRun();
  }

  if (mode === "aftercheck") {
    checkDocs();
  } else if (mode === "preflight") {
    warn("docs", "documentation checks are reserved for aftercheck mode");
  }

  const counts = {
    pass: results.filter((item) => item.status === "pass").length,
    warn: results.filter((item) => item.status === "warn").length,
    fail: results.filter((item) => item.status === "fail").length,
  };

  if (json) {
    console.log(JSON.stringify({ mode, counts, results }, null, 2));
  } else {
    console.log(`Windows release ${mode}`);
    console.log("=".repeat(`Windows release ${mode}`.length));
    for (const item of results) {
      const marker =
        item.status === "pass"
          ? "PASS"
          : item.status === "warn"
            ? "WARN"
            : "FAIL";
      console.log(
        `[${marker}] ${item.area}: ${item.message}${item.detail ? ` (${item.detail})` : ""}`,
      );
    }
    console.log("");
    console.log(
      `Summary: ${counts.pass} passed, ${counts.warn} warnings, ${counts.fail} failures`,
    );
  }

  if (counts.fail > 0) process.exitCode = 1;
}

await main();
