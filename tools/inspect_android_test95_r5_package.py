"""Inspect exact testing APK, public web bytes, signer continuity and real icon resources."""
from pathlib import Path
import argparse,json,subprocess,re,zipfile,hashlib
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('qa',type=Path);args=parser.parse_args();q=args.qa.resolve();prep=json.loads((q/'candidate-preparation.json').read_text());w=Path(prep['workspace']);apk=w/'android/app/build/outputs/apk/candidate/app-candidate.apk';aapt='/Users/hank/Library/Android/sdk/build-tools/36.0.0/aapt2';signer='/Users/hank/Library/Android/sdk/build-tools/36.0.0/apksigner';outs={}
for name,cmd in [('badging',['dump','badging',str(apk)]),('resources',['dump','resources',str(apk)]),('manifest',['dump','xmltree',str(apk),'--file','AndroidManifest.xml'])]:
 r=subprocess.run([aapt,*cmd],capture_output=True,text=True,check=True);(q/('apk-'+name+'.txt')).write_text(r.stdout);outs[name]=r.stdout
r=subprocess.run([signer,'verify','--print-certs',str(apk)],capture_output=True,text=True,check=True);(q/'apk-signature.txt').write_text(r.stdout);cert=re.search(r'Signer #1 certificate SHA-256 digest: ([a-f0-9]+)',r.stdout)[1];oldq=ROOT/'.codex-local/qa/20261016-android-installer85';previous=(oldq/'apk-signature.txt').read_text();assert cert==re.search(r'Signer #1 certificate SHA-256 digest: ([a-f0-9]+)',previous)[1];assert ("versionCode='"+str(prep['versionCode'])+"'") in outs['badging'] and "name='tw.aihankapps.timehut.testing'" in outs['badging'] and 'application-debuggable' not in outs['badging'];rows=[];name=None;ex=w/'extracted-apk';icons=w/'extracted-apk-icons';ex.mkdir();icons.mkdir();web={}
with zipfile.ZipFile(apk) as z:
 for n in z.namelist():
  if n.endswith('/'):continue
  if n.startswith('assets/public/'):
   rel=n[len('assets/public/'):];assert '..' not in Path(rel).parts;raw=z.read(n);f=ex/n;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(raw);assert raw==(w/'android/app/src/main/assets/public'/rel).read_bytes();web[rel]=hashlib.sha256(raw).hexdigest();assert Path(rel).name!='config.js';assert not rel.endswith('.html') or not re.search(rb'(?:src|href)=[\"\x27][^\"\x27]*js/config\.js',raw)
 for line in outs['resources'].splitlines():
  if re.search(r'resource 0x[0-9a-f]+ ',line):
   m=re.search(r'resource 0x[0-9a-f]+ mipmap/(ic_launcher(?:_round|_foreground)?)\b',line);name=m[1] if m else None;continue
  m=re.search(r'\(([^)]+)\).*?\(file\)\s+(res/\S+)',line)
  if name and m:
   config,res=m.groups();density=next((d for d in ['xxxhdpi','xxhdpi','xhdpi','hdpi','mdpi'] if re.search(r'(?:^|-)'+d+r'(?:-|$)',config)),None)
   if not density and config.startswith('anydpi'):density=config
   if not density:continue
   raw=z.read(res);kind='PNG' if raw.startswith(b'\x89PNG') else 'XML';f=icons/(name+'-'+density+('.png' if kind=='PNG' else '.xml'));f.write_bytes(raw);rows.append({'name':name,'density':density,'resource':res,'path':str(f),'kind':kind})
   if kind=='XML':
    r=subprocess.run([aapt,'dump','xmltree',str(apk),'--file',res],capture_output=True,text=True,check=True);(q/(name+'-adaptive-xml.txt')).write_text(r.stdout)
assert len([x for x in rows if x['kind']=='PNG'])==15 and len(rows)==17
(q/'apk-icon-map.json').write_text(json.dumps(rows,indent=2));sha=hashlib.sha256(apk.read_bytes()).hexdigest();report={'apk':str(apk),'bytes':apk.stat().st_size,'sha256':sha,'noEmbeddedConfig':True,'noLocalConfigReferences':True,'publicFiles':len(web),'allPackagedWebFilesMatchInputs':True,'iconsMapped':len(rows)};(q/'apk-inspection.json').write_text(json.dumps(report,indent=2));(q/'same-signature.json').write_text(json.dumps({'sameSigner':True,'certificateSHA256':cert},indent=2))
oldq=ROOT/'.codex-local/qa/20261017-android-installer95-r4';old=json.loads((oldq/'candidate-preparation.json').read_text());assert old['sourceFiles']==prep['sourceFiles']
oldweb={}
with zipfile.ZipFile(json.loads((oldq/'apk-inspection.json').read_text())['apk']) as z:
 for n in z.namelist():
  if n.startswith('assets/public/') and not n.endswith('/'):oldweb[n[len('assets/public/'):]]=hashlib.sha256(z.read(n)).hexdigest()
delta=sorted(n for n in set(web)|set(oldweb) if web.get(n)!=oldweb.get(n));assert delta==['album.html','index.html','js/flickr.js','js/timeline.js','js/utils.js','search.html','timeline.html'],delta
assert "application-label:'時光相簿測試版'" in outs['badging']
(q/'delta-from95-r4.json').write_text(json.dumps({'productionNativeInputsIdenticalToR4':True,'webChanged':delta,'oldSHA256':json.loads((oldq/'apk-inspection.json').read_text())['sha256'],'newSHA256':sha,'r4AndR5Unpublished':True},indent=2)+'\n')
print(json.dumps(report))
