import XCTest
@testable import CompanionCore

final class HomeOrderTests: XCTestCase {
    func testSavedOrderKeepsTheSetOrderAndAppendsNewIdsAtTheEnd() {
        XCTAssertEqual(SavedOrder.apply(["c", "a"], to: ["a", "b", "c", "d"]), ["c", "a", "b", "d"])
    }

    func testSavedOrderDropsIdsThatAreGone() {
        XCTAssertEqual(SavedOrder.apply(["gone", "b", "a"], to: ["a", "b"]), ["b", "a"])
    }

    func testSavedOrderSurvivesItsStoredForm() {
        let ids = ["section:Work", "bots", "groups"]
        XCTAssertEqual(SavedOrder.decode(SavedOrder.encode(ids)), ids)
        XCTAssertEqual(SavedOrder.decode(""), [])
    }

    func testNewestThreadIsTheOneWithTheLatestMessage() {
        var state = CompanionState()
        state.bots = [bot(tasks: [task("main", updatedAt: 10), task("side", updatedAt: 30)])]
        let newest = state.newestThread(of: state.bots[0])
        XCTAssertEqual(newest.threadId, "side")
        XCTAssertEqual(newest.at, 30)
    }

    func testALiveMessageNewerThanTheThreadRecordCounts() {
        var state = CompanionState()
        state.bots = [bot(tasks: [task("main", updatedAt: 10), task("side", updatedAt: 30)])]
        state.apply(.message(threadId: "main", message: Message(id: "m", role: .bot, kind: .text, at: 50)))
        XCTAssertEqual(state.newestThread(of: state.bots[0]).threadId, "main")
    }

    func testArchivedSnoozedAndRoutineThreadsDoNotMoveTheBot() {
        var archived = task("archived", updatedAt: 40)
        archived.archivedAt = 1
        var snoozed = task("snoozed", updatedAt: 50)
        snoozed.snoozedUntil = 0
        var routine = task("routine", updatedAt: 60)
        routine.routineRunId = "run"
        var state = CompanionState()
        state.bots = [bot(tasks: [task("main", updatedAt: 10), archived, snoozed, routine])]
        XCTAssertEqual(state.newestThread(of: state.bots[0]).threadId, "main")
    }

    private func bot(tasks: [BotTask]) -> Bot {
        Bot(
            id: "bot", threadId: "main", name: "Scout", title: "Researcher",
            description: "", notifications: true, color: "green", unread: false,
            modelSelection: ModelSelection(instanceId: "engine", model: "default"), createdAt: 1,
            tasks: tasks
        )
    }

    private func task(_ id: String, updatedAt: Double) -> BotTask {
        var task = BotTask(threadId: id, title: id, createdAt: 1)
        task.updatedAt = updatedAt
        return task
    }
}
