# Windows Release Runbook

This runbook covers the Windows release path for Activi Agent Desktop only.
It intentionally stays separate from macOS DMG/notarization work.

## Outputs

- Installer: `activi-desktop-<version>-setup.exe`
- Update metadata: `latest.yml`
- Blockmap: `activi-desktop-<version>-setup.exe.blockmap`
- Winget manifests: `dist/winget/manifests/a/Activi/ActiviAgent/<version>/`

## Release Pipeline

The Windows job in `.github/workflows/release.yml` runs on `windows-latest`.

It performs:

1. Checkout.
2. Node.js 22 setup.
3. `npm ci`.
4. `npm run build`.
5. Optional Windows code signing if signing secrets are configured.
6. `electron-builder --win nsis --x64 --publish never`.
7. Upload of `.exe`, `.exe.blockmap`, and `latest.yml`.

The winget job downloads the Windows x64 artifact and generates manifests for:

```text
Activi.ActiviAgent
```

## Scripted Local Checks

Use the local Windows release check script before changing the release workflow,
after changing it, and before pushing.

1. Preflight scan:

```bash
npm run release:windows:preflight
```

This checks the existing Windows release wiring without generating artifacts.

2. Dry run:

```bash
npm run release:windows:dry-run
```

This creates a temporary fake Windows installer, generates winget manifests in a
temporary directory, validates paths, package IDs, release URLs, and SHA256
output, then deletes the temporary files.

3. Aftercheck:

```bash
npm run release:windows:aftercheck
```

This runs the same checks as the dry run and also verifies that this runbook and
the README mention the expected Windows release commands and identifiers.

The script does not build installers, does not publish releases, and does not
push anything. It is safe to run repeatedly.

## Code Signing

Unsigned Windows builds are acceptable for internal testing, but public users may
see SmartScreen warnings such as "Unknown publisher".

For signed CI builds, configure these GitHub Actions secrets:

```text
WINDOWS_CSC_LINK
WINDOWS_CSC_KEY_PASSWORD
```

`WINDOWS_CSC_LINK` should contain either a supported certificate URL or a
base64-encoded signing certificate supported by Electron Builder. The password
for that certificate goes in `WINDOWS_CSC_KEY_PASSWORD`.

Do not commit certificates, private keys, or passwords to the repository.

## Dry Run

Use GitHub Actions `Release` workflow with:

```text
workflow_dispatch
dry_run: true
```

Expected result:

- Windows x64 artifact uploaded.
- Winget manifest artifact uploaded.
- macOS signing/notarization path skipped; macOS release checks stay separate.
- No GitHub tag is created.
- No GitHub Release is published.

## Public Release

Before a public release:

1. Confirm `package.json` version is final.
2. Confirm signing secrets are configured or knowingly release unsigned.
3. Run the workflow with `dry_run: true`.
4. Install the `.exe` on a real Windows machine.
5. Confirm app launch, Start Menu shortcut, uninstall, and update metadata.
6. Run the release workflow with `dry_run: false` or push to the `release` branch.

## Manual Windows QA

On a Windows test machine:

1. Download `activi-desktop-<version>-setup.exe`.
2. Install as a normal user.
3. Confirm the app appears as `Activi Agent`.
4. Launch the app.
5. Connect to the expected local or remote backend.
6. Verify Chat, Settings, Admin profiles, Skills, Gateway, and Office Kombiteks screens open.
7. Uninstall from Windows Settings.

If the build is unsigned, verify whether SmartScreen appears and document the
exact warning text.

## Winget Submission

The generated manifest path is:

```text
dist/winget/manifests/a/Activi/ActiviAgent/<version>/
```

Submit these generated files to `microsoft/winget-pkgs` only after the GitHub
Release is public and the installer URL is reachable.

## Known Boundaries

- The current pipeline builds Windows `x64`.
- Windows `arm64` can be added later as a separate matrix entry after x64 is stable.
- macOS signing/notarization uses separate Apple secrets and is not covered here.
