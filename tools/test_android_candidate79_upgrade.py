"""One managed known77 ->79 UI candidate update with genuine Keystore schema1 pending data.
No downgrade, reset, network login, real account data export or automatic replay.
"""
from pathlib import Path
import hashlib,json,os,subprocess,sys,time,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];TARGET=79;Q=ROOT/(f'.codex-local/qa/20261016-android-installer{TARGET}' if TARGET in [73,75,77,79] else '.codex-local/qa/20261015-android-installer71');ADB='/Users/hank/Library/Android/sdk/platform-tools/adb'
def main():
    assert os.environ.get('SIM_MANAGER_TOKEN') or os.environ.get('SIM_MANAGER_TOKENS')
    prep=json.loads((Q/'candidate-preparation.json').read_text());w=Path(prep['workspace']);apk=w/'android/app/build/outputs/apk/candidate/app-candidate.apk';test=w/'android/app/build/outputs/apk/androidTest/candidate/app-candidate-androidTest.apk'
    sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest();expected=sha(apk);assert expected==json.loads((Q/'apk-inspection.json').read_text())['sha256'];assert sha(test)==json.loads((Q/'test-build.json').read_text())['testApkSHA256'];assert json.loads((Q/'same-signature.json').read_text())['sameSigner']
    for name,digest in prep['sourceFiles'].items():assert sha(ROOT/name)==digest,name
    known={77:'c046859c7be730f0daefae3b3e9efe623a917654cbc84e6951958538a8cd5314'}
    baselineVersion=77
    baselineDate='20261016'
    baselinePrep=json.loads((ROOT/f'.codex-local/qa/{baselineDate}-android-installer{baselineVersion}/candidate-preparation.json').read_text());baseline=Path(baselinePrep['workspace'])/'android/app/build/outputs/apk/candidate/app-candidate.apk';assert sha(baseline)==known[baselineVersion]
    out=Q/('upgrade-runtime-'+str(time.time_ns()));out.mkdir();rows=[];skips=[];package='tw.aihankapps.timehut.testing'
    def call(serial,*args,check=True,timeout=30):
        r=subprocess.run([ADB,'-s',serial,*args],capture_output=True,timeout=timeout)
        if check:assert r.returncode==0,'Assigned device operation unconfirmed: '+args[0]
        return r
    def method(serial,name):
        method=name if '#' in name else 'CandidateReleaseTest#'+name
        r=call(serial,'shell','am','instrument','-w','-r','-e','class','tw.aihankapps.timehut.'+method,package+'.test/androidx.test.runner.AndroidJUnitRunner',check=False,timeout=50);raw=(r.stdout+r.stderr).decode();(out/(name.replace('#','-')+'.txt')).write_text(raw);assert 'OK (1 test)' in raw,raw[-1800:];reports=[json.loads(line.split('timehutReport=',1)[1]) for line in raw.splitlines() if 'timehutReport=' in line];assert len(reports)==1;return reports[0]
    try:
        for serial in os.environ['SIM_MANAGER_SERIALS'].split(','):
            if rows:break
            assert call(serial,'shell','getprop','ro.kernel.qemu').stdout.strip()==b'1';sdk=int(call(serial,'shell','getprop','ro.build.version.sdk').stdout)
            if '--sdk36' in sys.argv and sdk!=36:skips.append({'serial':serial,'sdk':sdk,'reason':'This follow-up covers SDK36 only; unchanged'});continue
            if '--sdk26' in sys.argv and sdk!=26:skips.append({'serial':serial,'sdk':sdk,'reason':'This phase covers SDK26 only; unchanged'});continue
            installed=call(serial,'shell','pm','path',package,check=False).stdout.decode().strip();fresh=False;cached=False;importance=None
            if installed:
                assert installed.startswith('package:') and '\n' not in installed
                h=call(serial,'shell','sha256sum',installed.removeprefix('package:')).stdout.decode().split()[0]
                versions=[v for v,digest in known.items() if digest==h]
                if not versions:skips.append({'serial':serial,'sdk':sdk,'reason':'Unknown/newer testing APK preserved'});continue
                cached=False;pid=call(serial,'shell','pidof',package,check=False).stdout.decode().strip()
                if pid:
                    import re
                    info=call(serial,'shell','dumpsys','package',package).stdout.decode();uid=re.search(r'^\s*(?:userId|appId)=(\d+)\s*$',info,re.M);assert uid
                    importance=call(serial,'shell','am','get-uid-state',uid[1],check=False).stdout.decode().strip()
                    if 'CACHED' not in importance:skips.append({'serial':serial,'sdk':sdk,'reason':'Existing noncached/unknown process preserved','importance':importance});continue
                    cached=True
                fromVersion=versions[0]
            else:
                assert b'Success' in call(serial,'install',str(baseline)).stdout;fresh=True;fromVersion=baselineVersion
            jobs=call(serial,'shell','dumpsys','jobscheduler').stdout.decode();import re
            assert not re.search(r'(JOB #|JobStatus\{)[^\n]*'+re.escape(package)+r'/',jobs),'Existing jobs preserved; no update'
            row={'serial':serial,'sdk':sdk,'fromVersion':fromVersion,'freshBaseline':fresh,'oldProcessCached':cached,'importance':importance,'status':'UNCONFIRMED','checks':[]};rows.append(row);owned=False
            try:
                if cached:call(serial,'shell','am','force-stop',package)
                assert b'Success' in call(serial,'install','-r','-t',str(test)).stdout;owned=True;row['checks'].append(method(serial,'CandidateUpgrade73Test#captureKnown77DataBefore79' if TARGET==79 else 'CandidateUpgrade73Test#captureKnown73DataBefore75' if TARGET==75 else 'CandidateUpgrade73Test#captureKnown71DataBefore73' if TARGET==73 else 'captureKnown68DataAndPendingCredentialBefore71'))
                assert b'Success' in call(serial,'install','-r',str(apk)).stdout;path=call(serial,'shell','pm','path',package).stdout.decode().strip().removeprefix('package:');assert call(serial,'shell','sha256sum',path).stdout.decode().split()[0]==expected;row['installedSHA256']=expected
                methods=[f'CandidateUpgrade73Test#upgraded{TARGET}PreservesBytesAndPendingReceipts',f'CandidateUpgrade73Test#nonDebug{TARGET}RejectsLegacyCredentialSetters','packagedReleaseRejectsDebugOrigins','coldEngineClosesLegacyAccessBeforeAnyActivity'] if TARGET in [73,75,77,79] else ['upgraded71PreservesBytesAndMigratesPendingSchema1','nonDebug71RejectsLegacyCredentialSettersSynchronously','packagedReleaseRejectsDebugOrigins','coldEngineClosesLegacyAccessBeforeAnyActivity']
                for name in methods:row['checks'].append(method(serial,name))
                call(serial,'shell','input','keyevent','224');call(serial,'shell','wm','dismiss-keyguard');call(serial,'shell','am','start','-W','-n',package+'/tw.aihankapps.timehut.MainActivity');time.sleep(3)
                remote='/data/local/tmp/timehut'+str(TARGET)+'-'+str(os.getpid())+'.xml'
                for attempt in range(5):
                    r=call(serial,'shell','uiautomator','dump','--compressed',remote,check=False)
                    if r.returncode==0:
                        xml=call(serial,'shell','cat',remote).stdout;(out/f'installed-entry-attempt-{attempt}.xml').write_bytes(xml);texts={n.get('text') for n in ET.fromstring(xml).iter('node')}
                        if ('請先更新手機的網頁元件' in texts if sdk<36 else any('登入' in (s or '') for s in texts)):break
                    time.sleep(1)
                else:raise AssertionError('Entry UI unconfirmed; current install and all upgrade evidence preserved')
                (out/'installed-entry.xml').write_bytes(xml);(out/'installed-entry.png').write_bytes(call(serial,'exec-out','screencap','-p').stdout)
                call(serial,'shell','am','start','-a','android.settings.APPLICATION_DETAILS_SETTINGS','-d','package:'+package);time.sleep(1);call(serial,'shell','uiautomator','dump','--compressed',remote);(out/'installed-app-info.xml').write_bytes(call(serial,'shell','cat',remote).stdout);(out/'installed-app-info.png').write_bytes(call(serial,'exec-out','screencap','-p').stdout);call(serial,'shell','rm',remote)
                row.update(status=f'PASS_EXACT{TARGET}_UPGRADE_PENDING_AND_NONDEBUG_GATES' if TARGET in [73,75,77,79] else 'PASS_EXACT71_UPGRADE_SCHEMA2_AND_NONDEBUG_GATES',dataReset=False,actualPublicHTTPSLogin=False,activeCustomerTaskMigration=False,installedHVisualReview='PENDING')
            finally:
                if owned:call(serial,'shell','am','force-stop',package,check=False)
        assert len(rows)==1 and rows[0]['status'].startswith('PASS')
        proof={'status':f'PASS_CURRENT{TARGET}_UPGRADE_NONDEBUG_PENDING' if TARGET in [73,75,77,79] else 'PASS_CURRENT71_UPGRADE_NONDEBUG_SCHEMA2','evidence':str(out),'devices':rows,'skippedAssignedDevices':skips,'apkSHA256':expected,'testApkSHA256':sha(test),'publicHTTPSLogin':False,'nonDebugBackgroundTransfer':False,'physicalPhone':False,'providerRequests':0,'dataReset':False,'formalCredit':0,'published':False}
        (out/'report.json').write_text(json.dumps(proof,indent=2)+'\n');(Q/'runtime-latest.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'status':proof['status'],'evidence':str(out)}))
    finally:(out/'observed-phases.json').write_text(json.dumps({'devices':rows,'skips':skips},indent=2)+'\n')
if __name__=='__main__':main()
