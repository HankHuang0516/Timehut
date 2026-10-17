"""Exact flat Railway payload; personal state and credentials are runtime-only."""
from pathlib import Path
import argparse,hashlib,json,re,shutil
from check_storage import ROOT,check
from public_media_guard import inspect_directory

def main():
    check()
    parser=argparse.ArgumentParser();parser.add_argument('site');parser.add_argument('destination');args=parser.parse_args()
    site=Path(args.site).resolve();destination=Path(args.destination).resolve()
    assert str(site).startswith('/Users/hank/.local/share/project-storage/internal/builds/timehut-public-') and site.name=='site'
    assert str(destination).startswith('/Users/hank/.local/share/project-storage/internal/builds/timehut-backend-') and destination.name=='backend'
    assert not destination.exists(),'Use a new artifact directory; preserve earlier payloads'
    web=json.loads((site.parent/'site-source.json').read_text());assert web['sourceRoot']==str(ROOT) and web['privateConfigCopied'] is False
    assert {str(f.relative_to(site)) for f in site.rglob('*') if f.is_file()}==set(web['files'])
    modules=['account-remember.js','server.js','account-feedback.js','feedback_admin.cjs','account-album-membership.js','account-erasure.js','account-family-media.js','account-gateway.js','account-media.js','account-native-login.js','account-owner-bootstrap.js','account-photo-deletion.js','account-photo-mutations.js','account-routes.js','account-sqlite-store.js','account-store.js','account-upload-admissions.js','account-upload-journal.js','account-upload-receiver.js','flickr-api.js','flickr-erasure.js','flickr-photo-mutations.js','media-tickets.js','photo-tags.js','video-media.js','bootstrap_legacy_owner.cjs','package.json','package-lock.json','railway.json']
    digest=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
    package=json.loads((ROOT/'server/package.json').read_text());lock=json.loads((ROOT/'server/package-lock.json').read_text());source=(ROOT/'server/server.js').read_text()
    version=re.search(r"const BACKEND_VERSION = '([^']+)';",source).group(1);build=re.search(r"const BACKEND_BUILD = '([^']+)';",source).group(1)
    assert package['version']==lock['version']==lock['packages']['']['version']==version
    assert package['engines']['node']=='24.22.0'
    for name in modules:
        f=ROOT/'server'/name;assert f.is_file() and not f.is_symlink()
        if f.suffix in ['.js','.cjs']:
            for dependency in re.findall(r"require\(['\"]\./([^'\"]+)['\"]\)",f.read_text()):assert any(dependency+suffix in modules for suffix in ['', '.js','.cjs','.json']),dependency
    for rel,row in web['files'].items():
        f=site/rel;assert f.is_file() and not f.is_symlink() and digest(f)==row['sha256']
        if not row.get('generatedPublicOnly'):assert digest(ROOT/rel)==row['sha256'],'Rebuild stale public website'
        assert Path(rel).name!='config.js'
    inspect_directory(site)
    destination.mkdir(parents=True);files={}
    for name in modules:
        f=ROOT/'server'/name;shutil.copy2(f,destination/name);files[name]={'sha256':digest(f),'bytes':f.stat().st_size,'source':str(f.relative_to(ROOT))}
    for rel,row in web['files'].items():
        f=site/rel;d=destination/'public-app'/rel;d.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,d);files['public-app/'+rel]={'sha256':digest(d),'bytes':d.stat().st_size,'source':'safe-public-artifact/'+rel}
    assert not any(part.startswith('.') or part in ['uploads','node_modules'] for rel in files for part in Path(rel).parts)
    assert {str(f.relative_to(destination)) for f in destination.rglob('*') if f.is_file()}==set(files)
    # This is a test/release artifact, not a source checkout or a replacement
    # for the existing persistent volume. Keep the policy outside the payload.
    shutil.copy2(ROOT/'AGENTS.md',destination.parent/'AGENTS.md')
    manifest={'sourceRoot':str(ROOT),'destination':str(destination),'version':version,'build':build,'node':package['engines']['node'],'persistentProductionPath':'/app/uploads','serverRelativeUploadsPath':'uploads','operatorCommand':'node bootstrap_legacy_owner.cjs','publicRegistrationActivated':False,'productionChanged':False,'privateConfigOrEnvironmentCopied':False,'credentialOrDatabaseCopied':False,'files':files,'publicArtifactSource':str(site.parent/'site-source.json')}
    (destination.parent/'backend-source.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'destination':str(destination),'files':len(files),'version':version,'build':build,'credentialOrDatabaseCopied':False,'productionChanged':False}))

if __name__=='__main__':main()
