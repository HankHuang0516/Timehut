"""Compile actual pure Java/Swift route guards; no network, Keychain or simulator."""
from pathlib import Path
import hashlib,json,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1]
def method(text,start):
    at=text.index(start);opening=text.index('{',at);depth=0
    for i in range(opening,len(text)):
        if text[i]=='{':depth+=1
        elif text[i]=='}':
            depth-=1
            if depth==0:return text[at:i+1]
    raise AssertionError('Unclosed method')
def main():
    workspace=Path(tempfile.mkdtemp(prefix='timehut-native-deletion-paths-',dir='/Users/hank/.local/share/project-storage/internal/builds'))
    files={'java':'mobile/android/app/src/main/java/tw/aihankapps/timehut/AccountClient.java','swift':'mobile/ios/App/App/NativeAccountClient.swift'}
    java=method((ROOT/files['java']).read_text(),'static boolean allowedPath(')
    swift=method((ROOT/files['swift']).read_text(),'static func allowedPath(')
    cases=[('GET','/api/accounts/photo-deletions',True),('GET','/api/accounts/photo-deletions?page=2',True),('GET','/api/accounts/photo-deletions?album=11111111-2222-4333-8444-555555555555&photoIds=1%2C2',True),('GET','/api/accounts/me',True),('POST','/api/photos/delete',True),('GET','/api/accounts/notifications',True)]
    cases += [(verb,'/api/accounts/photo-deletions',False) for verb in ['POST','PUT','DELETE','get']]
    cases += [('GET',p,False) for p in ['/api/accounts/photo-deletions/','/api/accounts/photo-deletions/extra','/api/accounts/%70hoto-deletions','/api/accounts/photo-deletions#fragment','https://evil.invalid/api/accounts/photo-deletions','//evil.invalid/api/accounts/photo-deletions','/api/accounts/../accounts/photo-deletions','/api/accounts/Photo-Deletions','/api/accounts/bug-releases']]
    checks='\n'.join('if(allowedPath('+json.dumps(verb)+','+json.dumps(p)+')!='+str(expected).lower()+')throw new AssertionError("case'+str(i)+'");' for i,(verb,p,expected) in enumerate(cases))
    (workspace/'NativeRouteCheck.java').write_text('import java.net.URI;\npublic class NativeRouteCheck{\n'+java+'\npublic static void main(String[] args){'+checks+'System.out.println("PASS_JAVA_EXACT_ROUTE_CASES");}}')
    swiftchecks='\n'.join('precondition(NativeRouteCheck.allowedPath('+json.dumps(verb)+','+json.dumps(p)+') == '+str(expected).lower()+',"case'+str(i)+'")' for i,(verb,p,expected) in enumerate(cases))
    (workspace/'main.swift').write_text('import Foundation\nstruct NativeRouteCheck{\n'+swift+'\n}\n'+swiftchecks+'\nprint("PASS_SWIFT_EXACT_ROUTE_CASES")\n')
    commands=[['/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/javac','NativeRouteCheck.java'],['/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java','-cp',str(workspace),'NativeRouteCheck'],['/usr/bin/xcrun','swiftc','main.swift','-o','swift-route-check'],[str(workspace/'swift-route-check')]]
    results=[]
    for command in commands:
        p=subprocess.run(command,cwd=workspace,capture_output=True,text=True,timeout=60);results.append({'program':command[0],'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr});assert p.returncode==0,p.stderr
    result={'status':'PASS_ACTUAL_EXTRACTED_JAVA_SWIFT_NATIVE_READ_GUARDS','workspace':str(workspace),'casesPerLanguage':len(cases),'sourceSHA256':{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in files.values()},'methodSHA256':{'java':hashlib.sha256(java.encode()).hexdigest(),'swift':hashlib.sha256(swift.encode()).hexdigest()},'commands':results,'networkRequests':0,'KeychainAccesses':0,'simulatorActions':0,'scope':'Actual language/path guard source only; no fullnativebridge/Keychain/phone claim'}
    (workspace/'report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':main()
