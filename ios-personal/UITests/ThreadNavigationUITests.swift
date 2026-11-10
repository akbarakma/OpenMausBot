import XCTest

/// Runs exclusively against the bundled ThreadPreview fleet. No account,
/// paired computer, message sends, or server mutations are involved.
final class ThreadNavigationUITests: XCTestCase {
    @MainActor
    func testHomeRowOpensTheBotsNewestThread() {
        let app = launchPreview()
        // Plan weekend has Pepper's latest message; the routine run is newer
        // but is not a thread the person keeps.
        app.buttons["chat-row.preview-pepper"].tap()
        assertThread("Plan weekend", in: app)
        recordScreenshot("Home row opened Pepper's newest thread", in: app)
    }

    @MainActor
    func testSettingsOpenThreadsWithIslandIntroEnabledAndSwitches() {
        let app = launchPreview(islandIntro: "always")
        openGmail(in: app)

        app.openThreadList()
        let iCloud = app.buttons["thread-preview-icloud"]
        XCTAssertTrue(iCloud.waitForExistence(timeout: 5))
        recordScreenshot("Top bar opens the thread picker", in: app)
        iCloud.tap()
        assertThread("Triage iCloud", in: app)
        XCTAssertTrue(transcriptContains("I am reviewing iCloud here", in: app))

        app.openThreadList()
        let weekend = app.buttons["thread-preview-weekend"]
        XCTAssertTrue(weekend.waitForExistence(timeout: 5))
        weekend.tap()
        assertThread("Plan weekend", in: app)
        XCTAssertFalse(transcriptContains("I am reviewing iCloud here", in: app))
    }

    @MainActor
    func testThreadPickerShowsStatesAndSwitchesLocally() {
        let app = launchPreview()
        openGmail(in: app)
        XCTAssertTrue(transcriptContains("I’m reviewing Gmail here", in: app))

        app.openThreadList()
        let iCloud = app.buttons["thread-preview-icloud"]
        XCTAssertTrue(iCloud.waitForExistence(timeout: 5))
        XCTAssertTrue(iCloud.label.contains("Unread"))
        XCTAssertTrue(app.buttons["thread-preview-weekend"].label.contains("Queued"))
        XCTAssertFalse(app.buttons["thread-preview-routine"].exists)
        recordScreenshot("Thread picker with folder and runtime states", in: app)
        iCloud.tap()
        assertThread("Triage iCloud", in: app)
        XCTAssertTrue(transcriptContains("I am reviewing iCloud here", in: app))
        XCTAssertFalse(transcriptContains("I’m reviewing Gmail here", in: app))
    }

