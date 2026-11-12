import CompanionCore
import SwiftUI
import UIKit

/// Shared by the transcript rows. ChatView holds this in `@State` and does not
/// observe it, so a drag redraws the rows and not the rest of the screen.
final class TranscriptScrollBox {
    let model = TranscriptScrollModel()
}

final class TranscriptScrollModel: ObservableObject {
    @Published private(set) var peek = TranscriptPeek.idle
    var onCommit: ((String) -> Void)?
    fileprivate weak var scrollView: UIScrollView?
    private var hold: (height: CGFloat, offset: CGFloat)?
    private var holding = false
    private var holdToken = 0
    private var stableMatches = 0

    func captureHold() {
        guard let scrollView else { return }
        holdToken += 1
        hold = (scrollView.contentSize.height, scrollView.contentOffset.y)
        holding = true
        correctHold()
    }

    func finishHold() {
        let token = holdToken
        stableMatches = 0
        correctHold()
        // Layout lands after the state update, and one later pass can put the
        // offset back on the new top. Stop once that has stayed put, so a
        // finger moving to read the new rows is not pulled back.
        func again(_ attempt: Int) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { [weak self] in
                guard let self, self.holdToken == token, self.holding else { return }
                self.correctHold()
                if self.holdIsSettled { self.stableMatches += 1 } else { self.stableMatches = 0 }
                if self.stableMatches >= 3 || attempt >= 40 {
                    self.holding = false
                    self.hold = nil
                } else {
                    again(attempt + 1)
                }
            }
        }
        again(0)
    }

    private var holdIsSettled: Bool {
        guard let scrollView, let hold else { return false }
        let delta = scrollView.contentSize.height - hold.height
        guard delta > 0.5 else { return false }
        return abs(scrollView.contentOffset.y - (hold.offset + delta)) <= 1
    }

    fileprivate func correctHold() {
        guard holding, let scrollView, let hold else { return }
        guard let y = PrependHold.offset(
            baselineHeight: hold.height,
            baselineOffset: hold.offset,
            height: scrollView.contentSize.height,
            offset: scrollView.contentOffset.y
        ) else { return }
        scrollView.contentOffset.y = y
    }

    fileprivate func dragChanged(translation: CGPoint, grabbedId: String?) {
        let moved = peek.dragged(translationX: translation.x, grabbedId: grabbedId)
        peek = moved.peek
        if moved.tick { Haptics.selection() }
    }

    fileprivate func dragEnded(commit: Bool) {
        let ended = peek.ended(commit: commit)
        peek = ended.peek
        if let id = ended.commitId { onCommit?(id) }
    }
}

/// Finds the transcript's scroll view, claims a left drag, and keeps the
/// offset still while older rows are inserted above it.
struct TranscriptScrollBridge: UIViewRepresentable {
    let model: TranscriptScrollModel
    let onCommit: (String) -> Void

