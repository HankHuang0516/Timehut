"""Shared public installer metadata and UI rendering; never publishes or reads credentials."""
import html,re
from urllib.parse import urlsplit

def installer_metadata(release):
 assert set(release)<= {'version','versionCode','filename','bytes','sha256','publicAccounts','publication','url'}, 'Unexpected field in public installer metadata'
 assert release.get('publicAccounts') is True and type(release.get('versionCode')) is int and release['versionCode']>=68, 'Reviewed installer must support public accounts; old published metadata is preserved'
 assert re.fullmatch(r'\d{4}\.\d{2}\.\d{2}-test\.'+str(release['versionCode']),release['version'])
 assert re.fullmatch(r'[A-Za-z0-9._-]+\.apk',release['filename'])
 assert release['filename']=='HuangJiaXiaoWu-'+release['version'].replace('-test.','-test')+'.apk'
 assert re.fullmatch(r'[0-9a-f]{64}',release['sha256']) and type(release['bytes']) is int and 0<release['bytes']<200_000_000
 assert release.get('publication') in ['candidate','released']
 if release['publication']=='released':
  url=urlsplit(release['url']);assert url.scheme=='https' and url.netloc=='github.com' and not url.query and not url.fragment
  assert url.path.startswith('/HankHuang0516/Timehut/releases/download/') and url.path.endswith('/'+release['filename'])

def render_installer(text,release,remote=False):
 installer_metadata(release)
 label=('候選版本 ' if release['publication']=='candidate' else '版本 ')+release['version']+f" · 約 {release['bytes']/1_000_000:.1f} MB · Android 7.0 以上"
 text,count=re.subn(r'(<p class="install-build">)[^<]*(</p>)',lambda m:m[1]+html.escape(label)+m[2],text);assert count==1
 def link(match):
  tag=match[0]
  for key in ['href','download','data-release-available','data-release-state']:
   tag=re.sub(r'\s'+key+r'="[^"]*"','',tag)
  tag=re.sub(r'\s+hidden(?=\s|>)','',tag)
  if remote:assert release['publication']=='released'
  href=release['url'] if remote else 'downloads/'+release['filename']
  return tag[:-1]+' href="'+html.escape(href,quote=True)+'" download="'+release['filename']+'" data-release-available="true" data-release-state="'+release['publication']+'">'
 text,count=re.subn(r'<a\b[^>]*\bid="androidDownload"[^>]*>',link,text);assert count==1
 return text

