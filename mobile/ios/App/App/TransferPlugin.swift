import Foundation
import CoreFoundation
import CryptoKit
import Capacitor
import Photos
import PhotosUI
import UniformTypeIdentifiers
import ImageIO
import AVFoundation
import UserNotifications

struct TransferRecord: Codable {
    var id = UUID().uuidString
    var direction: String
    var filename: String
    var mediaType: String
    var byteSize: Int64 = 0
    var sourceReference = ""
    var destinationReference = ""
    var endpoint = ""
    var albumId = ""
    var tags = ""
    var stage = "preparing"
    var bytesTransferred: Int64 = 0
    var systemTaskId = 0
    var serverReceiptId = ""
    var flickrPhotoId = ""
    var waitReason = ""
    var errorCode = ""
    var savedAssetId = ""
    var createdAt = ISO8601DateFormatter().string(from: Date())
    var updatedAt = ISO8601DateFormatter().string(from: Date())
    var bodyReference = ""
    var boundary = ""
    var attempts = 0
    var networkPolicyPending: Bool?
    var contentSha256: String?
    var metadataSha256: String?
    var bodySha256: String?
    var bodyByteSize: Int64?
    var mimeType: String?
    // Missing on legacy records; never infer a new owner from the current login.
    let accountOwner: String?
    let accountIssuer: String?
    init(direction: String, filename: String, mediaType: String, accountOwner: String? = nil, accountIssuer: String? = nil) {
        self.direction = direction; self.filename = filename; self.mediaType = mediaType
        self.accountOwner = accountOwner; self.accountIssuer = accountIssuer
    }
    var dictionary: [String: Any] { (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(self))) as? [String: Any] ?? [:] }
}

enum TransferAccountOwnership {
    static func owns(_ record: TransferRecord, session: NativeAccountSnapshot?) -> Bool {
        guard let session, let owner = record.accountOwner, let issuer = record.accountIssuer else { return false }
        return owner == session.credential.owner && issuer == session.credential.issuer
    }
}
struct TransferLedger: Codable {
    var version = 2
    let records: [String: TransferRecord]
    static func read(_ bytes: Data) throws -> [String: TransferRecord] {
        guard let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw NativeAccountError.invalidState }
        let raw: [String: Any], decoded: [String: TransferRecord]
        if object["version"] != nil {
            guard Set(object.keys) == Set(["version", "records"]), let rows = object["records"] as? [String: Any] else { throw NativeAccountError.invalidState }
            let ledger = try JSONDecoder().decode(TransferLedger.self, from: bytes)
            guard ledger.version == 2 else { throw NativeAccountError.invalidState }
            raw = rows; decoded = ledger.records
        } else { raw = object; decoded = try JSONDecoder().decode([String: TransferRecord].self, from: bytes) }
        for (id, record) in decoded {
            guard UUID(uuidString: id) != nil, record.id == id, let fields = raw[id] as? [String: Any],
                  Set(fields.keys).isSubset(of: Set(record.dictionary.keys).union(["networkPolicyPending", "accountOwner", "accountIssuer"])) else { throw NativeAccountError.invalidState }
            if record.accountOwner != nil || record.accountIssuer != nil {
                guard let owner = record.accountOwner, NativeAccountOrigin.uuid(owner), let issuer = record.accountIssuer,
                      NativeAccountOrigin.allowed(issuer) else { throw NativeAccountError.invalidState }
            }
            if record.contentSha256 != nil || record.metadataSha256 != nil || record.bodySha256 != nil || record.bodyByteSize != nil || record.mimeType != nil {
                guard TransferUploadIdentity.valid(record.contentSha256), TransferUploadIdentity.valid(record.metadataSha256),
                      TransferUploadIdentity.valid(record.bodySha256), (record.bodyByteSize ?? 0) > 0,
                      record.mimeType?.isEmpty == false, !record.bodyReference.isEmpty else { throw NativeAccountError.invalidState }
            }
        }
        return decoded
    }
}

enum TransferUploadIdentity {
    static func valid(_ value: String?) -> Bool { value?.range(of: "\\A[a-f0-9]{64}\\z", options: .regularExpression) != nil }
    static func hex(_ digest: SHA256.Digest) -> String { digest.map { String(format: "%02x", $0) }.joined() }
    static func metadata(_ fields: [String]) -> String {
        var hash = SHA256()
        for field in fields { let bytes = Data(field.utf8); hash.update(data: Data("\(bytes.count)\n".utf8)); hash.update(data: bytes); hash.update(data: Data([10])) }
        return hex(hash.finalize())
    }
    static func file(_ file: URL, check: () throws -> Void) throws -> String {
        let input = try FileHandle(forReadingFrom: file); defer { try? input.close() }; var hash = SHA256()
        while let bytes = try input.read(upToCount: 1_048_576), !bytes.isEmpty { try check(); hash.update(data: bytes) }
        try check(); return hex(hash.finalize())
    }
}

// LOCAL_THUMBNAIL_HELPER_BEGIN — pure local decoding/path selection, shared with host contract checks.
enum TransferThumbnail {
    static func make(record: TransferRecord, id: String, directory: URL) throws -> [String: Any] {
        guard UUID(uuidString: id) != nil, record.id == id else { return ["available":false] }
        let upload = record.direction == "upload"
        guard upload || (record.direction == "download" && ["file_ready","saving","saved"].contains(record.stage)) else { return ["available":false] }
        let reference = upload ? record.sourceReference : record.destinationReference
        guard !reference.isEmpty else { return ["available":false] }
        let file = URL(fileURLWithPath: reference).resolvingSymlinksInPath().standardizedFileURL
        let root = directory.resolvingSymlinksInPath().standardizedFileURL
        guard file.deletingLastPathComponent() == root,
              (upload ? file.lastPathComponent.hasPrefix(id + ".") : file.lastPathComponent == id + "-" + record.filename),
              !file.lastPathComponent.hasSuffix(".multipart"), !file.lastPathComponent.hasSuffix(".retry.json") else { return ["available":false] }
        let info = try file.resourceValues(forKeys: [.isRegularFileKey,.fileSizeKey])
        guard info.isRegularFile == true, (info.fileSize ?? 0) > 0 else { return ["available":false] }
        let image: CGImage
        if record.mediaType == "video" {
            let asset = AVURLAsset(url: file, options: [AVURLAssetReferenceRestrictionsKey: AVAssetReferenceRestrictions.forbidAll.rawValue])
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width:160,height:160)
            image = try generator.copyCGImage(at: .zero, actualTime: nil)
        } else if record.mediaType == "photo" {
            guard let source = CGImageSourceCreateWithURL(file as CFURL,[kCGImageSourceShouldCache:false] as CFDictionary),
                  let thumbnail = CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:160,kCGImageSourceShouldCacheImmediately:true] as CFDictionary) else { return ["available":false] }
            image = thumbnail
        } else { return ["available":false] }
        guard image.width > 0, image.height > 0, image.width <= 160, image.height <= 160 else { return ["available":false] }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data as CFMutableData,UTType.jpeg.identifier as CFString,1,nil) else { return ["available":false] }
        CGImageDestinationAddImage(destination,image,[kCGImageDestinationLossyCompressionQuality:0.78] as CFDictionary)
        guard CGImageDestinationFinalize(destination), data.length <= 65_536 else { return ["available":false] }
        return ["available":true,"width":image.width,"height":image.height,"dataUrl":"data:image/jpeg;base64," + (data as Data).base64EncodedString()]
    }
}
// LOCAL_THUMBNAIL_HELPER_END

// COMPLETION_POLICY_BEGIN — host-testable notification policy and separate durable preference journal.
enum TransferCompletionPolicy {
    static func event(_ record: TransferRecord) -> String {
        guard UUID(uuidString:record.id) != nil else { return "" }
        if record.direction == "upload", record.stage == "completed", !record.flickrPhotoId.isEmpty { return "upload-complete" }
        if record.direction == "download", record.stage == "file_ready", !record.destinationReference.isEmpty, record.byteSize > 0 { return "download-ready" }
        if record.direction == "download", record.stage == "saved", !record.savedAssetId.isEmpty { return "photo-saved" }
        return ""
    }
    static func transition(previous: TransferRecord?, next: TransferRecord) -> String {
        guard let previous, previous.id == next.id else { return "" }
        let value=event(next);return !value.isEmpty && value != event(previous) ? value : ""
    }
}
struct TransferNotificationState: Codable {
    var version=1
    var enabled=false
    var attempts=[String:Double]()
    var epoch=""
    init() {}
    private enum CodingKeys: String,CodingKey { case version,enabled,attempts,epoch }
    init(from decoder: Decoder) throws {
        let values=try decoder.container(keyedBy:CodingKeys.self)
        version=try values.decode(Int.self,forKey:.version);enabled=try values.decode(Bool.self,forKey:.enabled);attempts=try values.decode([String:Double].self,forKey:.attempts)
        epoch=try values.decodeIfPresent(String.self,forKey:.epoch) ?? ""
    }
}
final class TransferNotificationJournal {
    private let file: URL
    private let lock=NSRecursiveLock()
    init(file: URL) { self.file=file }
    func read() throws -> TransferNotificationState {
        lock.lock();defer{lock.unlock()}
        guard FileManager.default.fileExists(atPath:file.path) else { return TransferNotificationState() }
        let state=try JSONDecoder().decode(TransferNotificationState.self,from:Data(contentsOf:file))
        guard state.version == 1 else { throw NSError(domain:"TimehutNotifications",code:1) };return state
    }
    private func write(_ state: TransferNotificationState) throws { try JSONEncoder().encode(state).write(to:file,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication]) }
    func setEnabled(_ enabled: Bool) throws {
        lock.lock();defer{lock.unlock()};var state=try read();state.enabled=enabled;state.epoch=UUID().uuidString;try write(state)
    }
    func claim(id: String, event: String, epoch: String) throws -> Bool {
        lock.lock();defer{lock.unlock()};var state=try read();let key=id+":"+event
        guard state.enabled, state.epoch == epoch, UUID(uuidString:id) != nil, ["upload-complete","download-ready","photo-saved"].contains(event), state.attempts[key] == nil else { return false }
        state.attempts[key]=Date().timeIntervalSince1970;try write(state);return true
    }
}
// COMPLETION_POLICY_END