    func makeUIView(context: Context) -> BridgeView {
        let view = BridgeView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ view: BridgeView, context: Context) {
        model.onCommit = onCommit
        view.onMove = { [weak view] in
            guard let view else { return }
            context.coordinator.attach(from: view, model: model)
        }
        context.coordinator.attach(from: view, model: model)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class BridgeView: UIView {
        var onMove: (() -> Void)?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            onMove?()
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        private var observation: NSKeyValueObservation?
        private weak var model: TranscriptScrollModel?
        private weak var scrollView: UIScrollView?
        private var grabbedId: String?

        deinit {
            if let scrollView, let pan = scrollView.gestureRecognizers?.first(where: { $0.name == Self.gestureName }) {
                scrollView.removeGestureRecognizer(pan)
            }
        }

        func attach(from view: UIView, model: TranscriptScrollModel) {
            guard let scrollView = enclosingScrollView(from: view) else { return }
            self.model = model
            self.scrollView = scrollView
            model.scrollView = scrollView
            if scrollView.gestureRecognizers?.contains(where: { $0.name == Self.gestureName }) != true {
                let pan = UIPanGestureRecognizer(target: self, action: #selector(pan(_:)))
                pan.name = Self.gestureName
                pan.delegate = self
                // The scroll pan waits until this fails. shouldBegin refuses
                // anything that is not a leftward swipe, so a vertical drag
                // fails at once and the scroll proceeds.
                scrollView.addGestureRecognizer(pan)
                scrollView.panGestureRecognizer.require(toFail: pan)
            }
            if observation == nil {
                observation = scrollView.observe(\.contentSize, options: [.new]) { [weak self] _, _ in
                    DispatchQueue.main.async { self?.model?.correctHold() }
                }
            }
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let pan = gestureRecognizer as? UIPanGestureRecognizer, let view = pan.view else { return false }
            let velocity = pan.velocity(in: view)
            guard TranscriptPeek.shouldBegin(velocityX: velocity.x, velocityY: velocity.y) else { return false }
            let point = pan.location(in: view)
            grabbedId = Self.anchor(in: view, at: point)?.messageId
            return true
        }

        @objc private func pan(_ pan: UIPanGestureRecognizer) {
            guard let view = pan.view, let model else { return }
            let translation = pan.translation(in: view)
            switch pan.state {
            case .changed:
                model.dragChanged(translation: translation, grabbedId: grabbedId)
            case .ended:
                model.dragEnded(commit: true)
                grabbedId = nil
            case .cancelled, .failed:
                model.dragEnded(commit: false)
                grabbedId = nil
            default:
                break
            }
        }

        private func enclosingScrollView(from view: UIView) -> UIScrollView? {
            var current: UIView? = view
            while let node = current {
                if let scrollView = node as? UIScrollView, scrollView.bounds.height >= scrollView.bounds.width {
                    return scrollView
                }
                current = node.superview
            }
            var root: UIView? = view
            while let parent = root?.superview { root = parent }
            return Self.largestVerticalScroll(in: root)
        }

        private static func largestVerticalScroll(in view: UIView?) -> UIScrollView? {
            guard let view else { return nil }
            var best: UIScrollView?
            func walk(_ node: UIView) {
                if let scrollView = node as? UIScrollView,
                   scrollView.bounds.height >= scrollView.bounds.width,
                   best == nil || scrollView.bounds.height > best!.bounds.height {
                    best = scrollView
                }
                for subview in node.subviews { walk(subview) }
            }
            walk(view)
            return best
        }

        private static let gestureName = "omb.transcriptPeek"

        private static func anchor(in root: UIView, at point: CGPoint) -> PeekAnchorView? {
            func search(_ view: UIView) -> PeekAnchorView? {
                let local = view.convert(point, from: root)
                guard !view.isHidden, view.alpha > 0.01, view.bounds.contains(local) else { return nil }
                for subview in view.subviews.reversed() {
                    if let found = search(subview) { return found }
                }
                return view as? PeekAnchorView
            }
            return search(root)
        }
    }
}

/// A clear view behind a replyable bubble so a left drag can tell what it started on.
struct PeekAnchor: UIViewRepresentable {
    let messageId: String

    func makeUIView(context: Context) -> PeekAnchorView {
        let view = PeekAnchorView()
        view.messageId = messageId
        return view
    }

    func updateUIView(_ view: PeekAnchorView, context: Context) {
        view.messageId = messageId
    }
}

final class PeekAnchorView: UIView {
    var messageId = ""

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        isAccessibilityElement = false
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        isUserInteractionEnabled = false
        backgroundColor = .clear
    }
}

/// Slides one row left and brings its clock in from the right.
struct PeekSlide<Content: View>: View {
    @ObservedObject var model: TranscriptScrollModel
    let date: Date
    let messageIds: Set<String>
    let content: Content

    init(model: TranscriptScrollModel, date: Date, messageIds: Set<String>, @ViewBuilder content: () -> Content) {
        self.model = model
        self.date = date
        self.messageIds = messageIds
        self.content = content()
    }

    var body: some View {
        let grabbed = messageIds.contains(model.peek.grabbedId ?? "")
        let shift = model.peek.shift(grabbed: grabbed)
        ZStack(alignment: .trailing) {
            content.offset(x: -shift)
            HStack(spacing: 8) {
                Image(systemName: "arrowshape.turn.up.left.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.secondary)
                    .opacity(model.peek.replyOpacity(grabbed: grabbed))
                    .accessibilityHidden(true)
                Text(date.formatted(date: .omitted, time: .shortened))
                    .font(.caption)
                    .foregroundStyle(Color.secondary)
                    .opacity(model.peek.timeOpacity)
                    .accessibilityHidden(true)
            }
            .padding(.trailing, 4)
            .offset(x: TranscriptPeek.timeDistance - min(shift, TranscriptPeek.timeDistance))
            .allowsHitTesting(false)
        }
    }
}
