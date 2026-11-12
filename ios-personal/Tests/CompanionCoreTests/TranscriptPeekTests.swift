import XCTest
@testable import CompanionCore

final class TranscriptPeekTests: XCTestCase {
    func testAVerticalDragDoesNotBegin() {
        XCTAssertFalse(TranscriptPeek.shouldBegin(velocityX: -20, velocityY: -400))
        XCTAssertFalse(TranscriptPeek.shouldBegin(velocityX: 300, velocityY: 10))
    }

    func testALeftDragBegins() {
        XCTAssertTrue(TranscriptPeek.shouldBegin(velocityX: -240, velocityY: 30))
    }

    func testAShortDragShowsTimeAndDoesNotArm() {
        let moved = TranscriptPeek.idle.dragged(translationX: -40, grabbedId: "m1")
        XCTAssertEqual(moved.peek.travel, 40)
        XCTAssertFalse(moved.peek.armed)
        XCTAssertFalse(moved.tick)
        XCTAssertGreaterThan(moved.peek.timeOpacity, 0)
        XCTAssertEqual(moved.peek.replyOpacity(grabbed: true), 0)
    }

    func testCrossingTheReplyLineTicksOnceAndLettingGoReplies() {
        let crossed = TranscriptPeek.idle.dragged(translationX: -112, grabbedId: "m1")
        XCTAssertTrue(crossed.peek.armed)
        XCTAssertTrue(crossed.tick)
        let held = crossed.peek.dragged(translationX: -140, grabbedId: "m1")
        XCTAssertFalse(held.tick)
        XCTAssertEqual(held.peek.ended(commit: true).commitId, "m1")
    }

    func testPullingBackUnderTheLineDoesNotReply() {
        let crossed = TranscriptPeek.idle.dragged(translationX: -112, grabbedId: "m1").peek
        let back = crossed.dragged(translationX: -70, grabbedId: "m1")
        XCTAssertFalse(back.peek.armed)
        XCTAssertNil(back.peek.ended(commit: true).commitId)
    }

    func testADragOnEmptySpaceStopsAtTheClock() {
        let moved = TranscriptPeek.idle.dragged(translationX: -200, grabbedId: nil)
        XCTAssertEqual(moved.peek.travel, TranscriptPeek.timeDistance)
        XCTAssertFalse(moved.peek.armed)
        XCTAssertNil(moved.peek.ended(commit: true).commitId)
        XCTAssertEqual(moved.peek.shift(grabbed: false), TranscriptPeek.timeDistance)
    }

    func testACancelledTouchDoesNotReply() {
        let armed = TranscriptPeek.idle.dragged(translationX: -112, grabbedId: "m1").peek
        XCTAssertNil(armed.ended(commit: false).commitId)
    }

    func testPrependAddsTheNewHeightToTheOffset() {
        XCTAssertEqual(
            PrependHold.offset(baselineHeight: 800, baselineOffset: 20, height: 1400, offset: 20),
            620
        )
        XCTAssertNil(PrependHold.offset(baselineHeight: 800, baselineOffset: 20, height: 1400, offset: 620))
        XCTAssertNil(PrependHold.offset(baselineHeight: 800, baselineOffset: 20, height: 800, offset: 20))
    }
}
