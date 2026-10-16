"""Sync edited native sources and a safe frontend into the owned SSD test workspace."""
import argparse,json,pathlib,shutil,subprocess,hashlib,uuid
from check_storage import ROOT,check
from public_media_guard import inspect_directory
check()
parser=argparse.ArgumentParser();parser.add_argument('workspace');parser.add_argument('--public-app');parser.add_argument('--platform',choices=['android','ios']);parser.add_argument('--keep-build-config',action='store_true');args=parser.parse_args()
target=pathlib.Path(args.workspace).resolve()
assert str(target).startswith('/Users/hank/.local/share/project-storage/internal/builds/timehut-mobile-')
if args.public_app:
 snapshot=pathlib.Path(args.public_app).resolve()
 assert str(snapshot).startswith('/Users/hank/.local/share/project-storage/internal/builds/timehut-public-') and snapshot.name=='site'
 manifest=json.loads((snapshot.parent/'site-source.json').read_text());assert manifest['sourceRoot']==str(ROOT) and manifest['privateConfigCopied'] is False
 inspect_directory(snapshot)
 assert {str(p.relative_to(snapshot)) for p in snapshot.rglob('*') if p.is_file()}==set(manifest['files'])
 for rel,row in manifest['files'].items():
  assert 'config.js'!=pathlib.Path(rel).name and hashlib.sha256((snapshot/rel).read_bytes()).hexdigest()==row['sha256']
  if not row.get('generatedPublicOnly'):assert hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()==row['sha256'],'Source changed; rebuild public artifact'
 if (target/'www').exists():(target/'www').rename(target/('www-before-public-'+uuid.uuid4().hex))
else:
 snapshot=pathlib.Path(json.loads((ROOT/'.codex-local/preview.json').read_text())['snapshot'])
 assert str(snapshot).startswith('/Users/hank/.local/share/project-storage/internal/builds/timehut-ui-preview-')
kept_gradle=(target/'android/app/build.gradle').read_bytes() if args.keep_build_config else None
for platform in ([args.platform] if args.platform else ['ios','android']):
 shutil.copytree(ROOT/'mobile'/platform,target/platform,dirs_exist_ok=True,ignore=shutil.ignore_patterns('build','.gradle','.build','Pods','DerivedData','public','local.properties','xcuserdata'))
if kept_gradle is not None:(target/'android/app/build.gradle').write_bytes(kept_gradle)
shutil.copytree(snapshot,target/'www',dirs_exist_ok=True,ignore=shutil.ignore_patterns('AGENTS.md'))
shutil.copy2(target/'node_modules/@capacitor/core/dist/capacitor.js',target/'www/js/capacitor-core.js')
for page in (target/'www').glob('*.html'):
 text=page.read_text();assert '<head>' in text
 text=text.replace('<script src="js/capacitor-core.js"></script>','').replace('<head>','<head><script src="js/capacitor-core.js"></script>',1);page.write_text(text)
subprocess.run(['/opt/homebrew/bin/node','node_modules/@capacitor/cli/bin/capacitor','sync']+([args.platform] if args.platform else []),cwd=target,check=True)
if args.public_app:(target/'public-page-source.json').write_text(json.dumps({'artifact':str(snapshot),'privateConfigCopied':False,'sourceManifest':manifest,'coreBeforeAccountBootstrap':True},indent=2)+'\n')
