import UIKit
import Capacitor
import Photos

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        guard identifier == TransferEngine.sessionIdentifier else { completionHandler(); return }
        TransferEngine.shared.backgroundCompletion = completionHandler
        TransferEngine.shared.activate()
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        #if DEBUG
        #if targetEnvironment(simulator)
        if ProcessInfo.processInfo.environment["TIMEHUT_QA_MODE"] == "account-keychain" {
            if ["http", "engine", "engine-reopen", "upload", "upload-reopen"].contains(ProcessInfo.processInfo.environment["TIMEHUT_QA_ACCOUNT_PHASE"] ?? "") {
                DispatchQueue.global(qos: .utility).async { NativeAccountStoreQA.run() }
            } else { NativeAccountStoreQA.run() }
        }
        if ProcessInfo.processInfo.environment["TIMEHUT_QA_MODE"] == "photos-readback" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { SyntheticPhotoReadback.run() }
        }
        #endif
        if ProcessInfo.processInfo.environment["TIMEHUT_QA_MODE"] == "transfers" {
            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 1) {
                do {
                    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                    let endpoint = ProcessInfo.processInfo.environment["TIMEHUT_QA_ENDPOINT"] ?? ""
                    guard let url = URL(string: endpoint), ["127.0.0.1", "localhost"].contains(url.host ?? "") else { return }
                    let source = try TransferEngine.shared.importFile(documents.appendingPathComponent("native-qa.png"), mediaType: "photo")
                    let result = ["id":source.id,"endpoint":endpoint,"albumId":"90000000000002","tags":"native-synthetic-only"]
                    try JSONSerialization.data(withJSONObject: result).write(to: documents.appendingPathComponent("native-qa-prepared.json"), options:.atomic)
                } catch {
                    let documents = FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0]
                    try? Data(error.localizedDescription.utf8).write(to:documents.appendingPathComponent("native-qa-error.txt"))
                }
            }
        }
        #endif
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

