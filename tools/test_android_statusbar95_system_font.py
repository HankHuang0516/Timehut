from pathlib import Path
import os,json,subprocess,time,signal,hashlib
q=Path(__file__).resolve().parents[1]/'.codex-local/qa/20261017-android-installer95';prep=json.loads((q/'candidate-preparation.json').read_text());w=Path(prep['workspace']);adb='/Users/hank/Library/Android/sdk/platform-tools/adb';pkg='tw.aihankapps.timehut.testing';apkHash=json.loads((q/'apk-inspection.json').read_text())['sha256'];test=w/'android/app/build/outputs/apk/androidTest/candidate/app-candidate-androidTest.apk';out=q/('system-font-runtime-'+str(time.time_ns()));out.mkdir();rows=[]
assert hashlib.sha256(test.read_bytes()).hexdigest()==json.loads((q/'build-result.json').read_text())['testAPK']['sha256']
assert os.environ.get('SIM_MANAGER_TOKEN') or os.environ.get('SIM_MANAGER_TOKENS')
def interrupted(signum,frame):raise SystemExit(128+signum)
signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
def call(s,*args,check=True,timeout=25):
 r=subprocess.run([adb,'-s',s,*args],capture_output=True,timeout=timeout)
 if check:assert r.returncode==0,str(args[:3])
 return r
try:
 for serial in os.environ.get('SIM_MANAGER_SERIALS',os.environ.get('SIM_MANAGER_SERIAL','')).split(','):
  sdk=int(call(serial,'shell','getprop','ro.build.version.sdk').stdout)
  if sdk!=36:rows.append({'serial':serial,'sdk':sdk,'status':'SKIPPED_REQUIRES_CURRENT_WEBVIEW_OS36','deviceSettingChanged':False});continue
  path=call(serial,'shell','pm','path',pkg,check=False)
  if path.returncode!=0 or not path.stdout.strip():rows.append({'serial':serial,'sdk':sdk,'status':'SKIPPED_NO_KNOWN95_INSTALLED','deviceSettingChanged':False});continue
  installed=path.stdout.decode().strip().removeprefix('package:')
  installedHash=call(serial,'shell','sha256sum',installed).stdout.decode().split()[0]
  assert installedHash==apkHash,'Unknown installed APK preserved; requires final95 revision phase first'
  assert not call(serial,'shell','pidof',pkg,check=False).stdout.strip(),'Existing process preserved; normal managed95 phase must finish first'
  original=call(serial,'shell','settings','get','system','font_scale').stdout.decode().strip();assert original=='null' or .5<=float(original)<=5
  row={'serial':serial,'sdk':sdk,'beforeSystemFontScale':original,'status':'UNCONFIRMED','apkSHA256':apkHash};rows.append(row)
  try:
   call(serial,'shell','settings','put','system','font_scale','2.0');time.sleep(.6);assert call(serial,'shell','settings','get','system','font_scale').stdout.decode().strip()=='2.0'
   assert b'Success' in call(serial,'install','-r','-t',str(test)).stdout
   r=call(serial,'shell','am','instrument','-w','-r','-e','class','tw.aihankapps.timehut.SystemUiInsetsTest#actualSystemLargeFontSettingsAndAccount',pkg+'.test/androidx.test.runner.AndroidJUnitRunner',check=False,timeout=75);raw=(r.stdout+r.stderr).decode();(out/(serial+'-test.txt')).write_text(raw)
   reports=[json.loads(x.split('timehutReport=',1)[1]) for x in raw.splitlines() if 'timehutReport=' in x]
   if reports:
    row['proof']=reports[-1];folder=reports[-1].get('screenshotsDirectory');assert folder.startswith('/storage/emulated/0/Android/data/'+pkg+'/files/system-ui-insets-');dest=out/serial;dest.mkdir();call(serial,'pull',folder,str(dest))
   assert r.returncode==0 and 'OK (1 test)' in raw,raw[-1800:];row['status']='PASS_ACTUAL_OS_FONT2_CURRENT95_SETTINGS_AND_ACCOUNT'
  finally:
   if original=='null':call(serial,'shell','settings','delete','system','font_scale')
   else:call(serial,'shell','settings','put','system','font_scale',original)
   row['afterSystemFontScale']=call(serial,'shell','settings','get','system','font_scale').stdout.decode().strip();row['originalSettingRestored']=row['afterSystemFontScale']==original;assert row['originalSettingRestored'];call(serial,'shell','am','force-stop',pkg,check=False)
 assert any(r['status'].startswith('PASS') for r in rows),'No assigned API36 device; no UI proof claimed'
 result={'status':'PASS_EXACT95_ACTUAL_SYSTEM_FONT2_NATIVE_RUNTIME_AND_RESTORATION','devices':rows,'physicalPhone':False,'providerRequests':0,'realCredentialsEntered':False};(out/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');(q/'system-font-latest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':result['status'],'evidence':str(out)}))
finally:(out/'observed.json').write_text(json.dumps({'devices':rows},ensure_ascii=False,indent=2)+'\n')
