"""Prepare public Android testing notices from verified publication receipts only."""
from pathlib import Path
import argparse, json, os
from installer_release import installer_metadata


def android_entry(receipt, metadata, notes):
    installer_metadata(metadata)
    assert metadata['publication'] == 'released', 'An unpublished candidate is not a user update'
    assert receipt.get('status') == 'PUBLISHED_EXACT94_INTERNAL_PRERELEASE_VERIFIED' or (
        receipt.get('status') == 'PUBLISHED_INTERNAL_PRERELEASE_VERIFIED'
    ), 'Verified publication receipt required'
    assert receipt.get('prerelease') is True and receipt.get('draft') is False
    assert receipt.get('http') == 200 and receipt.get('downloadBytes') == metadata['bytes']
    assert receipt.get('downloadSHA256') == metadata['sha256']
    assert receipt.get('officialDigest') == 'sha256:' + metadata['sha256']
    expected_tag = 'android-test-' + metadata['version'].replace('-test.', '-')
    assert receipt.get('tag') == expected_tag
    expected_url = 'https://github.com/HankHuang0516/Timehut/releases/download/' + expected_tag + '/' + metadata['filename']
    assert receipt.get('downloadURL') == expected_url
    assert metadata.get('url', expected_url) == expected_url
    assert type(notes) is str and 1 <= len(notes.strip()) <= 240
    return dict(platform='android', channel='android-private-test', version=metadata['version'],
                versionCode=metadata['versionCode'], available=True, url=expected_url,
                sha256=metadata['sha256'], notes=notes.strip(), verifiedAt=receipt['at'])


def update(catalog, entry):
    assert catalog.get('schema') == 1 and isinstance(catalog.get('releases'), list)
    rows = catalog['releases']
    prior = [row for row in rows if row['channel'] == entry['channel']]
    assert len(prior) <= 1
    if prior:
        assert prior[0]['versionCode'] <= entry['versionCode'], 'Published notice rollback rejected'
        if prior[0]['versionCode'] == entry['versionCode']:
            for field in ['version', 'sha256', 'url']:
                assert prior[0][field] == entry[field], 'Conflicting artifact for same version'
    return dict(schema=1, releases=[entry] + [r for r in rows if r['channel'] != entry['channel']])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipt', required=True, type=Path)
    parser.add_argument('--metadata', required=True, type=Path)
    parser.add_argument('--notes-file', required=True, type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    target = Path(__file__).resolve().parents[1] / 'releases.json'
    before = target.read_bytes()
    entry = android_entry(json.loads(args.receipt.read_text()), json.loads(args.metadata.read_text()), args.notes_file.read_text())
    result = update(json.loads(before), entry)
    if args.apply:
        assert not target.is_symlink() and target.read_bytes() == before
        temporary = target.with_suffix('.json.new')
        with temporary.open('x', encoding='utf-8') as output:
            output.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
            output.flush()
            os.fsync(output.fileno())
        assert target.read_bytes() == before, 'Concurrent publisher changed catalog; preserve both'
        temporary.replace(target)
        descriptor = os.open(target.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    print(json.dumps(dict(status='CATALOG_UPDATED' if args.apply else 'CATALOG_READY',
                          version=entry['version'], websitePublished=False)))
