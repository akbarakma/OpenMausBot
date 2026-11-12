import XCTest
@testable import CompanionCore

final class ComposerDraftStoreTests: XCTestCase {
    private var root: URL!

    override func setUp() {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("draft-tests-\(UUID().uuidString)")
    }

    override func tearDown() {
        if let root { try? FileManager.default.removeItem(at: root) }
    }

    func testADraftRoundTripsPerThreadAndABlankOneIsRemoved() throws {
        let store = ComposerDraftStore(root: root)
        let photo = PendingMessageAttachment(
            id: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
            data: Data("photo".utf8),
            name: "Photo.jpg",
            mime: "image/jpeg",
            kind: .image
        )
        let reply = ComposerReply(messageId: "m1", author: "Chloe", preview: "The notes are live.")
        try store.save(
            threadId: "chloe",
            record: ComposerDraftRecord(text: "check the deploy", reply: reply, attachments: [photo])
        )
        try store.save(
            threadId: "julia",
            record: ComposerDraftRecord(text: "ok", reply: nil, attachments: [])
        )

        let chloe = store.load(threadId: "chloe")
        XCTAssertEqual(chloe?.text, "check the deploy")
        XCTAssertEqual(chloe?.reply, reply)
        XCTAssertEqual(chloe?.attachments, [photo])
        XCTAssertEqual(store.load(threadId: "julia")?.text, "ok")

        try store.save(threadId: "julia", record: ComposerDraftRecord(text: "  ", reply: nil, attachments: []))
        XCTAssertNil(store.load(threadId: "julia"))
        XCTAssertEqual(store.load(threadId: "chloe")?.text, "check the deploy")
    }

    func testAReplyStaysWhileOlderPagesMayHoldItAndDropsWhenTheThreadIsComplete() {
        let reply = ComposerReply(messageId: "old", author: "You", preview: "Earlier")
        XCTAssertEqual(
            ComposerDraftReply.kept(reply, messageIds: ["new"], hasMore: true),
            reply
        )
        XCTAssertNil(ComposerDraftReply.kept(reply, messageIds: ["new"], hasMore: false))
        XCTAssertEqual(
            ComposerDraftReply.kept(reply, messageIds: ["old"], hasMore: false)?.messageId,
            "old"
        )
    }

    func testTheSameThreadLoadsFromTheSameFolder() throws {
        let store = ComposerDraftStore(root: root)
        try store.save(threadId: "chloe", record: ComposerDraftRecord(text: "one", reply: nil, attachments: []))
        let again = ComposerDraftStore(root: root)
        XCTAssertEqual(again.load(threadId: "chloe")?.text, "one")
    }
}
