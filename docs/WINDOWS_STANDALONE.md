# Windows 11 Standalone Operation

## Release artifact

The `windows-standalone` GitHub Actions job builds
`ContractorAI-windows-x64.zip` on Windows x64 with Node.js 24.22.0. The package
contains its own `runtime\node.exe`, the production Vite output, the canonical
Node ledger runtime, and production dependencies. It does not require a global
Node.js or npm installation.

Extract the archive to an operator-controlled folder and start
`ContractorAI.cmd`. Do not run it directly from inside the zip archive.

## First run

The launcher creates these local-user resources:

```text
%LOCALAPPDATA%\ContractorAI\config\runtime.json
%LOCALAPPDATA%\ContractorAI\data\contractor-ledger.sqlite
%LOCALAPPDATA%\ContractorAI\data\uploads\
```

`runtime.json` contains a random 256-bit owner access key. The launcher applies
current-user file permissions where Windows permits it, prints the key once on
first run, binds the server to `127.0.0.1`, and opens
`http://127.0.0.1:3000`. The key is never written into the application folder,
browser storage, a URL, or the repository.

Later starts report only the protected configuration path and do not repeat the
key in terminal output or redirected logs.

Keep `%LOCALAPPDATA%\ContractorAI` on an encrypted Windows volume. Use the
in-product verified backup workflow and retain copies away from the computer.

## Launchers

- `ContractorAI.cmd`: local-only application.
- `ContractorAI-Export-HAI.cmd`: exports the read-only HAI feed while the local
  application is running. Set `CONTRACTOR_AI_HAI_FEED_PATH` to an absolute file
  under HAI's configured feed root first.
- With that path set before launch, Operations also shows the verified local-feed
  state and provides an owner-only **Publish to HAI** action. The Windows smoke
  gate publishes and reads back this feed with zero execution authority.

## Build locally

The package command intentionally fails outside Windows x64 or Node.js 24.22.0:

```powershell
npm ci
npm run package:windows
npm run test:windows-package
```

The unpacked result is under `release\ContractorAI-windows-x64`. Git ignores
the release directory. The package smoke test starts that exact bundled runtime
against an isolated profile and verifies current migration, authentication,
redacted team access, and read-only HAI behavior before cleanup. Signed
distribution and malware scanning remain release owner responsibilities.

### Build a candidate without replacing the current package

The builder and verifier share `CONTRACTOR_AI_WINDOWS_PACKAGE_DIR`. Use a new
direct child of this checkout's `release` directory to preserve the current
package while testing a candidate:

```powershell
$env:CONTRACTOR_AI_WINDOWS_PACKAGE_DIR = Join-Path $PWD 'release\ContractorAI-windows-x64-candidate'
npm run package:windows
npm run test:windows-package
Remove-Item Env:\CONTRACTOR_AI_WINDOWS_PACKAGE_DIR
```

Both commands must use Node.js 24.22.0. Paths outside the release directory, nested
paths, symbolic links and junctions are rejected. A build refuses recognized
operator data and private configuration before rebuilding the web assets or
removing generated package files. An existing clean generated candidate can be
replaced, so select a new name when retaining an earlier build matters.

Packaging builds the web application inside a private
`release\.contractor-web-build-*` staging directory. It does not rebuild or
replace the checkout's served `dist` directory. Brotli output follows the same
selected build directory. The staging lifecycle cleans generated output after
success or failure, rejects unexpected/private paths, and emits success only
after cleanup finishes. This protects an already running checkout UI; it does
not promise uninterrupted access when replacing a package that is itself running.

Before replacing any generated package files, the staged web build must pass
the same unchanged bundle budgets as CI. Missing required UI chunks or missing,
invalid or mismatched precompressed Brotli assets also fail this gate. A failed
gate leaves the previous target untouched and removes only generated staging
output. There is no override for packaging an over-budget release candidate.

Successful packages include `BUNDLE_BUDGET.json` and a summary in `BUILD.json`.
The smoke verifier recomputes sizes, source and Brotli hashes, required surfaces,
and current limits against the selected package. Old packages without this
evidence must be rebuilt before this release gate can pass; an earlier successful
smoke is historical evidence, not acceptance of the current package.

The smoke gate also runs the real solver worker from the selected package,
checks a dated forecast against the resulting proposal, and verifies that the
preview did not mutate its isolated ledger. Identity recovery, company handover
and local HAI publication use isolated fixtures. Passing this package gate includes its local bundle
checks but does not establish EU-hosted production readiness.
