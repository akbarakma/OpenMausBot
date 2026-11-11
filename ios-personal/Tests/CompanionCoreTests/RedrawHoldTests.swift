import XCTest
@testable import CompanionCore

final class RedrawHoldTests: XCTestCase {
    func testAChangeRedrawsAtOnceWhenNothingMoves() {
        var redraws = 0
        let hold = RedrawHold { redraws += 1 }
        hold.changed()
        hold.changed()
        XCTAssertEqual(redraws, 2)
    }

    func testChangesDuringAMotionRedrawOnceWhenItEnds() {
        var redraws = 0
        let hold = RedrawHold { redraws += 1 }
        hold.begin(.scroll)
        hold.begin(.keyboard)
        hold.changed()
        hold.changed()
        hold.end(.scroll)
        XCTAssertEqual(redraws, 0, "the keyboard is still moving")
        hold.end(.keyboard)
        XCTAssertEqual(redraws, 1)
    }

    func testAMotionWithNoChangeRedrawsNothing() {
        var redraws = 0
        let hold = RedrawHold { redraws += 1 }
        hold.begin(.scroll)
        hold.end(.scroll)
        XCTAssertEqual(redraws, 0)
    }

    func testALongMotionStillRedrawsAfterTheLimit() {
        let redrawn = expectation(description: "redrawn while still scrolling")
        let hold = RedrawHold(maxHold: 0.05) { redrawn.fulfill() }
        hold.begin(.scroll)
        hold.changed()
        wait(for: [redrawn], timeout: 2)
    }
}
