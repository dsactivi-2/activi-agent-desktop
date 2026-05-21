#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_DESKTOP_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_OFFICE_ROOT = "/private/tmp/office-kombiteks";

const args = process.argv.slice(2);
const options = {
  strict: args.includes("--strict"),
  json: args.includes("--json"),
  withChecks: args.includes("--with-checks"),
  roots: [],
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--root" && args[i + 1]) {
    options.roots.push(resolve(args[i + 1]));
    i += 1;
  } else if (arg === "--office" && args[i + 1]) {
    options.roots.push(resolve(args[i + 1]));
    i += 1;
  }
}

if (options.roots.length === 0) {
  options.roots.push(DEFAULT_DESKTOP_ROOT);
  if (existsSync(join(DEFAULT_OFFICE_ROOT, "package.json"))) {
    options.roots.push(DEFAULT_OFFICE_ROOT);
  }
}

const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".serena",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const IGNORE_FILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const PERSONAL_PATTERNS = [
  /\bMUJO\b/gi,
  /\bMujo\b/g,
  /\bMyHermes\b/g,
  /\bmyhermes\b/gi,
  /\bdsselmanovic\b/gi,
  /\bStorageBox\b/g,
  /\bwatchdog\b/gi,
  /\bhermes-admin\b/gi,
  /\b8212488253\b/g,
  /\b5\.78\.\d{1,3}\.\d{1,3}\b/g,
  /\b88\.99\.\d{1,3}\.\d{1,3}\b/g,
  /\b100\.122\.\d{1,3}\.\d{1,3}\b/g,
];

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9][A-Za-z0-9._-]{20,}\b/g,
  /\bsk-or-v1-[A-Za-z0-9._-]{20,}\b/g,
  /\bxai-[A-Za-z0-9._-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
  /\bKEY[0-9A-Z]{10,}_[A-Za-z0-9_-]{10,}\b/g,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g,
];

const LEGACY_VISIBLE_PATTERNS = [
  /\bDarasu\b/g,
  /\bClaw3D\b/g,
  /\bClaw3d\b/g,
  /\bclaw3d\b/g,
  /\bMigrate to Hermes\b/g,
  /\bRemote Hermes\b/g,
  /\bTunnel to a remote Hermes\b/g,
  /\bJoin Telegram Community\b/g,
  /https:\/\/t\.me\/hermes_agent_desktop/g,
];

const HERMES_VISIBLE_PATTERN = /\bHermes\b/g;
const IPV4_PATTERN =
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

function isTextFile(file) {
  if (IGNORE_FILE_NAMES.has(file.split("/").pop())) return false;
  const dot = file.lastIndexOf(".");
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(file.slice(dot));
}

function shouldIgnoreDir(name) {
  return IGNORE_DIRS.has(name);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (shouldIgnoreDir(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (stat.isFile() && isTextFile(full)) {
      files.push(full);
    }
  }
  return files;
}

function isVisibleSurface(relPath) {
  return (
    relPath === "README.md" ||
    relPath === "package.json" ||
    relPath === "electron-builder.yml" ||
    relPath.startsWith("src/renderer/") ||
    relPath.startsWith("src/shared/i18n/")
  );
}

function isAllowedHermesReference(relPath, line) {
  if (relPath.startsWith("src/shared/i18n/locales/en/settings.ts")) {
    return line.includes("~/.hermes");
  }
  if (relPath.startsWith("src/renderer/src/components/common/HermesLogo")) {
    return true;
  }
  if (relPath.startsWith("src/renderer/src/screens/Chat/hooks/useLocalCommands")) {
    return true;
  }
  return false;
}

function isAllowedIp(ip, relPath) {
  if (ip === "127.0.0.1" || ip === "0.0.0.0") return true;
  if (
    relPath.startsWith("tests/") ||
    relPath.includes(".test.") ||
    relPath.includes("/tests/")
  ) {
    return true;
  }
  if (relPath.endsWith("detect-provider.ts")) return true;
  if (ip.startsWith("10.")) return relPath === "src/shared/app-config.ts";
  if (ip.startsWith("192.168.")) return false;
  const [a, b] = ip.split(".").map(Number);
  if (a === 172 && b >= 16 && b <= 31) return false;
  return false;
}

function isAllowedLegacyReference(relPath, line) {
  if (line.includes("claw3d:onboarding:completed")) return true;
  if (line.includes("assets/branding/claw3d-hero.png")) return true;
  if (line.includes("~/.openclaw/claw3d/settings.json")) return true;
  if (line.includes("CLAW3D_GATEWAY_")) return true;
  if (relPath.startsWith("tests/") || relPath.includes("/tests/")) return true;
  return false;
}

function addFinding(findings, severity, repo, relPath, lineNo, kind, message, value) {
  findings.push({
    severity,
    repo,
    file: relPath,
    line: lineNo,
    kind,
    message,
    value,
  });
}

function scanPatternList({ findings, repo, relPath, line, lineNo, patterns, severity, kind, message }) {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(line))) {
      addFinding(findings, severity, repo, relPath, lineNo, kind, message, match[0]);
    }
  }
}

