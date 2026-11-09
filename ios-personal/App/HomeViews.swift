// The pieces of the home list: one row per bot or group, Kara with the
// pinned bots, the account photo and the connection chip.
import SwiftUI
import UIKit
import CompanionCore

/// A bot or group on home: face, name and role on the first line with the
/// time, the latest message on the second.
///
/// Plain values only, shown `.equatable()`, so a row whose chat has not
/// moved is skipped when the session publishes.
struct HomeRow: View, Equatable {
    let chat: Chat
    let members: [Bot]
    let preview: String
    let at: Double
    /// The day the list drew on (`RosterDay.today`): "09:15" must still
    /// become "Yesterday" after midnight.
    let today: Date
    let face: MausState
    let waiting: Bool

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.preview == rhs.preview && lhs.at == rhs.at && lhs.today == rhs.today && lhs.face == rhs.face
            && lhs.waiting == rhs.waiting && lhs.members == rhs.members && sameContent(lhs.chat, rhs.chat)
    }

    /// `Chat`'s own `==` compares identity only; a row draws the whole bot or room.
    private static func sameContent(_ lhs: Chat, _ rhs: Chat) -> Bool {
        switch (lhs, rhs) {
        case let (.bot(left), .bot(right)): return left == right
        case let (.room(left), .room(right)): return left == right
        default: return false
        }
    }

    private var role: String {
        if case let .bot(bot) = chat { return bot.title }
        return ""
    }

    private var isChief: Bool {
        if case let .bot(bot) = chat { return bot.chiefOfStaff == true }
        return false
    }

    var body: some View {
        HStack(spacing: 14) {
            Group {
                if case .room = chat {
                    RoomFaces(members: members, size: 40)
                } else {
                    ChatAvatarView(chat: chat, size: 40, state: face, animated: face.showsActivity)
                }
            }
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(verbatim: chat.name)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.primary)
                        .lineLimit(1)
                        .layoutPriority(1)
                    if isChief { ChiefBadge() }
                    if !role.isEmpty {
                        Text(verbatim: role)
                            .font(.subheadline)
                            .foregroundStyle(Color.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 6)
                    Text(verbatim: RelativeStamp.list(at))
                        .font(.subheadline)
                        .foregroundStyle(Color.secondary)
                        .fixedSize()
                }
                HStack(spacing: 8) {
                    Text(verbatim: preview.isEmpty ? " " : preview)
                        .font(.subheadline)
                        .foregroundStyle(Color.secondary)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if waiting {
                        Image(systemName: "hand.raised.fill")
                            .font(.footnote)
                            .foregroundStyle(MausPalette.color(chat.color))
                            .accessibilityLabel("Waiting on you")
                    }
                    if chat.unread && !chat.busy {
                        Circle()
                            .fill(Color.accentColor)
                            .frame(width: 10, height: 10)
                            .accessibilityLabel("Unread")
                    }
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
        .contentShape(Rectangle())
    }
}

/// Two members' faces in one face's square: the first up and left, the
/// second down and right on a ring of the list's background.
struct RoomFaces: View {
    let members: [Bot]
    let size: CGFloat
    var fallbackColor = "blue"

    var body: some View {
        ZStack {
            if let first = members.first {
                BotAvatarView(bot: first, size: size * 0.74, state: .happy, animated: false)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                MausAvatar(color: fallbackColor, size: size, state: .happy, animated: false)
            }
            if members.count > 1 {
                BotAvatarView(bot: members[1], size: size * 0.62, state: .happy, animated: false)
                    .padding(1.5)
                    .background(Circle().fill(Color(uiColor: .systemBackground)))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .offset(x: 3, y: 3)
            }
        }
        .frame(width: size, height: size)
    }
}

/// The Chief of Staff mark after a bot's name: the desktop's crown.
struct ChiefBadge: View {
    @ScaledMetric(relativeTo: .body) private var size: CGFloat = 12

    var body: some View {
        Image(systemName: "crown.fill")
            .font(.system(size: size))
            .foregroundStyle(Color.accentColor)
            .accessibilityLabel("Chief of Staff")
            .accessibilityIdentifier("chief-badge")
    }
}

/// The day a home render words its stamps on, so a row whose bot has not
/// moved still redraws once the day turns over.
enum RosterDay {
    static var today: Date { Calendar.current.startOfDay(for: Date()) }
}

