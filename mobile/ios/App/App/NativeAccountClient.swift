import Foundation
import CoreFoundation

enum NativeAccountHTTPError: Error { case status(Int), invalidResponse, tooLarge, timeout, invalidRequest, busy }

// Each bounded call has a cookie-free ephemeral session and rejects redirects.
// All callers use the native worker queue, never the WebView/main thread.
private final class NativeAccountJSONCall: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
    private let mutex = NSLock(), semaphore = DispatchSemaphore(value: 0)
    private var data = Data(), response: HTTPURLResponse?, failure: Error?, finished = false
    private var session: URLSession?, task: URLSessionDataTask?, timer: DispatchSourceTimer?
    func run(_ request: URLRequest, seconds: TimeInterval) throws -> (HTTPURLResponse, [String: Any]) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil; configuration.httpShouldSetCookies = false; configuration.urlCache = nil
        configuration.urlCredentialStorage = nil
        configuration.timeoutIntervalForRequest = seconds; configuration.timeoutIntervalForResource = seconds
        let callbacks = OperationQueue(); callbacks.maxConcurrentOperationCount = 1
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: callbacks)
        task = session!.dataTask(with: request)
        let deadline = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
        deadline.schedule(deadline: .now() + seconds); deadline.setEventHandler { [weak self] in self?.finish(NativeAccountHTTPError.timeout) }
        timer = deadline; deadline.resume(); task!.resume()
        if semaphore.wait(timeout: .now() + seconds + 1) == .timedOut { finish(NativeAccountHTTPError.timeout) }
        mutex.lock(); defer { mutex.unlock() }
        if let failure { throw failure }
        guard let response else { throw NativeAccountHTTPError.invalidResponse }
        if response.statusCode == 401 { throw NativeAccountHTTPError.status(401) }
        guard (200..<300).contains(response.statusCode) else { throw NativeAccountHTTPError.status(response.statusCode) }
        guard response.mimeType == "application/json", let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw NativeAccountHTTPError.invalidResponse }
        return (response, object)
    }
    private func finish(_ error: Error?) {
        mutex.lock(); guard !finished else { mutex.unlock(); return }; finished = true; failure = error
        timer?.cancel(); timer = nil; task?.cancel(); session?.invalidateAndCancel(); mutex.unlock(); semaphore.signal()
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, http.url == dataTask.originalRequest?.url else { completionHandler(.cancel); finish(NativeAccountHTTPError.invalidResponse); return }
        mutex.lock(); self.response = http; let oversized = response.expectedContentLength > 1_048_576; mutex.unlock()
        completionHandler(oversized ? .cancel : .allow); if oversized { finish(NativeAccountHTTPError.tooLarge) }
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive bytes: Data) {
        mutex.lock(); guard !finished else { mutex.unlock(); return }
        let excessive = data.count + bytes.count > 1_048_576
        if !excessive { data.append(bytes) }; mutex.unlock()
        if excessive { finish(NativeAccountHTTPError.tooLarge) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) { finish(error) }
}

