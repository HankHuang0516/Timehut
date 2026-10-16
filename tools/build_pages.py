"""Create an explicit static Pages payload and bind the downloadable APK to its reviewed digest."""
from pathlib import Path
from public_media_guard import inspect_files,inspect_directory,inspect_apk
from installer_release import installer_metadata,render_installer
import argparse,json,hashlib,shutil,urllib.request,re,posixpath,subprocess,sys,tempfile,io,zipfile
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote

def check_local_references(source,names,generated):
 allowed=set(names)|set(generated);missing=set()
 def check(name,value):
  url=urlsplit(value)
  if url.scheme or url.netloc or not url.path:return
  # These pages use relative links under the repository's Pages base path.
  target=posixpath.normpath(posixpath.join(posixpath.dirname(name),unquote(url.path)))
  if target not in allowed:missing.add(f'{name} -> {target}')
 class References(HTMLParser):
  def handle_starttag(self,tag,attrs):
   for key,value in attrs:
    if key in ('src','href') and value:check(self.name,value)
 for name in names:
  if name.endswith('.html'):
   parser=References();parser.name=name;parser.feed((source/name).read_text())
  elif name.endswith('.css'):
   for match in re.finditer(r'url\(\s*[\"\']?([^\"\')\s]+)',(source/name).read_text()):check(name,match.group(1))
  elif name.endswith('.js'):
   for match in re.finditer(r'(?:from\s*|import\(\s*)[\"\'](\.[^\"\']+)',(source/name).read_text()):check(name,match.group(1))
  elif name.endswith('.webmanifest'):
   for icon in json.loads((source/name).read_text()).get('icons',[]):check(name,icon['src'])
 assert not missing,'Static payload omits local dependencies: '+', '.join(sorted(missing))

def account_entry():
 # The static host must reach the first-party cookie session before login.
 return '''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>我的帳戶 · 黃家小屋</title><link rel="icon" href="favicon.png"><link rel="stylesheet" href="css/account.css">
<script>
(()=>{const target=new URL('https://just-healing-production.up.railway.app/app/account.html'),query=new URLSearchParams(location.search);
if(query.get('intent')==='delete')target.searchParams.set('intent','delete');
const next=query.get('next');if(next){try{const value=new URL(next,target),pages=['index.html','timeline.html','album.html','search.html','settings.html','transfer.html'];if(value.origin===target.origin&&!value.hash&&pages.some(page=>value.pathname==='/app/'+page))target.searchParams.set('next',value.pathname.slice(5)+value.search);}catch(_){}}
location.replace(target.href);})();
</script></head><body><main class="account-shell"><h1>開啟我的帳戶</h1><p>正在前往小屋的登入頁。</p><a href="https://just-healing-production.up.railway.app/app/account.html">前往我的帳戶</a></main></body></html>
'''

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[1])
 parser.add_argument('--output',type=Path,default=Path('_site'))
 parser.add_argument('--apk',type=Path,help='Use an already verified local package instead of fetching the release asset')
 parser.add_argument('--public-app',type=Path,help='Use an existing current safe public-site artifact')
 parser.add_argument('--release-manifest',type=Path,help='Explicit candidate or released installer metadata; does not publish it')
 args=parser.parse_args();source=args.source.resolve();out=args.output.resolve()
 assert out!=source and not (out.exists() and any(out.iterdir())), 'Output must be a new empty directory'
 names=json.loads((source/'tools/pages-files.json').read_text());release=json.loads((args.release_manifest or source/'tools/android-release.json').read_text());installer_metadata(release)
 assert len(names)==len(set(names))
 if args.public_app:site=args.public_app.resolve()
 else:
  temporary=Path(tempfile.mkdtemp(prefix='timehut-pages-source-',dir=out.parent));site=temporary/'site'
  subprocess.run([sys.executable,str(source/'tools/build_public_app.py'),str(site)],check=True,stdout=subprocess.DEVNULL)
 manifest=json.loads((site.parent/(site.name+'-source.json')).read_text())
 assert manifest['sourceRoot']==str(source) and manifest['privateConfigCopied'] is False
 assert set(names)==set(manifest['files'])=={str(p.relative_to(site)) for p in site.rglob('*') if p.is_file()}, 'Pages allowlist must cover the exact public artifact'
 inspect_files(site,names)
 for name,row in manifest['files'].items():
  assert hashlib.sha256((site/name).read_bytes()).hexdigest()==row['sha256'],name
  if not row.get('generatedPublicOnly'):assert hashlib.sha256((source/name).read_bytes()).hexdigest()==row['sha256'], 'Rebuild stale public artifact: '+name
 # Validate all downloaded bytes before creating the new publication payload.
 if args.apk:body=args.apk.read_bytes()
 else:
  assert release['publication']=='released', 'Candidate packaging requires an explicit local APK'
  assert release['url'].startswith('https://github.com/HankHuang0516/Timehut/releases/download/')
  with urllib.request.urlopen(release['url'],timeout=60) as response:body=response.read(release['bytes']+1)
 assert len(body)==release['bytes'] and hashlib.sha256(body).hexdigest()==release['sha256'], 'APK does not match reviewed package'
 inspect_apk(io.BytesIO(body))
 with zipfile.ZipFile(io.BytesIO(body)) as archive:
  for name in ['js/accounts.js','js/account-config.js','js/transfers.js']:
   assert archive.read('assets/public/'+name)==(site/name).read_bytes(), 'APK account integration differs from reviewed website: '+name
 check_local_references(site,names,['downloads/'+release['filename']])
 for name in names:
  rel=Path(name);assert not rel.is_absolute() and '..' not in rel.parts and not any(p.startswith('.') for p in rel.parts)
  src=site/rel;assert src.is_file() and not src.is_symlink(),name
  dst=out/rel;dst.parent.mkdir(parents=True,exist_ok=True)
  if name=='install.html':dst.write_text(render_installer(src.read_text(),release))
  elif name=='account.html':dst.write_text(account_entry())
  else:shutil.copyfile(src,dst)
 check_local_references(out,names,['downloads/'+release['filename']])
 apk=out/'downloads'/release['filename'];apk.parent.mkdir(exist_ok=True);apk.write_bytes(body)
 (out/'.nojekyll').write_text('')
 inspect_directory(out)
 (out/'site-release.json').write_text(json.dumps({'site':'public-account-site','android':release['version'],'apkSHA256':release['sha256'],'publication':release['publication'],'publicAccounts':True,'backendDeploymentVerifiedByThisBuild':False},indent=2)+'\n')
 files={str(f.relative_to(out)):{'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in out.rglob('*') if f.is_file()}
 (out.parent/(out.name+'-source.json')).write_text(json.dumps({'sourceRoot':str(source),'publicSource':str(site),'installer':release,'transformedPublicPages':['install.html','account.html'],'privateConfigCopied':False,'files':files},indent=2)+'\n')
 print(json.dumps({'staticFiles':len(names),'apkBytes':len(body),'apkSHA256':release['sha256'],'output':str(out)}))

if __name__=='__main__':main()
