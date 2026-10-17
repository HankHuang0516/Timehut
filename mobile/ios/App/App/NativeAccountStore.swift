import Foundation

// The complete credential ledger lives in one atomic Keychain item. The local
// control files contain UUIDs only. An unfinished mutation closes authentication
// on recovery; it never discards the credentials that Keychain still contains.
protocol NativeAccountVault {
    func read() throws -> Data?
    func write(_ data: Data) throws
}
struct NativeAccountControlState { let installation: String?; let pendingMutation: String? }
protocol NativeAccountControl {
    func read() throws -> NativeAccountControlState
    func begin() throws -> String
    func finish(installation: String, mutation: String) throws
}
enum NativeAccountError: Error { case unavailable, invalidState, invalidIdentity, capacity, changed, unauthenticated, pendingToken }

struct NativeAccountCredential: Codable, Equatable {
    let owner: String
    let token: String
    let issuer: String
    let expiresAt: Int64
    let legacyOwner: Bool
}
struct NativeAccountSnapshot: Equatable {
    let credential: NativeAccountCredential
    let generation: String
}
struct NativeAccountRevocation: Codable, Equatable {
    let owner: String?
    let token: String
    let issuer: String
}
private struct NativeAccountLogin: Codable {
    let id: String
    let generation: String
    let process: String
    let issuer: String
    var token: String?
    var cancelSecret: String?
}
private struct NativeUnknownLogin: Codable {
    let id: String
    let issuer: String
    var cancelSecret: String?
}
struct NativeAccountCancellation: Equatable {
    let attemptId: String
    let secret: String
    let issuer: String
}
private struct NativeAccountEnvelope: Codable {
    var version = 3
    var installation = UUID().uuidString.lowercased()
    var generation = UUID().uuidString.lowercased()
    var active: NativeAccountCredential?
    var pending = [NativeAccountCredential]()
    // v1/v2 migrate without inventing proof for legacy unknown outcomes.
    // v3 fences old readers before cancellation secrets are written.
    var opaquePending: [NativeAccountRevocation]?
    var unknownLogins: [NativeUnknownLogin]?
    var login: NativeAccountLogin?
}

