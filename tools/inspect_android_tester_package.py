"""Inspect current candidate APK and bind extracted resources to exact build inputs."""
from pathlib import Path
import zipfile,json,hashlib,subprocess,re,os,shutil
import sys
from public_media_guard import inspect_apk
ROOT=Path(__file__).resolve().parents[1];q=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'.codex-local/qa/20261014-android-tester55';prep=json.loads((q/('candidate-preparation.json' if (q/'candidate-preparation.json').exists() else 'preparation.json')).read_text());w=Path(prep['workspace']);apk=w/'android/app/build/outputs/apk/candidate/app-candidate.apk';sdk='/Users/hank/Library/Android/sdk/build-tools/36.0.0/'
sha=lambda b:hashlib.sha256(b).hexdigest()
for name,command in [('apk-badging.txt',['dump','badging',str(apk)]),('apk-manifest.txt',['dump','xmltree',str(apk),'--file','AndroidManifest.xml']),('apk-resources.txt',['dump','resources',str(apk)])]:
 (q/name).write_text(subprocess.check_output([sdk+'aapt2']+command,text=True))
env=dict(os.environ,JAVA_HOME='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home')
(q/'apk-signature.txt').write_text(subprocess.check_output([sdk+'apksigner','verify','--verbose','--print-certs',str(apk)],env=env,text=True))
manifest=(q/'apk-manifest.txt').read_text();assert 'debuggable' not in manifest and 'testOnly' not in manifest and 'usesCleartextTraffic' not in manifest
inspect_apk(apk)
z=zipfile.ZipFile(apk);names=z.namelist();assert 'assets/public/js/config.js' not in names
assert not any(x.startswith('assets/public/') and ('.env' in x or 'snapshot-manifest' in x or 'AGENTS.md' in x) for x in names)
for name in names:
 if name.startswith('assets/public/') or name=='assets/capacitor.config.json':
  dst=w/'extracted-apk'/name;dst.parent.mkdir(parents=True,exist_ok=True);raw=z.read(name);dst.write_bytes(raw)
  if name.startswith('assets/public/'):
   relative=name.removeprefix('assets/public/');src=w/'www'/relative
   assert (w/'android/app/src/main/assets/public'/relative).read_bytes()==raw,name
   if src.exists():assert src.read_bytes()==raw,name
   else:assert relative in ['cordova.js','cordova_plugins.js'],name
   if name.endswith('.html'):assert not re.search(rb'<script\b[^>]*\bsrc="js/config\.js"',raw),name
rows=[];current=None
for line in (q/'apk-resources.txt').read_text().splitlines():
 if '    resource ' in line:
  current=re.search(r'mipmap/(ic_launcher(?:_round|_foreground)?)$',line);current=current[1] if current else None
 if current:
  m=re.search(r'\(([^)]+)\) \(file\) (res/\S+) type=(\w+)',line)
  if m:
   density,resource,kind=m.groups();dst=w/'extracted-apk-icons'/(current+'-'+density+Path(resource).suffix);dst.parent.mkdir(exist_ok=True);dst.write_bytes(z.read(resource));rows.append({'name':current,'density':density,'resource':resource,'path':str(dst),'kind':kind})
   if kind=='XML':(q/(current+'-adaptive-xml.txt')).write_text(subprocess.check_output([sdk+'aapt2','dump','xmltree',str(apk),'--file',resource],text=True))
(q/'apk-icon-map.json').write_text(json.dumps(rows,indent=2)+'\n')
record={'apk':str(apk),'bytes':apk.stat().st_size,'sha256':sha(apk.read_bytes()),'noEmbeddedConfig':True,'noLocalConfigReferences':True,'publicFiles':len([n for n in names if n.startswith('assets/public/')]),'allPackagedWebFilesMatchInputs':True,'iconsMapped':len(rows)}
(q/'apk-inspection.json').write_text(json.dumps(record,indent=2)+'\n')
if (w/'android-candidate-build-fixed.log').exists():shutil.copy2(w/'android-candidate-build-fixed.log',q/'build-success-fixed.log')
print(json.dumps(record))