function scanRepo(root) {
  const repoName = root === DEFAULT_DESKTOP_ROOT ? "desktop" : root.split("/").pop();
  const findings = [];
  const files = walk(root);

  for (const file of files) {
    const relPath = relative(root, file);
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const lineNo = index + 1;

      scanPatternList({
        findings,
        repo: repoName,
        relPath,
        line,
        lineNo,
        patterns: SECRET_PATTERNS,
        severity: "high",
        kind: "secret",
        message: "Possible hardcoded secret/token",
      });

      scanPatternList({
        findings,
        repo: repoName,
        relPath,
        line,
        lineNo,
        patterns: PERSONAL_PATTERNS,
        severity: "high",
        kind: "personal-server-data",
        message: "Possible personal server/person identifier",
      });

      IPV4_PATTERN.lastIndex = 0;
      let ipMatch;
      while ((ipMatch = IPV4_PATTERN.exec(line))) {
        const ip = ipMatch[0];
        if (!isAllowedIp(ip, relPath)) {
          addFinding(
            findings,
            "medium",
            repoName,
            relPath,
            lineNo,
            "hardcoded-ip",
            "Hardcoded IP address should be a variable or neutral placeholder",
            ip,
          );
        }
      }

      if (isVisibleSurface(relPath)) {
        if (!isAllowedLegacyReference(relPath, line)) {
          scanPatternList({
            findings,
            repo: repoName,
            relPath,
            line,
            lineNo,
            patterns: LEGACY_VISIBLE_PATTERNS,
            severity: "medium",
            kind: "visible-legacy-brand",
            message: "Visible legacy/upstream branding or community link",
          });
        }

        HERMES_VISIBLE_PATTERN.lastIndex = 0;
        let hermesMatch;
        while ((hermesMatch = HERMES_VISIBLE_PATTERN.exec(line))) {
          if (!isAllowedHermesReference(relPath, line)) {
            addFinding(
              findings,
              "low",
              repoName,
              relPath,
              lineNo,
              "visible-hermes-reference",
              "Visible Hermes reference; verify if it is intentional technical compatibility text",
              hermesMatch[0],
            );
          }
        }
      }
    });
  }

  return { root, repoName, filesScanned: files.length, findings };
}

function runGitStatus(root) {
  try {
    return execFileSync("git", ["status", "--short"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function runCommand(root, command, commandArgs) {
  const started = Date.now();
  try {
    execFileSync(command, commandArgs, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });
    return {
      command: [command, ...commandArgs].join(" "),
      ok: true,
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      command: [command, ...commandArgs].join(" "),
      ok: false,
      ms: Date.now() - started,
      error: error.stderr?.toString?.().slice(0, 2000) || error.message,
    };
  }
}

const repoReports = options.roots
  .filter((root) => existsSync(root))
  .map((root) => ({
    ...scanRepo(root),
    gitStatus: runGitStatus(root),
    checks: options.withChecks
      ? [
          runCommand(root, "npm", ["run", "typecheck"]),
          runCommand(root, "npm", ["test", "--", "--run"]),
        ]
      : [],
  }));

const allFindings = repoReports.flatMap((repo) => repo.findings);
const high = allFindings.filter((finding) => finding.severity === "high");
const medium = allFindings.filter((finding) => finding.severity === "medium");
const low = allFindings.filter((finding) => finding.severity === "low");

const report = {
  generatedAt: new Date().toISOString(),
  roots: repoReports.map((repo) => repo.root),
  summary: {
    filesScanned: repoReports.reduce((sum, repo) => sum + repo.filesScanned, 0),
    findings: allFindings.length,
    high: high.length,
    medium: medium.length,
    low: low.length,
  },
  repos: repoReports,
};

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Activi white-label audit");
  console.log("========================");
  console.log(`Repos: ${repoReports.map((repo) => repo.repoName).join(", ")}`);
  console.log(`Files scanned: ${report.summary.filesScanned}`);
  console.log(
    `Findings: ${report.summary.findings} ` +
      `(high ${high.length}, medium ${medium.length}, low ${low.length})`,
  );
  console.log("");

  for (const repo of repoReports) {
    console.log(`## ${repo.repoName}`);
    console.log(`Root: ${repo.root}`);
    if (repo.gitStatus) {
      console.log("Git status:");
      console.log(repo.gitStatus);
    } else {
      console.log("Git status: clean or unavailable");
    }
    if (repo.checks.length > 0) {
      for (const check of repo.checks) {
        console.log(
          `${check.ok ? "OK" : "FAIL"} ${check.command} (${check.ms}ms)`,
        );
        if (!check.ok && check.error) console.log(check.error);
      }
    }
    console.log("");
  }

  for (const severity of ["high", "medium", "low"]) {
    const findings = allFindings.filter((finding) => finding.severity === severity);
    if (findings.length === 0) continue;
    console.log(`## ${severity.toUpperCase()} findings`);
    for (const finding of findings.slice(0, 200)) {
      console.log(
        `${finding.repo}:${finding.file}:${finding.line} ` +
          `[${finding.kind}] ${finding.message}: ${finding.value}`,
      );
    }
    if (findings.length > 200) {
      console.log(`... ${findings.length - 200} more`);
    }
    console.log("");
  }
}

const shouldFail = high.length > 0 || (options.strict && medium.length > 0);
process.exit(shouldFail ? 1 : 0);
