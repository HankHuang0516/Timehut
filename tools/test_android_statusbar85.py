"""Managed exact81 ->83 update and real native-inset/touch tests; no account login."""
from pathlib import Path
import os,sys,subprocess,json,hashlib,time,re,shutil
ROOT=Path(__file__).resolve().parents[1];Q=ROOT/'.codex-local/qa/20261016-android-installer85';ADB='/Users/hank/Library/Android/sdk/platform-tools/adb';PACKAGE='tw.aihankapps.timehut.testing'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
 assert os.environ.get('SIM_MANAGER_TOKEN') or os.environ.get('SIM_MANAGER_TOKENS')
 prep=json.loads((Q/'candidate-preparation.json').read_text());w=Path(prep['workspace']);apk=w/'android/app/build/outputs/apk/candidate/app-candidate.apk';test=w/'android/app/build/outputs/apk/androidTest/candidate/app-candidate-androidTest.apk';expected=json.loads((Q/'apk-inspection.json').read_text())['sha256'];assert sha(apk)==expected
 resumeFile=Path(sys.argv[sys.argv.index('--resume')+1]) if '--resume' in sys.argv else None
 resume=json.loads(resumeFile.read_text())['devices'] if resumeFile else []
 baseline='a8e07561ff1c135f92b880c048c02a13fcb4bb39b0cbd992cf68c9096134043f';assert json.loads((Q/'same-signature.json').read_text())['sameSigner']
 out=Q/('statusbar-runtime-'+str(time.time_ns()));out.mkdir();rows=[]
 def call(serial,*args,check=True,timeout=35):
  r=subprocess.run([ADB,'-s',serial,*args],capture_output=True,timeout=timeout)
  if check:assert r.returncode==0, 'Assigned-device operation failed: '+str(args[:3])
  return r
 def method(serial,name,timeout=60):
  r=call(serial,'shell','am','instrument','-w','-r','-e','class','tw.aihankapps.timehut.'+name,PACKAGE+'.test/androidx.test.runner.AndroidJUnitRunner',check=False,timeout=timeout);raw=(r.stdout+r.stderr).decode();(out/(serial+'-'+name.replace('#','-')+'.txt')).write_text(raw)
  if 'OK (1 test)' not in raw:
   failureReports=[json.loads(line.split('timehutReport=',1)[1]) for line in raw.splitlines() if 'timehutReport=' in line]
   if failureReports and failureReports[0].get('screenshotsDirectory'):
    dest=out/(serial+'-failed-test');dest.mkdir();call(serial,'pull',failureReports[0]['screenshotsDirectory'],str(dest),check=False)
   (out/(serial+'-failure.png')).write_bytes(call(serial,'exec-out','screencap','-p').stdout)
   (out/(serial+'-failure-activity.txt')).write_bytes(call(serial,'shell','dumpsys','activity','top').stdout)
  assert 'OK (1 test)' in raw,raw[-2600:]
  reports=[json.loads(line.split('timehutReport=',1)[1]) for line in raw.splitlines() if 'timehutReport=' in line];assert len(reports)==1,name;return reports[0]
 try:
  for serial in os.environ['SIM_MANAGER_SERIALS'].split(','):
   sdk=int(call(serial,'shell','getprop','ro.build.version.sdk').stdout);assert call(serial,'shell','getprop','ro.kernel.qemu').stdout.strip()==b'1';assert sdk in [26,36]
   installed=call(serial,'shell','pm','path',PACKAGE).stdout.decode().strip().removeprefix('package:');installedHash=call(serial,'shell','sha256sum',installed).stdout.decode().split()[0]
   previous=next((r for r in resume if r['serial']==serial and r.get('installedSHA256')==expected and len(r.get('checks',[]))==5),None)
   assert installedHash==(expected if previous else baseline),'Unknown/newer APK preserved'
   jobs=call(serial,'shell','dumpsys','jobscheduler').stdout.decode();assert not re.search(r'(JOB #|JobStatus\{)[^\n]*'+re.escape(PACKAGE)+r'/',jobs),'Existing scheduled work preserved'
   pid=call(serial,'shell','pidof',PACKAGE,check=False).stdout.strip()
   if pid:
    detail=call(serial,'shell','dumpsys','package',PACKAGE).stdout.decode();uid=re.search(r'^\s*(?:userId|appId)=(\d+)\s*$',detail,re.M);assert uid
    state=call(serial,'shell','am','get-uid-state',uid[1]).stdout.decode();assert 'CACHED' in state,'Existing active process preserved'
    call(serial,'shell','am','force-stop',PACKAGE)
   row=dict(previous) if previous else {'serial':serial,'sdk':sdk,'checks':[],'status':'UNCONFIRMED'};rows.append(row)
   assert b'Success' in call(serial,'install','-r','-t',str(test)).stdout
   try:
    if previous:
     row['priorPassedEvidence']=str(resumeFile)
     if row.get('insets',{}).get('status','').startswith('PASS') and row['insets']['screenshotsDirectory'].startswith('/data/'):
      exported=method(serial,'SystemUiInsetsTest#exportRecordedSyntheticScreenshots');row['syntheticExport']=exported
      folder=next(f for f in exported['folders'] if Path(f).name==Path(row['insets']['screenshotsDirectory']).name);row['insets']['screenshotsDirectory']=folder
    else:
     row['checks'].append(method(serial,'CandidateUpgrade73Test#captureKnown83DataBefore85'))
    if not previous:assert b'Success' in call(serial,'install','-r',str(apk)).stdout
    installed=call(serial,'shell','pm','path',PACKAGE).stdout.decode().strip().removeprefix('package:');assert call(serial,'shell','sha256sum',installed).stdout.decode().split()[0]==expected;row['installedSHA256']=expected
    for name in ([] if previous else ['CandidateUpgrade73Test#upgraded85PreservesBytesAndPendingReceipts','CandidateUpgrade73Test#nonDebug85RejectsLegacyCredentialSetters','CandidateReleaseTest#packagedReleaseRejectsDebugOrigins','CandidateReleaseTest#coldEngineClosesLegacyAccessBeforeAnyActivity']):
     row['checks'].append(method(serial,name))
    call(serial,'shell','input','keyevent','224');call(serial,'shell','wm','dismiss-keyguard')
    if not row.get('insets',{}).get('status','').startswith('PASS'):row['insets']=method(serial,'SystemUiInsetsTest#safeViewportAndSystemTaps',timeout=100)
    row['featurePaths']=method(serial,'AccountFeaturePathsTest#exactNewPathsPreserveNarrowAuthority')
    # Instrumentation is trusted and writes only this synthetic screenshot folder.
    folder=row['insets']['screenshotsDirectory'];assert folder.startswith('/storage/emulated/0/Android/data/'+PACKAGE+'/files/system-ui-insets-') or folder.startswith('/sdcard/Android/data/'+PACKAGE+'/files/system-ui-insets-')
    dest=out/('sdk'+str(sdk));dest.mkdir();assert call(serial,'pull',folder,str(dest)).returncode==0
    if row.get('baseline'):
     bf=row['baseline']['screenshotsDirectory'];bd=out/'baseline79';bd.mkdir();call(serial,'pull',bf,str(bd))
    call(serial,'shell','am','start','-W','-n',PACKAGE+'/tw.aihankapps.timehut.MainActivity');time.sleep(2);(out/('sdk'+str(sdk)+'-entry.png')).write_bytes(call(serial,'exec-out','screencap','-p').stdout)
    call(serial,'shell','am','start','-a','android.settings.APPLICATION_DETAILS_SETTINGS','-d','package:'+PACKAGE);time.sleep(3);(out/('sdk'+str(sdk)+'-app-info.png')).write_bytes(call(serial,'exec-out','screencap','-p').stdout)
    row.update(status='PASS_EXACT85_SAFE_VIEWPORT_AND_UPGRADE',dataReset=False,physicalPhone=False,providerRequests=0)
   finally:call(serial,'shell','am','force-stop',PACKAGE,check=False)
  assert len(rows)==2 and {r['sdk'] for r in rows}=={26,36}
  report={'status':'PASS_EXACT85_MANAGED_INSETS_AND83_UPGRADE','devices':rows,'apkSHA256':expected,'testAPK_SHA256':sha(test),'physicalPhone':False,'providerRequests':0,'formalAcceptance':False}
  (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');(Q/'runtime-latest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':report['status'],'evidence':str(out)}))
 finally:(out/'observed-phases.json').write_text(json.dumps({'devices':rows},ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