enum NativeAccountOrigin {
    static let backend = "https://just-healing-production.up.railway.app"
    static func allowed(_ value: String) -> Bool {
        if value == backend { return true }
        #if DEBUG
        // An explicit origin is needed by separately identified local fixtures.
        guard let url = URLComponents(string: value), url.scheme == "http",
              ["127.0.0.1", "localhost"].contains(url.host ?? ""),
              url.user == nil, url.password == nil, url.fragment == nil, url.query == nil,
              url.percentEncodedPath.isEmpty,
              url.port == nil || (1...65535).contains(url.port!) else { return false }
        return value == "http://" + url.host! + (url.port.map { ":\($0)" } ?? "")
        #else
        return false
        #endif
    }
    static func uuid(_ value: String) -> Bool { UUID(uuidString: value)?.uuidString.lowercased() == value }
    static func cancelSecret(_ value: String) -> Bool {
        guard value.utf8.count == 43, token(value),
              let bytes = Data(base64Encoded: value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") + "="), bytes.count == 32 else { return false }
        return bytes.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") == value
    }
    static func token(_ value: String) -> Bool {
        let bytes = Array(value.utf8)
        return (32...128).contains(bytes.count) && bytes.allSatisfy { (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0) || $0 == 45 || $0 == 95 }
    }
}

final class NativeAccountStore {
    static let boundary = NSRecursiveLock()
    static let maximumPending = 24
    private static let process = UUID().uuidString.lowercased()
    private let vault: NativeAccountVault
    private let control: NativeAccountControl
    private let now: () -> Int64
    init(vault: NativeAccountVault, control: NativeAccountControl,
         now: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.vault = vault; self.control = control; self.now = now
    }
    private func locked<T>(_ action: () throws -> T) rethrows -> T {
        Self.boundary.lock(); defer { Self.boundary.unlock() }; return try action()
    }
    private func valid(_ credential: NativeAccountCredential) -> Bool {
        NativeAccountOrigin.uuid(credential.owner) && NativeAccountOrigin.token(credential.token) &&
            NativeAccountOrigin.allowed(credential.issuer) && credential.expiresAt > 0
    }
    private func sameToken(_ a: NativeAccountCredential, _ b: NativeAccountCredential) -> Bool {
        a.issuer == b.issuer && a.token == b.token
    }
    private func validate(_ state: NativeAccountEnvelope) throws {
        guard [1, 2, 3].contains(state.version), NativeAccountOrigin.uuid(state.installation), NativeAccountOrigin.uuid(state.generation),
              occupancy(state) <= Self.maximumPending,
              state.pending.allSatisfy(valid), state.active.map(valid) ?? true else { throw NativeAccountError.invalidState }
        for i in state.pending.indices {
            if state.pending[..<i].contains(where: { sameToken($0, state.pending[i]) }) ||
                state.active.map({ sameToken($0, state.pending[i]) }) == true { throw NativeAccountError.invalidState }
        }
        let opaque = state.opaquePending ?? [], unknown = state.unknownLogins ?? []
        guard opaque.allSatisfy({ $0.owner == nil && NativeAccountOrigin.allowed($0.issuer) && NativeAccountOrigin.token($0.token) }),
              unknown.allSatisfy({ NativeAccountOrigin.uuid($0.id) && NativeAccountOrigin.allowed($0.issuer) && $0.cancelSecret.map(NativeAccountOrigin.cancelSecret) ?? true }),
              Set(unknown.map(\.id)).count == unknown.count else { throw NativeAccountError.invalidState }
        let keys = state.pending.map { $0.issuer + " " + $0.token } + opaque.map { $0.issuer + " " + $0.token }
        guard Set(keys).count == keys.count, state.active.map({ !keys.contains($0.issuer + " " + $0.token) }) ?? true else { throw NativeAccountError.invalidState }
        if let login = state.login {
            guard NativeAccountOrigin.uuid(login.id), NativeAccountOrigin.uuid(login.generation), NativeAccountOrigin.uuid(login.process),
                  NativeAccountOrigin.allowed(login.issuer), login.token.map(NativeAccountOrigin.token) ?? true,
                  login.cancelSecret.map(NativeAccountOrigin.cancelSecret) ?? true,
                  !unknown.contains(where: { $0.id == login.id }),
                  login.token.map({ !keys.contains(login.issuer + " " + $0) && state.active.map({ $0.token != login.token || $0.issuer != login.issuer }) ?? true }) ?? true else { throw NativeAccountError.invalidState }
        }
    }
    private func occupancy(_ state: NativeAccountEnvelope) -> Int {
        state.pending.count + (state.opaquePending?.count ?? 0) + (state.unknownLogins?.count ?? 0) + (state.active == nil ? 0 : 1) + (state.login == nil ? 0 : state.login?.cancelSecret == nil ? 1 : 2)
    }
    private func outstanding(_ state: NativeAccountEnvelope) -> Int {
        state.pending.count + (state.opaquePending?.count ?? 0) + (state.unknownLogins?.count ?? 0)
    }
    private func abandonLogin(_ state: inout NativeAccountEnvelope, definitiveNoToken: Bool = false) {
        guard let login = state.login else { return }
        if let token = login.token {
            var rows = state.opaquePending ?? []; rows.append(NativeAccountRevocation(owner: nil, token: token, issuer: login.issuer)); state.opaquePending = rows
        }
        if !definitiveNoToken && (login.cancelSecret != nil || login.token == nil) {
            var rows = state.unknownLogins ?? []; rows.append(NativeUnknownLogin(id: login.id, issuer: login.issuer, cancelSecret: login.cancelSecret)); state.unknownLogins = rows
        }
        state.login = nil
    }
    private func retire(_ state: inout NativeAccountEnvelope) {
        if let current = state.active { state.pending.append(current) }
        state.active = nil; state.generation = UUID().uuidString.lowercased()
    }
    private func persist(_ input: NativeAccountEnvelope, recoveryMutation: String? = nil) throws {
        var state = input; state.version = 3
        try validate(state)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(state)
        let mutation = try recoveryMutation ?? control.begin()
        // No cleanup on failure. The durable control makes all later handles
        // recover closed instead of trusting either side of an uncertain write.
        try vault.write(data)
        guard try vault.read() == data else { throw NativeAccountError.unavailable }
        try control.finish(installation: state.installation, mutation: mutation)
    }
    private func load() throws -> NativeAccountEnvelope {
        let local = try control.read(), bytes = try vault.read()
        guard local.installation.map(NativeAccountOrigin.uuid) ?? true,
              local.pendingMutation.map(NativeAccountOrigin.uuid) ?? true else { throw NativeAccountError.invalidState }
        guard let bytes else {
            guard local.installation == nil, local.pendingMutation == nil else { throw NativeAccountError.unavailable }
            return NativeAccountEnvelope()
        }
        guard bytes.count <= 65_536 else { throw NativeAccountError.invalidState }
        // Preserve schemas this implementation does not understand, including
        // fields a future writer might accidentally add without a version bump.
        guard let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(object.keys).isSubset(of: ["version", "installation", "generation", "active", "pending", "opaquePending", "unknownLogins", "login"]) else { throw NativeAccountError.invalidState }
        let credentialKeys: Set<String> = ["owner", "token", "issuer", "expiresAt", "legacyOwner"]
        func checkKeys(_ value: Any?, allowed: Set<String>) throws {
            guard let value, !(value is NSNull) else { return }
            guard let row = value as? [String: Any], Set(row.keys).isSubset(of: allowed) else { throw NativeAccountError.invalidState }
        }
        try checkKeys(object["active"], allowed: credentialKeys)
        let schema = object["version"] as? Int ?? 0
        let proofFields: Set<String> = schema >= 3 ? ["cancelSecret"] : []
        try checkKeys(object["login"], allowed: Set(["id", "generation", "process", "issuer", "token"]).union(proofFields))
        for (key, allowed) in [("pending", credentialKeys), ("opaquePending", Set(["owner", "token", "issuer"])), ("unknownLogins", Set(["id", "issuer"]).union(proofFields))] {
            if let rows = object[key] as? [Any] { for row in rows { try checkKeys(row, allowed: allowed) } }
        }
        var state = try JSONDecoder().decode(NativeAccountEnvelope.self, from: bytes)
        try validate(state)
        if let installation = local.installation, installation != state.installation { throw NativeAccountError.invalidState }
        if local.pendingMutation != nil || local.installation == nil {
            // Covers a crash on either side of atomic SecItemUpdate, and an app
            // reinstall with a surviving Keychain item. Neither resumes a login.
            retire(&state); abandonLogin(&state)
            try persist(state, recoveryMutation: local.pendingMutation)
        }
        if let login = state.login, login.process != Self.process {
            retire(&state); abandonLogin(&state); try persist(state)
        }
        if let current = state.active, current.expiresAt <= now() || current.expiresAt > now() + 31 * 86_400_000 {
            retire(&state); try persist(state)
        }
        if state.version < 3 { state.version = 3; try persist(state) }
        return state
    }
    func snapshot() throws -> NativeAccountSnapshot? {
        try locked { let state = try load(); return state.active.map { NativeAccountSnapshot(credential: $0, generation: state.generation) } }
    }
    func require(_ expected: NativeAccountSnapshot) throws {
        try locked { guard try snapshot() == expected else { throw NativeAccountError.changed } }
    }
    func status() throws -> [String: Any] {
        try locked {
            let state = try load()
            return ["authenticated": state.active != nil, "owner": state.active?.owner as Any? ?? NSNull(),
                    "legacyOwner": state.active?.legacyOwner ?? false, "generation": state.generation,
                    "pendingRevocations": state.pending.count + (state.opaquePending?.count ?? 0),
                    "unknownLoginResults": state.unknownLogins?.count ?? 0, "loginPending": state.login != nil,
                    "accountMode": true, "credentialStorage": "keychain"]
        }
    }
    func preflightLogin() throws {
        try locked { let state = try load(); guard state.login == nil, outstanding(state) < Self.maximumPending - 1, occupancy(state) + 2 <= Self.maximumPending else { throw NativeAccountError.capacity } }
    }
    // Internal native operation only. A future HTTP identity verifier must call
    // /api/accounts/me before this operation; never bridge raw owner/token input.
    @discardableResult func activateVerified(_ credential: NativeAccountCredential) throws -> NativeAccountSnapshot {
        try locked {
            guard valid(credential), credential.expiresAt > now(), credential.expiresAt <= now() + 31 * 86_400_000 else { throw NativeAccountError.invalidIdentity }
            var state = try load()
            guard state.login == nil else { throw NativeAccountError.changed }
            if state.active == credential { return NativeAccountSnapshot(credential: credential, generation: state.generation) }
            guard !state.pending.contains(where: { sameToken($0, credential) }) else { throw NativeAccountError.pendingToken }
            guard outstanding(state) < Self.maximumPending - 1 else { throw NativeAccountError.capacity }
            retire(&state); state.active = credential
            try persist(state)
            return NativeAccountSnapshot(credential: credential, generation: state.generation)
        }
    }
    @discardableResult func signOut(ifCurrent expected: NativeAccountSnapshot? = nil) throws -> Bool {
        try locked {
            var state = try load()
            if let expected, state.active != expected.credential || state.generation != expected.generation { return false }
            guard state.active != nil || state.login != nil else { return false }
            retire(&state)
            // A proof can tombstone a concurrent POST before its bearer arrives.
            // Legacy requests retain their old capture/unknown-result behavior.
            if state.login?.cancelSecret != nil { abandonLogin(&state) }
            try persist(state); return true
        }
    }
    func pendingRevocations() throws -> [NativeAccountCredential] { try locked { try load().pending } }
    func confirmRevocation(_ expected: NativeAccountCredential) throws {
        try locked {
            var state = try load()
            guard let index = state.pending.firstIndex(of: expected) else { return }
            state.pending.remove(at: index)
            // Acknowledging A never changes B's generation or active credential.
            try persist(state)
        }
    }
    func beginLogin(issuer: String, cancelSecret: String? = nil) throws -> String {
        try locked {
            guard NativeAccountOrigin.allowed(issuer), cancelSecret.map(NativeAccountOrigin.cancelSecret) ?? true else { throw NativeAccountError.invalidIdentity }
            var state = try load()
            guard state.login == nil, outstanding(state) < Self.maximumPending - 1,
                  occupancy(state) + (cancelSecret == nil ? 1 : 2) <= Self.maximumPending else { throw NativeAccountError.capacity }
            let id = UUID().uuidString.lowercased()
            state.login = NativeAccountLogin(id: id, generation: state.generation, process: Self.process, issuer: issuer, cancelSecret: cancelSecret)
            try persist(state); return id
        }
    }
    func captureLoginToken(_ token: String, attempt: String) throws {
        try locked {
            var state = try load()
            guard NativeAccountOrigin.token(token), var login = state.login, login.id == attempt, login.token == nil else { throw NativeAccountError.changed }
            let known = allRows(state)
            guard !known.contains(where: { $0.issuer == login.issuer && $0.token == token }),
                  state.active.map({ $0.token != token || $0.issuer != login.issuer }) ?? true else { throw NativeAccountError.pendingToken }
            login.token = token; state.login = login; try persist(state)
        }
    }
    @discardableResult func completeLogin(_ credential: NativeAccountCredential, attempt: String) throws -> NativeAccountSnapshot {
        try locked {
            guard valid(credential), credential.expiresAt > now(), credential.expiresAt <= now() + 31 * 86_400_000 else { throw NativeAccountError.invalidIdentity }
            var state = try load()
            guard let login = state.login, login.id == attempt, login.token == credential.token, login.issuer == credential.issuer else { throw NativeAccountError.changed }
            guard login.generation == state.generation else { abandonLogin(&state); try persist(state); throw NativeAccountError.changed }
            state.login = nil; retire(&state); state.active = credential; try persist(state)
            return NativeAccountSnapshot(credential: credential, generation: state.generation)
        }
    }
    func abortLogin(_ attempt: String, definitiveNoToken: Bool = false) throws {
        try locked {
            var state = try load(); guard state.login?.id == attempt else { return }
            abandonLogin(&state, definitiveNoToken: definitiveNoToken); try persist(state)
        }
    }
    func nativeCancellations() throws -> [NativeAccountCancellation] {
        try locked { try load().unknownLogins?.compactMap { row in row.cancelSecret.map { NativeAccountCancellation(attemptId: row.id, secret: $0, issuer: row.issuer) } } ?? [] }
    }
    func confirmNativeCancellation(_ expected: NativeAccountCancellation) throws {
        try locked {
            var state = try load()
            guard let index = state.unknownLogins?.firstIndex(where: { $0.id == expected.attemptId && $0.issuer == expected.issuer && $0.cancelSecret == expected.secret }) else { return }
            state.unknownLogins?.remove(at: index); try persist(state)
        }
    }
    private func allRows(_ state: NativeAccountEnvelope) -> [NativeAccountRevocation] {
        state.pending.map { NativeAccountRevocation(owner: $0.owner, token: $0.token, issuer: $0.issuer) } + (state.opaquePending ?? [])
    }
    func allRevocations() throws -> [NativeAccountRevocation] { try locked { allRows(try load()) } }
    func confirmRevocation(_ expected: NativeAccountRevocation) throws {
        try locked {
            var state = try load()
            if let index = state.pending.firstIndex(where: { $0.owner == expected.owner && $0.token == expected.token && $0.issuer == expected.issuer }) { state.pending.remove(at: index) }
            else if let index = state.opaquePending?.firstIndex(of: expected) { state.opaquePending?.remove(at: index) }
            else { return }
            try persist(state)
        }
    }
}
