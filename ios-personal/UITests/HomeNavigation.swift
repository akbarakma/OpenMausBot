import XCTest

extension XCUIApplication {
    /// Home opens a bot at its main thread; bot settings reach the others.
    @MainActor
    func openThread(_ threadId: String, of botId: String) {
        let row = buttons["chat-row.\(botId)"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
        openThreadList()
        let thread = buttons["thread-\(threadId)"]
        XCTAssertTrue(thread.waitForExistence(timeout: 5))
        thread.tap()
    }

    /// A bot's threads live in its settings, opened from the face pill.
    @MainActor
    func openThreadList() {
        let profile = buttons["header-profile"]
        XCTAssertTrue(profile.waitForExistence(timeout: 10))
        profile.tap()
        let threads = buttons["profile-threads"]
        XCTAssertTrue(threads.waitForExistence(timeout: 5))
        threads.tap()
    }
}
