"""Create an explicit static Pages payload and bind the downloadable APK to its reviewed digest."""
from pathlib import Path
import argparse,json,hashlib,shutil,urllib.request,re,posixpath
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
 assert not missing,'Static payload omits local dependencies: '+', '.join(sorted(missing))

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[1])
 parser.add_argument('--output',type=Path,default=Path('_site'))
 parser.add_argument('--apk',type=Path,help='Use an already verified local package instead of fetching the release asset')
 args=parser.parse_args();source=args.source.resolve();out=args.output.resolve()
 assert out!=source and not (out.exists() and any(out.iterdir())), 'Output must be a new empty directory'
 names=json.loads((source/'tools/pages-files.json').read_text());release=json.loads((source/'tools/android-release.json').read_text())
 assert len(names)==len(set(names))
 check_local_references(source,names,['downloads/'+release['filename']])
 for name in names:
  rel=Path(name);assert not rel.is_absolute() and '..' not in rel.parts and not any(p.startswith('.') for p in rel.parts)
  src=source/rel;assert src.is_file() and not src.is_symlink(),name
  dst=out/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
 if args.apk:body=args.apk.read_bytes()
 else:
  assert release['url'].startswith('https://github.com/HankHuang0516/Timehut/releases/download/')
  with urllib.request.urlopen(release['url'],timeout=60) as response:body=response.read(release['bytes']+1)
 assert len(body)==release['bytes'] and hashlib.sha256(body).hexdigest()==release['sha256'], 'APK does not match reviewed package'
 apk=out/'downloads'/release['filename'];apk.parent.mkdir(exist_ok=True);apk.write_bytes(body)
 (out/'.nojekyll').write_text('')
 (out/'site-release.json').write_text(json.dumps({'site':'2026.10.14-candidate-layout.2','android':release['version'],'apkSHA256':release['sha256'],'backendVersion':'1.0.64','backendUpdated':True},indent=2)+'\n')
 print(json.dumps({'staticFiles':len(names),'apkBytes':len(body),'apkSHA256':release['sha256'],'output':str(out)}))

if __name__=='__main__':main()
