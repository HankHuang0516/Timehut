#if DEBUG && targetEnvironment(simulator)
import Foundation
import Security
import WebKit

// Explicit isolated simulator namespace; never uses the production Keychain
// service, real accounts, network, Photos or another app's container.
enum NativeAccountStoreQA {
    static func run() {
        guard let bundle = Bundle.main.bundleIdentifier, bundle.hasPrefix("tw.aihankapps.timehut.qa.accounts."),
              let run = ProcessInfo.processInfo.environment["TIMEHUT_QA_ACCOUNT_RUN"], NativeAccountOrigin.uuid(run),
              let phase = ProcessInfo.processInfo.environment["TIMEHUT_QA_ACCOUNT_PHASE"],
              ["prepare", "reopen", "interrupt", "recover", "login-stage", "login-resume", "unknown-stage", "unknown-resume", "schema", "http", "engine", "engine-reopen", "upload", "upload-reopen", "bridge-local-close", "native-proof-stage", "native-proof-reopen"].contains(phase) else { return }
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let directory = documents.appendingPathComponent("account-qa-" + run, isDirectory: true)
        var checks = [String](), report: [String: Any] = ["phase": phase, "pid": getpid(), "run": run,
            "bundleIdentifier": bundle, "productionServiceUsed": false, "networkUsed": false, "fullEngineIntegration": false]
        var ownedUploadFixtureLease: NativeAccountSnapshot?
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            func require(_ value: Bool, _ name: String) throws {
                guard value else { throw NativeAccountError.invalidState }; checks.append(name)
            }
            let service = bundle + ".isolated-" + run
            let vault = NativeKeychainVault(service: service)
            let control = NativeFileAccountControl(directory: directory.appendingPathComponent("control", isDirectory: true))
            let store = NativeAccountStore(vault: vault, control: control)
            let ownerA = "20000000-0000-4000-8000-000000000001", ownerB = "20000000-0000-4000-8000-000000000002"
            let expiry = Int64(Date().timeIntervalSince1970 * 1000) + 3_600_000
            func credential(_ owner: String, suffix: String) -> NativeAccountCredential {
                NativeAccountCredential(owner: owner, token: "synthetic_account_" + run.replacingOccurrences(of: "-", with: "") + suffix,
                    issuer: NativeAccountOrigin.backend, expiresAt: expiry, legacyOwner: owner == ownerA)
            }
            if phase == "native-proof-stage" || phase == "native-proof-reopen" {
                let secret = Data(repeating: 42, count: 32).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
                if phase == "native-proof-stage" {
                    try require(try vault.read() == nil, "exclusive isolated simulator Keychain namespace")
                    let a = try store.activateVerified(credential(ownerA, suffix: "a"))
                    let attempt = try store.beginLogin(issuer: NativeAccountOrigin.backend, cancelSecret: secret)
                    try store.captureLoginToken(credential(ownerB, suffix: "issued").token, attempt: attempt)
                    try require(try store.snapshot() == a && store.status()["loginPending"] as? Bool == true, "native proof and observed token committed before process exit")
                    var query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:"credential-ledger",kSecReturnAttributes as String:true]
                    query[kSecMatchLimit as String] = kSecMatchLimitOne
                    var result: CFTypeRef?
                    try require(SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, "actual Keychain item attributes available")
                    guard let attributes=result as? [String:Any] else {throw NativeAccountError.invalidState}
                    try require(attributes[kSecAttrAccessible as String] as? String == kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String, "proof shares original AfterFirstUnlockThisDeviceOnly protection")
                    try require((attributes[kSecAttrSynchronizable as String] as? Bool) != true, "proof is never synchronized through iCloud")
                    report["attemptId"]=attempt;report["generationA"]=a.generation
                } else {
                    let before=try JSONSerialization.jsonObject(with:Data(contentsOf:directory.appendingPathComponent("native-proof-stage.json"))) as! [String:Any]
                    try require(before["pid"] as? Int != Int(getpid()), "actual different OS process")
                    try require(try store.snapshot() == nil, "cold process closes unfinished native admission")
                    let rows=try store.nativeCancellations()
                    try require(rows.count == 1 && rows[0].attemptId == before["attemptId"] as? String && rows[0].secret == secret, "actual Keychain cold recovery retains original exact proof")
                    let pending=try store.allRevocations()
                    try require(pending.count == 2 && pending.contains(where:{$0.owner == ownerA}) && pending.contains(where:{$0.owner == nil}), "both prior verified owner and independently observed opaque token preserved")
                    let b=try store.activateVerified(credential(ownerB,suffix:"b"))
                    let wrong=NativeAccountCancellation(attemptId:rows[0].attemptId,secret:String(repeating:"A",count:43),issuer:rows[0].issuer)
                    try store.confirmNativeCancellation(wrong)
                    try require(try store.nativeCancellations() == rows && store.snapshot() == b, "wrong local ACK cannot erase original proof or change B")
                    try store.confirmNativeCancellation(rows[0])
                    try require(try store.nativeCancellations().isEmpty && store.snapshot() == b && store.allRevocations() == pending, "exact local ACK retires proof only; B and both known tokens untouched")
                    let status=String(decoding:try JSONSerialization.data(withJSONObject:store.status()),as:UTF8.self)
                    try require(!status.contains(secret), "bridge status exports no cancellation secret")
                    _ = try store.signOut()
                    try require(try store.allRevocations().count == 3 && store.snapshot() == nil, "all three synthetic token receipts remain preserved after local closure")
                    report["actualKeychainColdRecovery"]=true;report["localAcknowledgementOnly"]=true;report["HTTPIdentityOrCancellationACKVerified"]=false
                }
            } else if phase == "bridge-local-close" {
                let platform=NativeAccountStore.platform
                guard let expectedOwner=ProcessInfo.processInfo.environment["TIMEHUT_QA_EXPECTED_OWNER"],NativeAccountOrigin.uuid(expectedOwner),
                      let expectedIssuer=ProcessInfo.processInfo.environment["TIMEHUT_QA_ACCOUNT_BACKEND"],NativeAccountOrigin.allowed(expectedIssuer),
                      URLComponents(string:expectedIssuer)?.host=="127.0.0.1",
                      let current=try platform.snapshot(),current.credential.owner==expectedOwner,current.credential.issuer==expectedIssuer else { throw NativeAccountError.changed }
                let before=try platform.allRevocations(),unknown=try platform.status()["unknownLoginResults"] as? Int
                try require(try platform.signOut(ifCurrent:current),"only exact failed artificial UI account closes locally")
                let after=try platform.allRevocations(),added=NativeAccountRevocation(owner:current.credential.owner,token:current.credential.token,issuer:current.credential.issuer)
                try require(after.count==before.count+1 && before.allSatisfy(after.contains) && after.contains(added),"every old pending credential plus the failed UI credential is retained")
                try require(try platform.snapshot()==nil && platform.status()["unknownLoginResults"] as? Int==unknown,"local closure preserves unknown outcomes and stays signed out")
                report["pendingBefore"]=before.count;report["pendingAfter"]=after.count;report["noRemoteACKAttempted"]=true
            } else if phase == "upload" || phase == "upload-reopen" {
                let platform = NativeAccountStore.platform, engine = TransferEngine.shared, baseline = try platform.allRevocations()
                try require(try platform.snapshot() == nil && platform.status()["unknownLoginResults"] as? Int == 0, "isolated platform is closed without clearing prior unknown credentials")
                report["preservedBaselinePendingCount"] = baseline.count
                let png = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=")!
                if phase == "upload-reopen" {
                    let prior = try JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("upload.json"))) as! [String: Any]
                    guard let id = prior["uploadID"] as? String, let record = engine.get(id) else { throw NativeAccountError.invalidState }
                    engine.activate()
                    try require(engine.list().isEmpty && record.stage == "completed" && record.serverReceiptId == prior["localId"] as? String, "cold process keeps exact completed upload receipt private while signed out")
                    try require(try Data(contentsOf: URL(fileURLWithPath: record.sourceReference)) == png && TransferUploadIdentity.file(URL(fileURLWithPath: record.bodyReference), check: {}) == record.bodySha256, "cold process preserves original PNG and complete immutable multipart bytes")
                    try require(record.contentSha256 == prior["contentSha256"] as? String && record.metadataSha256 == prior["metadataSha256"] as? String, "cold process keeps exact upload content and metadata fingerprints")
                } else {
                    guard let backend = ProcessInfo.processInfo.environment["TIMEHUT_QA_ACCOUNT_BACKEND"],
                          let url = URLComponents(string: backend), url.scheme == "http", url.host == "127.0.0.1", NativeAccountOrigin.allowed(backend) else { throw NativeAccountError.invalidIdentity }
                    report["networkUsed"] = true; report["syntheticRootBackendUsed"] = true
                    func fixture(_ suffix: String) throws -> [String: Any] {
                        let target = URL(string: backend + "/fixture/" + suffix)!
                        let config = URLSessionConfiguration.ephemeral
                        config.httpCookieStorage = nil; config.urlCredentialStorage = nil; config.urlCache = nil
                        let session = URLSession(configuration: config); defer { session.invalidateAndCancel() }
                        let done = DispatchSemaphore(value: 0), mutex = NSLock()
                        var result: Result<[String: Any], Error>?
                        var request = URLRequest(url: target); request.timeoutInterval = 5
                        session.dataTask(with: request) { data, response, error in
                            mutex.lock(); defer { mutex.unlock(); done.signal() }
                            result = Result {
                                if let error { throw error }
                                guard let response = response as? HTTPURLResponse, response.url == target, response.statusCode == 200,
                                      let data, data.count <= 1_048_576,
                                      let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw NativeAccountHTTPError.invalidResponse }
                                return object
                            }
                        }.resume()
                        guard done.wait(timeout: .now()+5) == .success else { throw NativeAccountHTTPError.timeout }
                        mutex.lock(); defer { mutex.unlock() }; return try result!.get()
                    }
                    func wait(_ condition: () throws -> Bool) throws {
                        let deadline = Date().addingTimeInterval(25)
                        while try !condition() { guard Date() < deadline else { throw NativeAccountHTTPError.timeout }; Thread.sleep(forTimeInterval: 0.1) }
                    }
                    let client = try NativeAccountClient(store: platform, backend: backend, changed: { engine.accountChanged() })
                    _ = try client.signIn(username: "fixture-alpha", password: "artificial-native-root-secret")
                    let a = try platform.snapshot()!
                    ownedUploadFixtureLease = a
                    let albums = try client.request(method: "GET", path: "/api/accounts/albums")
                    guard let album = (albums["albums"] as? [[String: Any]])?.first?["id"] as? String else { throw NativeAccountError.invalidState }
                    let source = directory.appendingPathComponent("人工-😀-e\u{301}.png"); try png.write(to: source, options: .atomic)
                    let prepared = try engine.importFile(source, mediaType: "photo", expected: a)
                    let record = try engine.enqueueUpload(id: prepared.id, endpoint: backend, albumId: album, tags: "標籤 😀\nline")
                    report["uploadID"] = record.id; report["contentSha256"] = record.contentSha256; report["metadataSha256"] = record.metadataSha256
                    try wait { ((try fixture("stats"))["queue"] as? [[String: Any]])?.contains { $0["clientUploadId"] as? String == record.id && $0["status"] as? String == "completed" } == true }
                    let before = try fixture("stats"), rows = before["queue"] as! [[String: Any]]
                    guard let accepted = rows.first(where: { $0["clientUploadId"] as? String == record.id }), let localId = accepted["localId"] as? String else { throw NativeAccountError.invalidState }
                    report["localId"] = localId
                    try require(engine.get(record.id)?.serverReceiptId.isEmpty == true && before["heldACKs"] as? Int == 1, "server committed original while actual OS upload has not received its held ACK")
                    try require(accepted["contentSha256"] as? String == record.contentSha256 && accepted["metadataSha256"] as? String == record.metadataSha256 && accepted["originalFilename"] as? String == record.filename, "actual server verifies native content, Unicode filename and length-prefixed UTF8 metadata")
                    try engine.cancel(record.id); try engine.retry(record.id)
                    try wait { engine.get(record.id)?.stage == "completed" }
                    let after = try fixture("stats")
                    try require(engine.get(record.id)?.serverReceiptId == localId && before["posts"] as? Int == 1 && after["posts"] as? Int == 1 && after["creations"] as? Int == 1, "retry recovers the same accepted receipt with exactly one original POST and provider creation")
                    _ = try fixture("mode?value=receiving")
                    let held = try engine.importFile(source, mediaType: "photo", expected: a)
                    _ = try engine.enqueueUpload(id: held.id, endpoint: backend, albumId: album, tags: "unknown receiving")
                    try wait { engine.get(held.id)?.errorCode == "RECEIPT_UNCONFIRMED" }
                    let firstHeld = try fixture("stats")
                    try engine.retry(held.id)
                    try wait { engine.get(held.id)?.errorCode == "RECEIPT_UNCONFIRMED" }
                    let secondHeld = try fixture("stats")
                    try require(firstHeld["posts"] as? Int == 1 && secondHeld["posts"] as? Int == 1 && (secondHeld["admissionGets"] as! Int) > (firstHeld["admissionGets"] as! Int), "receiving response and explicit retry only repeat lookup, never original POST")
                    try require(try Data(contentsOf: URL(fileURLWithPath: held.sourceReference)) == png, "unknown receiving original remains byte-identical")
                    _ = try fixture("mode?value=normal"); try engine.cancel(held.id)
                    _ = try client.signIn(username: "fixture-bravo", password: "artificial-native-root-secret")
                    let b = try platform.snapshot()!
                    ownedUploadFixtureLease = b
                    try require(engine.list().isEmpty && a.credential.owner != b.credential.owner, "new principal cannot see completed or unknown original upload")
                    _ = try platform.signOut(); engine.accountChanged()
                    for pending in try platform.allRevocations() where pending.issuer == backend && [a.credential.owner, b.credential.owner].contains(pending.owner ?? "") {
                        try require(try client.retryRevocation(pending), "exact this-fixture issuer ACK confirms only its own credential")
                    }
                    try require(try platform.snapshot() == nil && platform.allRevocations() == baseline, "logout preserves all previous pending credentials without reset")
                    report["actualOSBackgroundURLSessionUsed"] = true; report["uploadAdmissionProtocolVerified"] = true
                }
                report["boundedUploadEngineIntegrated"] = true; report["backgroundOrLockTransitionVerified"] = false; report["PhotoKitUsed"] = false
            } else if phase == "engine" || phase == "engine-reopen" {
                let platform = NativeAccountStore.platform, engine = TransferEngine.shared
                let baselinePending = try platform.allRevocations()
                try require(try platform.snapshot() == nil && platform.status()["unknownLoginResults"] as? Int == 0,
                    "isolated QA platform ledger starts closed without discarding any existing pending result")
                report["preservedBaselinePendingCount"] = baselinePending.count
                let png = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=")!
                if phase == "engine-reopen" {
                    let prior = try JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("engine.json"))) as! [String: Any]
                    guard let preparedID = prior["enginePreparedID"] as? String, let downloadID = prior["engineDownloadID"] as? String,
                          let prepared = engine.get(preparedID), let download = engine.get(downloadID) else { throw NativeAccountError.invalidState }
                    engine.activate()
                    try require(engine.list().isEmpty, "new process cannot list prior owner's work while logged out")
                    try require(prepared.accountOwner == download.accountOwner && prepared.accountIssuer == download.accountIssuer,
                        "new process retains both exact original task owners and issuer")
                    try require(try Data(contentsOf: URL(fileURLWithPath: prepared.sourceReference)) == png && Data(contentsOf: URL(fileURLWithPath: download.destinationReference)) == png,
                        "new process keeps prepared and downloaded original bytes")
                    report["coldEngineReopenVerified"] = true
                } else {
                    guard let backend = ProcessInfo.processInfo.environment["TIMEHUT_QA_ACCOUNT_BACKEND"],
                          let url = URLComponents(string: backend), url.scheme == "http", url.host == "127.0.0.1",
                          NativeAccountOrigin.allowed(backend) else { throw NativeAccountError.invalidIdentity }
                    let client = try NativeAccountClient(store: platform, backend: backend, changed: { engine.accountChanged() })
                    report["networkUsed"] = true; report["syntheticRootBackendUsed"] = true
                    _ = try client.signIn(username: "fixture-alpha", password: "artificial-native-root-secret")
                    let a = try platform.snapshot()!
                    engine.activate(); try require(engine.list().isEmpty, "new fixture owner cannot adopt retained work")
                    let source = directory.appendingPathComponent("synthetic-engine.png"); try png.write(to: source, options: .atomic)
                    let prepared = try engine.importFile(source, mediaType: "photo", expected: a)
                    report["enginePreparedID"] = prepared.id
                    try require(prepared.accountOwner == a.credential.owner && prepared.accountIssuer == backend, "actual engine preparation stamps verified Keychain owner")
                    let download = try engine.enqueueDownload(url: backend + "/api/photo/900000000081/image?size=o", filename: "synthetic-original.jpg", mediaType: "photo")
                    report["engineDownloadID"] = download.id
                    let deadline = Date().addingTimeInterval(25)
                    while let current = engine.get(download.id), !["file_ready", "failed"].contains(current.stage), Date() < deadline { Thread.sleep(forTimeInterval: 0.1) }
                    let context = try engine.saveContext(download.id)
                    try require(context.0.filename == "synthetic-original.png" && (try Data(contentsOf: URL(fileURLWithPath: context.0.destinationReference))) == png,
                        "actual background URLSession downloads exact first-party original and correct MIME extension")
                    _ = try client.signIn(username: "fixture-bravo", password: "artificial-native-root-secret")
                    let b = try platform.snapshot()!
                    try require(a.credential.owner != b.credential.owner && engine.list().isEmpty, "real Keychain switch removes A work from engine list")
                    var refused = false
                    do { _ = try engine.ownedRecord(download.id) } catch { refused = true }
                    try require(refused, "actual engine denies B access to A download")
                    refused = false
                    do { _ = try engine.thumbnail(prepared.id) } catch { refused = true }
                    try require(refused, "actual engine denies B preview of A prepared original")
                    let foreign = try engine.enqueueDownload(url: backend + "/api/photo/900000000081/image?size=o", filename: "foreign.png", mediaType: "photo")
                    let foreignDeadline = Date().addingTimeInterval(25)
                    while let current = engine.get(foreign.id), !["file_ready", "failed"].contains(current.stage), Date() < foreignDeadline { Thread.sleep(forTimeInterval: 0.1) }
                    try require(engine.get(foreign.id)?.stage == "failed" && engine.get(foreign.id)?.destinationReference.isEmpty == true && (try platform.snapshot()) == b,
                        "actual root denies B media download before any private file publication and preserves B")
                    try require(try Data(contentsOf: URL(fileURLWithPath: prepared.sourceReference)) == png, "A prepared original survives B download denial")
                    _ = try platform.signOut(); engine.accountChanged()
                    for pending in try platform.allRevocations() where pending.issuer == backend && [a.credential.owner, b.credential.owner].contains(pending.owner ?? "") {
                        try require(try client.retryRevocation(pending), "exact current-fixture remote ACK retires only its own pending credential")
                    }
                    try require(try platform.allRevocations() == baselinePending && engine.list().isEmpty && platform.snapshot() == nil,
                        "actual logout closes engine and preserves every unrelated baseline pending credential")
                    report["actualOSBackgroundURLSessionUsed"] = true
                }
                report["boundedTransferEngineIntegrated"] = true
                report["platformKeychainServiceWithinIsolatedQABundle"] = true
                report["backgroundOrLockTransitionVerified"] = false
                report["uploadAdmissionProtocolVerified"] = false
                report["PhotoKitUsed"] = false
            } else if phase == "http" {
                guard let backend = ProcessInfo.processInfo.environment["TIMEHUT_QA_ACCOUNT_BACKEND"],
                      let url = URLComponents(string: backend), url.scheme == "http", url.host == "127.0.0.1",
                      NativeAccountOrigin.allowed(backend) else { throw NativeAccountError.invalidIdentity }
                // Healthy HTTP integration has its own ledger; earlier uncertain
                // outcome fixtures and their pending credentials stay intact.
                let httpStore = NativeAccountStore(vault: NativeKeychainVault(service: service + ".http"),
                    control: NativeFileAccountControl(directory: directory.appendingPathComponent("control-http", isDirectory: true)))
                let client = try NativeAccountClient(store: httpStore, backend: backend)
                let password = "artificial-native-root-secret"
                let a = try client.signIn(username: "fixture-alpha", password: password)
                try require(a["token"] == nil, "actual iOS native login-me excludes bearer from result")
                let albums = try client.request(method: "GET", path: "/api/accounts/albums")
                guard let row = (albums["albums"] as? [[String: Any]])?.first, let id = row["id"] as? String else { throw NativeAccountError.invalidState }
                let ownPhotos = try client.request(method: "GET", path: "/api/album/" + id + "/photos")
                try require(ownPhotos["stat"] as? String == "ok", "same actual root album endpoint succeeds for A")
                let prior = try httpStore.snapshot()!
                _ = try client.signIn(username: "fixture-bravo", password: password)
                let current = try httpStore.snapshot()!
                try require(prior.credential.owner != current.credential.owner, "actual iOS Keychain switches verified principal")
                var rejected = false
                do { _ = try client.request(method: "GET", path: "/api/album/" + id + "/photos") } catch NativeAccountHTTPError.status(404) { rejected = true }
                try require(rejected && (try httpStore.snapshot()) == current, "actual root denies A album while preserving B")
                for pending in try httpStore.allRevocations() { _ = try client.retryRevocation(pending) }
                try require(try httpStore.allRevocations().isEmpty && httpStore.snapshot() == current, "typed HTTP logout ACK retires only A")
                let fresh = try client.signIn(username: "fixture-ios-runtime", password: password, displayName: "人工原生新帳戶", register: true)
                let context = try client.request(method: "GET", path: "/api/accounts/context")
                try require(fresh["legacyOwner"] as? Bool == false && (context["children"] as? [Any])?.isEmpty == true, "actual iOS registration starts without household role or children")
                for pending in try httpStore.allRevocations() { _ = try client.retryRevocation(pending) }
                let signed = try client.signOut()
                try require(signed["serverConfirmed"] as? Bool == true && (try httpStore.snapshot()) == nil, "actual iOS Keychain and root backend confirm logout")
                let owner = try client.signIn(username: "fixture-owner", password: password)
                let household = try client.request(method: "GET", path: "/api/accounts/context")
                try require(owner["legacyOwner"] as? Bool == true && httpStore.snapshot()?.credential.legacyOwner == true && (household["children"] as? [[String: Any]])?.first?["albumId"] as? String == "72100000000000001", "actual iOS receives verified fixture household role and original numeric context")
                _ = try client.signOut()
                report["networkUsed"] = true; report["syntheticRootBackendUsed"] = true
                report["separateHealthyHTTPLedger"] = true
            } else if phase == "prepare" {
                try require(try vault.read() == nil, "exclusive new QA Keychain service")
                let a = try store.activateVerified(credential(ownerA, suffix: "a"))
                let b = try store.activateVerified(credential(ownerB, suffix: "b"))
                try require(try store.pendingRevocations() == [a.credential], "actual Keychain switch retains A")
                try require(try NativeAccountStore(vault: vault, control: control).snapshot() == b, "fresh store reads actual Keychain item")
                let status = try JSONSerialization.data(withJSONObject: store.status())
                try require(!String(data: status, encoding: .utf8)!.contains(b.credential.token), "bridge metadata excludes token")
                var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                    kSecAttrAccount as String: "credential-ledger", kSecReturnAttributes as String: true]
                query[kSecMatchLimit as String] = kSecMatchLimitOne
                var attributes: CFTypeRef?
                try require(SecItemCopyMatching(query as CFDictionary, &attributes) == errSecSuccess, "actual Keychain attributes readable")
                guard let values = attributes as? [String: Any] else { throw NativeAccountError.invalidState }
                try require(values[kSecAttrAccessible as String] as? String == kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String,
                    "AfterFirstUnlockThisDeviceOnly accessibility")
                try require((values[kSecAttrSynchronizable as String] as? Bool) != true, "no iCloud Keychain synchronization")
                let files = try FileManager.default.contentsOfDirectory(at: directory.appendingPathComponent("control"), includingPropertiesForKeys: nil)
                try require(files.count == 1 && files[0].lastPathComponent == "installation" && (try Data(contentsOf: files[0])).count == 37,
                    "only UUID installation marker stored outside Keychain")
                report["generationA"] = a.generation
                report["generationB"] = b.generation
            } else if phase == "reopen" {
                guard let current = try store.snapshot() else { throw NativeAccountError.unauthenticated }
                try require(current.credential.owner == ownerB && (try store.pendingRevocations()).map(\.owner) == [ownerA], "new OS process retains B and pending A")
                let prepared = try JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("prepare.json"))) as! [String: Any]
                try require(current.generation == prepared["generationB"] as? String, "cold reopen does not replace generation")
                guard let prior = try store.pendingRevocations().first, let generation = prepared["generationA"] as? String else { throw NativeAccountError.invalidState }
                try require(try !store.signOut(ifCurrent: NativeAccountSnapshot(credential: prior, generation: generation)), "stale A callback cannot log B out")
            } else if phase == "interrupt" {
                guard let current = try store.snapshot() else { throw NativeAccountError.unauthenticated }
                try require(current.credential.owner == ownerB, "B is active before pending-control interruption")
                _ = try control.begin()
                try require(try control.read().pendingMutation != nil, "actual durable pending mutation held for process termination")
            } else if phase == "recover" {
                try require(try store.snapshot() == nil, "next OS process recovers closed")
                let pending = try store.pendingRevocations()
                try require(Set(pending.map(\.owner)) == Set([ownerA, ownerB]) && pending.count == 2, "A and B credentials retained for original-issuer revocation")
                try require(try control.read().pendingMutation == nil, "confirmed recovery completes control")
                if let a = pending.first(where: { $0.owner == ownerA }) { try store.confirmRevocation(a) }
                try require(try store.pendingRevocations().map(\.owner) == [ownerB] && store.snapshot() == nil, "exact local ACK removes A only")
            } else if phase == "schema" {
                guard let raw = try vault.read(), var before = try JSONSerialization.jsonObject(with: raw) as? [String: Any] else { throw NativeAccountError.invalidState }
                before["version"] = 1; try vault.write(JSONSerialization.data(withJSONObject: before))
                try require(try store.snapshot() == nil && store.status()["unknownLoginResults"] as? Int == 1, "actual Keychain v1 migration keeps closed state and unknown login receipt")
                guard let migrated = try vault.read(), let after = try JSONSerialization.jsonObject(with: migrated) as? [String: Any] else { throw NativeAccountError.invalidState }
                before["version"] = 2
                try require(NSDictionary(dictionary: before).isEqual(to: after), "actual Keychain migration changes only schema version")
                try require(try store.allRevocations().map(\.owner) == [ownerB], "actual Keychain migration retains B revocation")
            } else if phase == "login-stage" || phase == "unknown-stage" {
                let attempt = try store.beginLogin(issuer: NativeAccountOrigin.backend)
                if phase == "login-stage" { try store.captureLoginToken("synthetic_issued_" + run.replacingOccurrences(of: "-", with: ""), attempt: attempt) }
                try require(try store.snapshot() == nil && store.status()["loginPending"] as? Bool == true, "Keychain persists login admission without activating it")
            } else if phase == "login-resume" {
                try require(try store.snapshot() == nil, "cold login recovery remains signed out")
                let rows = try store.allRevocations()
                try require(rows.count == 2 && rows.filter({ $0.owner == nil }).count == 1, "issued opaque token and previous B survive in real Keychain")
                if let issued = rows.first(where: { $0.owner == nil }) { try store.confirmRevocation(issued) }
                try require(try store.allRevocations().map(\.owner) == [ownerB], "exact local opaque ACK preserves B")
            } else {
                try require(try store.snapshot() == nil && store.status()["unknownLoginResults"] as? Int == 1, "cold process retains unknown login outcome without a fabricated token")
                try require(try store.allRevocations().map(\.owner) == [ownerB], "unknown outcome does not discard B revocation")
            }
            report["status"] = "PASS_ISOLATED_IOS_KEYCHAIN_PHASE"; report["checks"] = checks
        } catch {
            if phase == "upload", let lease = ownedUploadFixtureLease {
                report["onlyOwnFixtureLocallyClosedAfterFailure"] = (try? NativeAccountStore.platform.signOut(ifCurrent: lease)) ?? false
                TransferEngine.shared.accountChanged()
            }
            report["status"] = "IOS_KEYCHAIN_PHASE_UNCONFIRMED"
            report["checksBeforeFailure"] = checks
            report["errorType"] = String(reflecting: type(of: error))
            if case NativeKeychainError.systemStatus(let status) = error { report["keychainSystemStatus"] = Int(status) }
        }
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: directory.appendingPathComponent(phase + ".json"), options: .atomic)
        }
    }
}

