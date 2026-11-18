import XCTest
@testable import CompanionCore

final class FramesTests: XCTestCase {
    private func frame(seq: Int?) -> StreamFrame {
        StreamFrame(frame: .botDeleted(botId: "scout"), seq: seq)
    }

    func testAFrameAtOrBelowTheHelloSequenceIsAReplay() {
        XCTAssertTrue(frame(seq: 41).isReplay(helloCursor: "s-1a2b:42"))
        XCTAssertTrue(frame(seq: 42).isReplay(helloCursor: "s-1a2b:42"))
        XCTAssertFalse(frame(seq: 43).isReplay(helloCursor: "s-1a2b:42"))
    }

    func testAFrameIsLiveWithoutASequenceOrAReadableCursor() {
        XCTAssertFalse(frame(seq: nil).isReplay(helloCursor: "s-1a2b:42"))
        XCTAssertFalse(frame(seq: 3).isReplay(helloCursor: nil))
        XCTAssertFalse(frame(seq: 3).isReplay(helloCursor: "s-1a2b"))
    }
}
