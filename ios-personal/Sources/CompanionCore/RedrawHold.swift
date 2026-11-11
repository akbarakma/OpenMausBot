import Foundation

/// Holds a screen's redraws back while something on it is in motion.
///
/// A change to the session redraws every screen that reads it, and on the
/// chat that redraw outlasts a frame: 23 ms against 8.3 on an iPhone 16 Pro
/// Max (Nov 2026). A bot that is streaming changes it twenty times a second,
/// so a scroll under it dropped a frame in four. Changes that arrive during a
/// motion go out as one redraw when the motion ends, or after `maxHold` in a
/// long one.
public final class RedrawHold {
    public enum Motion { case scroll, keyboard }

    private let maxHold: TimeInterval
    private let redraw: () -> Void
    private var motions: Set<Motion> = []
    private var held = false

    public init(maxHold: TimeInterval = 1, redraw: @escaping () -> Void) {
        self.maxHold = maxHold
        self.redraw = redraw
    }

    public func begin(_ motion: Motion) { motions.insert(motion) }

    public func end(_ motion: Motion) {
        motions.remove(motion)
        if motions.isEmpty { flush() }
    }

    public func changed() {
        guard !motions.isEmpty else { return redraw() }
        guard !held else { return }
        held = true
        // A motion whose end never arrives (its view left mid-scroll) must
        // not leave the screens stale.
        DispatchQueue.main.asyncAfter(deadline: .now() + maxHold) { [weak self] in self?.flush() }
    }

    private func flush() {
        guard held else { return }
        held = false
        redraw()
    }
}