/// Kara large, her role under her name, and the pinned bots as a row of
/// faces beneath. The same block sits at the top of the list or above the
/// bottom bar.
struct FavoritesBlock: View {
    let chief: Bot?
    let pinned: [Bot]
    let face: (Bot) -> MausState
    let open: (Bot) -> Void
    let menu: (Bot) -> AnyView

    /// More than this many pinned faces scroll sideways instead of shrinking.
    private static let fitting = 4

    var body: some View {
        VStack(spacing: 14) {
            if let chief {
                Button { open(chief) } label: {
                    VStack(spacing: 6) {
                        faceView(chief, size: 76)
                        HStack(spacing: 5) {
                            Text(verbatim: chief.name)
                                .font(.headline)
                                .foregroundStyle(Color.primary)
                            if chief.chiefOfStaff == true { ChiefBadge() }
                        }
                        if !chief.title.isEmpty {
                            Text(verbatim: chief.title)
                                .font(.subheadline)
                                .foregroundStyle(Color.secondary)
                        }
                    }
                    .padding(.horizontal, 24)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .contextMenu { menu(chief) }
                .accessibilityIdentifier("home-chief")
            }
            if !pinned.isEmpty {
                if pinned.count > Self.fitting {
                    ScrollView(.horizontal, showsIndicators: false) {
                        pinnedFaces.padding(.horizontal, 16)
                    }
                } else {
                    pinnedFaces.frame(maxWidth: .infinity)
                }
            }
        }
    }

    private var pinnedFaces: some View {
        HStack(spacing: 14) {
            ForEach(pinned) { bot in
                Button { open(bot) } label: {
                    VStack(spacing: 5) {
                        faceView(bot, size: 52)
                        Text(verbatim: bot.name)
                            .font(.caption)
                            .foregroundStyle(Color.primary)
                            .lineLimit(1)
                    }
                    .frame(width: 66)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .contextMenu { menu(bot) }
                .accessibilityIdentifier("pinned.\(bot.id)")
            }
        }
    }

    private func faceView(_ bot: Bot, size: CGFloat) -> some View {
        let state = face(bot)
        return BotAvatarView(bot: bot, size: size, state: state, animated: state.showsActivity)
            .overlay(alignment: .topTrailing) {
                if bot.unread == true && bot.busy != true {
                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 12, height: 12)
                        .overlay(Circle().stroke(Color(uiColor: .systemBackground), lineWidth: 2))
                }
            }
    }
}

/// The person's profile picture from the paired computer's Settings ›
/// Profile, or their initial while it loads or when none is set.
struct AccountPhoto: View {
    @EnvironmentObject private var session: Session
    let size: CGFloat
    @State private var name = ""
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            } else {
                ProfileAvatar(name: name.isEmpty ? (session.connection?.name ?? "You") : name, size: size)
            }
        }
        .task(id: session.connection?.id) {
            guard let profile = await session.configStatus()?.profile else { return }
            name = profile.name
            guard let path = profile.avatarUrl, !path.isEmpty,
                  let data = await session.avatarData(path: path) else { return }
            image = UIImage(data: data)
        }
    }
}

/// The connection, shown only when it is not fine, in the title row so the
/// list below it never moves.
struct ConnectionChip: View {
    let status: Session.Status

    var body: some View {
        switch status {
        case .live, .unpaired:
            EmptyView()
        case .connecting:
            chip(Text("Connecting…"), systemImage: "arrow.triangle.2.circlepath", tint: .secondary)
        case let .offline(reason):
            chip(Text(verbatim: reason), systemImage: "wifi.slash", tint: .orange)
        case .unauthorized:
            chip(Text("Unpaired"), systemImage: "lock.slash", tint: .red)
        }
    }

    private func chip(_ text: Text, systemImage: String, tint: Color) -> some View {
        Label { text } icon: { Image(systemName: systemImage) }
            .font(.footnote)
            .lineLimit(1)
            .foregroundStyle(tint)
            .padding(.horizontal, 11)
            .padding(.vertical, 6)
            .glassCapsule(interactive: false)
            .accessibilityIdentifier("connection-chip")
    }
}

extension Session {
    /// A new thread started from a home menu. A failure always says
    /// something, even when the client had no error.
    func createRosterThread(for bot: Bot) async -> Bot? {
        if let created = await createTask(for: bot, title: nil) { return created }
        if actionError == nil {
            actionError = "Couldn't create a thread. Check the connection and try again."
        }
        return nil
    }
}
