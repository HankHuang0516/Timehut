"""Create an explicit static Pages payload and bind the downloadable APK to its reviewed digest."""
from pathlib import Path
import argparse,json,hashlib,shutil,urllib.request

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[1])
 parser.add_argument('--output',type=Path,default=Path('_site'))
 parser.add_argument('--apk',type=Path,help='Use an already verified local package instead of fetching the release asset')
 args=parser.parse_args();source=args.source.resolve();out=args.output.resolve()
 assert out!=source and not (out.exists() and any(out.iterdir())), 'Output must be a new empty directory'
 names=json.loads((source/'tools/pages-files.json').read_text());release=json.loads((source/'tools/android-release.json').read_text())
 assert len(names)==len(set(names))
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
 (out/'site-release.json').write_text(json.dumps({'site':'2026.10.14-upload-safety.1','android':release['version'],'apkSHA256':release['sha256'],'backendUpdated':False},indent=2)+'\n')
 print(json.dumps({'staticFiles':len(names),'apkBytes':len(body),'apkSHA256':release['sha256'],'output':str(out)}))

if __name__=='__main__':main()
