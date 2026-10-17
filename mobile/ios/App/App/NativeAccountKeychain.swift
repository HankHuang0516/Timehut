import Foundation
import Security
import Darwin

enum NativeKeychainError: Error { case systemStatus(OSStatus) }

// No synchronizable/access-group override: the item belongs to this signed app.
// AfterFirstUnlockThisDeviceOnly supports lock-screen background transfers after
// the first unlock, without iCloud migration or putting credentials in JSON files.
final class NativeKeychainVault: NativeAccountVault {
    private let service: String
    init(service: String = "tw.aihankapps.timehut.accounts.v1") { self.service = service }
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: "credential-ledger", kSecAttrSynchronizable as String: false]
    }
    func read() throws -> Data? {
        var request = query; request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw NativeKeychainError.systemStatus(status) }
        guard let data = result as? Data, data.count <= 65_536 else { throw NativeAccountError.invalidState }
        return data
    }
    func write(_ data: Data) throws {
        guard data.count <= 65_536 else { throw NativeAccountError.invalidState }
        let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var added = query; attributes.forEach { added[$0.key] = $0.value }
            let addedStatus = SecItemAdd(added as CFDictionary, nil)
            guard addedStatus == errSecSuccess else { throw NativeKeychainError.systemStatus(addedStatus) }
        } else if status != errSecSuccess { throw NativeKeychainError.systemStatus(status) }
    }
}

final class NativeFileAccountControl: NativeAccountControl {
    private let directory: URL
    init(directory: URL) { self.directory = directory }
    private func directoryFD() throws -> Int32 {
        // The OS-provided app-private parent is trusted; the selected control
        // directory itself must not redirect to another folder.
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication, .posixPermissions: 0o700])
        let fd = open(directory.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard fd >= 0 else { throw NativeAccountError.unavailable }
        return fd
    }
    private func readUUID(_ name: String, directory fd: Int32) throws -> String? {
        let file = openat(fd, name, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
        if file < 0, errno == ENOENT { return nil }
        guard file >= 0 else { throw NativeAccountError.unavailable }
        defer { close(file) }; var info = stat()
        guard fstat(file, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_size == 37 else { throw NativeAccountError.invalidState }
        var bytes = [UInt8](repeating: 0, count: 38)
        let count = bytes.withUnsafeMutableBytes { Darwin.read(file, $0.baseAddress!, 38) }
        guard count == 37, bytes[36] == 10, let text = String(bytes: bytes.prefix(36), encoding: .utf8), NativeAccountOrigin.uuid(text) else { throw NativeAccountError.invalidState }
        return text
    }
    private func createUUID(_ value: String, name: String, directory fd: Int32) throws {
        guard NativeAccountOrigin.uuid(value) else { throw NativeAccountError.invalidState }
        let file = openat(fd, name, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard file >= 0 else { throw NativeAccountError.unavailable }
        defer { close(file) }; let bytes = Array((value + "\n").utf8)
        let written = bytes.withUnsafeBytes { Darwin.write(file, $0.baseAddress!, $0.count) }
        guard written == bytes.count, fsync(file) == 0 else { throw NativeAccountError.unavailable }
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: directory.appendingPathComponent(name).path)
        guard fsync(fd) == 0 else { throw NativeAccountError.unavailable }
    }
    func read() throws -> NativeAccountControlState {
        let fd = try directoryFD(); defer { close(fd) }
        return NativeAccountControlState(installation: try readUUID("installation", directory: fd),
                                         pendingMutation: try readUUID("mutation-pending", directory: fd))
    }
    func begin() throws -> String {
        let fd = try directoryFD(); defer { close(fd) }; let mutation = UUID().uuidString.lowercased()
        try createUUID(mutation, name: "mutation-pending", directory: fd); return mutation
    }
    func finish(installation: String, mutation: String) throws {
        let fd = try directoryFD(); defer { close(fd) }
        guard try readUUID("mutation-pending", directory: fd) == mutation else { throw NativeAccountError.invalidState }
        if let prior = try readUUID("installation", directory: fd) {
            guard prior == installation else { throw NativeAccountError.invalidState }
        } else { try createUUID(installation, name: "installation", directory: fd) }
        guard unlinkat(fd, "mutation-pending", 0) == 0, fsync(fd) == 0 else { throw NativeAccountError.unavailable }
    }
}

extension NativeAccountStore {
    static let platform = NativeAccountStore(vault: NativeKeychainVault(), control: NativeFileAccountControl(
        directory: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("TimehutAccounts", isDirectory: true)))
}
extension NativeAccountClient {
    static let platform: NativeAccountClient? = {
        var backend = NativeAccountOrigin.backend
        #if DEBUG && targetEnvironment(simulator)
        if Bundle.main.bundleIdentifier?.hasPrefix("tw.aihankapps.timehut.qa.accounts.") == true,
           ProcessInfo.processInfo.environment["TIMEHUT_QA_MODE"] == "account-bridge",
           let candidate = ProcessInfo.processInfo.environment["TIMEHUT_QA_ACCOUNT_BACKEND"],
           let parts = URLComponents(string: candidate), parts.scheme == "http", parts.host == "127.0.0.1",
           NativeAccountOrigin.allowed(candidate) { backend = candidate }
        #endif
        return try? NativeAccountClient(store: NativeAccountStore.platform, backend: backend, changed: { NativeAccountClient.notifyPlatformChange() })
    }()
}