final class NativeAccountClient {
    typealias Delivery = ([String: Any], [String: Any]) throws -> Void
    private static var platformObserver: (() -> Void)?
    static func observePlatformChanges(_ observer: @escaping () -> Void) {
        NativeAccountStore.boundary.lock(); platformObserver = observer; NativeAccountStore.boundary.unlock()
    }
    static func notifyPlatformChange() {
        NativeAccountStore.boundary.lock(); let observer = platformObserver; NativeAccountStore.boundary.unlock()
        observer?()
    }
    let store: NativeAccountStore
    private let backend: String
    var origin: String { backend }
    private let loginLock = NSLock()
    private let changed: () -> Void
    init(store: NativeAccountStore, backend: String = NativeAccountOrigin.backend, changed: @escaping () -> Void = {}) throws {
        guard NativeAccountOrigin.allowed(backend) else { throw NativeAccountHTTPError.invalidRequest }
        self.store = store; self.backend = backend; self.changed = changed
    }
    static func allowedPath(_ method: String, _ value: String) -> Bool {
        guard let url = URLComponents(string: value), url.scheme == nil, url.host == nil, url.user == nil,
              url.password == nil, url.fragment == nil, url.percentEncodedPath == url.path,
              !value.contains("\\") else { return false }
        let report="[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}"
        let additions = [
            "GET":"/api/accounts/(albums/archived|feedback(/inbox|/\(report)(/image/[0-9]{1,3})?)?|notifications|notification-settings)",
            "POST":"/api/accounts/(albums/[A-Za-z0-9_-]{1,128}/(archive|restore)|feedback(/\(report)/(chunks/[0-9]{1,3}|complete|cancel))?|notifications/\(report)/read)",
            "PUT":"/api/accounts/(albums/[A-Za-z0-9_-]{1,128}/title|notification-settings)"]
        if let extra=additions[method], url.path.range(of:"\\A"+extra+"\\z",options:.regularExpression) != nil { return true }
        let patterns = [
            "GET": "/api/(accounts/(me|albums|context|photos)|albums|auth/status|uploads/(status(/[A-Za-z0-9_-]{1,128})?|admission/[A-Za-z0-9_-]{16,80})|album/[A-Za-z0-9_-]{1,128}/photos|photo/[0-9]+/sizes)",
            "POST": "/api/(accounts/albums|uploads/retry|photos/(delete|tags/add|update-date)|album/[A-Za-z0-9_-]{1,128}/(add_photos|remove_photos))",
            "PUT": "/api/(photo/[0-9]+/tags|accounts/albums/dates)",
            "DELETE": "/api/(accounts/me|photo/[0-9]+|uploads/[A-Za-z0-9_-]{1,128})"]
        guard let pattern = patterns[method] else { return false }
        return url.path.range(of: "\\A" + pattern + "\\z", options: .regularExpression) != nil
    }
    private func json(_ issuer: String, _ method: String, _ path: String, body: [String: Any]? = nil,
                      token: String? = nil, seconds: TimeInterval = 30, expectedOwner: String? = nil) throws -> [String: Any] {
        guard NativeAccountOrigin.allowed(issuer), let url = URL(string: issuer + path),
              token.map(NativeAccountOrigin.token) ?? true else { throw NativeAccountHTTPError.invalidRequest }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: seconds)
        request.httpMethod = method; request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body {
            let data = try JSONSerialization.data(withJSONObject: body); guard data.count <= 16_384 else { throw NativeAccountHTTPError.tooLarge }
            request.httpBody = data; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let response = try NativeAccountJSONCall().run(request, seconds: seconds)
        if let expectedOwner, let actor = response.0.value(forHTTPHeaderField: "X-Timehut-Account"), actor != expectedOwner { throw NativeAccountHTTPError.invalidResponse }
        return response.1
    }
    private func rejectSecrets(_ value: Any, bearer: String? = nil) throws {
        if let object = value as? [String: Any] {
            for (key, value) in object {
                guard !["token", "password", "passwordHash"].contains(key) else { throw NativeAccountHTTPError.invalidResponse }
                try rejectSecrets(value, bearer: bearer)
            }
        } else if let array = value as? [Any] { for value in array { try rejectSecrets(value, bearer: bearer) } }
        else if let bearer, let text = value as? String, text.contains(bearer) { throw NativeAccountHTTPError.invalidResponse }
    }
    private func profile(_ object: [String: Any], token: String, issuer: String) throws -> (NativeAccountCredential, [String: Any]) {
        try rejectSecrets(object, bearer: token)
        guard let user = object["user"] as? [String: Any], let owner = user["id"] as? String, NativeAccountOrigin.uuid(owner),
              let username = user["username"] as? String, let displayName = user["displayName"] as? String,
              username.utf8.count <= 32, displayName.utf8.count <= 512,
              let expiry = object["expiresAt"] as? NSNumber, CFGetTypeID(expiry) != CFBooleanGetTypeID(),
              ["q", "i", "l"].contains(String(cString: expiry.objCType)),
              let role = object["legacyOwner"] as? NSNumber, CFGetTypeID(role) == CFBooleanGetTypeID() else { throw NativeAccountHTTPError.invalidResponse }
        let now = Int64(Date().timeIntervalSince1970 * 1000), until = expiry.int64Value
        guard until > now, until <= now + 31 * 86_400_000 else { throw NativeAccountHTTPError.invalidResponse }
        let credential = NativeAccountCredential(owner: owner, token: token, issuer: issuer, expiresAt: until, legacyOwner: role.boolValue)
        return (credential, ["user": ["id": owner, "username": username, "displayName": displayName], "expiresAt": until, "legacyOwner": role.boolValue])
    }
    private func publish(_ payload: [String: Any], for current: NativeAccountSnapshot, delivery: Delivery?) throws -> [String: Any] {
        NativeAccountStore.boundary.lock(); defer { NativeAccountStore.boundary.unlock() }
        try store.require(current)
        let authority = try store.status(); try store.require(current)
        try delivery?(payload, authority); return payload
    }
    func signIn(username: String, password: String, displayName: String = "", register: Bool = false, expectedGeneration: String? = nil, delivery: Delivery? = nil) throws -> [String: Any] {
        guard username.range(of: "\\A[A-Za-z0-9_.-]{3,32}\\z", options: .regularExpression) != nil,
              (12...128).contains(password.count), displayName.utf8.count <= 512 else { throw NativeAccountHTTPError.invalidRequest }
        guard loginLock.try() else { throw NativeAccountHTTPError.busy }; defer { loginLock.unlock() }
        NativeAccountStore.boundary.lock()
        let attempt: String
        do {
            if let expectedGeneration {
                guard NativeAccountOrigin.uuid(expectedGeneration), try store.status()["generation"] as? String == expectedGeneration else { throw NativeAccountError.changed }
            }
            attempt = try store.beginLogin(issuer: backend); NativeAccountStore.boundary.unlock()
        } catch { NativeAccountStore.boundary.unlock(); throw error }
        var loginDispatched = false
        do {
            if register { _ = try json(backend, "POST", "/api/accounts/register", body: ["username": username, "password": password, "displayName": displayName]) }
            loginDispatched = true
            let result = try json(backend, "POST", "/api/accounts/login", body: ["username": username, "password": password])
            guard let token = result["token"] as? String, NativeAccountOrigin.token(token) else { throw NativeAccountHTTPError.invalidResponse }
            try store.captureLoginToken(token, attempt: attempt)
            let verified = try profile(json(backend, "GET", "/api/accounts/me", token: token), token: token, issuer: backend)
            let current = try store.completeLogin(verified.0, attempt: attempt); changed()
            return try publish(verified.1, for: current, delivery: delivery)
        } catch {
            let definitive: Bool
            if case NativeAccountHTTPError.status(401) = error { definitive = true } else { definitive = !loginDispatched }
            try? store.abortLogin(attempt, definitiveNoToken: definitive)
            throw error
        }
    }
    func request(method: String, path: String, body: [String: Any]? = nil, expectedGeneration: String? = nil, expectedOwner: String? = nil, delivery: Delivery? = nil) throws -> [String: Any] {
        guard Self.allowedPath(method, path) else { throw NativeAccountHTTPError.invalidRequest }
        guard let current = try store.snapshot() else { throw NativeAccountError.unauthenticated }
        if let expectedGeneration {
            guard current.generation == expectedGeneration, current.credential.owner == expectedOwner else { throw NativeAccountError.changed }
        } else if expectedOwner != nil { throw NativeAccountError.invalidIdentity }
        try store.require(current)
        do {
            let response = try json(current.credential.issuer, method, path, body: body, token: current.credential.token, expectedOwner: current.credential.owner)
            try rejectSecrets(response, bearer: current.credential.token)
            if method == "DELETE", path == "/api/accounts/me" {
                NativeAccountStore.boundary.lock(); defer { NativeAccountStore.boundary.unlock() }
                try store.require(current)
                if try store.signOut(ifCurrent: current) { changed() }
                let authority = try store.status()
                guard authority["authenticated"] as? Bool == false else { throw NativeAccountError.changed }
                try delivery?(response, authority); return response
            }
            return try publish(response, for: current, delivery: delivery)
        } catch {
            if case NativeAccountHTTPError.status(401) = error, try store.signOut(ifCurrent: current) { changed() }
            throw error
        }
    }
    @discardableResult func retryRevocation(_ row: NativeAccountRevocation) throws -> Bool {
        guard try store.allRevocations().contains(row) else { return true }
        var confirmed = false
        do {
            let response = try json(row.issuer, "POST", "/api/accounts/logout", body: [:], token: row.token, seconds: 6)
            if let value = response["ok"] as? NSNumber { confirmed = CFGetTypeID(value) == CFBooleanGetTypeID() && value.boolValue }
        } catch NativeAccountHTTPError.status(401) { confirmed = true }
        catch { return false }
        if confirmed { try store.confirmRevocation(row) }
        return confirmed
    }
    func signOut(expectedGeneration: String? = nil, expectedOwner: String? = nil, delivery: Delivery? = nil) throws -> [String: Any] {
        NativeAccountStore.boundary.lock()
        let closedGeneration: String
        do {
            if let expectedGeneration {
                let before = try store.status()
                guard NativeAccountOrigin.uuid(expectedGeneration), before["generation"] as? String == expectedGeneration,
                      before["owner"] as? String == expectedOwner else { throw NativeAccountError.changed }
            } else if expectedOwner != nil { throw NativeAccountError.invalidIdentity }
            _ = try store.signOut(); changed()
            guard let generation = try store.status()["generation"] as? String else { throw NativeAccountError.invalidState }
            closedGeneration = generation; NativeAccountStore.boundary.unlock()
        } catch { NativeAccountStore.boundary.unlock(); throw error }
        var confirmed = true
        // One bounded pass. An OS/persistent retry scheduler is still separate.
        let pending = try store.allRevocations()
        if let row = pending.first { confirmed = try retryRevocation(row) }
        NativeAccountStore.boundary.lock(); defer { NativeAccountStore.boundary.unlock() }
        let left = try store.allRevocations().count
        let status = try store.status(), unknown = status["unknownLoginResults"] as? Int ?? 0, loginPending = status["loginPending"] as? Bool ?? true
        guard status["generation"] as? String == closedGeneration, status["authenticated"] as? Bool == false else { throw NativeAccountError.changed }
        let result: [String: Any] = ["signedOut": true, "serverConfirmed": confirmed && left == 0 && unknown == 0 && !loginPending,
                "pendingRevocations": left, "unknownLoginResults": unknown, "loginPending": loginPending]
        try delivery?(result, status); return result
    }
}
