"""Verify the actual external volume and APFS image before using this checkout."""
import pathlib
import plistlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
PHYSICAL = pathlib.Path('/Volumes/codex_2T')
# The mount name may change after reconnecting; the UUID and backing image must not.
DATA = ROOT.parent
IMAGE = PHYSICAL / 'codex_project/AiHankAppsData.sparsebundle'


def check():
    physical = plistlib.loads(subprocess.check_output(['diskutil', 'info', '-plist', str(PHYSICAL)]))
    assert physical.get('VolumeUUID') == '4E209AF2-AF33-3CF7-8F47-54D26FE14F19', 'Wrong physical disk'
    assert physical.get('MountPoint') == str(PHYSICAL), 'Physical volume is not mounted'
    assert physical.get('Internal') is False, 'Physical storage must remain external'
    data = plistlib.loads(subprocess.check_output(['diskutil', 'info', '-plist', str(DATA)]))
    assert data.get('FilesystemType') == 'apfs', 'Checkout must be on APFS'
    assert data.get('VolumeUUID') == '7253A744-D59D-4188-9069-99261F167274', 'Wrong APFS data area'
    assert data.get('MountPoint') == str(DATA), 'APFS data area is not mounted'
    assert data.get('GlobalPermissionsEnabled') is True, 'APFS file ownership must be enabled'
    assert data.get('WritableVolume') is True, 'APFS data area must be writable'
    assert ROOT.stat().st_dev == DATA.stat().st_dev, 'Checkout is not stored on the verified APFS volume'
    images = plistlib.loads(subprocess.check_output(['hdiutil', 'info', '-plist']))['images']
    assert any(i.get('image-path') == str(IMAGE) and any(
        e.get('mount-point') == str(DATA) for e in i.get('system-entities', [])
    ) for i in images), 'APFS image must be backed by codex_2T'
    common = pathlib.Path(subprocess.check_output(
        ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], cwd=ROOT, text=True
    ).strip()).resolve()
    assert common.is_relative_to(ROOT), 'This checkout must retain its independent Git history'
    assert (ROOT / 'timeline.html').is_file() and (ROOT / 'server/server.js').is_file()
    print('PASS: codex_2T physical UUID, APFS image, readable source and independent Git')


if __name__ == '__main__':
    check()
