import CoreGraphics
import Foundation

/// How far a left drag on a transcript has gone, and whether it has become a reply.
///
/// The first part of the drag reveals the clock. A drag that started on a
/// replyable bubble and crosses `replyDistance` arms a reply. Letting go
/// before that line, or dragging back under it, does not reply.
public struct TranscriptPeek: Equatable, Sendable {
    public static let timeDistance: CGFloat = 64
    public static let replyDistance: CGFloat = 112

    public var travel: CGFloat
    public var grabbedId: String?
    public var armed: Bool

    public static let idle = TranscriptPeek(travel: 0, grabbedId: nil, armed: false)

    /// A leftward drag, clearly more horizontal than vertical.
    public static func shouldBegin(velocityX: CGFloat, velocityY: CGFloat) -> Bool {
        velocityX < -40 && abs(velocityX) > abs(velocityY)
    }

    /// `translationX` is the finger's movement since the drag began. Negative is left.
    /// `grabbedId` is the replyable bubble under the finger when the drag began.
    public func dragged(translationX: CGFloat, grabbedId: String?) -> (peek: TranscriptPeek, tick: Bool) {
        let pull = max(0, -translationX)
        let cap = grabbedId == nil ? Self.timeDistance : Self.replyDistance
        let travel = min(pull, cap)
        let armed = grabbedId != nil && travel >= Self.replyDistance
        let tick = armed && !self.armed
        return (TranscriptPeek(travel: travel, grabbedId: grabbedId, armed: armed), tick)
    }

    /// `commit` is false when the system cancels the touch.
    public func ended(commit: Bool) -> (peek: TranscriptPeek, commitId: String?) {
        let id = commit && armed ? grabbedId : nil
        return (.idle, id)
    }

    public func shift(grabbed: Bool) -> CGFloat {
        grabbed ? travel : min(travel, Self.timeDistance)
    }

    public var timeOpacity: CGFloat {
        min(1, travel / 28)
    }

    public func replyOpacity(grabbed: Bool) -> CGFloat {
        guard grabbed else { return 0 }
        let span = Self.replyDistance - Self.timeDistance
        return min(1, max(0, travel - Self.timeDistance) / span)
    }
}

/// Where to put the scroll offset after rows are inserted above it.
///
/// A top-aligned scroll view keeps offset 0 on the new top, so the reader
/// jumps. The added height has to be added to the offset they already had.
public enum PrependHold {
    public static func offset(
        baselineHeight: CGFloat,
        baselineOffset: CGFloat,
        height: CGFloat,
        offset: CGFloat
    ) -> CGFloat? {
        let delta = height - baselineHeight
        guard delta > 0.5 else { return nil }
        let expected = baselineOffset + delta
        guard abs(offset - expected) > 1 else { return nil }
        return expected
    }
}