final class TransferCompletionNotifications {
    private let journal: TransferNotificationJournal
    private let queue=DispatchQueue(label:"TimehutCompletionNotifications")
    private let center=UNUserNotificationCenter.current()
    init(directory: URL) { journal=TransferNotificationJournal(file:directory.appendingPathComponent("notifications.json")) }
    private func systemEnabled(_ settings: UNNotificationSettings) -> Bool {
        let allowed=[UNAuthorizationStatus.authorized,.provisional,.ephemeral].contains(settings.authorizationStatus)
        return allowed && (settings.alertSetting == .enabled || settings.notificationCenterSetting == .enabled || settings.lockScreenSetting == .enabled)
    }
    private func snapshot(_ settings: UNNotificationSettings, wanted: Bool? = nil) throws -> [String:Any] {
        let allowed=systemEnabled(settings)
        if let wanted { try journal.setEnabled(wanted && allowed) }
        let state=try journal.read()
        let permission: String
        switch settings.authorizationStatus { case .notDetermined: permission="prompt";case .authorized: permission="granted";case .provisional,.ephemeral: permission="provisional";default: permission="denied" }
        return ["enabled":state.enabled,"permission":permission,"systemEnabled":allowed,"channelEnabled":true,"canNotify":state.enabled && allowed]
    }
    func settings(_ completion: @escaping (Result<[String:Any],Error>)->Void) {
        center.getNotificationSettings { settings in self.queue.async { completion(Result { try self.snapshot(settings) }) } }
    }
    func setEnabled(_ wanted: Bool, completion: @escaping (Result<[String:Any],Error>)->Void) {
        let finish = { self.center.getNotificationSettings { settings in self.queue.async { completion(Result { try self.snapshot(settings,wanted:wanted) }) } } }
        guard wanted else { finish();return }
        center.getNotificationSettings { settings in
            if settings.authorizationStatus == .notDetermined { self.center.requestAuthorization(options:[.alert,.sound]) { _,error in if let error { completion(.failure(error)) } else { finish() } } }
            else { finish() }
        }
    }
    func clearPrivateCompletions(_ ids: [String]) {
        let values = ids.flatMap { id in ["upload-complete", "download-ready", "photo-saved"].map { "timehut-completion:" + id + ":" + $0 } }
        center.removePendingNotificationRequests(withIdentifiers: values)
        center.removeDeliveredNotifications(withIdentifiers: values)
    }
    func clearAllTransferCompletions() {
        center.getPendingNotificationRequests { rows in
            self.center.removePendingNotificationRequests(withIdentifiers: rows.map(\.identifier).filter { $0.hasPrefix("timehut-completion:") })
        }
        center.getDeliveredNotifications { rows in
            self.center.removeDeliveredNotifications(withIdentifiers: rows.map { $0.request.identifier }.filter { $0.hasPrefix("timehut-completion:") })
        }
    }
    func transition(previous: TransferRecord?, next: TransferRecord, authority: @escaping () -> Bool = { true }) {
        let event=TransferCompletionPolicy.transition(previous:previous,next:next);guard !event.isEmpty else { return }
        queue.async {
            guard authority(), let preference=try? self.journal.read(), preference.enabled else { return }
            self.center.getNotificationSettings { settings in self.queue.async {
            do {
                NativeAccountStore.boundary.lock(); defer { NativeAccountStore.boundary.unlock() }
                guard authority(), self.systemEnabled(settings), try self.journal.claim(id:next.id,event:event,epoch:preference.epoch) else { return }
                // Claim precedes OS submission: a crash can miss an alert, never replay an old completion.
                let kind=next.mediaType == "video" ? "影片" : "照片",content=UNMutableNotificationContent()
                content.title="黃家小屋 · 傳輸完成"
                content.body=event == "upload-complete" ? kind+"已在 Flickr 完成上傳。" : event == "download-ready" ? kind+"已下載至 App，請回傳輸中心保存至手機相簿。" : kind+"已保存至手機相簿。"
                content.sound = .default
                let request=UNNotificationRequest(identifier:"timehut-completion:"+next.id+":"+event,content:content,trigger:nil)
                self.center.add(request) { _ in /* OS submission is best effort, never transfer completion proof. */ }
            } catch { /* Notification storage/OS failure does not change the authoritative task receipt. */ }
            } }
        }
    }
}

// WIFI_POLICY_BEGIN — independent preference; optional task field remains backward compatible.
struct TransferNetworkState: Codable { var version=1; var wifiOnly=false }
final class TransferNetworkPreferences {
    private let file: URL
    private let lock=NSRecursiveLock()
    private var state: TransferNetworkState
    init(file: URL) throws {
        self.file=file
        do { state=try JSONDecoder().decode(TransferNetworkState.self,from:Data(contentsOf:file));guard state.version==1 else { throw NSError(domain:"TimehutNetwork",code:1) } }
        catch {
            let native=error as NSError
            guard native.domain==NSCocoaErrorDomain, native.code==NSFileReadNoSuchFileError,
                  let names=try? FileManager.default.contentsOfDirectory(atPath:file.deletingLastPathComponent().path), !names.contains(file.lastPathComponent) else { throw error }
            state=TransferNetworkState()
        }
    }
    var enabled: Bool { lock.lock();defer{lock.unlock()};return state.wifiOnly }
    func setEnabled(_ enabled: Bool) throws { lock.lock();defer{lock.unlock()};var next=state;next.wifiOnly=enabled;try JSONEncoder().encode(next).write(to:file,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication]);state=next }
    static func eligible(_ record: TransferRecord) -> Bool { !record.endpoint.isEmpty && ["queued","transferring","server_accepted","server_processing","waiting_wifi","waiting_network","waiting_system"].contains(record.stage) }
    static func request(_ url: URL, wifiOnly: Bool) -> URLRequest { var request=URLRequest(url:url);request.allowsCellularAccess = !wifiOnly;return request }
}
// WIFI_POLICY_END

