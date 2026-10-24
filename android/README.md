# Contractor.AI Field for Android

Native Java Android client, using the existing Node operating ledger. This is
source implementation, **not an accepted phone release**: no APK build, device
installation or emulator test has been completed in this checkout. Android SDK
installation and its terms remain an operator prerequisite. There is no iOS app.

## Included path

- Native Android controls, named-worker login, paged assigned-job downloads.
- Kunnen / Weten / Hebben / Doen work-pack content and native PDF page/zoom view.
- Private AES-GCM work folder using Android Keystore and atomic file writes.
- Screen lock required; Android backup disabled; no saved authentication token.
- Source-bound queued questions/read acknowledgments, same-ledger idempotency,
  reauthorized synchronization, visible source conflicts and approved office
  replies after using the online work-pack update control.
- Login identity is bound to the company, ledger and assigned worker returned by
  `/api/session`; subsequent API requests send the same company headers and the
  encrypted offline vault refuses to reopen under a different scope.
- Assigned photo-evidence sets can be captured in the Android camera, with the
  required before/during/after sequence derived from the current work pack. JPEGs
  are orientation-corrected, stripped of EXIF/GPS metadata and bounded to 2 MB,
  then stored in the encrypted offline vault and replayed to the governed upload
  endpoint with a stable idempotency key. Office review remains independent.
- Offline progress/blocker reports require a selected open task from the current
  work-pack revision and retain its task ID in the encrypted queue. The server
  rechecks assignment, task visibility and source revision on sync; reports do
  not change job-wide progress or status, and completion remains office-controlled.
- Task-specific office recovery instructions are rendered in the native Know
  view from that same downloaded work-pack revision. The worker can acknowledge
  the version and later report the exact task back in progress while offline;
  both entries remain encrypted, retain the source hash and synchronize in order.
  Server validation still governs acceptance. Changed or revoked sources remain
  conflicts, and no local state releases a safety control.
- Assigned safety briefings are downloaded with the worker's own attendee record
  and exact content hash. The worker can review each topic and queue an explicit
  acknowledgement offline; it remains visibly local until the authenticated
  server confirms it. If briefing topics change before sync, the hash check
  returns a conflict instead of attaching the acknowledgement to new content.
  Attendance acknowledgement is not a start permission or safety clearance.
- Positions that require a supervisor start release show its status and the
  supervisor's instruction. The named worker can explicitly confirm receipt
  online; the request is retained with a stable idempotency key in the encrypted
  work pack per release ID, and the UI only shows permission after the server confirms an
  active release. Starting progress for these tasks requires a current online
  server check; the server revalidates the release, task revision and eligibility
  and rejects stale or revoked permission. Offline, the worker can still report
  a blocker but cannot mark a controlled task as started. Cached release status
  is explicitly identified as a saved snapshot, never as current site clearance.
  The worker can also stop an active or awaiting release online with a reason;
  the exact reason and per-release idempotency key are retained in the encrypted vault for
  safe retries, and the UI changes to stopped only after server confirmation.
- Warehouse deliveries appear in the assigned work pack. A field worker can
  record partial received, accepted and damaged quantities with delivery/evidence
  references and site location while offline. The encrypted queue records the
  dispatch reference and expected remaining quantity; source-bound work and photos
  synchronize first, then site receipts in order. Stale dispatches/quantities stay
  visible as conflicts. Only server-confirmed accepted quantities update the pack;
  queued or conflicting receipts never count as available site stock.
- Seven-day offline access, bounded downloads, checksum verification, explicit
  local erase and recovery of unsent responses using the original worker/server.
- The open native work-pack screen checks its authenticated, assignment-scoped
  approved-reply feed every 30 seconds while online. New approved office answers
  are merged into the encrypted vault and announced in an accessible in-app
  status line without re-rendering the work screen. Polling stops when the app
  leaves the foreground or another screen opens. This is not background work or
  push delivery.
- Unavailability and conditional standby reports can be recorded in the
  encrypted, account-scoped queue while offline. Standby can retain a minimum
  0-48 hour notice requirement; a personal reason is not requested. Reauthorization
  against the original worker/server is required before sync; only a server
  response confirms receipt and reports affected assignments. If a newly synced
  unavailability revokes overlapping standby call-outs, the encrypted receipt
  retains the count and displays that office must review coverage again.
  Confirmed results remain encrypted until explicitly reviewed. No illness or
  medical reason is requested or retained by this form.

Limits: 20 packs, 100 queued responses, 10 waiting availability reports, 50
retained conflicts per confirmed availability report, 20 photos and 8 MB pending
photos per job, 2 MB per photo, 8 MB per PDF, 12 MB files per pack, 24 MB
serialized vault including base64 files. Cached instructions cannot detect remote
revocation.
Use device encryption and lock the app/device when unattended. Expiry is a device-
clock policy, not secure erasure. Device time is not independently attested. Opening
a PDF or capturing a photo does not establish site safety or release a hold point.
Push notifications, background reply polling, biometrics and task completion are
not part of this client. Questions synchronize from the encrypted queue; the
online update control retrieves approved replies. Live chat is not implemented.
Availability reports are worker-wide rather than job-bound. While offline they
are retained only in the encrypted vault and are not visible to the office; after
authentication, the server derives worker identity from the session and returns
the conflicts it can confirm. Exact duplicate time windows are replay-safe at the
ledger boundary. A stale or rejected submission remains visible as a conflict;
it is never silently reclassified as received.

