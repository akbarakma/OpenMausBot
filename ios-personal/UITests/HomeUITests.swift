import XCTest

/// Runs against the bundled roster fixture: no paired computer, nothing leaves the phone.
final class HomeUITests: XCTestCase {
    @MainActor
    func testPinnedBlockSitsAtTheTopUnlessMovedToTheBottom() {
        var app = launch()
        XCTAssertLessThan(frame("home-chief", in: app).minY, frame("section-header.groups", in: app).minY)
        record("Pinned at the top", app)

        app = launch(["-companion.prefs.pinnedAtBottom", "YES"])
        XCTAssertGreaterThan(frame("home-chief", in: app).minY, frame("section-header.groups", in: app).minY)
        record("Pinned at the bottom", app)
    }

    @MainActor
    func testUnpinningInTheDemoLeavesOnlyTheChief() {
        let app = launch()
        let pixel = app.buttons["pinned.roster-pixel"]
        XCTAssertTrue(pixel.waitForExistence(timeout: 5))
        pixel.press(forDuration: 1)
        let unpin = app.buttons["Unpin"]
        XCTAssertTrue(unpin.waitForExistence(timeout: 5))
        unpin.tap()
        XCTAssertTrue(pixel.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["home-chief"].exists)
        record("No pinned bots", app)
    }

    /// A launch argument would override the saved order, so this test starts
    /// from whatever order the last run left and moves Groups back on top at the end.
    @MainActor
    func testSectionOrderSetInTheReorderSheetStays() {
        var app = launch()
        moveToTop("Growth", from: "section:Growth", in: app)

        app = launch()
        XCTAssertLessThan(frame("section-header.section:Growth", in: app).minY,
                          frame("section-header.groups", in: app).minY)
        record("Order kept after a relaunch", app)

        moveToTop("Groups", from: "groups", in: app)
        app = launch()
        XCTAssertLessThan(frame("section-header.groups", in: app).minY,
                          frame("section-header.section:Growth", in: app).minY)
    }

    @MainActor
    private func moveToTop(_ title: String, from sectionId: String, in app: XCUIApplication) {
        let header = app.buttons["section-header.\(sectionId)"]
        XCTAssertTrue(header.waitForExistence(timeout: 5))
        header.press(forDuration: 1)
        let reorder = app.buttons["Reorder"]
        XCTAssertTrue(reorder.waitForExistence(timeout: 5))
        reorder.tap()
        let moving = handle(title, in: app)
        XCTAssertTrue(moving.waitForExistence(timeout: 5))
        let sections = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Reorder' AND NOT (label BEGINSWITH 'Reorder Pixel')"))
            .allElementsBoundByIndex.filter { $0.label != "Reorder" }
        let top = sections.min { $0.frame.minY < $1.frame.minY }!
        if top.label != moving.label {
            let target = top.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0)).withOffset(CGVector(dx: 0, dy: -12))
            moving.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
                .press(forDuration: 0.6, thenDragTo: target, withVelocity: .slow, thenHoldForDuration: 0.5)
        }
        record("\(title) dragged to the top", app)
        app.buttons["reorder-done"].tap()
        XCTAssertTrue(app.buttons["home-chief"].waitForExistence(timeout: 5))
    }

    @MainActor
    private func launch(_ extra: [String] = []) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.terminate()
        app.launchArguments = [
            "-store-preview", "-roster-preview",
            "-AppleLanguages", "(en)", "-AppleLocale", "en_US",
            "-companion.prefs.islandIntro", "never",
            "-companion.onboarding.welcomeSeen", "YES",
            "-companion.onboarding.notificationsSeen", "YES"
        ] + extra
        app.launch()
        XCTAssertTrue(app.buttons["home-chief"].waitForExistence(timeout: 10))
        return app
    }

    @MainActor
    private func frame(_ id: String, in app: XCUIApplication) -> CGRect {
        let element = app.buttons[id]
        XCTAssertTrue(element.waitForExistence(timeout: 5), "\(id) is missing")
        return element.frame
    }

    @MainActor
    private func handle(_ title: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Reorder \(title)")).firstMatch
    }

    @MainActor
    private func record(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