final class TransferEngine: NSObject, URLSessionDownloadDelegate, URLSessionDataDelegate {
    static let shared = TransferEngine()
    static let sessionIdentifier = "tw.aihankapps.timehut.transfers.v1"
    var backgroundCompletion: (() -> Void)?
    var changed: (([String: Any]) -> Void)?
    var authorizationClosed: (() -> Void)?
    // A single recursive boundary prevents account/engine lock inversion.
    private let lock = NativeAccountStore.boundary
    private let accounts = NativeAccountStore.platform
    private var requestAuthorities: [Int: NativeAccountSnapshot] = [:]
    private var records: [String: TransferRecord] = [:]
    private var responseBodies: [Int: Data] = [:]
    private var storageError: Error?
    private let directory: URL
    let notifications: TransferCompletionNotifications
    private var networkPreferences: TransferNetworkPreferences?
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.waitsForConnectivity = true
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil; config.urlCache = nil
        let delegates = OperationQueue(); delegates.maxConcurrentOperationCount = 1
        return URLSession(configuration: config, delegate: self, delegateQueue: delegates)
    }()
    private override init() {
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("TimehutTransfers", isDirectory: true)
        notifications=TransferCompletionNotifications(directory:directory)
        super.init()
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
            networkPreferences=try TransferNetworkPreferences(file:directory.appendingPathComponent("network-policy.json"))
            let store = directory.appendingPathComponent("tasks.json")
            if FileManager.default.fileExists(atPath:store.path) { records = try TransferLedger.read(Data(contentsOf:store)) }
            // App updates can move the sandbox; only rebind this engine's private files.
            for id in Array(records.keys) {
                for key in ["source", "body", "destination"] {
                    let reference = key == "source" ? records[id]!.sourceReference : key == "body" ? records[id]!.bodyReference : records[id]!.destinationReference
                    guard !reference.isEmpty, reference.contains("/TimehutTransfers/") else { continue }
                    let current=directory.appendingPathComponent(URL(fileURLWithPath:reference).lastPathComponent).path
                    if FileManager.default.fileExists(atPath:current) {
                        if key == "source" { records[id]?.sourceReference=current } else if key == "body" { records[id]?.bodyReference=current } else { records[id]?.destinationReference=current }
                    }
                }
            }
        } catch { storageError = error }
    }
    func validateStore() throws { if storageError != nil { throw failure("傳輸收據無法讀取或保存，既有檔案已保留；請先處理儲存問題") } }
    func currentAccount() throws -> NativeAccountSnapshot {
        try validateStore()
        guard let value = try accounts.snapshot() else { throw failure("請先登入帳戶；原檔與收據保留") }
        return value
    }
    func requireAccount(_ expected: NativeAccountSnapshot) throws { try accounts.require(expected) }
    func ownedLease(_ id: String) throws -> NativeAccountSnapshot {
        lock.lock(); defer { lock.unlock() }
        let current = try currentAccount()
        guard let record = records[id], TransferAccountOwnership.owns(record, session: current) else { throw failure("此工作不屬於目前帳戶") }
        return current
    }
    func ownedRecord(_ id: String, expected: NativeAccountSnapshot? = nil) throws -> TransferRecord {
        lock.lock(); defer { lock.unlock() }
        let current = try ownedLease(id)
        if let expected { guard expected == current else { throw failure("帳戶已變更，請回原帳戶核對") } }
        return records[id]!
    }
    private func authorized(_ record: TransferRecord) -> Bool {
        guard let current = try? accounts.snapshot() else { return false }
        return TransferAccountOwnership.owns(record, session: current)
    }
    private func taskAuthority(_ task: URLSessionTask, record: TransferRecord) -> NativeAccountSnapshot? {
        guard let current = try? ownedLease(record.id) else { return nil }
        if let prior = requestAuthorities[task.taskIdentifier] { return prior == current ? current : nil }
        // A relaunched background session may rebind only a request that still
        // uses the exact original owner's current credential and issuer.
        guard let request = task.originalRequest, let url = request.url,
              request.value(forHTTPHeaderField: "Authorization") == "Bearer " + current.credential.token,
              Self.requestOrigin(url) == current.credential.issuer else { return nil }
        requestAuthorities[task.taskIdentifier] = current
        return current
    }
    static func requestOrigin(_ url: URL) -> String? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false), let scheme = parts.scheme, let host = parts.host,
              parts.user == nil, parts.password == nil, parts.fragment == nil else { return nil }
        let port = parts.port
        return scheme + "://" + host + (port == nil || scheme == "https" && port == 443 || scheme == "http" && port == 80 ? "" : ":\(port!)")
    }
    private func authenticatedRequest(_ record: TransferRecord, url: URL) throws -> (URLRequest, NativeAccountSnapshot) {
        let current = try ownedLease(record.id)
        guard Self.requestOrigin(url) == current.credential.issuer else { throw failure("此工作的服務來源尚未確認") }
        var request = TransferNetworkPreferences.request(url, wifiOnly: wifiOnly)
        request.setValue("Bearer " + current.credential.token, forHTTPHeaderField: "Authorization")
        return (request, current)
    }
    func accountChanged() {
        lock.lock(); let current = try? accounts.snapshot()
        let privateIDs = records.values.filter { !TransferAccountOwnership.owns($0, session: current) }.map(\.id)
        let unreadable = storageError != nil
        lock.unlock()
        if unreadable { notifications.clearAllTransferCompletions() } else { notifications.clearPrivateCompletions(privateIDs) }
        session.getAllTasks { tasks in
            self.lock.lock(); defer { self.lock.unlock() }
            for task in tasks {
                guard let id = task.taskDescription?.components(separatedBy: ":").first,
                      var record = self.records[id], record.systemTaskId == task.taskIdentifier else { task.cancel(); continue }
                guard self.taskAuthority(task, record: record) != nil else {
                    task.cancel()
                    // Keep the original owner's bytes and any receipt. Explicit
                    // recovery must remain possible when that owner signs in again.
                    if record.accountOwner != nil && record.accountIssuer != nil &&
                        ["queued", "transferring", "waiting_network", "waiting_wifi", "waiting_system", "server_processing", "server_accepted"].contains(record.stage) {
                        record.stage = "waiting_system"; record.networkPolicyPending = false
                        record.waitReason = "帳戶已變更；請回原帳戶核對後繼續"
                        record.updatedAt = ISO8601DateFormatter().string(from: Date())
                        try? self.put(record, publish: false)
                    }
                    continue
                }
            }
        }
    }
    private var wifiOnly: Bool { networkPreferences?.enabled ?? true }
    func networkSettings() throws -> [String:Any] { lock.lock();defer{lock.unlock()};try validateStore();return ["wifiOnly":wifiOnly,"appliesTo":"unfinished","restriction":"non-cellular","rescheduleFailures":0,"applying":list().contains{$0.networkPolicyPending==true}] }
    func setWifiOnly(_ enabled: Bool, completion: @escaping (Result<[String:Any],Error>)->Void) {
        lock.lock()
        do { try validateStore();guard let preference=networkPreferences else { throw failure("網路設定無法讀取") };try preference.setEnabled(enabled) }
        catch { lock.unlock();completion(.failure(error));return }
        let prior=Dictionary(uniqueKeysWithValues:records.values.map{($0.id,$0.systemTaskId)})
        lock.unlock()
        session.getAllTasks { tasks in
            self.lock.lock();self.applyNetworkPolicy(to:tasks)
            let active=Set(tasks.compactMap{$0.taskDescription?.components(separatedBy:":").first})
            for record in self.list() where !active.contains(record.id) && prior[record.id]==record.systemTaskId && TransferNetworkPreferences.eligible(record) { self.continueNetworkPolicy(record.id) }
            self.lock.unlock()
            do { completion(.success(try self.networkSettings())) } catch { completion(.failure(error)) }
        }
    }
    private func applyNetworkPolicy(to tasks: [URLSessionTask]) {
        for task in tasks {
            guard let id=task.taskDescription?.components(separatedBy:":").first, let record=get(id),record.systemTaskId==task.taskIdentifier,
                  taskAuthority(task, record: record) != nil,
                  TransferNetworkPreferences.eligible(record),record.networkPolicyPending != true,
                  task.originalRequest?.allowsCellularAccess != !wifiOnly else { continue }
            edit(id){$0.networkPolicyPending=true;$0.stage="waiting_system";$0.waitReason="正在套用網路設定；原檔與收據保留"}
            task.cancel()
        }
    }
    private func continueNetworkPolicy(_ id: String) {
        guard storageError==nil,let record=get(id), authorized(record) else { return }
        guard TransferNetworkPreferences.eligible(record) else { if record.networkPolicyPending==true { edit(id){$0.networkPolicyPending=false} };return }
        edit(id){$0.networkPolicyPending=false;$0.errorCode=""}
        if record.direction=="download" { startDownload(id) }
        else if !record.serverReceiptId.isEmpty { poll(id) }
        else if !record.bodyReference.isEmpty { startUpload(id) }
    }
    func activate() {
        accountChanged()
        guard storageError == nil else { return }
        let previous = list()
        session.getAllTasks { tasks in
            self.lock.lock();defer{self.lock.unlock()}
            for task in tasks {
                guard let id = task.taskDescription?.components(separatedBy: ":").first,
                      let row = self.records[id], self.taskAuthority(task, record: row) != nil else { task.cancel(); continue }
            }
            self.applyNetworkPolicy(to:tasks)
            let active = Set(tasks.compactMap { $0.taskDescription?.components(separatedBy: ":").first })
            for record in previous where !active.contains(record.id) && self.get(record.id)?.updatedAt == record.updatedAt {
                if record.networkPolicyPending==true { self.continueNetworkPolicy(record.id) }
                else if record.stage == "server_processing" || record.stage == "server_accepted" { self.poll(record.id) }
                else if !record.endpoint.isEmpty && ["transferring", "waiting_network", "queued", "preparing"].contains(record.stage) {
                    self.edit(record.id) { $0.stage = "failed"; $0.errorCode = "INTERRUPTED"; $0.waitReason = "傳輸已中斷；可重試，已送達的檔案不會重新建立" }
                }
            }
        }
    }
    func list() -> [TransferRecord] {
        lock.lock(); defer { lock.unlock() }
        guard let current = try? currentAccount() else { return [] }
        let result = records.values.filter { TransferAccountOwnership.owns($0, session: current) }.sorted { $0.createdAt > $1.createdAt }
        guard (try? accounts.require(current)) != nil else { return [] }
        return result
    }
    func get(_ id: String) -> TransferRecord? { lock.lock(); defer { lock.unlock() }; return records[id] }
    private func put(_ record: TransferRecord, publish: Bool = true) throws {
        lock.lock(); defer { lock.unlock() }
        try validateStore()
        let previous=records[record.id]
        if let previous, previous.accountOwner != record.accountOwner || previous.accountIssuer != record.accountIssuer { throw failure("工作歸屬不可變更；原資料保留") }
        if let previous, previous.contentSha256 != nil {
            guard previous.contentSha256 == record.contentSha256, previous.metadataSha256 == record.metadataSha256,
                  previous.bodySha256 == record.bodySha256, previous.bodyByteSize == record.bodyByteSize,
                  previous.mimeType == record.mimeType, previous.filename == record.filename,
                  previous.endpoint == record.endpoint, previous.albumId == record.albumId, previous.tags == record.tags,
                  previous.boundary == record.boundary, previous.bodyReference == record.bodyReference else { throw failure("上傳識別不可變更；原檔與收據保留") }
        }
        var next=records;next[record.id]=record
        do { try JSONEncoder().encode(TransferLedger(records: next)).write(to: directory.appendingPathComponent("tasks.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]); records=next }
        catch { storageError=error;throw error }
        guard publish, let lease = try? ownedLease(record.id) else { return }
        notifications.transition(previous:previous,next:record, authority: { [weak self] in (try? self?.accounts.require(lease)) != nil })
        DispatchQueue.main.async {
            self.lock.lock(); defer { self.lock.unlock() }
            guard (try? self.accounts.require(lease)) != nil else { return }
            self.changed?(record.dictionary)
        }
    }
    private func edit(_ id: String, _ action: (inout TransferRecord) -> Void) {
        lock.lock(); defer { lock.unlock() }
        guard var record = records[id] else { return }; action(&record)
        record.updatedAt = ISO8601DateFormatter().string(from: Date())
        do { try put(record) } catch { records[id]?.stage = "failed"; records[id]?.errorCode = "STORAGE_ERROR" }
    }
    func importFile(_ url: URL, mediaType: String, expected: NativeAccountSnapshot? = nil) throws -> TransferRecord {
        try validateStore()
        let lease = try expected ?? currentAccount(); try accounts.require(lease)
        let mime=UTType(filenameExtension:url.pathExtension)?.preferredMIMEType ?? ""
        guard ["image/jpeg","image/png","image/gif","image/webp","video/mp4","video/quicktime","video/x-msvideo","video/mpeg"].contains(mime) else { throw failure("Flickr 不支援此格式，請匯出 JPEG/PNG 照片或 MP4 影片後再選取；手機原檔不會修改") }
        let filename = url.lastPathComponent.replacingOccurrences(of: "\"", with: "_").replacingOccurrences(of: "\\", with: "_").replacingOccurrences(of: "\r", with: "_").replacingOccurrences(of: "\n", with: "_")
        var record = TransferRecord(direction: "upload", filename: filename, mediaType: mediaType, accountOwner: lease.credential.owner, accountIssuer: lease.credential.issuer)
        let target = directory.appendingPathComponent(record.id + "." + url.pathExtension)
        try FileManager.default.copyItem(at: url, to: target)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: target.path)
        record.sourceReference = target.path
        record.byteSize = (try target.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0
        record.stage = "queued"
        lock.lock(); defer { lock.unlock() }
        // Retain A's prepared original, but never return it to B after a switch.
        try put(record, publish: (try? accounts.require(lease)) != nil)
        try accounts.require(lease); return record
    }
    func thumbnail(_ id: String) throws -> [String: Any] {
        try validateStore()
        let lease = try ownedLease(id), record = try ownedRecord(id, expected: lease)
        let result = try TransferThumbnail.make(record:record,id:id,directory:directory)
        try accounts.require(lease); return result
    }
    private func validEndpoint(_ value: String) throws -> URL {
        #if DEBUG
        if let url = URL(string: value), url.scheme == "http", ["127.0.0.1", "localhost"].contains(url.host ?? "") { return url }
        #endif
        guard let url = URL(string: value), url.scheme == "https", url.host == "just-healing-production.up.railway.app", url.path.isEmpty || url.path == "/" else { throw failure("無效的上傳服務") }
        return url
    }
    private func failure(_ message: String) -> NSError { NSError(domain: "TimehutTransfers", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    func enqueueUpload(id: String, endpoint: String, albumId: String, tags: String) throws -> TransferRecord {
        let lease = try ownedLease(id)
        var record = try ownedRecord(id, expected: lease)
        guard record.direction == "upload", record.stage == "queued", record.endpoint.isEmpty, record.bodyReference.isEmpty,
              tags.utf8.count <= 16_384 else { throw failure("無效或已送出的上傳檔案") }
        _ = try validEndpoint(endpoint)
        guard endpoint == lease.credential.issuer,
              NativeAccountOrigin.uuid(albumId) || lease.credential.legacyOwner && albumId.range(of: "\\A[0-9]{1,32}\\z", options: .regularExpression) != nil else { throw failure("請選擇自己的相簿") }
        record.endpoint = endpoint.trimmingCharacters(in: CharacterSet(charactersIn: "/")); record.albumId = albumId; record.tags = tags
        record.boundary = "Timehut-" + record.id
        let body = directory.appendingPathComponent(record.id + ".multipart")
        record.bodyReference = body.path; record.stage = "preparing"
        lock.lock()
        do {
            try accounts.require(lease)
            let current = try ownedRecord(id, expected: lease)
            guard current.stage == "queued", current.bodyReference.isEmpty else { throw failure("此檔案已開始準備，原件保留") }
            try put(record); lock.unlock()
        } catch { lock.unlock(); throw error }
        func check() throws {
            lock.lock(); defer { lock.unlock() }; try accounts.require(lease)
            guard records[id]?.stage == "preparing", records[id]?.bodyReference == body.path else { throw failure("工作已停止或帳戶已變更") }
        }
        do {
        try Data().write(to: body, options: [.withoutOverwriting, .completeFileProtectionUntilFirstUserAuthentication])
        let output = try FileHandle(forWritingTo: body); defer { try? output.close() }
        var bodyHash = SHA256(), contentHash = SHA256(); var bodySize: Int64 = 0, originalSize: Int64 = 0
        func writeBytes(_ bytes: Data) throws { try check(); try output.write(contentsOf: bytes); bodyHash.update(data: bytes); bodySize += Int64(bytes.count) }
        func write(_ value: String) throws { try writeBytes(Data(value.utf8)) }
        for (name, value) in [("albumId",albumId),("tags",tags),("clientUploadId",record.id)] {
            try write("--\(record.boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n")
        }
        let filename = record.filename.replacingOccurrences(of: "\"", with: "_").replacingOccurrences(of: "\r", with: "_").replacingOccurrences(of: "\n", with: "_")
        let mime = UTType(filenameExtension: URL(fileURLWithPath: record.sourceReference).pathExtension)?.preferredMIMEType ?? (record.mediaType == "video" ? "video/mp4" : "image/jpeg")
        try write("--\(record.boundary)\r\nContent-Disposition: form-data; name=\"files\"; filename=\"\(filename)\"\r\nContent-Type: \(mime)\r\n\r\n")
        let input = try FileHandle(forReadingFrom: URL(fileURLWithPath: record.sourceReference)); defer { try? input.close() }
        while let data = try input.read(upToCount: 1024 * 1024), !data.isEmpty {
            originalSize += Int64(data.count); guard originalSize <= 500 * 1024 * 1024 else { throw failure("原檔超過目前單檔上限") }
            contentHash.update(data: data); try writeBytes(data)
        }
        try write("\r\n--\(record.boundary)--\r\n"); try output.synchronize()
        guard originalSize > 0, originalSize == record.byteSize else { throw failure("原檔大小已變更，請保留原件核對") }
        record.contentSha256 = TransferUploadIdentity.hex(contentHash.finalize())
        record.metadataSha256 = TransferUploadIdentity.metadata([albumId, filename, mime, tags, filename, "", ""])
        record.mimeType = mime; record.bodyByteSize = bodySize; record.bodySha256 = TransferUploadIdentity.hex(bodyHash.finalize())
        lock.lock(); defer { lock.unlock() }; try accounts.require(lease)
        try check()
        try put(record); startUpload(id); try accounts.require(lease); return get(id)!
        } catch {
            lock.lock(); defer { lock.unlock() }
            if var current = records[id], current.stage == "preparing" {
                current.stage = "failed"; current.errorCode = "PREPARATION_UNCONFIRMED"; current.waitReason = "原檔與準備中的檔案保留，尚未重新送出"
                try? put(current, publish: (try? accounts.require(lease)) != nil)
            }
            throw error
        }
    }
    private func startUpload(_ id: String) {
        lock.lock();defer{lock.unlock()}
        guard storageError==nil else { return }
        guard let record = get(id), record.direction == "upload" else { return }
        guard TransferUploadIdentity.valid(record.contentSha256), TransferUploadIdentity.valid(record.metadataSha256),
              TransferUploadIdentity.valid(record.bodySha256), let mime = record.mimeType,
              TransferUploadIdentity.metadata([record.albumId, record.filename, mime, record.tags, record.filename, "", ""]) == record.metadataSha256 else {
            edit(id) { $0.stage = "failed"; $0.errorCode = "UPLOAD_IDENTITY_UNCONFIRMED"; $0.waitReason = "請先核對原工作；不會自動重建或重新送出" }; return
        }
        if !record.serverReceiptId.isEmpty { poll(id); return }
        guard let url = URL(string: record.endpoint + "/api/uploads/admission/" + id),
              let authorized = try? authenticatedRequest(record, url: url) else { return }
        let task = session.downloadTask(with: authorized.0); task.taskDescription = id + ":admission"
        requestAuthorities[task.taskIdentifier] = authorized.1
        edit(id) { $0.stage = "queued"; $0.systemTaskId = task.taskIdentifier; $0.networkPolicyPending=false; $0.errorCode = ""; $0.waitReason = "先核對同一筆工作的收件紀錄" }; if storageError==nil { task.resume() } else { task.cancel() }
    }
    private func sendPreparedUpload(_ id: String) throws {
        let record = try ownedRecord(id), lease = try ownedLease(id)
        let body = URL(fileURLWithPath: record.bodyReference).resolvingSymlinksInPath().standardizedFileURL
        guard body.deletingLastPathComponent() == directory.resolvingSymlinksInPath().standardizedFileURL,
              body.lastPathComponent == id + ".multipart", TransferUploadIdentity.valid(record.contentSha256),
              TransferUploadIdentity.valid(record.metadataSha256), TransferUploadIdentity.valid(record.bodySha256),
              let size = record.bodyByteSize, size > 0,
              try body.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]).isRegularFile == true,
              Int64(try body.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? -1) == size,
              try TransferUploadIdentity.file(body, check: { try self.accounts.require(lease) }) == record.bodySha256,
              let url = URL(string: record.endpoint + "/api/upload") else { throw failure("上傳原件或內容已變更，請先核對原工作收據") }
        let authorized = try authenticatedRequest(record, url: url)
        var request = authorized.0; request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=" + record.boundary, forHTTPHeaderField: "Content-Type")
        request.setValue(String(size), forHTTPHeaderField: "Content-Length")
        request.setValue(record.albumId, forHTTPHeaderField: "X-Timehut-Album")
        request.setValue(id, forHTTPHeaderField: "X-Timehut-Upload")
        request.setValue(record.contentSha256, forHTTPHeaderField: "X-Timehut-Content-SHA256")
        request.setValue(record.metadataSha256, forHTTPHeaderField: "X-Timehut-Metadata-SHA256")
        let task = session.uploadTask(with: request, fromFile: body); task.taskDescription = id + ":upload"
        requestAuthorities[task.taskIdentifier] = authorized.1
        edit(id) { $0.stage = "queued"; $0.systemTaskId = task.taskIdentifier; $0.networkPolicyPending=false; $0.errorCode = ""; $0.waitReason = wifiOnly ? "等待 Wi-Fi／有線網路與手機系統安排" : "等待手機系統開始傳輸" }
        if storageError==nil { task.resume() } else { task.cancel() }
    }
    private func admission(_ object: [String: Any], id: String) throws {
        let record = try ownedRecord(id)
        guard let state = object["admissionStatus"] as? String else { throw failure("收件結果尚未確認") }
        if let receipt = object["localId"] as? String, !receipt.isEmpty {
            guard ["accepted", "completed"].contains(state), Self.validReceipt(receipt), record.serverReceiptId.isEmpty || record.serverReceiptId == receipt else { throw failure("原收據識別尚未確認") }
            edit(id) { $0.serverReceiptId = receipt }
            if object["status"] as? String == "deleted" { edit(id) { $0.stage = "photo_deleted"; $0.errorCode = "PHOTO_DELETED"; $0.waitReason = "照片已刪除，此收據不會重新上傳" }; return }
            if object["status"] as? String == "cancelled" { edit(id) { $0.stage = "cancelled"; $0.errorCode = "RECEIPT_CANCELLED"; $0.waitReason = "此收據已取消，不會重新上傳" }; return }
            poll(id); return
        }
        let nullReceipt = object["localId"] == nil || object["localId"] is NSNull
        let nullStatus = object["status"] == nil || object["status"] is NSNull
        let notBlocked = object["retryBlocked"] == nil || Self.falseValue(object["retryBlocked"])
        guard ["not_found", "not_accepted"].contains(state), nullReceipt, nullStatus, notBlocked else {
            edit(id) { $0.stage = "waiting_system"; $0.errorCode = "RECEIPT_UNCONFIRMED"; $0.waitReason = "先前收件仍待確認；原檔與同一筆工作保留" }; return
        }
        try sendPreparedUpload(id)
    }
    static func trustedVideoEndpoint(_ url: URL) -> Bool {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        return parts.scheme == "https" && parts.host == "just-healing-production.up.railway.app" &&
            (parts.port == nil || parts.port == 443) && parts.user == nil && parts.password == nil && parts.fragment == nil &&
            parts.percentEncodedPath.range(of: "^/api/photo/[0-9]+/video$", options: .regularExpression) != nil &&
            parts.percentEncodedQuery == "purpose=original"
    }
    func enqueueDownload(url value: String, filename: String, mediaType: String) throws -> TransferRecord {
        let lease = try currentAccount()
        guard let url = URL(string: value), let parts = URLComponents(url: url, resolvingAgainstBaseURL: false), ["photo", "video"].contains(mediaType) else { throw failure("無效的媒體下載網址") }
        let allowed = Self.requestOrigin(url) == lease.credential.issuer &&
            parts.percentEncodedPath == parts.path &&
            url.path.range(of: "\\A/api/(photo/[0-9]+/(image|video)|uploads/file/[A-Za-z0-9_-]+)\\z", options: .regularExpression) != nil
        guard allowed else { throw failure("無效的媒體下載網址") }
        if url.path.contains("/photo/") {
            let name = mediaType == "video" ? "purpose" : "size", variant = mediaType == "video" ? "original" : "o"
            let values = (parts.queryItems ?? []).filter { $0.name == name }
            guard url.path.hasSuffix(mediaType == "video" ? "/video" : "/image"), values.count == 1, values.first?.value == variant else { throw failure("請使用自己的原始照片／影片下載入口") }
        }
        var record = TransferRecord(direction: "download", filename: URL(fileURLWithPath: filename).lastPathComponent, mediaType: mediaType, accountOwner: lease.credential.owner, accountIssuer: lease.credential.issuer)
        record.endpoint = value; record.stage = "queued"
        lock.lock(); defer { lock.unlock() }; try accounts.require(lease)
        try put(record); startDownload(record.id); try accounts.require(lease); return get(record.id)!
    }
    private func startDownload(_ id: String) {
        lock.lock();defer{lock.unlock()}
        guard storageError==nil else { return }
        guard let record = get(id), let url = URL(string: record.endpoint), let authorized = try? authenticatedRequest(record, url: url) else { return }
        let task = session.downloadTask(with: authorized.0); task.taskDescription = id + ":download"
        requestAuthorities[task.taskIdentifier] = authorized.1
        edit(id) { $0.stage = "queued"; $0.systemTaskId = task.taskIdentifier; $0.networkPolicyPending=false; $0.errorCode = ""; $0.waitReason = wifiOnly ? "等待 Wi-Fi／有線網路與手機系統安排" : "等待手機系統開始傳輸" }; if storageError==nil { task.resume() } else { task.cancel() }
    }
    private func poll(_ id: String, after seconds: TimeInterval = 0) {
        lock.lock();defer{lock.unlock()}
        guard storageError==nil else { return }
        guard let record = get(id), !record.serverReceiptId.isEmpty, let url = URL(string: record.endpoint + "/api/uploads/status/" + record.serverReceiptId), let authorized = try? authenticatedRequest(record, url: url) else { return }
        let task = session.downloadTask(with: authorized.0); task.taskDescription = id + ":receipt"; task.earliestBeginDate = Date().addingTimeInterval(seconds)
        requestAuthorities[task.taskIdentifier] = authorized.1
        edit(id) { $0.systemTaskId = task.taskIdentifier;$0.networkPolicyPending=false;$0.stage="server_processing";$0.waitReason=wifiOnly ? "使用 Wi-Fi／有線網路確認 Flickr 結果" : "正在確認 Flickr 結果" }; if storageError==nil { task.resume() } else { task.cancel() }
    }
    func cancel(_ id: String) throws {
        lock.lock();defer{lock.unlock()}
        let record = try ownedRecord(id)
        guard !["server_accepted", "server_processing", "completed", "file_ready", "saved"].contains(record.stage) else { throw failure("已送到伺服器或已完成的檔案無法取消") }
        edit(id) { $0.stage = "cancelled";$0.networkPolicyPending=false; $0.waitReason = "已停止手機傳輸；伺服器若已收到仍可能完成" }
        session.getAllTasks { tasks in tasks.filter { $0.taskIdentifier==record.systemTaskId && $0.taskDescription?.hasPrefix(id + ":") == true }.forEach { $0.cancel() } }
    }
    func retry(_ id: String) throws {
        lock.lock();defer{lock.unlock()}
        let record = try ownedRecord(id)
        guard record.errorCode != "RECEIPT_CANCELLED" else { throw failure("此收據已取消，不能重新上傳") }
        guard record.networkPolicyPending != true, ["failed", "cancelled", "waiting_system","waiting_network","waiting_wifi"].contains(record.stage) else { throw failure("此任務目前不可重試") }
        if record.direction == "download" { startDownload(id) }
        else if !record.serverReceiptId.isEmpty {
            let body = directory.appendingPathComponent(id + ".retry.json")
            try JSONSerialization.data(withJSONObject: ["localIds":[record.serverReceiptId]]).write(to: body, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            guard let url = URL(string: record.endpoint + "/api/uploads/retry") else { throw failure("無效的收據服務") }
            let authorized = try authenticatedRequest(record, url: url)
            var request = authorized.0; request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField:"Content-Type")
            let task = session.uploadTask(with:request,fromFile:body); task.taskDescription = id + ":retry"
            requestAuthorities[task.taskIdentifier] = authorized.1
            edit(id) { $0.stage = "server_processing"; $0.systemTaskId = task.taskIdentifier; $0.errorCode = "" }; if storageError==nil { task.resume() } else { task.cancel() }
        } else if !record.bodyReference.isEmpty { startUpload(id) }
        else { throw failure("請先選擇相簿並送出此檔案") }
    }
    func saveContext(_ id: String) throws -> (TransferRecord, NativeAccountSnapshot) {
        lock.lock(); defer { lock.unlock() }
        let lease = try ownedLease(id), record = try ownedRecord(id, expected: lease)
        let url = URL(fileURLWithPath: record.destinationReference).resolvingSymlinksInPath().standardizedFileURL
        guard record.stage == "file_ready", url.deletingLastPathComponent() == directory.resolvingSymlinksInPath().standardizedFileURL,
              url.lastPathComponent == id + "-" + record.filename, FileManager.default.fileExists(atPath: url.path) else { throw failure("尚無可保存的完整檔案") }
        return (record, lease)
    }
    func finishSave(_ id: String, lease: NativeAccountSnapshot, asset: String?, error: String = "") throws {
        lock.lock(); defer { lock.unlock() }
        guard var record = records[id], TransferAccountOwnership.owns(record, session: lease) else { throw failure("工作歸屬尚未確認") }
        if let asset, !asset.isEmpty { record.stage = "saved"; record.savedAssetId = asset; record.errorCode = "" }
        else { record.stage = "file_ready"; record.errorCode = error; record.waitReason = "檔案仍保留，可重新保存" }
        record.updatedAt = ISO8601DateFormatter().string(from: Date())
        try put(record, publish: (try? accounts.require(lease)) != nil)
    }
    func markSaved(_ id: String, asset: String) { if let lease = try? ownedLease(id) { try? finishSave(id, lease: lease, asset: asset) } }
    func markSaveError(_ id: String, error: String) { if let lease = try? ownedLease(id) { try? finishSave(id, lease: lease, asset: nil, error: error) } }
    private func callbackAllowed(_ task: URLSessionTask, record: TransferRecord) -> Bool {
        guard taskAuthority(task, record: record) != nil else { task.cancel(); return false }
        if (task.response as? HTTPURLResponse)?.statusCode == 401 {
            if let lease = requestAuthorities[task.taskIdentifier], (try? accounts.signOut(ifCurrent: lease)) == true { authorizationClosed?() }
            accountChanged(); task.cancel(); return false
        }
        return true
    }
    private static func trueValue(_ value: Any?) -> Bool {
        guard let value = value as? NSNumber else { return false }
        return CFGetTypeID(value) == CFBooleanGetTypeID() && value.boolValue
    }
    private static func falseValue(_ value: Any?) -> Bool {
        guard let value = value as? NSNumber else { return false }
        return CFGetTypeID(value) == CFBooleanGetTypeID() && !value.boolValue
    }
    private static func validReceipt(_ value: String) -> Bool { value.range(of: "\\A[A-Za-z0-9_-]{1,128}\\z", options: .regularExpression) != nil }
    private func preserveAcceptedReceipt(_ task: URLSessionTask, record: TransferRecord) {
        guard task.taskDescription?.hasSuffix(":upload") == true, let response = task.response as? HTTPURLResponse,
              (200..<300).contains(response.statusCode), let requestURL = task.originalRequest?.url,
              Self.requestOrigin(requestURL) == record.accountIssuer,
              (requestAuthorities[task.taskIdentifier].map { TransferAccountOwnership.owns(record, session: $0) } ?? false) || response.value(forHTTPHeaderField: "X-Timehut-Account") == record.accountOwner,
              let bytes = responseBodies[task.taskIdentifier], let result = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any],
              let rows = result["results"] as? [[String: Any]], rows.count == 1, let first = rows.first,
              Self.trueValue(first["success"]), let receipt = first["localId"] as? String,
              receipt.range(of: "\\A[A-Za-z0-9_-]{1,128}\\z", options: .regularExpression) != nil,
              var latest = records[record.id], latest.serverReceiptId.isEmpty || latest.serverReceiptId == receipt else { return }
        latest.serverReceiptId = receipt; latest.updatedAt = ISO8601DateFormatter().string(from: Date())
        try? put(latest, publish: false)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        lock.lock();defer{lock.unlock()}
        guard let id = task.taskDescription?.components(separatedBy: ":").first,let record=get(id),record.systemTaskId==task.taskIdentifier,callbackAllowed(task, record: record),record.networkPolicyPending != true,record.stage != "cancelled" else { return }; edit(id) { $0.bytesTransferred = totalBytesSent;if task.taskDescription?.hasSuffix(":upload")==true {$0.stage="transferring";$0.waitReason=""} }
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        lock.lock();defer{lock.unlock()}
        guard downloadTask.taskDescription?.hasSuffix(":download") == true, let id = downloadTask.taskDescription?.components(separatedBy: ":").first,let record=get(id),record.systemTaskId==downloadTask.taskIdentifier,callbackAllowed(downloadTask, record: record),record.networkPolicyPending != true,record.stage != "cancelled" else { return }
        edit(id) { $0.stage="transferring";$0.waitReason="";$0.bytesTransferred = totalBytesWritten; if totalBytesExpectedToWrite > 0 { $0.byteSize = totalBytesExpectedToWrite } }
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        lock.lock(); defer { lock.unlock() }
        guard let id = dataTask.taskDescription?.components(separatedBy: ":").first, let record = records[id],
              record.systemTaskId == dataTask.taskIdentifier, callbackAllowed(dataTask, record: record) else { dataTask.cancel(); return }
        var current = responseBodies[dataTask.taskIdentifier] ?? Data()
        guard current.count + data.count <= 1_048_576 else { dataTask.cancel(); responseBodies.removeValue(forKey: dataTask.taskIdentifier); return }
        current.append(data); responseBodies[dataTask.taskIdentifier] = current
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        lock.lock();defer{lock.unlock()}
        guard let description = downloadTask.taskDescription, let id = description.components(separatedBy: ":").first, let record = get(id), record.stage != "cancelled" else { return }
        guard record.systemTaskId == downloadTask.taskIdentifier, callbackAllowed(downloadTask, record: record), record.networkPolicyPending != true else { return }
        do {
            guard let response = downloadTask.response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { throw failure("伺服器暫時無法回傳檔案或收據") }
            if description.hasSuffix(":admission") {
                guard let responseURL = response.url, Self.requestOrigin(responseURL) == record.accountIssuer,
                      response.value(forHTTPHeaderField: "X-Timehut-Account").map({ $0 == record.accountOwner }) ?? true,
                      (try location.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= 1_048_576,
                      let result = try JSONSerialization.jsonObject(with: Data(contentsOf: location)) as? [String: Any] else { throw failure("收件結果或來源尚未確認") }
                try admission(result, id: id)
            } else if description.hasSuffix(":receipt") {
                guard (try location.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max) <= 1_048_576 else { throw failure("無效收據大小") }
                guard let result = try JSONSerialization.jsonObject(with: Data(contentsOf: location)) as? [String: Any], let status = result["status"] as? String else { throw failure("無效的 Flickr 收據") }
                if status == "completed", let photoId = result["flickrPhotoId"] as? String, photoId.range(of: "\\A[0-9]{1,32}\\z", options: .regularExpression) != nil { edit(id) { $0.stage = "completed";$0.networkPolicyPending=false; $0.flickrPhotoId = photoId; $0.errorCode = "" } }
                else if status == "deleted" { edit(id) { $0.stage = "photo_deleted"; $0.errorCode = "PHOTO_DELETED"; $0.waitReason = "照片已刪除，此收據不會重新上傳" } }
                else if status == "cancelled" { edit(id) { $0.stage = "cancelled"; $0.errorCode = "RECEIPT_CANCELLED"; $0.waitReason = "此收據已取消，不會重新上傳" } }
                else if status == "error" { throw failure("Flickr 處理尚未完成；原檔與收據保留") }
                else if ["pending", "uploading", "processing"].contains(status) { edit(id) { $0.stage = "server_processing" }; poll(id, after: 15) }
                else { throw failure("收據狀態尚未確認，原件保留") }
            } else {
                let mime = response.mimeType ?? ""
                guard let responseURL = response.url, Self.requestOrigin(responseURL) == record.accountIssuer,
                      mime.hasPrefix(record.mediaType == "video" ? "video/" : "image/") else { throw failure("下載內容或來源與照片／影片類型不符") }
                let extensions = ["image/jpeg":"jpg", "image/png":"png", "image/gif":"gif", "image/webp":"webp", "image/avif":"avif", "image/heic":"heic", "image/heif":"heif", "video/mp4":"mp4", "video/quicktime":"mov"]
                guard let ext = extensions[mime] else { throw failure("原檔格式尚未支援，原件不轉檔") }
                let base = (record.filename as NSString).deletingPathExtension
                let filename = base + "." + ext
                let target = directory.appendingPathComponent(id + "-" + filename)
                guard !FileManager.default.fileExists(atPath: target.path) else { throw failure("已有下載原件，請先核對；不覆寫") }
                let originalSize = try location.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                guard originalSize > 0, response.expectedContentLength <= 0 || response.expectedContentLength == originalSize else { throw failure("下載原件不完整") }
                try FileManager.default.moveItem(at: location, to: target)
                try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: target.path)
                let size = try target.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0; guard size > 0 else { throw failure("下載檔案為空") }
                edit(id) { $0.stage = "file_ready";$0.filename=filename;$0.networkPolicyPending=false; $0.destinationReference = target.path; $0.byteSize = Int64(size); $0.bytesTransferred = Int64(size); $0.errorCode = "" }
            }
        } catch { edit(id) { $0.stage = "failed";$0.networkPolicyPending=false; $0.errorCode = error.localizedDescription } }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock();defer{lock.unlock()}
        defer { responseBodies.removeValue(forKey: task.taskIdentifier); requestAuthorities.removeValue(forKey: task.taskIdentifier) }
        guard let description = task.taskDescription, let id = description.components(separatedBy: ":").first, let record = get(id) else { return }
        guard record.systemTaskId == task.taskIdentifier else { return }
        preserveAcceptedReceipt(task, record: record)
        guard record.stage != "cancelled" else { return }
        guard callbackAllowed(task, record: record) else { return }
        if record.networkPolicyPending==true {
            // Keep a positive acknowledgement even if cancellation won the callback race.
            if description.hasSuffix(":upload"),let data=responseBodies[task.taskIdentifier],let response=task.response as? HTTPURLResponse,(200..<300).contains(response.statusCode),
               let result=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],let rows=result["results"] as? [[String:Any]],rows.count == 1,let first=rows.first,Self.trueValue(first["success"]),let localId=first["localId"] as? String,Self.validReceipt(localId) { edit(id){$0.serverReceiptId=localId} }
            responseBodies.removeValue(forKey:task.taskIdentifier);continueNetworkPolicy(id);return
        }
        if ["completed","file_ready","saving","saved"].contains(record.stage){responseBodies.removeValue(forKey:task.taskIdentifier);return}
        if let error {
            let native = error as NSError
            let network=native.domain==NSURLErrorDomain && [NSURLErrorNotConnectedToInternet,NSURLErrorNetworkConnectionLost,NSURLErrorTimedOut,NSURLErrorDataNotAllowed].contains(native.code)
            edit(id) { $0.stage = network ? (wifiOnly ? "waiting_wifi" : "waiting_network") : "failed"; $0.errorCode = "\(native.domain):\(native.code) \(native.localizedDescription)";if network {$0.waitReason=wifiOnly ? "等待 Wi-Fi／有線網路恢復後可重試；原檔與收據保留" : "網路恢復後可重試；原檔與收據保留"} }
            #if DEBUG
            if record.tags == "native-synthetic-only" || record.filename == "native-qa.png" { NSLog("Timehut synthetic transfer error: %@", native) }
            #endif
            return
        }
        if description.hasSuffix(":retry") {
            let data = responseBodies.removeValue(forKey:task.taskIdentifier) ?? Data()
            guard let response = task.response as? HTTPURLResponse, (200..<300).contains(response.statusCode), (try? JSONSerialization.jsonObject(with:data)) is [String:Any] else { edit(id) { $0.stage = "failed"; $0.errorCode = "收據重試尚未被伺服器接受" }; return }
            poll(id); return
        }
        guard description.hasSuffix(":upload") else { return }
        let data = responseBodies.removeValue(forKey: task.taskIdentifier) ?? Data()
        do {
            guard let response = task.response as? HTTPURLResponse, (200..<300).contains(response.statusCode), let result = try JSONSerialization.jsonObject(with: data) as? [String: Any], let rows = result["results"] as? [[String: Any]], rows.count == 1, let first = rows.first, Self.trueValue(first["success"]), let localId = first["localId"] as? String, Self.validReceipt(localId), record.serverReceiptId.isEmpty || record.serverReceiptId == localId else { throw failure("手機送出結果尚未確認；請續查同一筆收據") }
            edit(id) { $0.stage = "server_accepted"; $0.serverReceiptId = localId }; poll(id)
        } catch { edit(id) { $0.stage = "failed"; $0.errorCode = error.localizedDescription } }
    }
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) { DispatchQueue.main.async { self.backgroundCompletion?(); self.backgroundCompletion = nil } }
}