    @MainActor
    func testGmailRendersATableAndTasks() {
        let app = launchPreview()
        openGmail(in: app)
        let wide = String(repeating: "W", count: 80)

        let grid = app.descendants(matching: .any)["message-preview-gmail-grid"]
        XCTAssertTrue(grid.waitForExistence(timeout: 5))
        func cell(_ label: String) -> XCUIElement {
            grid.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
        }
        let labels = ["Alpha", "Beta", "one", wide]
        for label in labels {
            XCTAssertTrue(cell(label).waitForExistence(timeout: 5), label)
        }
        let alpha = cell("Alpha")
        let beta = cell("Beta")
        let one = cell("one")
        let token = cell(wide)
        XCTAssertEqual(alpha.frame.midY, beta.frame.midY, accuracy: 1)
        XCTAssertEqual(one.frame.midY, token.frame.midY, accuracy: 1)
        XCTAssertGreaterThan(one.frame.midY, alpha.frame.midY)
        XCTAssertEqual(alpha.frame.width, one.frame.width, accuracy: 1)
        XCTAssertEqual(beta.frame.width, token.frame.width, accuracy: 1)
        XCTAssertEqual(token.frame.height, one.frame.height, accuracy: 1)
        let cellIds = [
            "message-preview-gmail-grid-scroll-cell-0-0",
            "message-preview-gmail-grid-scroll-cell-0-1",
            "message-preview-gmail-grid-scroll-cell-1-0",
            "message-preview-gmail-grid-scroll-cell-1-1",
        ]
        let identified = cellIds.map { grid.descendants(matching: .any)[$0] }
        for (element, label) in zip(identified, labels) {
            XCTAssertTrue(element.waitForExistence(timeout: 5))
            XCTAssertEqual(element.label, label)
        }
        let order = identified.map(\.label)
        XCTAssertEqual(order, labels)
        func absent(_ label: String, in element: XCUIElement) {
            let match = element.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", label)).firstMatch
            XCTAssertFalse(match.exists, label)
        }
        absent("DATA TABLE", in: grid)
        absent("Copy CSV", in: grid)
        absent("rows", in: grid)
        absent("| --- | --- |", in: grid)

        let scroll = app.descendants(matching: .any)["message-preview-gmail-grid-scroll"]
        XCTAssertTrue(scroll.waitForExistence(timeout: 5))
        let before = token.frame.origin.x
        token.swipeLeft()
        XCTAssertLessThan(token.frame.origin.x, before)

        let tasks = app.descendants(matching: .any)["message-preview-gmail-tasks"]
        XCTAssertTrue(tasks.waitForExistence(timeout: 5))
        XCTAssertTrue(tasks.descendants(matching: .any)["Quant baskets"].waitForExistence(timeout: 5))
        XCTAssertTrue(tasks.staticTexts["1."].exists)
        XCTAssertTrue(tasks.descendants(matching: .any)["completed, Ship the notes"].exists)
        XCTAssertFalse(tasks.buttons["completed, Ship the notes"].exists)
        XCTAssertTrue(tasks.descendants(matching: .any)["not completed, waiting"].exists)
        XCTAssertFalse(tasks.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "**")).firstMatch.exists)
        XCTAssertFalse(tasks.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "[x] Ship the notes")).firstMatch.exists)

        let mine = app.descendants(matching: .any)["message-preview-gmail-user-md"]
        XCTAssertTrue(mine.waitForExistence(timeout: 5))
        XCTAssertTrue(mine.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "| --- | --- |")).firstMatch.exists)
        XCTAssertTrue(mine.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "[x] done")).firstMatch.exists)
        recordScreenshot("Gmail table and task list", in: app)
    }

    @MainActor
    func testHomeSearchFindsABotByItsThreadTitle() {
        let app = launchPreview()
        app.buttons["open-search"].tap()
        let search = app.textFields["Search bots"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("iCloud")
        recordScreenshot("Home search for iCloud", in: app)
        XCTAssertTrue(app.buttons["chat-row.preview-pepper"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testSwitchingThreadsKeepsSeparateUnsentDrafts() {
        let app = launchPreview()
        openGmail(in: app)
        let input = app.descendants(matching: .any).matching(identifier: "message-input").firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        input.typeText("Gmail draft only")

        selectThread("preview-icloud", title: "Triage iCloud", in: app)
        XCTAssertNotEqual(input.value as? String, "Gmail draft only")
        input.tap()
        input.typeText("iCloud draft only")

        selectThread("preview-gmail", title: "Triage Gmail", in: app)
        XCTAssertEqual(input.value as? String, "Gmail draft only")
        selectThread("preview-icloud", title: "Triage iCloud", in: app)
        XCTAssertEqual(input.value as? String, "iCloud draft only")
        recordScreenshot("Restored iCloud draft after switching threads", in: app)
    }

    @MainActor
    func testFailedCreationKeepsThreadPickerOpenWithError() {
        let app = launchPreview()
        openGmail(in: app)
        app.openThreadList()
        let create = app.buttons["new-thread"]
        XCTAssertTrue(create.waitForExistence(timeout: 5))
        // The preview deliberately has no API client, so this cannot write
        // anywhere and exercises the failure path deterministically.
        create.tap()
        let error = app.descendants(matching: .any).matching(identifier: "thread-action-error").firstMatch
        XCTAssertTrue(error.waitForExistence(timeout: 5))
        XCTAssertTrue(error.label.contains("Couldn't create the thread"))
        XCTAssertTrue(create.exists)
        XCTAssertTrue(create.isEnabled)
        XCTAssertTrue(app.buttons["thread-preview-gmail"].exists)
        recordScreenshot("Failed creation keeps thread picker open", in: app)
        app.buttons["Done"].tap()
        assertThread("Triage Gmail", in: app)
    }

    @MainActor
    func testUpdatesKeepSiblingThreadsSeparate() {
        let app = launchPreview()
        app.buttons["updates-button"].tap()
        let gmail = app.buttons["update-preview-gmail"]
        let iCloud = app.buttons["update-preview-icloud"]
        let weekend = app.buttons["update-preview-weekend"]
        XCTAssertTrue(gmail.waitForExistence(timeout: 5))
        XCTAssertTrue(iCloud.exists)
        XCTAssertTrue(weekend.exists)
        XCTAssertTrue(gmail.label.contains("Triage Gmail"))
        XCTAssertTrue(iCloud.label.contains("Triage iCloud"))
        XCTAssertTrue(weekend.label.contains("Plan weekend"))
        XCTAssertFalse(app.buttons["update-preview-routine"].exists)
        XCTAssertTrue(app.staticTexts["3 active"].exists)
        if !iCloud.isHittable { app.swipeUp() }
        recordScreenshot("Separate updates for sibling threads", in: app)
        iCloud.tap()
        assertThread("Triage iCloud", in: app)
    }

    @MainActor
    func testBulkDeletionKeepsCurrentAndWorkingThread() {
        let app = launchPreview(extraArguments: ["-threads-preview-deletion"])
        openGmail(in: app)
        app.openThreadList()
        app.buttons["select-threads"].tap()

        XCTAssertFalse(app.buttons["select-thread-preview-gmail"].isEnabled)
        XCTAssertFalse(app.buttons["select-thread-preview-routine"].exists)
        app.buttons["select-all-threads"].tap()
        XCTAssertTrue(app.buttons["delete-selected-threads"].label.contains("2"))
        app.buttons["delete-selected-threads"].tap()
        let confirmation = app.buttons["Delete 2 threads"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 5))
        recordScreenshot("Bulk delete confirmation with count", in: app)
        confirmation.tap()

        assertMissing(app.buttons["select-thread-preview-icloud"])
        assertMissing(app.buttons["select-thread-preview-weekend"])
        XCTAssertTrue(app.buttons["thread-preview-gmail"].waitForExistence(timeout: 5))
        app.buttons["Done"].tap()
        assertThread("Triage Gmail", in: app)
        XCTAssertTrue(transcriptContains("I’m reviewing Gmail here", in: app))
        app.buttons["Back"].tap()
        XCTAssertTrue(app.buttons["chat-row.preview-pepper"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testBulkDeletionStopsOnFailureAndKeepsRemainingSelection() {
        let app = launchPreview(extraArguments: [
            "-threads-preview-deletion", "-threads-preview-deletion-fails-weekend"
        ])
        openGmail(in: app)
        app.openThreadList()
        app.buttons["select-threads"].tap()
        app.buttons["select-all-threads"].tap()
        app.buttons["delete-selected-threads"].tap()
        let confirmation = app.buttons["Delete 2 threads"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 5))
        confirmation.tap()

        let error = app.descendants(matching: .any).matching(identifier: "thread-action-error").firstMatch
        XCTAssertTrue(error.waitForExistence(timeout: 5))
        XCTAssertTrue(error.label.contains("Deleted 1 of 2 threads"))
        XCTAssertTrue(error.label.contains("Synthetic deletion failure"))
        assertMissing(app.buttons["select-thread-preview-icloud"])
        let remaining = app.buttons["select-thread-preview-weekend"]
        XCTAssertTrue(remaining.exists)
        XCTAssertTrue(remaining.label.contains("Deselect"))
        XCTAssertTrue(app.buttons["delete-selected-threads"].label.contains("1"))
        recordScreenshot("Partial bulk deletion keeps the remaining thread selected", in: app)
    }

    @MainActor
    private func launchPreview(
        extraArguments: [String] = [], islandIntro: String = "never"
    ) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        // Xcode may prelaunch the app after installing an updated build.
        // Restart it so Session initializes with the offline fixture flags.
        app.terminate()
        app.launchArguments = [
            "-store-preview", "-threads-preview",
            "-AppleLanguages", "(en)", "-AppleLocale", "en_US",
            "-companion.prefs.islandIntro", islandIntro, "-companion.prefs.collapsedSections", "",
            "-companion.onboarding.welcomeSeen", "YES",
            "-companion.onboarding.notificationsSeen", "YES"
        ] + extraArguments
        app.launch()
        // Simulator installation can restore an unpaired, prewarmed scene
        // without the preview arguments once. Restart only that wrong route;
        // a missing thread in an already-loaded fixture must still fail.
        if app.buttons["Connect computer"].exists {
            app.terminate()
            app.launch()
        }
        XCTAssertTrue(app.buttons["chat-row.preview-pepper"].waitForExistence(timeout: 10))
        return app
    }

    /// Home opens Pepper on its newest thread; Gmail is one switch away.
    @MainActor
    private func openGmail(in app: XCUIApplication) {
        app.buttons["chat-row.preview-pepper"].tap()
        assertThread("Plan weekend", in: app)
        selectThread("preview-gmail", title: "Triage Gmail", in: app)
    }

    @MainActor
    private func selectThread(_ id: String, title: String, in app: XCUIApplication) {
        app.openThreadList()
        let row = app.buttons["thread-\(id)"]
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.tap()
        assertThread(title, in: app)
    }

    @MainActor
    private func assertThread(_ title: String, in app: XCUIApplication) {
        let header = app.buttons["header-profile"]
        let expected = NSPredicate(format: "value == %@", title)
        let appeared = XCTNSPredicateExpectation(predicate: expected, object: header)
        // Thread headers settle late on a loaded CI runner; 5s timed out on
        // PRs 1576 and 1615 while the switch itself was correct.
        XCTAssertEqual(XCTWaiter.wait(for: [appeared], timeout: 10), .completed)
    }

    @MainActor
    private func transcriptContains(_ text: String, in app: XCUIApplication) -> Bool {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch.exists
    }

    @MainActor
    private func assertMissing(_ element: XCUIElement) {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: element
        )
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 5), .completed)
    }

    @MainActor
    private func recordScreenshot(_ name: String, in app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
