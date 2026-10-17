# Task-local foreground-service decoder correction

Upstream: https://github.com/tamtom/play-console-cli, v1.0.0, annotated tag
dereferenced to commit `aa553c0c8cef22f7a99ca0cacd9edd242debbad7`.
This is a local tool patch, not an upstream release or a waiver. The official
v1.0.0 result stays unchanged and separately recorded.

The typed APK/AAB attribute is a bitmask. The old projection used its displayed
`0x1`/`1` string as a service-type name. The patch decodes the fourteen public
SDK 36 flags before the existing permission checks. Unknown bits, including
reserved 0x1000, remain error-producing tokens; zero keeps the original block.
Symbolic strings, scanner registry and permission checker are unchanged.
The mapping comes from installed Android SDK 36 `attrs_manifest.xml` (commented
fileManagement is excluded), consistent with Android ServiceInfo constants:
https://developer.android.com/reference/android/content/pm/ServiceInfo

`fgs_types_test.go` covers both binary XML encodings, integer formats, combined
types and unknown high bits, plus full scan permission controls. The optional
artifact test makes unsigned negative copies of a real APK with a missing
permission or unknown bit; these are never installed or distributed.

Run `tools/verify_gplay_fgs_bitmask.py --help`. Supply the saved pinned upstream
archive, official Go 1.27.2 binary, unchanged official gplay binary, input APK
and a new SSD workspace named `timehut-gplay-repro-*`. The runner performs a
failing test first, applies only this patch, runs preflight/CLI tests, builds a
clearly named local binary and scans the original plus negative controls. No
skip flags, new APK permissions, account credentials or upload commands are used.
It preserves official errors. Store readiness is not inferred from this check.
