import SwiftUI

/// A transcript row in a view graph of its own.
///
/// SwiftUI walks every attribute under a scroll view on each scrolled frame.
/// Fifty markdown rows in the chat's own graph made that walk 6 ms of an
/// 8.3 ms frame on an iPhone 16 Pro Max; behind a hosting controller each it
/// is 2 ms, because moving a hosted view never enters its graph (Nov 2026).
/// Every row is still built up front, so nothing is created mid-scroll the
/// way a lazy stack would.
struct IsolatedRow<Content: View & Equatable>: View, Equatable {
    let content: Content

    var body: some View { RowHost(content: content) }
}

private struct RowHost<Content: View>: UIViewControllerRepresentable {
    let content: Content

    func makeUIViewController(context: Context) -> UIHostingController<RowRoot<Content>> {
        let host = UIHostingController(rootView: root(context))
        host.view.backgroundColor = .clear
        // The transcript already keeps its rows clear of the bars and the
        // keyboard; a row that avoided them too would shrink under both.
        host.safeAreaRegions = []
        host.sizingOptions = [.intrinsicContentSize]
        return host
    }

    func updateUIViewController(_ host: UIHostingController<RowRoot<Content>>, context: Context) {
        host.rootView = root(context)
    }

    func sizeThatFits(
        _ proposal: ProposedViewSize, uiViewController host: UIHostingController<RowRoot<Content>>, context: Context
    ) -> CGSize? {
        guard let width = proposal.width, width.isFinite, width > 0 else { return nil }
        let fitted = host.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: fitted.height)
    }

    private func root(_ context: Context) -> RowRoot<Content> {
        RowRoot(content: content, locale: context.environment.locale, scenePhase: context.environment.scenePhase)
    }
}

/// A hosting controller starts a fresh environment: UIKit traits cross over
/// (colour scheme, text size), values set in SwiftUI do not. The two a row
/// reads are handed across: the app's language, and the scene phase that
/// clears a credential card's field when the app leaves the screen. A row
/// that comes to read another one has to add it here, or it sees the default.
private struct RowRoot<Content: View>: View {
    let content: Content
    let locale: Locale
    let scenePhase: ScenePhase

    var body: some View {
        content
            .environment(\.locale, locale)
            .environment(\.scenePhase, scenePhase)
    }
}
