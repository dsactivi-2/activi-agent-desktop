import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = resolve("scripts/audit-white-label.mjs");

function createFixture(): {
  root: string;
  localeFile: string;
  settingsFile: string;
  readmeFile: string;
} {
  const root = mkdtempSync(join(tmpdir(), "activi-white-label-audit-"));
  const localeDir = join(root, "src/shared/i18n/locales/de");
  const settingsDir = join(root, "src/renderer/src/screens/Settings");
  mkdirSync(localeDir, { recursive: true });
  mkdirSync(settingsDir, { recursive: true });
  writeFileSync(join(root, "package.json"), "{}\n");

  const readmeFile = join(root, "README.md");
  writeFileSync(
    readmeFile,
    [
      "Hermes Desktop installs Hermes Agent.",
      "Hermes files are stored in ~/.hermes.",
      "",
    ].join("\n"),
  );

  const localeFile = join(localeDir, "memory.ts");
  writeFileSync(
    localeFile,
    [
      "export default {",
      '  appName: "Agente Hermes",',
      '  subtitle: "What Hermes remembers across sessions.",',
      '  home: "~/.hermes",',
      "} as const;",
      "",
    ].join("\n"),
  );

  const settingsFile = join(settingsDir, "Settings.tsx");
  writeFileSync(
    settingsFile,
    [
      'localStorage.getItem("hermes-version-cache");',
      'const label = "Hermes engine info";',
      "",
    ].join("\n"),
  );

  return { root, localeFile, settingsFile, readmeFile };
}

describe("white-label audit fixer", () => {
  it("dry-runs safe visible text changes without editing files", () => {
    const { root, localeFile } = createFixture();
    const before = readFileSync(localeFile, "utf8");

    const output = execFileSync(
      "node",
      [scriptPath, "--root", root, "--fix", "--dry-run"],
      { encoding: "utf8" },
    );

    expect(output).toContain("Fix mode: dry-run");
    expect(output).toContain("safe-visible-hermes-reference");
    expect(readFileSync(localeFile, "utf8")).toBe(before);
  });

  it("applies only safe visible text changes and leaves technical keys intact", () => {
    const { root, localeFile, settingsFile } = createFixture();

    execFileSync("node", [scriptPath, "--root", root, "--fix", "--apply"], {
      encoding: "utf8",
    });

    expect(readFileSync(localeFile, "utf8")).toContain(
      "What Activi Agent remembers across sessions.",
    );
    expect(readFileSync(localeFile, "utf8")).toContain('"Activi Agent"');
    expect(readFileSync(localeFile, "utf8")).not.toContain(
      "Agente Activi Agent",
    );
    expect(readFileSync(localeFile, "utf8")).toContain('"~/.hermes"');
    expect(readFileSync(settingsFile, "utf8")).toContain(
      'localStorage.getItem("hermes-version-cache");',
    );
    expect(readFileSync(settingsFile, "utf8")).toContain(
      '"Activi Agent engine info"',
    );
  });

  it("full-low mode also rewrites visible README and technical-context copy", () => {
    const { root, localeFile, readmeFile } = createFixture();

    const dryRun = execFileSync(
      "node",
      [scriptPath, "--root", root, "--fix-all-low", "--dry-run"],
      { encoding: "utf8" },
    );
    expect(dryRun).toContain("Fix mode: full-low dry-run");

    execFileSync(
      "node",
      [scriptPath, "--root", root, "--fix-all-low", "--apply"],
      { encoding: "utf8" },
    );

    expect(readFileSync(readmeFile, "utf8")).toContain(
      "Activi Agent Desktop installs Activi Agent.",
    );
    expect(readFileSync(readmeFile, "utf8")).toContain(
      "Activi Agent files are stored in ~/.hermes.",
    );
    expect(readFileSync(localeFile, "utf8")).toContain(
      "What Activi Agent remembers across sessions.",
    );
  });
});