class TimehutBridgeController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(TransferPlugin())
        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.environment["TIMEHUT_QA_MODE"] == "account-bridge", let view=webView { NativeAccountBridgeQA.start(view) }
        #endif
        #if DEBUG
        if ProcessInfo.processInfo.environment["TIMEHUT_QA_MODE"] == "transfers" { checkSyntheticBridge(attempt:0) }
        else if ProcessInfo.processInfo.environment["TIMEHUT_QA_MODE"] == "save" { checkSyntheticPhotoSave(attempt:0) }
        else if ProcessInfo.processInfo.environment["TIMEHUT_QA_MODE"] == "store-audit" { checkSyntheticStore(attempt:0) }
        #endif
    }
    #if DEBUG
    private func checkSyntheticBridge(attempt:Int) {
        DispatchQueue.main.asyncAfter(deadline:.now()+1) { [weak self] in
            guard let self else { return }
            let documents=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0]
            guard let data=try? Data(contentsOf:documents.appendingPathComponent("native-qa-prepared.json")),let upload=try? JSONSerialization.jsonObject(with:data) as? [String:Any] else { if attempt<15 { self.checkSyntheticBridge(attempt:attempt+1) };return }
            self.webView?.callAsyncJavaScript("if(!window.TimehutTransfers) throw new Error('Page not ready'); const caps=await window.TimehutTransfers.ready; const plugin=Capacitor.registerPlugin('TimehutTransfer'); const state=window.timehutSyntheticEnqueue ||= {}; state.upload ||= await plugin.enqueueUpload(upload); state.download ||= await plugin.enqueueDownload({url:upload.endpoint+'/native-qa.png',filename:'native-qa.png',mediaType:'photo'}); const tasks=await window.TimehutTransfers.list(); return JSON.stringify({caps,taskCount:tasks.length,registered:Capacitor.isPluginAvailable('TimehutTransfer'),uploadId:state.upload.id,downloadId:state.download.id,jsEnqueueUploadAndDownload:true});",arguments:["upload":upload],in:nil,in:.page) { result in
                switch result {
                case .success(let value):
                    if let text=value as? String { try? Data(text.utf8).write(to:documents.appendingPathComponent("native-qa-bridge.json"),options:.atomic);try? Data(text.utf8).write(to:documents.appendingPathComponent("native-qa-start.json"),options:.atomic);self.checkSyntheticPhotoSave(attempt:0) }
                case .failure: if attempt<15 { self.checkSyntheticBridge(attempt:attempt+1) }
                }
            }
        }
    }
    private func checkSyntheticStore(attempt:Int) {
        DispatchQueue.main.asyncAfter(deadline:.now()+0.5) { [weak self] in
            guard let self else { return }
            self.webView?.callAsyncJavaScript("if(!window.TimehutTransfers) throw new Error('Page not ready'); const caps=await TimehutTransfers.ready; if(!caps.nativeError) throw new Error('QA expects a corrupted store');const plugin=Capacitor.registerPlugin('TimehutTransfer'); const rejected={};for(const method of ['list','prepareUpload']){try{await plugin[method]();rejected[method]=false;}catch(error){rejected[method]=true;}}return JSON.stringify({caps,rejected});",arguments:[:],in:nil,in:.page) { result in
                if case .success(let value)=result,let text=value as? String { let documents=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0];try? Data(text.utf8).write(to:documents.appendingPathComponent("native-qa-store-report.json"),options:.atomic) }
                else if attempt<20 { self.checkSyntheticStore(attempt:attempt+1) }
            }
        }
    }
    private func checkSyntheticPhotoSave(attempt:Int) {
        guard attempt<150 else { return }
        DispatchQueue.main.asyncAfter(deadline:.now()+0.5) { [weak self] in
            guard let self else { return };let documents=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0];let command=documents.appendingPathComponent("native-qa-command.json")
            if let data=try? Data(contentsOf:command),let args=try? JSONSerialization.jsonObject(with:data) as? [String:Any],let id=args["id"] as? String,let record=TransferEngine.shared.get(id),record.filename=="native-qa.png",record.direction=="download" {
                try? FileManager.default.removeItem(at:command)
                let finish:([String:Any])->Void={ value in
                    var response=value
                    response["commandId"]=args["commandId"]
                    response["photoAddAuthorization"]=PHPhotoLibrary.authorizationStatus(for:.addOnly).rawValue
                    response["photoReadAuthorization"]=PHPhotoLibrary.authorizationStatus(for:.readWrite).rawValue
                    response["readUsageDescriptionPresent"]=Bundle.main.object(forInfoDictionaryKey:"NSPhotoLibraryUsageDescription") != nil
                    if let encoded=try? JSONSerialization.data(withJSONObject:response){try? encoded.write(to:documents.appendingPathComponent("native-qa-command-result.json"),options:.atomic)}
                }
                if args["probe"] as? String == "authorization" {
                    finish(["success":true,"probe":"authorization"])
                } else if record.stage=="saved",!record.savedAssetId.isEmpty {
                    finish(["success":true,"value":["savedAssetId":record.savedAssetId],"probe":args["probe"] ?? "saved"])
                } else {
                self.webView?.callAsyncJavaScript("try { const value=await Capacitor.registerPlugin('TimehutTransfer').saveToPhotos({id:args.id}); return JSON.stringify({success:true,value,probe:args.probe}); } catch(error) { return JSON.stringify({success:false,error:String(error),probe:args.probe}); }",arguments:["args":args],in:nil,in:.page) { result in
                    if case .success(let value)=result,let text=value as? String,let bytes=text.data(using:.utf8),let response=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any] {
                        if response["success"] as? Bool == true {
                            try? bytes.write(to:documents.appendingPathComponent("native-qa-save-written.json"),options:.atomic)
                        }
                        // Saving exercises the production AddOnly API. Readback is a separate QA observer.
                        finish(response)
                    } else { finish(["success":false,"probe":args["probe"] ?? "","error":"QA_JAVASCRIPT_CALLBACK_FAILED"]) }
                }
                }
            }
            self.checkSyntheticPhotoSave(attempt:attempt+1)
        }
    }
    #endif
}

