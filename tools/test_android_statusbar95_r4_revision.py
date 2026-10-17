"""Managed exact95-R3→95-R4 retained revision; original94 capture is not recreated. No data reset, login or provider mutation."""
from pathlib import Path
import os, sys, subprocess, json, hashlib, time, re
ROOT=Path(__file__).resolve().parents[1]
Q=ROOT/'.codex-local/qa/20261017-android-installer95-r4'
ADB='/Users/hank/Library/Android/sdk/platform-tools/adb'
PACKAGE='tw.aihankapps.timehut.testing'
BASELINE='d154bfffbecea317ccb0534d341c09985828d99d19a24f58a8f7cd4593be7ce3'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
    assert os.environ.get('SIM_MANAGER_TOKEN') or os.environ.get('SIM_MANAGER_TOKENS')
    prep=json.loads((Q/'candidate-preparation.json').read_text());w=Path(prep['workspace'])
    build=json.loads((Q/'build-result.json').read_text());apk=Path(build['mainAPK']['path']);test=Path(build['testAPK']['path'])
    assert sha(apk)==build['mainAPK']['sha256']==json.loads((Q/'apk-inspection.json').read_text())['sha256']
    assert sha(test)==build['testAPK']['sha256'] and json.loads((Q/'same-signature.json').read_text())['sameSigner']
    resume=json.loads(Path(sys.argv[sys.argv.index('--resume')+1]).read_text()) if '--resume' in sys.argv else None
    if resume:assert resume['apkSHA256']==sha(apk) and resume['testAPK_SHA256']==sha(test)
    prior_path=ROOT/'.codex-local/qa/20261017-android-installer95/revision-runtime-latest.json'; prior_receipt=json.loads(prior_path.read_text()); assert prior_receipt['apkSHA256']==BASELINE
    out=Q/('revision-runtime-'+str(time.time_ns()));out.mkdir();rows=[]
    def checkpoint():
        data={'devices':rows,'apkSHA256':sha(apk),'testAPK_SHA256':sha(test),'physicalPhone':False,'providerRequests':0,'formalAcceptance':False}
        with (out/'observed-phases.json').open('w') as f:json.dump(data,f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
        return data
    def call(serial,*args,check=True,timeout=40):
        result=subprocess.run([ADB,'-s',serial,*args],capture_output=True,timeout=timeout)
        if check:assert result.returncode==0,'Assigned-device operation failed: '+str(args[:3])
        return result
    def method(serial,name,timeout=80):
        result=call(serial,'shell','am','instrument','-w','-r','-e','class','tw.aihankapps.timehut.'+name,PACKAGE+'.test/androidx.test.runner.AndroidJUnitRunner',check=False,timeout=timeout)
        raw=(result.stdout+result.stderr).decode();(out/(serial+'-'+name.replace('#','-')+'.txt')).write_text(raw)
        assert 'OK (1 test)' in raw,raw[-2200:]
        reports=[json.loads(line.split('timehutReport=',1)[1]) for line in raw.splitlines() if 'timehutReport=' in line]
        assert len(reports)==1,name
        return reports[0]
    try:
        for serial in os.environ['SIM_MANAGER_SERIALS'].split(','):
            sdk=int(call(serial,'shell','getprop','ro.build.version.sdk').stdout);assert sdk in [26,36]
            assert call(serial,'shell','getprop','ro.kernel.qemu').stdout.strip()==b'1'
            paths=call(serial,'shell','pm','path',PACKAGE).stdout.decode().strip().splitlines();assert len(paths)==1 and paths[0].startswith('package:'),'Unknown or absent package preserved'
            installed=call(serial,'shell','sha256sum',paths[0].removeprefix('package:')).stdout.decode().split()[0]
            prior=next((r for r in resume['devices'] if r['serial']==serial and r.get('capture') and r.get('installedSHA256')==sha(apk)),None) if resume else None
            assert installed==sha(apk) if prior else installed==BASELINE,'Unknown/newer installed APK preserved'
            jobs=call(serial,'shell','dumpsys','jobscheduler').stdout.decode();assert not re.search(r'(JOB #|JobStatus\{)[^\n]*'+re.escape(PACKAGE)+r'/',jobs),'Existing scheduled work preserved'
            if call(serial,'shell','pidof',PACKAGE,check=False).stdout.strip():
                detail=call(serial,'shell','dumpsys','package',PACKAGE).stdout.decode();uid=re.search(r'^\s*(?:userId|appId)=(\d+)\s*$',detail,re.M);assert uid
                assert 'CACHED' in call(serial,'shell','am','get-uid-state',uid[1]).stdout.decode(),'Active process preserved'
                call(serial,'shell','am','force-stop',PACKAGE)
            row=dict(prior) if prior else {'serial':serial,'sdk':sdk,'baselineSHA256':BASELINE,'baselineVersion':95,'prior94CaptureReceiptSHA256':sha(prior_path),'checks':[],'dataReset':False};rows.append(row)
            assert b'Success' in call(serial,'install','-r','-t',str(test)).stdout
            try:
                if not prior:
                    previous=next(r for r in prior_receipt['devices'] if r['serial']==serial and r['sdk']==sdk);assert previous['status']=='PASS_KNOWN95_R2_TO_R3_PRESERVATION_AND_BOUNDED_UI';row['capture']=previous['capture'];row['beforeRevisionPreservation']=method(serial,'CandidateUpgrade73Test#upgraded95PreservesBytesAndPendingReceipts');checkpoint()
                    assert b'Success' in call(serial,'install','-r',str(apk)).stdout
                current=call(serial,'shell','pm','path',PACKAGE).stdout.decode().strip().removeprefix('package:')
                assert call(serial,'shell','sha256sum',current).stdout.decode().split()[0]==sha(apk);row['installedSHA256']=sha(apk);checkpoint()
                tests=['CandidateUpgrade73Test#upgraded95PreservesBytesAndPendingReceipts','CandidateUpgrade73Test#nonDebug95RejectsLegacyCredentialSetters','CandidateReleaseTest#packagedReleaseRejectsDebugOrigins','CandidateReleaseTest#coldEngineClosesLegacyAccessBeforeAnyActivity']
                for name in tests[len(row['checks']):]:row['checks'].append(method(serial,name));checkpoint()
                call(serial,'shell','input','keyevent','224');call(serial,'shell','wm','dismiss-keyguard')
                if not row.get('insets'):row['insets']=method(serial,'SystemUiInsetsTest#safeViewportAndSystemTaps',timeout=105);checkpoint()
                if not row.get('featurePaths'):row['featurePaths']=method(serial,'AccountFeaturePathsTest#exactNewPathsPreserveNarrowAuthority');checkpoint()
                row['identity']=method(serial,'CandidateUpgrade73Test#exact95DisplayLabelAndIdentity');checkpoint()
                folder=row['insets']['screenshotsDirectory'];assert re.match(r'^/(storage/emulated/0|sdcard)/Android/data/'+re.escape(PACKAGE)+r'/files/system-ui-insets-\d+$',folder)
                destination=out/('sdk'+str(sdk)+'-'+serial);destination.mkdir();call(serial,'pull',folder,str(destination))
                call(serial,'shell','am','start','-W','-n',PACKAGE+'/tw.aihankapps.timehut.MainActivity');time.sleep(2);(out/('sdk'+str(sdk)+'-entry.png')).write_bytes(call(serial,'exec-out','screencap','-p').stdout)
                call(serial,'shell','am','start','-a','android.settings.APPLICATION_DETAILS_SETTINGS','-d','package:'+PACKAGE);time.sleep(1);call(serial,'shell','input','keyevent','4');time.sleep(1);call(serial,'shell','am','start','-a','android.settings.APPLICATION_DETAILS_SETTINGS','-d','package:'+PACKAGE);time.sleep(2);(out/('sdk'+str(sdk)+'-app-info.png')).write_bytes(call(serial,'exec-out','screencap','-p').stdout)
                row['status']='PASS_KNOWN95_R3_TO_R4_PRESERVATION_AND_BOUNDED_UI';checkpoint()
            finally:call(serial,'shell','am','force-stop',PACKAGE,check=False)
        assert rows and all(r.get('status')=='PASS_KNOWN95_R3_TO_R4_PRESERVATION_AND_BOUNDED_UI' for r in rows)
        data=checkpoint();data['status']='PASS_EXACT95_R4_MANAGED_R3_REVISION_WITH_ORIGINAL94_CHAIN'
        (out/'report.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');(Q/'revision-runtime-latest.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':data['status'],'evidence':str(out)}))
    finally:checkpoint()
if __name__=='__main__':main()
