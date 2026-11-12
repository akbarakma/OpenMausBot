import CryptoKit
import Foundation

/// The reply chip kept with an unsent draft.
public struct ComposerReply: Equatable, Sendable, Codable {
    public var messageId: String
    public var author: String
    public var preview: String

    public init(messageId: String, author: String, preview: String) {
        self.messageId = messageId
        self.author = author
        self.preview = String(preview.prefix(280))
    }
}

/// One thread's unsent composer: text, reply, and attachments already in the tray.
public struct ComposerDraftRecord: Equatable, Sendable {
    public var text: String
    public var reply: ComposerReply?
    public var attachments: [PendingMessageAttachment]

    public init(text: String, reply: ComposerReply?, attachments: [PendingMessageAttachment]) {
        self.text = text
        self.reply = reply
        self.attachments = attachments
    }

    public var isBlank: Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && reply == nil && attachments.isEmpty
    }
}

/// Drop a stored reply once the thread is fully loaded and that message is not in it.
public enum ComposerDraftReply {
    public static func kept(_ reply: ComposerReply?, messageIds: Set<String>, hasMore: Bool) -> ComposerReply? {
        guard let reply else { return nil }
        if messageIds.contains(reply.messageId) || hasMore { return reply }
        return nil
    }
}

/// Drafts on this phone, one folder per thread. An empty draft deletes its folder.
public struct ComposerDraftStore: Sendable {
    public let root: URL

    public init(root: URL) {
        self.root = root
    }

    public func load(threadId: String) -> ComposerDraftRecord? {
        let folder = folderURL(threadId)
        let manifestURL = folder.appendingPathComponent("draft.json")
        guard let data = try? Data(contentsOf: manifestURL),
              let manifest = try? JSONDecoder().decode(Manifest.self, from: data) else { return nil }
        let attachments = manifest.attachments.compactMap { item -> PendingMessageAttachment? in
            guard let kind = kind(item.kind),
                  let bytes = try? Data(contentsOf: folder.appendingPathComponent(item.id.uuidString)) else { return nil }
            return PendingMessageAttachment(id: item.id, data: bytes, name: item.name, mime: item.mime, kind: kind)
        }
        return ComposerDraftRecord(text: manifest.text, reply: manifest.reply, attachments: attachments)
    }

    public func save(threadId: String, record: ComposerDraftRecord) throws {
        if record.isBlank {
            remove(threadId: threadId)
            return
        }
        let folder = folderURL(threadId)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        for attachment in record.attachments {
            let url = folder.appendingPathComponent(attachment.id.uuidString)
            try attachment.data.write(to: url, options: .atomic)
        }
        let keep = Set(record.attachments.map { $0.id.uuidString })
        if let names = try? FileManager.default.contentsOfDirectory(atPath: folder.path) {
            for name in names where name != "draft.json" && !keep.contains(name) {
                try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
            }
        }
        let manifest = Manifest(
            text: record.text,
            reply: record.reply,
            attachments: record.attachments.map {
                Item(id: $0.id, name: $0.name, mime: $0.mime, kind: $0.kind == .image ? "image" : "file")
            }
        )
        let data = try JSONEncoder().encode(manifest)
        try data.write(to: folder.appendingPathComponent("draft.json"), options: .atomic)
    }

    public func remove(threadId: String) {
        try? FileManager.default.removeItem(at: folderURL(threadId))
    }

    private func folderURL(_ threadId: String) -> URL {
        let digest = SHA256.hash(data: Data(threadId.utf8))
        let name = digest.map { String(format: "%02x", $0) }.joined()
        return root.appendingPathComponent(name, isDirectory: true)
    }

    private func kind(_ name: String) -> PendingMessageAttachment.Kind? {
        switch name {
        case "image": .image
        case "file": .file
        default: nil
        }
    }

    private struct Manifest: Codable {
        var text: String
        var reply: ComposerReply?
        var attachments: [Item]
    }

    private struct Item: Codable {
        var id: UUID
        var name: String
        var mime: String
        var kind: String
    }
}
