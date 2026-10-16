"""Reject known private static originals in a new public artifact; never edits it."""
from pathlib import Path
import hashlib,json,zipfile

POLICY=Path(__file__).with_name('private-static-media.json')

def inspect_bytes(name,body,policy):
    relative=Path(name)
    assert relative.name.lower() not in policy['private_filenames'], 'Private source cannot enter a public payload: '+name
    assert hashlib.sha256(body).hexdigest() not in policy['private_sha256'], 'Private source bytes cannot enter a public payload: '+name
    if relative.suffix.lower() in ['.html','.css','.js']:
        text=body.decode('utf8').lower()
        assert '16120.jpg' not in text, 'Private family image reference remains: '+name

def inspect_files(directory,names):
    policy=json.loads(POLICY.read_text());assert policy['version']==1
    for name in names:
        file=Path(directory)/name
        assert file.is_file() and not file.is_symlink(),name
        inspect_bytes(str(name),file.read_bytes(),policy)

def inspect_directory(directory):
    root=Path(directory);inspect_files(root,[str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()])

def inspect_apk(file):
    policy=json.loads(POLICY.read_text())
    with zipfile.ZipFile(file) as archive:
        for row in archive.infolist():
            if not row.is_dir():inspect_bytes(row.filename,archive.read(row),policy)
