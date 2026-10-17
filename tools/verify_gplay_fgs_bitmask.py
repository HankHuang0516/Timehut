"""Reproduce the task-local scanner repair; never modifies/uploads the input APK."""
from pathlib import Path
import argparse, hashlib, json, os, shutil, subprocess, tarfile

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'tools/fixtures/gplay-preflight'
ARCHIVE_SHA = '35c40fac3cf9ca88e39a4fba3a70c4ac740f8a70b2d0ac250d9136f6426c7a3d'
COMMIT = 'aa553c0c8cef22f7a99ca0cacd9edd242debbad7'
MANIFEST_SHA = '5cdc23e199faef1f6633fdf166d1d029a81a995de4c531b49b78c8d2c0ab85ac'
SCANNER_SHA = '68b6810d1fb2ba810b770311a4af96a9d94b7af6644bfb2c6cf0a09592086497'
REGISTRY_SHA = 'defff9067ad7c5032afd02bbaeeea859c0759d3765355ccad647f725c4927952'
def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def main():
    p = argparse.ArgumentParser()
    for name in ['upstream-archive', 'go', 'official', 'apk', 'workspace']:
        p.add_argument('--' + name, type=Path, required=True)
    a = p.parse_args(); w = a.workspace.resolve(); apk = a.apk.resolve()
    assert str(w).startswith('/Users/hank/.local/share/project-storage/internal/builds/timehut-gplay-repro-') and not w.exists()
    assert digest(a.upstream_archive) == ARCHIVE_SHA
    subprocess.run(['/Users/hank/.local/bin/project-storage', 'check', '--required-gib', '1.5'], check=True, stdout=subprocess.DEVNULL)
    original_apk = digest(apk); w.mkdir()
    with tarfile.open(a.upstream_archive) as t: t.extractall(w, filter='data')
    source = next(f for f in w.iterdir() if f.is_dir())
    assert digest(source/'internal/preflight/manifest.go') == MANIFEST_SHA
    assert digest(source/'internal/preflight/scan_manifest.go') == SCANNER_SHA
    assert digest(source/'internal/preflight/scanner.go') == REGISTRY_SHA
    env = dict(os.environ, GOTOOLCHAIN='local', GOPATH=str(w/'gopath'),
        GOMODCACHE='/Users/hank/.cache/hank-internal/timehut-gplay-go-mod',
        GOCACHE='/Users/hank/.cache/hank-internal/timehut-gplay-go-build', GPLAY_NO_UPDATE='1')
    runs = []
    def run(label, cmd, expected=0):
        r = subprocess.run(list(map(str, cmd)), cwd=source, env=env, capture_output=True, timeout=180)
        (w/(label+'.stdout')).write_bytes(r.stdout); (w/(label+'.stderr')).write_bytes(r.stderr)
        runs.append({'label':label, 'argv':list(map(str, cmd)), 'exit':r.returncode, 'expected':expected})
        assert r.returncode == expected, label + ': ' + r.stderr.decode(errors='replace')[-1000:]
        return r.stdout
    assert b'go1.27.2' in run('go-version', [a.go, 'version'])
    shutil.copy2(FIXTURES/'fgs_types_test.go', source/'internal/preflight/task_fgs_types_test.go')
    red = run('red-tests', [a.go, 'test', './internal/preflight', '-run', 'TestTaskFGS', '-count=1'], 1)
    assert b'FAIL: TestTaskFGSTypedAXML' in red and b'foreground_service_type' in red
    patch = FIXTURES/'v1.0.0-fgs-bitmask.patch'
    run('patch-check', ['/usr/bin/git', 'apply', '--check', patch])
    run('patch', ['/usr/bin/git', 'apply', patch])
    shutil.copy2(FIXTURES/'artifact_controls_test.go', source/'internal/preflight/task_artifact_controls_test.go')
    controls = w/'unsigned-negative-controls'; env.update(TIMEHUT_FGS_APK=str(apk), TIMEHUT_FGS_CONTROLS=str(controls))
    run('all-preflight-tests', [a.go, 'test', './internal/preflight', '-count=1', '-v'])
    run('cli-preflight-tests', [a.go, 'test', './internal/cli/preflight', '-count=1'])
    exe = w/'gplay-v1.0.0-task-fgs-bitmask'
    run('build', [a.go, 'build', '-trimpath', '-ldflags', '-X github.com/tamtom/play-console-cli/internal/version.Version=1.0.0-task-fgs-bitmask', '-o', exe, '.'])
    reports = {}
    for label, tool, file, expected in [('official',a.official,apk,1), ('patched',exe,apk,0),
            ('missing-permission',exe,controls/'missing-permission.apk',1), ('unknown-bit',exe,controls/'unknown-bit.apk',1)]:
        raw = run(label, [tool, 'preflight', '--file', file, '--output', 'json'], expected)
        report = json.loads(raw); reports[label] = report
        assert len(report['scanners']) == 9
        assert [x['id'] for x in report['scanners'] if x.get('skipped')] == ['metadata']
        assert report['errors'] == expected
    assert digest(apk) == original_apk
    assert digest(source/'internal/preflight/scan_manifest.go') == SCANNER_SHA
    assert digest(source/'internal/preflight/scanner.go') == REGISTRY_SHA
    result = {'status':'PASS_TASK_LOCAL_FGS_REPAIR_AND_NEGATIVE_CONTROLS', 'upstreamCommit':COMMIT,
        'taskLocalPatchedNotOfficial':True, 'APK':str(apk), 'APK_SHA256':original_apk,
        'inputAPKUnchanged':True, 'runs':runs, 'reports':reports, 'binarySHA256':digest(exe),
        'patchSHA256':digest(patch), 'permissionCheckerAndRegistryUnchanged':True,
        'metadata':'No Fastlane listing directory supplied; unchanged metadata scanner reports skipped. Eight applicable scanners ran.',
        'waivers':[], 'published':False, 'controlsUnsignedNeverInstalled':True}
    (w/'result.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'status':result['status'], 'workspace':str(w), 'APK_SHA256':original_apk}))

if __name__ == '__main__': main()