#if DEBUG && targetEnvironment(simulator)
// Only the separately signed QA observer has read access. Never enumerate the library or automate a permission response.
private enum SyntheticPhotoReadback {
    static func run(authorizationAttempted:Bool=false, authorizationCallbackReceived:Bool=false) {
        guard ProcessInfo.processInfo.environment["TIMEHUT_QA_MODE"] == "photos-readback",
              Bundle.main.bundleIdentifier?.hasPrefix("tw.aihankapps.timehut.qa.readback.") == true else { return }
        let documents=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0]
        guard let data=try? Data(contentsOf:documents.appendingPathComponent("native-qa-readback.json")),
              let command=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],
              let assetId=command["assetId"] as? String, !assetId.isEmpty,
              let commandId=command["commandId"] as? String,
              let expected=try? Data(contentsOf:documents.appendingPathComponent("native-qa.png")) else { return }
        let status=PHPhotoLibrary.authorizationStatus(for:.readWrite)
        var proof:[String:Any]=["commandId":commandId,"assetId":assetId,"photoReadAuthorization":status.rawValue,
                               "expectedByteSize":expected.count,"savedBytesMatch":false,"success":false,
                               "readUsageDescriptionPresent":Bundle.main.object(forInfoDictionaryKey:"NSPhotoLibraryUsageDescription") != nil,
                               "authorizationPromptRequested":authorizationAttempted,"authorizationCallbackReceived":authorizationCallbackReceived,
                               "networkAccessAllowed":false,"assetFetchScope":"exact-created-QA-asset-id"]
        let lock=NSLock();var completed=false;var actual=Data()
        let finish:([String:Any])->Void={ result in
            lock.lock();defer{lock.unlock()};guard !completed else{return};completed=true
            if let encoded=try? JSONSerialization.data(withJSONObject:result) {
                try? encoded.write(to:documents.appendingPathComponent("native-qa-readback-result.json"),options:.atomic)
            }
        }
        guard proof["readUsageDescriptionPresent"] as? Bool == true else {
            proof["readbackError"]="QA_READWRITE_USAGE_DESCRIPTION_MISSING";finish(proof);return
        }
        // One bounded initialization attempt, only when the headless harness explicitly asks.
        // simctl's Photos grant can leave PhotoKit at notDetermined until this API is called.
        if status == .notDetermined, !authorizationAttempted, command["requestAuthorization"] as? Bool == true {
            let gate=NSLock();var returned=false
            PHPhotoLibrary.requestAuthorization(for:.readWrite) { _ in
                DispatchQueue.main.async {
                    gate.lock();guard !returned else { gate.unlock();return };returned=true;gate.unlock()
                    run(authorizationAttempted:true,authorizationCallbackReceived:true)
                }
            }
            DispatchQueue.main.asyncAfter(deadline:.now()+6) {
                gate.lock();guard !returned else { gate.unlock();return };returned=true;gate.unlock()
                var result=proof;result["authorizationPromptRequested"]=true
                result["readbackError"]="QA_READWRITE_AUTHORIZATION_CALLBACK_TIMEOUT_6_SECONDS"
                result["photoReadAuthorization"]=PHPhotoLibrary.authorizationStatus(for:.readWrite).rawValue
                finish(result)
            }
            return
        }
        guard status == .authorized || status == .limited else {
            proof["readbackError"]="QA_READWRITE_PERMISSION_NOT_GRANTED";finish(proof);return
        }
        guard let asset=PHAsset.fetchAssets(withLocalIdentifiers:[assetId],options:nil).firstObject,
              let resource=PHAssetResource.assetResources(for:asset).first(where:{$0.type == .photo}) else {
            proof["readbackError"]="QA_EXACT_ASSET_RESOURCE_NOT_READABLE";finish(proof);return
        }
        proof["resourceType"]=resource.type.rawValue;proof["resourceFilename"]=resource.originalFilename
        let options=PHAssetResourceRequestOptions();options.isNetworkAccessAllowed=false
        let request=PHAssetResourceManager.default().requestData(for:resource,options:options,dataReceivedHandler:{ bytes in
            lock.lock();if !completed { actual.append(bytes) };lock.unlock()
        }) { error in
            lock.lock();let bytes=actual;lock.unlock();var result=proof
            result["savedByteSize"]=bytes.count;result["savedBytesMatch"]=error == nil && bytes == expected
            result["success"]=error == nil
            if error == nil { try? bytes.write(to:documents.appendingPathComponent("native-qa-resource.png"),options:.atomic) }
            if let error { result["readbackError"]=error.localizedDescription }
            finish(result)
        }
        DispatchQueue.global(qos:.utility).asyncAfter(deadline:.now()+6) {
            var result=proof;result["readbackError"]="QA_RESOURCE_CALLBACK_TIMEOUT_6_SECONDS"
            finish(result);PHAssetResourceManager.default().cancelDataRequest(request)
        }
    }
}
#endif
