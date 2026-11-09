import XCTest

extension XCUIApplication {
    /// Home opens a bot at its newest thread; the header's picker reaches the others.
    @MainActor
    func openThread(_ threadId: String, of botId: String) {
        let row = buttons["chat-row.\(botId)"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
        let picker = buttons["header-threads"]
        XCTAssertTrue(picker.waitForExistence(timeout: 10))
        picker.tap()
        let thread = buttons["thread-\(threadId)"]
        XCTAssertTrue(thread.waitForExistence(timeout: 5))
        thread.tap()
    }
}
