// Where the chat's preferences are stored.
//
// `@AppStorage` rather than an observable object on purpose: the settings
// screen writes these and the chat reads them, and AppStorage already keeps
// both in step through UserDefaults. One place for the key strings is the
// only thing a shared type is needed for.
import Foundation
import SwiftUI
import CompanionCore

enum PrefKey {
    static let islandIntro = "companion.prefs.islandIntro"
    static let islandSeen = "companion.prefs.islandSeen"
    static let activityDetail = "companion.prefs.activityDetail"
    static let quickReplies = "companion.prefs.quickReplies"
    static let language = "companion.prefs.language"
    static let pinnedAtBottom = "companion.prefs.pinnedAtBottom"
    /// One id per line (`SavedOrder`): pinned bot ids, and home section ids.
    static let pinnedOrder = "companion.prefs.pinnedOrder"
    static let sectionOrder = "companion.prefs.sectionOrder"
    static let collapsedSections = "companion.prefs.collapsedSections"
    static let chatBackdrop = "companion.prefs.chatBackdrop"
}

enum PhoneDrafts {
    static let store = ComposerDraftStore(
        root: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("composer-drafts", isDirectory: true)
    )
}

extension ChatBackdrop {
    var color: Color {
        Color(.sRGB, red: red, green: green, blue: blue, opacity: 1)
    }

    var cardColor: Color {
        switch self {
        case .black: Color(uiColor: .secondarySystemGroupedBackground)
        case .ink: Color(.sRGB, red: 30 / 255, green: 33 / 255, blue: 45 / 255, opacity: 1)
        }
    }

    static func screenFill(stored raw: String, scheme: ColorScheme) -> Color {
        guard scheme == .dark else { return Color(uiColor: .systemBackground) }
        return (ChatBackdrop(rawValue: raw) ?? .fallback).color
    }

    static func cardFill(stored raw: String, scheme: ColorScheme) -> Color {
        guard scheme == .dark else { return Color(uiColor: .secondarySystemGroupedBackground) }
        return (ChatBackdrop(rawValue: raw) ?? .fallback).cardColor
    }
}

/// The card that sits one step above the chosen background, for grouped rows and panels.
struct BackdropCard: View {
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage(PrefKey.chatBackdrop) private var raw = ChatBackdrop.fallback.rawValue

    var body: some View {
        ChatBackdrop.cardFill(stored: raw, scheme: colorScheme)
    }
}

extension View {
    /// The chosen dark background behind a screen, including its navigation bar.
    /// A list or form also drops the system black so the color shows through the gaps.
    func screenCanvas() -> some View {
        modifier(ScreenCanvas())
    }

    /// Grouped rows take the card that matches the chosen background.
    func cardRows() -> some View {
        listRowBackground(BackdropCard())
    }
}

private struct ScreenCanvas: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage(PrefKey.chatBackdrop) private var raw = ChatBackdrop.fallback.rawValue

    func body(content: Content) -> some View {
        let dark = colorScheme == .dark
        let fill = dark
            ? ChatBackdrop.screenFill(stored: raw, scheme: colorScheme)
            : Color(uiColor: .systemGroupedBackground)
        content
            .scrollContentBackground(dark ? .hidden : .automatic)
            .background(fill.ignoresSafeArea())
            .toolbarBackground(fill, for: .navigationBar)
            .toolbarBackground(dark ? .visible : .automatic, for: .navigationBar)
    }
}

extension ActivityDetail {
    /// The reader's Activity setting, for code that is not a view and so
    /// cannot hold an `@AppStorage` of its own: Live Activities and the widget
    /// writer read the same line the Updates pill does.
    static var stored: ActivityDetail {
        ActivityDetail(rawValue: UserDefaults.standard.string(forKey: PrefKey.activityDetail) ?? "") ?? .phoneDefault
    }
}

/// The set of chats whose island intro has already played.
///
/// Stored as JSON in the same defaults as everything else rather than in its
/// own store: it is a handful of ids, and a chat that loses its entry simply
/// plays its intro once more.
enum IslandSeen {
    static func contains(_ id: String, in json: String) -> Bool {
        decode(json).contains(id)
    }

    static func adding(_ id: String, to json: String) -> String {
        var seen = decode(json)
        guard seen.insert(id).inserted else { return json }
        guard let data = try? JSONEncoder().encode(seen.sorted()) else { return json }
        return String(decoding: data, as: UTF8.self)
    }

    private static func decode(_ json: String) -> Set<String> {
        guard let data = json.data(using: .utf8),
              let list = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return Set(list)
    }
}