The Android company-scope, photo, offline site-receipt, recovery-instruction and
safety-briefing integrations are protected by source-contract regression tests.
This checkout has no Java, Gradle, Android SDK, or adb installed, so the native
project has not been compiled or exercised on an emulator or physical device.
Source tests do not substitute for that proof.

## Build prerequisites

The selected toolchains are in `../android-runtime.json`: stable JDK 27.0.1, final Android SDK Platform 37.2, Build Tools 37.0.0 and AGP 9.4.1. The app compiles against major 37/minor 2 and targets major 37. Java 17 source/bytecode compatibility is a separate floor; it does not select the build compiler. Review Android 17 behavior changes before device rollout; this checkout has no device or emulator acceptance evidence. When the entered server resolves to a local address, Android 17 requires the user to grant local-network permission before connecting. The app asks before using the worker key, then requires the key to be entered again after the permission prompt. Review Google's SDK
terms through its official installation flow; neither this repository nor its
build script accepts them. AGP 9.4.1 requires Gradle 9.6.0 or newer. The checked-in Gradle 9.8.2 wrapper downloads the
official binary distribution and verifies its pinned SHA-256 checksum. The first
build therefore needs internet access, but a separate Gradle installation is not
required. The wrapper itself is pinned to Gradle's published JAR checksum. SDK aliases and junctions are no longer created: install the actual selected platform. The PowerShell launcher restores its SDK environment setting after the build.

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk'
$env:ANDROID_HOME = 'C:\path\to\Android\Sdk'
.\scripts\build-android.ps1
```

An already-installed Gradle executable can be selected with `-Gradle`; the
wrapper remains the default and project version authority.

On Linux or macOS, after installing the same JDK and Android SDK prerequisites:

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
sh ./gradlew --no-daemon :app:assembleDebug :app:lintDebug
```

Expected output after a successful build:
`android/app/build/outputs/apk/debug/app-debug.apk`. A debug APK is only for local
testing; it is not a signed production distribution. No signing key is committed.

## Connect and verify

The server must require authentication and issue a named `field_worker` token.
Enter its origin and worker token, enable a device screen lock, sign in and
download an assigned job with a current approved drawing. Test airplane-mode
restart, PDF rendering, expired access, incorrect identity, revocation, disk-full
recovery and exact queue retries before operational use. Never test on live jobs.

Release builds reject cleartext HTTP. Debug builds allow only loopback and the
emulator host `http://10.0.2.2:PORT`; every other connection requires HTTPS. On a
physical phone, use an intentionally configured authenticated HTTPS endpoint or
an authorized USB `adb reverse` route for development. Do not expose an owner-
unauthenticated local ledger to a LAN/tunnel. Tokens stay in memory until logout
or process destruction. Screenshots are blocked with `FLAG_SECURE`, including in
debug builds; UI-tree tests are not proof of visual rendering.

Official references: [build from the command line](https://developer.android.com/build/building-cmdline),
[Android 17 / API 37](https://developer.android.com/about/versions/17), [Android 17 behavior changes](https://developer.android.com/about/versions/17/behavior-changes-17), [local network permission](https://developer.android.com/privacy-and-security/local-network-permission), [AGP 9.4 prerequisites](https://developer.android.com/build/releases/agp-9-4-0-release-notes),
[AGP and Gradle compatibility](https://developer.android.com/build/releases/about-agp#updating-gradle),
[Gradle 9.8.2 checksums](https://gradle.org/release-checksums/),
[Jetpack Core releases](https://developer.android.com/jetpack/androidx/releases/core),
[secure FileProvider sharing](https://developer.android.com/reference/androidx/core/content/FileProvider),
[camera capture intent](https://developer.android.com/reference/android/provider/MediaStore#ACTION_IMAGE_CAPTURE),
[Keystore](https://developer.android.com/privacy-and-security/keystore),
[PDF renderer](https://developer.android.com/reference/android/graphics/pdf/PdfRenderer).


### Current toolchain qualification

The Android CI job selects free Zulu CA Java 27.0.1+9 / vendor 27.30.107 and
records the actual compiler, SDK final-release fields and package properties.
It uses the existing Node 26.12.1 toolchain for this metadata inspection. The existing debug APK
assembly and lint remain the qualification path; logs and the compiled APK hash
are retained. A passing source or metadata check alone is not a successful build.
No operator SDK is installed or changed by preparing this configuration.

The existing public AndroidX Core coordinate remains 1.19.1, matching the
queried stable Google Maven metadata. This does not qualify the complete resolved
native dependency graph, device permissions, worker credentials, offline sync,
physical hardware or production release signing. Match current-head Actions
evidence before claiming the new compiler/SDK combination works.
