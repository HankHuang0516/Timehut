"""Allowlisted website artifact. Never reads or copies private js/config.js."""
from pathlib import Path
import argparse,json,hashlib,shutil
from public_media_guard import inspect_files,inspect_directory
from installer_release import installer_metadata,render_installer
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('destination');parser.add_argument('--release-manifest',type=Path);args=parser.parse_args()
destination=Path(args.destination).resolve()
assert destination.name in ['public-app','site'],'Unexpected artifact directory'
assert not destination.exists(),'Preserve existing artifact; use a new build directory'
selected=['index.html','timeline.html','album.html','search.html','settings.html','transfer.html','account.html','privacy.html','support.html','delete-account.html','offline.html','install.html','favicon.png','favicon.ico','public-service-worker.js']
selected += [str(path.relative_to(root)) for path in (root/'js').rglob('*.js') if path.name!='config.js']
selected += ['js/vendor/noble-hashes-2.4.0/LICENSE','js/vendor/noble-hashes-2.4.0/provenance.json']
selected += [str(path.relative_to(root)) for path in (root/'css').glob('*.css')]
selected += [str(path.relative_to(root)) for path in (root/'assets').glob('*.png') if path.name.startswith(('storybook-','app-icon-'))]
for filename in ['manifest.webmanifest','site.webmanifest']:
 if (root/filename).is_file():selected.append(filename)
inspect_files(root,selected)
destination.mkdir(parents=True)
manifest={'sourceRoot':str(root),'privateConfigCopied':False,'files':{}}
for rel in selected:
 source=root/rel;target=destination/rel;assert source.is_file() and 'config.js'!=source.name
 target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
 manifest['files'][rel]={'bytes':source.stat().st_size,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
if args.release_manifest:
 release=json.loads(args.release_manifest.read_text());installer_metadata(release);assert release['publication']=='released', 'Backend install link requires released installer metadata'
 target=destination/'install.html';target.write_text(render_installer(target.read_text(),release,remote=True))
 manifest['files']['install.html']={'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'generatedPublicOnly':True,'templateSHA256':hashlib.sha256((root/'install.html').read_bytes()).hexdigest()}
 manifest['installer']=release
webmanifest={'id':'./','name':'黃家小屋','short_name':'黃家小屋','start_url':'index.html','scope':'./','display':'standalone','background_color':'#f9f6f0','theme_color':'#486d55','icons':[{'src':'assets/app-icon-192.png','sizes':'192x192','type':'image/png'},{'src':'assets/app-icon-512.png','sizes':'512x512','type':'image/png','purpose':'any maskable'}]}
generated={'manifest.webmanifest':json.dumps(webmanifest,ensure_ascii=False,indent=2)+'\n'}
for name,content in generated.items():
 target=destination/name;target.write_text(content);manifest['files'][name]={'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'generatedPublicOnly':True}
inspect_directory(destination)
(destination.parent/(destination.name+'-source.json')).write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'destination':str(destination),'files':len(manifest['files']),'privateConfigCopied':False}))
