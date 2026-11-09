import Foundation

/// An order the person set on this phone, applied to what exists now.
public enum SavedOrder {
    /// `present` in `saved`'s order. An id `saved` does not know yet goes
    /// after the known ones, in `present`'s order; a saved id that is gone
    /// drops out.
    public static func apply(_ saved: [String], to present: [String]) -> [String] {
        let presentSet = Set(present)
        var seen = Set<String>()
        let known = saved.filter { presentSet.contains($0) && seen.insert($0).inserted }
        return known + present.filter { !seen.contains($0) }
    }

    /// The stored form: one id per line.
    public static func decode(_ stored: String) -> [String] {
        stored.split(separator: "\n").map(String.init)
    }

    public static func encode(_ ids: [String]) -> String {
        ids.joined(separator: "\n")
    }
}

extension CompanionState {
    /// The bot's thread with the latest message, and when that was. Home
    /// sorts bots by it and opens the bot there. Archived and snoozed
    /// threads, and routine runs the thread list hides, do not count.
    public func newestThread(of bot: Bot, now: Date = Date()) -> (threadId: String, at: Double) {
        var best = (threadId: bot.threadId, at: lastVisibleMessage(forThread: bot.threadId)?.at ?? 0)
        for task in bot.tasks ?? [] where !task.isArchived && !task.isSnoozed(now: now) && task.routineRunId == nil {
            let at = max(task.updatedAt ?? task.createdAt, lastVisibleMessage(forThread: task.threadId)?.at ?? 0)
            if at > best.at { best = (task.threadId, at) }
        }
        return best
    }
}