// Headless WebView observer for this task's isolated QA app. Commands select
// fixed DOM actions; no arbitrary JavaScript, real account, picker or Photos.
enum NativeAccountBridgeQA {
    static func start(_ view: WKWebView) {
        guard Bundle.main.bundleIdentifier?.hasPrefix("tw.aihankapps.timehut.qa.accounts.") == true,
              ProcessInfo.processInfo.environment["TIMEHUT_QA_MODE"] == "account-bridge",
              let run = ProcessInfo.processInfo.environment["TIMEHUT_QA_ACCOUNT_RUN"], NativeAccountOrigin.uuid(run),
              let backend = ProcessInfo.processInfo.environment["TIMEHUT_QA_ACCOUNT_BACKEND"],
              URLComponents(string: backend)?.host == "127.0.0.1", NativeAccountOrigin.allowed(backend) else { return }
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("account-ui-" + run)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let store = NativeAccountStore.platform
            guard try store.snapshot() == nil else { throw NativeAccountError.changed }
            let baseline = try store.allRevocations()
            guard !baseline.contains(where:{$0.issuer==backend}) else { throw NativeAccountError.changed }
            let ruleRows: [[String:Any]] = [
                ["trigger":["url-filter":"^https?://"],"action":["type":"block"]],
                ["trigger":["url-filter":"^"+NSRegularExpression.escapedPattern(for:backend)+"/"],"action":["type":"ignore-previous-rules"]]
            ]
            let rules = String(data:try JSONSerialization.data(withJSONObject:ruleRows),encoding:.utf8)!
            WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "timehut-ui-" + run, encodedContentRuleList: rules) { list, error in
                guard let list, error == nil else { write(["ok":false,"error":"QA_NETWORK_RULE_UNCONFIRMED"], to:directory.appendingPathComponent("startup.json"));return }
                view.configuration.userContentController.add(list)
                view.load(URLRequest(url: URL(string:"capacitor://localhost/account.html")!))
                write(["ok":true,"pid":getpid(),"baselinePending":baseline.count,"externalWebRequestRuleInstalled":true],to:directory.appendingPathComponent("startup.json"))
                poll(view, directory:directory, backend:backend, baseline:baseline, handled:[])
            }
        } catch { write(["ok":false,"error":"QA_EXISTING_ACCOUNT_PRESERVED"],to:directory.appendingPathComponent("startup.json")) }
    }
    private static func write(_ object: [String:Any], to file: URL) {
        if let bytes = try? JSONSerialization.data(withJSONObject:object,options:[.sortedKeys]) { try? bytes.write(to:file,options:.atomic) }
    }
    private static func poll(_ view: WKWebView, directory:URL, backend:String, baseline:[NativeAccountRevocation], handled:Set<String>) {
        DispatchQueue.main.asyncAfter(deadline:.now()+0.2) {
            guard let bytes = try? Data(contentsOf:directory.appendingPathComponent("command.json")),
                  let command = (try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any],
                  let id = command["id"] as? String, NativeAccountOrigin.uuid(id), !handled.contains(id),
                  let phase = command["phase"] as? String,
                  ["register","create","prepare-source","open-transfer","start-upload","open-account","logout","login-b","verify-b-transfer","close"].contains(phase) else { poll(view,directory:directory,backend:backend,baseline:baseline,handled:handled);return }
            let expectedPage = ["register","create","logout","login-b"].contains(phase) ? "account.html" : ["start-upload","verify-b-transfer"].contains(phase) ? "transfer.html" : nil
            if let expectedPage, view.isLoading || view.url?.lastPathComponent != expectedPage {
                write(["path":view.url?.path ?? "","nativeLoading":view.isLoading,"expectedPage":expectedPage],to:directory.appendingPathComponent(id+"-diagnostic.json"))
                poll(view,directory:directory,backend:backend,baseline:baseline,handled:handled);return
            }
            var next=handled;next.insert(id)
            let finishLock=NSLock();var didFinish=false
            let finish:([String:Any])->Void = { value in
                finishLock.lock();defer{finishLock.unlock()};guard !didFinish else{return};didFinish=true
                var report=value;report["id"]=id;report["phase"]=phase;report["pid"]=getpid()
                write(report,to:directory.appendingPathComponent(id+".json"))
                if phase != "close" { poll(view,directory:directory,backend:backend,baseline:baseline,handled:next) }
            }
            if phase == "open-transfer" || phase == "open-account" {
                view.load(URLRequest(url:URL(string:"capacitor://localhost/"+(phase == "open-transfer" ? "transfer.html" : "account.html"))!))
                finish(["ok":true,"navigationScheduled":true]);return
            }
            if phase == "prepare-source" {
                do {
                    let file=directory.appendingPathComponent("synthetic-ui.png")
                    try Data(base64Encoded:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=")!.write(to:file,options:.atomic)
                    let record=try TransferEngine.shared.importFile(file,mediaType:"photo")
                    write(["id":record.id],to:directory.appendingPathComponent("prepared.json"))
                    finish(["ok":true,"taskId":record.id,"actualPickerUsed":false])
                } catch { finish(["ok":false,"error":"NATIVE_QA_PREPARATION_UNCONFIRMED"]) };return
            }
            if phase == "close" {
                DispatchQueue.global(qos:.utility).async {
                    do {
                        guard let current=try NativeAccountStore.platform.snapshot(),current.credential.issuer==backend,
                              let client=NativeAccountClient.platform else { throw NativeAccountError.changed }
                        let reports=try FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:nil).filter{$0.pathExtension=="json"}.compactMap{try? JSONSerialization.jsonObject(with:Data(contentsOf:$0)) as? [String:Any]}
                        var own=Set(reports.filter{["register","login-b"].contains($0["phase"] as? String ?? "")}.compactMap{$0["owner"] as? String})
                        let verified=try client.request(method:"GET",path:"/api/accounts/me")
                        if let user=verified["user"] as? [String:Any],user["id"] as? String==current.credential.owner,
                           ["fixture-ios-ui","fixture-bravo"].contains(user["username"] as? String ?? "") { own.insert(current.credential.owner) }
                        guard own.contains(current.credential.owner) else { throw NativeAccountError.changed }
                        _ = try NativeAccountStore.platform.signOut(ifCurrent:current);NativeAccountClient.notifyPlatformChange()
                        for row in try NativeAccountStore.platform.allRevocations() where row.issuer==backend && own.contains(row.owner ?? "") { guard try client.retryRevocation(row) else { throw NativeAccountError.unavailable } }
                        guard try NativeAccountStore.platform.allRevocations()==baseline, try NativeAccountStore.platform.snapshot()==nil else { throw NativeAccountError.invalidState }
                        finish(["ok":true,"baselinePendingPreserved":baseline.count,"closedOnlyOwnFixture":true])
                    } catch { finish(["ok":false,"error":"QA_CLOSE_UNCONFIRMED_ALL_DATA_PRESERVED"]) }
                };return
            }
            let prepared=(try? JSONSerialization.jsonObject(with:Data(contentsOf:directory.appendingPathComponent("prepared.json")))) as? [String:Any]
            let script = """
            const wait=async predicate=>{const end=Date.now()+20000;while(!await predicate()){if(Date.now()>end)throw Error('DOM phase timed out');await new Promise(resolve=>setTimeout(resolve,100));}};
            await wait(()=>document.readyState==='complete');
            await wait(()=>window.TimehutAccounts);await TimehutAccounts.ready;
            const get=id=>document.getElementById(id),fill=(form,name,value)=>{form.elements[name].value=value;form.elements[name].dispatchEvent(new Event('input',{bubbles:true}));};
            if(phase==='register'||phase==='login-b'){
              await wait(()=>get('account-form')&&!get('account-form').querySelector('button').disabled);
              if(TimehutAccounts.status().authenticated)throw Error('Prior account unexpectedly active');
              if(phase==='register')get('account-toggle').click();
              const form=get('account-form');fill(form,'username',phase==='register'?'fixture-ios-ui':'fixture-bravo');fill(form,'password','artificial-native-root-secret');
              if(phase==='register')fill(form,'displayName','人工iOS新帳戶');form.requestSubmit();
              await wait(()=>TimehutAccounts.status().authenticated&&get('account-home')&&!get('account-home').hidden&&!form.elements.password.value);
              const state=TimehutAccounts.status();if(!state.native||!state.user||JSON.stringify(state).includes('"token"'))throw Error('Native identity missing');
              await wait(()=>get('account-message').textContent==='已登入。');
              if(phase==='login-b'&&(get('account-albums').children.length!==0||document.body.textContent.includes('人工iOS相簿')))throw Error('Old account DOM retained');
              return {ok:true,owner:state.user.id,native:true,passwordCleared:true,albumButtons:get('account-albums').children.length};
            }
            if(phase==='create'){
              const form=get('album-form');fill(form,'title','人工iOS相簿');fill(form,'birthDate','2020-02-29');form.requestSubmit();
              await wait(()=>get('account-message').textContent==='相簿已建立。');
              const albums=await TimehutAccounts.request('/api/accounts/albums');if(albums.albums.length!==1)throw Error('Unexpected owned albums');
              return {ok:true,albumId:albums.albums[0].id,native:TimehutAccounts.status().native};
            }
            if(phase==='start-upload'){
              await wait(()=>window.TimehutPage&&window.TimehutTransfers);await TimehutPage.ready;await TimehutTransfers.ready;
              await wait(()=>document.querySelector('[data-task-id="'+taskId+'"]'));
              const row=document.querySelector('[data-task-id="'+taskId+'"]'),button=[...row.querySelectorAll('button')].find(b=>b.textContent==='開始上傳');if(!button)throw Error('Upload control missing');button.click();
              await wait(()=>document.querySelector('[data-task-id="'+taskId+'"]')?.dataset.stage==='completed');
              return {ok:true,taskId,actualDOMUploadButton:true,completed:true,native:TimehutAccounts.status().native};
            }
            if(phase==='logout'){
              await wait(()=>get('account-logout')&&!get('account-home').hidden);get('account-logout').click();
              await wait(()=>!TimehutAccounts.status().authenticated&&get('account-auth')&&!get('account-auth').hidden&&!get('account-logout').disabled);
              if(get('account-photos').children.length||get('account-albums').children.length)throw Error('Old private DOM retained');
              return {ok:true,localSignedOut:true,message:get('account-message').textContent};
            }
            if(phase==='verify-b-transfer'){
              await wait(()=>window.TimehutPage&&window.TimehutTransfers);await TimehutPage.ready;await TimehutTransfers.ready;
              const tasks=await TimehutTransfers.list();if(tasks.length||document.querySelectorAll('.transfer-task').length)throw Error('Foreign transfer retained');
              return {ok:true,native:TimehutAccounts.status().native,ownedTasks:0};
            }
            throw Error('Unknown fixed phase');
            """
            DispatchQueue.main.asyncAfter(deadline:.now()+8) {
                finishLock.lock();let active = !didFinish;finishLock.unlock();guard active else{return}
                view.evaluateJavaScript("JSON.stringify({path:location.pathname,ready:document.readyState,account:window.TimehutAccounts?{authenticated:TimehutAccounts.status().authenticated,native:TimehutAccounts.status().native}:null,pageDefined:!!window.TimehutPage,transfersDefined:!!window.TimehutTransfers,loading:document.documentElement.hasAttribute('data-timehut-loading'),rows:document.querySelectorAll('.transfer-task').length,albumOptions:document.getElementById('transferAlbum')?.options.length,capability:document.getElementById('transferCapability')?.textContent,accountMessage:document.getElementById('account-message')?.textContent,authTitle:document.getElementById('auth-title')?.textContent})") { value,_ in
                    if let text=value as? String,let bytes=text.data(using:.utf8),let object=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any] { write(object,to:directory.appendingPathComponent(id+"-diagnostic.json")) }
                }
            }
            DispatchQueue.main.asyncAfter(deadline:.now()+23) { finish(["ok":false,"error":"WHOLE_WEBVIEW_PHASE_TIMEOUT_23_SECONDS"]) }
            view.callAsyncJavaScript(script,arguments:["phase":phase,"taskId":prepared?["id"] as? String ?? ""],in:nil,in:.page) { result in
                if case .success(let value)=result,let report=value as? [String:Any] { finish(report) }
                else if case .failure(let error)=result {
                    let native=error as NSError
                    finish(["ok":false,"error":"ACTUAL_WEBVIEW_PHASE_UNCONFIRMED","description":error.localizedDescription,"scriptError":String((native.userInfo["WKJavaScriptExceptionMessage"] as? String ?? "").prefix(256))])
                }
                else { finish(["ok":false,"error":"ACTUAL_WEBVIEW_PHASE_UNCONFIRMED"]) }
            }
        }
    }
}
#endif