@objc(TransferPlugin)
public class TransferPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "TransferPlugin"
    public let jsName = "TimehutTransfer"
    public let pluginMethods: [CAPPluginMethod] = ["capabilities","prepareUpload","enqueueUpload","enqueueDownload","list","cancel","retry","saveToPhotos","thumbnail","notificationSettings","setCompletionNotifications","networkSettings","setWifiOnly","photoLibrarySettings","accountStatus","accountSignIn","accountRequest","accountSignOut"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let accountCalls = DispatchQueue(label: "TimehutAccountRequests", qos: .userInitiated, attributes: .concurrent)
    private var pickerCall: CAPPluginCall?
    private var pickerAccount: NativeAccountSnapshot?
    private func resolveTransfer(_ call: CAPPluginCall, action: () throws -> [String: Any]) {
        do {
            let lease = try TransferEngine.shared.currentAccount()
            let result = try action()
            NativeAccountStore.boundary.lock(); defer { NativeAccountStore.boundary.unlock() }
            try TransferEngine.shared.requireAccount(lease)
            call.resolve(result)
        } catch { call.reject("帳戶或傳輸狀態已變更，請更新；原件與收據保留") }
    }
    private let notificationLock=NSLock()
    private var notificationRequestPending=false
    private let thumbnailLock = NSLock()
    private let thumbnailQueue: OperationQueue = { let queue=OperationQueue();queue.maxConcurrentOperationCount=2;queue.qualityOfService = .utility;return queue }()
    public override func load() {
        #if DEBUG && targetEnvironment(simulator)
        if Bundle.main.bundleIdentifier?.hasPrefix("tw.aihankapps.timehut.qa.accounts.") == true,
           ProcessInfo.processInfo.environment["TIMEHUT_QA_MODE"] == "account-keychain",
           ["native-proof-stage", "native-proof-reopen"].contains(ProcessInfo.processInfo.environment["TIMEHUT_QA_ACCOUNT_PHASE"] ?? "") { return }
        #endif
        NativeAccountClient.observePlatformChanges { [weak self] in
            TransferEngine.shared.accountChanged()
            let state = (try? NativeAccountStore.platform.status()) ?? ["unconfirmed": true]
            self?.notifyListeners("accountChanged", data: state)
        }
        TransferEngine.shared.authorizationClosed = { NativeAccountClient.notifyPlatformChange() }
        TransferEngine.shared.changed = { [weak self] record in self?.notifyListeners("transferChanged", data: record) }
        TransferEngine.shared.activate()
        // Reconcile one durable native-login cancellation on ordinary app load.
        // No background execution or OS wake guarantee is implied by this pass.
        accountCalls.async {
            guard let client = NativeAccountClient.platform else { return }
            do {
                if let row = try client.store.nativeCancellations().first { _ = try client.retryNativeCancellation(row) }
            } catch { /* Preserve the complete receipt for the next explicit retry. */ }
        }
    }
    @objc func accountStatus(_ call: CAPPluginCall) {
        do {
            NativeAccountStore.boundary.lock(); defer { NativeAccountStore.boundary.unlock() }
            var state = try NativeAccountStore.platform.status(); state["bridgeVersion"] = 2
            guard let client = NativeAccountClient.platform else { throw NativeAccountError.unavailable }
            state["backend"] = client.origin
            TransferEngine.shared.accountChanged(); call.resolve(state)
        }
        catch { TransferEngine.shared.accountChanged(); call.reject("帳戶儲存尚未確認，原件與待確認憑證保留") }
    }
    @objc func accountSignIn(_ call: CAPPluginCall) {
        accountCalls.async {
            do {
                guard let client = NativeAccountClient.platform else { throw NativeAccountError.unavailable }
                guard let expected = call.getString("expectedGeneration"), NativeAccountOrigin.uuid(expected) else { throw NativeAccountError.changed }
                _ = try client.signIn(username: call.getString("username") ?? "", password: call.getString("password") ?? "",
                    displayName: call.getString("displayName") ?? "", register: call.getBool("register") ?? false,
                    expectedGeneration: expected,
                    delivery: { data, authority in call.resolve(["bridgeVersion": 2, "data": data, "authority": authority]) })
            } catch { call.reject("登入尚未確認，請更新帳戶狀態；原件與待確認憑證保留") }
        }
    }
    @objc func accountRequest(_ call: CAPPluginCall) {
        accountCalls.async {
            do {
                guard let client = NativeAccountClient.platform else { throw NativeAccountError.unavailable }
                guard let expected = call.getString("expectedGeneration"), NativeAccountOrigin.uuid(expected),
                      let owner = call.getString("expectedOwner"), NativeAccountOrigin.uuid(owner) else { throw NativeAccountError.changed }
                _ = try client.request(method: call.getString("method") ?? "GET", path: call.getString("path") ?? "", body: call.getObject("body"),
                    expectedGeneration: expected, expectedOwner: owner,
                    delivery: { data, authority in call.resolve(["bridgeVersion": 2, "data": data, "authority": authority]) })
            } catch { call.reject("帳戶操作未完成，請更新狀態；原件與待確認憑證保留") }
        }
    }
    @objc func accountSignOut(_ call: CAPPluginCall) {
        accountCalls.async {
            do {
                guard let client = NativeAccountClient.platform else { throw NativeAccountError.unavailable }
                guard let expected = call.getString("expectedGeneration"), NativeAccountOrigin.uuid(expected) else { throw NativeAccountError.changed }
                _ = try client.signOut(expectedGeneration: expected, expectedOwner: call.getString("expectedOwner"),
                    delivery: { data, authority in call.resolve(["bridgeVersion": 2, "data": data, "authority": authority]) })
            } catch { call.reject("登出尚未確認，請更新帳戶狀態；原件與待確認憑證保留") }
        }
    }
    @objc func capabilities(_ call: CAPPluginCall) { do { try TransferEngine.shared.validateStore();call.resolve(["nativeBackgroundUpload":true,"nativeBackgroundDownload":true,"photoLibrarySave":true,"photoLibraryStatus":true,"platform":"ios","notifications":true,"completionNotifications":true,"wifiPolicy":true,"ongoingTransferNotifications":false,"localThumbnails":true]) } catch { call.reject(error.localizedDescription) } }
    @objc func photoLibrarySettings(_ call: CAPPluginCall) {
        let status=PHPhotoLibrary.authorizationStatus(for: .addOnly)
        let permission:String
        switch status {
        case .notDetermined: permission="prompt"
        case .authorized: permission="granted"
        case .limited: permission="limited"
        case .denied: permission="denied"
        case .restricted: permission="restricted"
        @unknown default: permission="unknown"
        }
        call.resolve(["supported":true,"canSave":status == .authorized || status == .limited,"permission":permission,"scope":"add-only"])
    }
    @objc func networkSettings(_ call: CAPPluginCall){do{call.resolve(try TransferEngine.shared.networkSettings())}catch{call.reject("網路設定暫時無法讀取，請更新狀態")}}
    @objc func setWifiOnly(_ call: CAPPluginCall){guard let enabled=call.getBool("enabled") else {call.reject("缺少網路選項");return};TransferEngine.shared.setWifiOnly(enabled){result in switch result{case .success(let value):call.resolve(value);case .failure:call.reject("網路設定未能確認，原檔與收據保留；請更新狀態")}}}
    @objc func notificationSettings(_ call: CAPPluginCall) {
        TransferEngine.shared.notifications.settings { result in
            switch result { case .success(let settings): call.resolve(settings);case .failure: call.reject("通知設定暫時無法讀取；傳輸不受影響") }
        }
    }
    @objc func setCompletionNotifications(_ call: CAPPluginCall) {
        guard let enabled=call.getBool("enabled") else { call.reject("缺少通知選項");return }
        notificationLock.lock();guard !notificationRequestPending else { notificationLock.unlock();call.reject("請先完成目前的通知設定");return };notificationRequestPending=true;notificationLock.unlock()
        TransferEngine.shared.notifications.setEnabled(enabled) { result in
            self.notificationLock.lock();self.notificationRequestPending=false;self.notificationLock.unlock()
            switch result { case .success(let settings): call.resolve(settings);case .failure: call.reject("通知設定未能保存；傳輸不受影響") }
        }
    }
    @objc func list(_ call: CAPPluginCall) { resolveTransfer(call) { ["tasks":TransferEngine.shared.list().map(\.dictionary)] } }
    @objc func thumbnail(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        thumbnailLock.lock(); defer { thumbnailLock.unlock() }
        guard thumbnailQueue.operationCount < 10 else { call.resolve(["available":false]); return }
        thumbnailQueue.addOperation {
            autoreleasepool {
                self.resolveTransfer(call) { try TransferEngine.shared.thumbnail(id) }
            }
        }
    }
    @objc func prepareUpload(_ call: CAPPluginCall) {
        let lease: NativeAccountSnapshot
        do { lease = try TransferEngine.shared.currentAccount() } catch { call.reject(error.localizedDescription);return }
        DispatchQueue.main.async {
            guard (try? TransferEngine.shared.requireAccount(lease)) != nil else { call.reject("帳戶已變更，請重新選取"); return }
            guard self.pickerCall == nil else { call.reject("已有照片選取視窗"); return }
            self.pickerCall = call; self.pickerAccount = lease; var config = PHPickerConfiguration(); config.filter = .any(of: [.images, .videos]); config.selectionLimit = 0; config.preferredAssetRepresentationMode = .compatible
            let picker = PHPickerViewController(configuration: config); picker.delegate = self; self.bridge?.viewController?.present(picker, animated: true)
        }
    }
    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pickerCall, let lease = pickerAccount else { return }; pickerCall = nil; pickerAccount = nil
        let group = DispatchGroup(), guardLock = NSLock(); var tasks = [[String: Any]](), errors = [String]()
        for result in results {
            let video = result.itemProvider.hasItemConformingToTypeIdentifier(UTType.movie.identifier)
            group.enter(); result.itemProvider.loadFileRepresentation(forTypeIdentifier: video ? UTType.movie.identifier : UTType.image.identifier) { url, error in
                defer { group.leave() }; do { guard let url else { throw error ?? NSError(domain:"Picker",code:1) }; let task = try TransferEngine.shared.importFile(url, mediaType: video ? "video" : "photo", expected: lease); guardLock.lock(); tasks.append(task.dictionary); guardLock.unlock() }
                catch { guardLock.lock(); errors.append(error.localizedDescription); guardLock.unlock() }
            }
        }
        group.notify(queue: .main) {
            NativeAccountStore.boundary.lock(); defer { NativeAccountStore.boundary.unlock() }
            guard (try? TransferEngine.shared.requireAccount(lease)) != nil else { call.reject("選取期間帳戶已變更；原帳戶檔案保留"); return }
            call.resolve(["tasks":tasks,"errors":errors])
        }
    }
    @objc func enqueueUpload(_ call: CAPPluginCall) { accountCalls.async { self.resolveTransfer(call) { try TransferEngine.shared.enqueueUpload(id:call.getString("id") ?? "",endpoint:call.getString("endpoint") ?? "",albumId:call.getString("albumId") ?? "",tags:call.getString("tags") ?? "").dictionary } } }
    @objc func enqueueDownload(_ call: CAPPluginCall) { resolveTransfer(call) { try TransferEngine.shared.enqueueDownload(url:call.getString("url") ?? "",filename:call.getString("filename") ?? "media",mediaType:call.getString("mediaType") ?? "photo").dictionary } }
    @objc func cancel(_ call: CAPPluginCall) { do { try TransferEngine.shared.cancel(call.getString("id") ?? ""); call.resolve() } catch { call.reject(error.localizedDescription) } }
    @objc func retry(_ call: CAPPluginCall) { do { try TransferEngine.shared.retry(call.getString("id") ?? ""); call.resolve() } catch { call.reject(error.localizedDescription) } }
    @objc func saveToPhotos(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        let record: TransferRecord, lease: NativeAccountSnapshot
        do { (record, lease) = try TransferEngine.shared.saveContext(id) }
        catch { call.reject("尚無屬於目前帳戶的完整檔案"); return }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else { try? TransferEngine.shared.finishSave(id, lease: lease, asset: nil, error:"PHOTO_PERMISSION_DENIED"); call.reject("相簿權限未允許，下載原檔仍保留"); return }
            var asset = ""
            PHPhotoLibrary.shared().performChanges {
                NativeAccountStore.boundary.lock(); defer { NativeAccountStore.boundary.unlock() }
                guard (try? TransferEngine.shared.ownedRecord(id, expected: lease)) != nil else { return }
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with:record.mediaType == "video" ? .video : .photo,fileURL:URL(fileURLWithPath:record.destinationReference),options:nil); asset = request.placeholderForCreatedAsset?.localIdentifier ?? ""
            } completionHandler: { success, error in
                NativeAccountStore.boundary.lock(); defer { NativeAccountStore.boundary.unlock() }
                do {
                    try TransferEngine.shared.finishSave(id, lease: lease, asset: success && !asset.isEmpty ? asset : nil, error: "SAVE_FAILED")
                    try TransferEngine.shared.requireAccount(lease)
                    if success, !asset.isEmpty { call.resolve(["savedAssetId":asset]) }
                    else { call.reject("相簿保存尚未完成，下載原檔仍保留") }
                } catch { call.reject("帳戶或保存結果已變更，請回原帳戶核對；原件與收據保留") }
            }
        }
    }
}
