// scripts/generate-winget-manifests.mjs
//
// Fills the YAML templates in build/winget/ with the current version,
// installer URL, and SHA256 of the NSIS installer in dist/, and writes
// the result under the winget package identifier path.
//
// Run from CLI: VERSION=0.4.5 node scripts/generate-winget-manifests.mjs
// Or import as ESM and call generateWingetManifests({ rootDir, version, name, releaseOwner, releaseRepo, packageIdentifier }).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function generateWingetManifests({
  rootDir,
  version,
  name,
  releaseOwner,
  releaseRepo,
  packageIdentifier,
}) {
  const exePath = join(rootDir, "dist", `${name}-${version}-setup.exe`);
  if (!existsSync(exePath)) {
    throw new Error(
      `NSIS installer not found at ${exePath}. ` +
        `Run electron-builder --win nsis first, or download the windows-x64-artifacts CI artifact into dist/.`,
    );
  }

  const sha256 = createHash("sha256")
    .update(readFileSync(exePath))
    .digest("hex")
    .toUpperCase();
  const releaseDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const installerUrl = `https://github.com/${releaseOwner}/${releaseRepo}/releases/download/v${version}/${name}-${version}-setup.exe`;
  const releaseNotesUrl = `https://github.com/${releaseOwner}/${releaseRepo}/releases/tag/v${version}`;

  const replacements = {
    VERSION: version,
    PACKAGE_IDENTIFIER: packageIdentifier,
    INSTALLER_URL: installerUrl,
    INSTALLER_SHA256: sha256,
    RELEASE_DATE: releaseDate,
    RELEASE_NOTES_URL: releaseNotesUrl,
  };

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const fillTemplate = (str) =>
    Object.entries(replacements).reduce(
      (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
      str,
    );

  const templateDir = join(rootDir, "build", "winget");
  if (!existsSync(templateDir)) {
    throw new Error(
      `Winget templates not found at ${templateDir}. ` +
        `This script must be run from the repo root.`,
    );
  }
  const identifierParts = packageIdentifier.split(".");
  if (identifierParts.length < 2 || identifierParts.some((part) => !part)) {
    throw new Error(`Invalid winget package identifier: ${packageIdentifier}`);
  }
  const outDir = join(
    rootDir,
    "dist",
    "winget",
    "manifests",
    identifierParts[0][0].toLowerCase(),
    ...identifierParts,
    version,
  );
  mkdirSync(outDir, { recursive: true });

  const baseName = packageIdentifier;
  const files = [
    ["Installer.template.yaml", `${baseName}.installer.yaml`],
    ["Locale.en-US.template.yaml", `${baseName}.locale.en-US.yaml`],
    ["Version.template.yaml", `${baseName}.yaml`],
  ];

  for (const [tmplName, outName] of files) {
    const tmpl = readFileSync(join(templateDir, tmplName), "utf-8");
    writeFileSync(join(outDir, outName), fillTemplate(tmpl));
  }

  return { outDir, sha256, installerUrl };
}

// CLI entrypoint
const isCli =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const rootDir = process.cwd();
  const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8"));
  const result = generateWingetManifests({
    rootDir,
    version: process.env.VERSION || pkg.version,
    name: pkg.name,
    releaseOwner: process.env.RELEASE_OWNER || "dsactivi-2",
    releaseRepo: process.env.RELEASE_REPO || "activi-agent-desktop",
    packageIdentifier:
      process.env.WINGET_PACKAGE_IDENTIFIER || "Activi.ActiviAgent",
  });
  console.log(`Winget manifests generated in ${result.outDir}`);
  console.log(`InstallerSha256: ${result.sha256}`);
  console.log(`InstallerUrl: ${result.installerUrl}`);
}
