"""Prepare a same-identity testing installer from the verified public site only."""
from pathlib import Path
import argparse,datetime,hashlib,json,shutil,subprocess,tempfile
from check_storage import ROOT,check
from public_media_guard import inspect_directory

check()
parser=argparse.ArgumentParser();parser.add_argument('--public-app',required=True);parser.add_argument('--version-code',type=int,required=True);parser.add_argument('--version-name',required=True);args=parser.parse_args()
release_date=args.version_name.split('-test.',1)[0]
assert datetime.datetime.strptime(release_date,'%Y.%m.%d').strftime('%Y.%m.%d')==release_date
assert args.version_code>56 and args.version_name==f'{release_date}-test.{args.version_code}'
site=Path(args.public_app).resolve();assert str(site).startswith('/Users/hank/.local/share/project-storage/internal/builds/timehut-public-') and site.name=='site'
manifest=json.loads((site.parent/'site-source.json').read_text());assert manifest['sourceRoot']==str(ROOT) and manifest['privateConfigCopied'] is False
inspect_directory(site)
assert {str(f.relative_to(site)) for f in site.rglob('*') if f.is_file()}==set(manifest['files'])
for name,row in manifest['files'].items():
 assert Path(name).name!='config.js' and hashlib.sha256((site/name).read_bytes()).hexdigest()==row['sha256']
 if not row.get('generatedPublicOnly'):assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==row['sha256'],name
subprocess.run(['/Users/hank/.local/bin/project-storage','check','--required-gib','1.5'],check=True,stdout=subprocess.DEVNULL)
q=ROOT/f'.codex-local/qa/{release_date.replace(".","")}-android-installer{args.version_code}';q.mkdir()
old=Path('/Users/hank/.local/share/project-storage/internal/builds/timehut-mobile-accounts57-m0z94dfz')
w=Path(tempfile.mkdtemp(prefix=f'timehut-mobile-installer{args.version_code}-',dir=old.parent));shutil.copy2(ROOT/'AGENTS.md',w/'AGENTS.md')
for name in ['package.json','package-lock.json','capacitor.config.json']:shutil.copy2(ROOT/'mobile'/name,w/name)
(w/'node_modules').symlink_to(old/'node_modules',target_is_directory=True)
shutil.copytree(ROOT/'mobile/android',w/'android',ignore=shutil.ignore_patterns('build','.gradle','.build','public','local.properties'))
shutil.copy2(old/'android/local.properties',w/'android/local.properties')
gradle=w/'android/app/build.gradle';text=gradle.read_text();assert 'versionCode 1\n' in text and 'versionName "1.0"' in text
text=text.replace('versionCode 1\n',f'versionCode {args.version_code}\n').replace('versionName "1.0"',f'versionName "{args.version_name}"')
text=text.replace('    buildTypes {',"""    testBuildType "candidate"
    buildTypes {
        candidate {
            initWith release
            debuggable false
            applicationIdSuffix ".testing"
            signingConfig signingConfigs.debug
            matchingFallbacks = ['release']
        }""",1);gradle.write_text(text)
subprocess.run(['python3',str(ROOT/'tools/sync_mobile.py'),str(w),'--public-app',str(site),'--platform','android','--keep-build-config'],check=True)
strings=w/'android/app/src/main/res/values/strings.xml';strings.write_text(strings.read_text().replace('>黃家小屋<','>黃家小屋測試版<'))
version=f"/* Testing installer metadata; public site content stays separately bound. */\nwindow.TimehutBuild=Object.freeze({{version:'{args.version_name}',versionCode:{args.version_code},channel:'android-private-test',sourceBase:'caa1779'}});\n"
for directory in [w/'www',w/'android/app/src/main/assets/public']:(directory/'js/version.js').write_text(version)
sources={}
for base in [ROOT/'mobile/android/app/src/main',ROOT/'mobile/android/app/src/test']:
 for file in base.rglob('*'):
  if file.is_file() and 'assets/public' not in str(file):sources[str(file.relative_to(ROOT))]=hashlib.sha256(file.read_bytes()).hexdigest()
record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'workspace':str(w),'sourceRoot':str(ROOT),'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'versionCode':args.version_code,'versionName':args.version_name,'applicationId':'tw.aihankapps.timehut.testing','buildVariant':'candidate','debuggable':False,'signing':'Existing test56 debug certificate; testing distribution only, not store signing','privateConfigCopied':False,'privateOwnerDBCopied':False,'publicArtifact':str(site),'publicManifest':manifest,'sourceFiles':sources,'allowedWorkspaceChanges':['versionCode/versionName','candidate testing applicationId, DEBUG false, existing test signing','testing app label','js/version.js installer version metadata','Capacitor sync/core script preceding account bootstrap'],'published':False}
(q/'candidate-preparation.json').write_text(json.dumps(record,indent=2,ensure_ascii=False)+'\n');(w/'installer-preparation.json').write_text(json.dumps(record,indent=2,ensure_ascii=False)+'\n');print(json.dumps({'workspace':str(w),'qa':str(q),'nativeInputs':len(sources),'publicFiles':len(manifest['files']),'debuggable':False,'published':False}))
