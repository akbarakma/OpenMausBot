// Home: a large title with the account photo, Kara and the pinned bots,
// the bots and groups by section, and a bottom bar with Updates and search.
//
// Kara and the pinned bots form one block. "Pinned at the bottom" in
// Settings moves that block from the top of the list to just above the
// bottom bar, where a thumb reaches it.
import SwiftUI
import CompanionCore

struct ChatListView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage(PrefKey.chatBackdrop) private var chatBackdropRaw = ChatBackdrop.fallback.rawValue
    @State private var query = ""
    @AppStorage(PrefKey.activityDetail) private var activityDetail = ActivityDetail.phoneDefault.rawValue
    @AppStorage(PrefKey.collapsedSections) private var collapsedSections = ""
    @AppStorage(PrefKey.pinnedAtBottom) private var pinnedAtBottom = false
    @AppStorage(PrefKey.pinnedOrder) private var pinnedOrder = ""
    @AppStorage(PrefKey.sectionOrder) private var sectionOrder = ""
    @State private var reordering = false
    @State private var today = RosterDay.today
    /// Driven so a notification or a deep link can open a chat without a tap.
    @State private var path = NavigationPath()
    @State private var searchHits: [SearchHit] = []
    @State private var searching = false
    @State private var searchOpen = false
    @State private var showingUpdates = false
    @State private var creatingThreads = Set<String>()
    @State private var managingThreads: Chat?
    /// The preview lines, folded again only for a thread that changed.
    /// Filled while rendering: a cache, not something any view observes.
    @State private var previewCache = RosterPreviewCache()
    /// Working bots' faces: six move at once.
    @State private var motionBudget = MascotMotionBudget(limit: 6)
    @FocusState private var searchFocused: Bool

    private var homeFill: Color {
        ChatBackdrop.screenFill(stored: chatBackdropRaw, scheme: colorScheme)
    }

    var body: some View {
        // Read once per render: the island, the pill and every row's hand
        // start from the same approvals.
        let approvals = session.state.pendingApprovals
        let updates = session.state.updates(detail: activity, pendingApprovals: approvals)
        let waiting = waitingChats(approvals)
        let summaries = rosterSummaries()
        let matches = query.isEmpty ? [] : searchMatches(summaries)
        NavigationStack(path: $path) {
            // With the navigation bar hidden, a bare ScrollView here gets no
            // top safe-area inset and the title slides under the status bar.
            GeometryReader { _ in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    header
                    if query.isEmpty {
                        if !pinnedAtBottom {
                            favorites.padding(.top, 8).padding(.bottom, 6)
                        }
                        sections(summaries, waiting: waiting)
                    } else {
                        searchResults(matches, waiting: waiting)
                    }
                }
                .padding(.bottom, 16)
            }
            .environment(\.mascotMotionBudget, motionBudget)
            .refreshable { await session.refresh() }
            .scrollContentBackground(.hidden)
            .accessibilityIdentifier("roster-list")
            .overlay {
                if rosterIsEmpty(matches: matches) {
                    EmptyStateView(
                        query.isEmpty ? "No bots yet" : "Nothing matches",
                        systemImage: query.isEmpty ? "bubble.left.and.bubble.right" : "magnifyingglass",
                        description: Text(
                            query.isEmpty
                                ? "Bots you create on your computer show up here."
                                : "No bot matches \u{201C}\(query)\u{201D}."
                        )
                    )
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { bottomArea(updates: updates) }
            }
            .frame(maxWidth: CompanionLayout.rosterWidth, maxHeight: .infinity, alignment: .top)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background { homeFill.ignoresSafeArea() }
            // a bot that stopped for you grows out of the island
            .overlay(alignment: .top) {
                if CompanionLayout.supportsIslandPresentation {
                    NeedsYouIsland(update: updates.first { $0.kind == .needsYou }) { chat in path.append(chat) }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged).receive(on: RunLoop.main)) { _ in
                today = RosterDay.today
            }
            .navigationDestination(for: Chat.self) { ChatView(chat: $0) }
            .onValueChange(of: session.notificationChat) { chat in
                guard let chat else { return }
                path.append(chat)
                session.consumeNotificationChat()
            }
            .onValueChange(of: session.pendingChat) { chat in
                guard let chat else { return }
                path.append(chat)
                session.consumePendingChat()
            }
            .task {
                if let chat = session.notificationChat {
                    path.append(chat)
                    session.consumeNotificationChat()
                }
                if let chat = session.pendingChat {
                    path.append(chat)
                    session.consumePendingChat()
                }
            }
#if DEBUG
            // Lets the screenshot harness reach a chat without a tap.
            .task {
                if ProcessInfo.processInfo.arguments.contains("-open-first"),
                   path.isEmpty, let first = summaries.first {
                    path.append(first.chat)
                }
            }
#endif
            .sheet(isPresented: $showingUpdates) {
                UpdatesSheet { chat in
                    showingUpdates = false
                    path.append(chat)
                }
            }
            .sheet(isPresented: $reordering) {
                reorderSheet(homeSections(summaries))
            }
            .sheet(item: $managingThreads) { chat in
                TaskManagerView(chat: chat) { threadId in
                    guard let bot = session.state.bot(forThread: threadId) else { return }
                    managingThreads = nil
                    path.append(Chat.bot(bot))
                }
            }
            .task(id: query) {
                let expected = query
                guard expected.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 else {
                    searchHits = []
                    searching = false
                    return
                }
                searching = true
                defer {
                    if query == expected { searching = false }
                }
                try? await Task.sleep(for: .milliseconds(250))
                guard !Task.isCancelled, query == expected else { return }
                let hits = await session.search(expected)
                guard !Task.isCancelled, query == expected else { return }
                searchHits = hits
            }
        }
    }

    // MARK: - Header

    /// The title, the connection when it is not fine, and the account photo,
    /// which opens Settings.
    private var header: some View {
        HStack(spacing: 8) {
            Text(verbatim: "MausBot")
                .font(.largeTitle.bold())
                .foregroundStyle(Color.primary)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("home-title")
            Spacer(minLength: 8)
            ConnectionChip(status: session.status)
            Spacer(minLength: 8)
            NavigationLink { SettingsView() } label: {
                AccountPhoto(size: 40)
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Settings")
            .accessibilityIdentifier("open-settings")
        }
        .padding(.leading, HomeLayout.margin)
        .padding(.trailing, HomeLayout.margin - 2)
        .padding(.top, 6)
        .padding(.bottom, 4)
    }

    // MARK: - Kara and pinned

    /// The main Chief of Staff, or a pinned Chief when there is none.
    private var chief: Bot? {
        session.state.unsectionedChief ?? session.state.pinnedBots.first { $0.chiefOfStaff == true }
    }

    /// In the order set in the reorder sheet; a newly pinned bot goes last.
    private var pinned: [Bot] {
        let chiefId = chief?.id
        let bots = session.state.pinnedBots.filter { $0.id != chiefId }
        let byId = Dictionary(bots.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return SavedOrder.apply(SavedOrder.decode(pinnedOrder), to: bots.map(\.id)).compactMap { byId[$0] }
    }

    @ViewBuilder
    private var favorites: some View {
        if chief != nil || !pinned.isEmpty {
            FavoritesBlock(
                chief: chief.map(atHomeThread),
                pinned: pinned.map(atHomeThread),
                face: { MausState.forChat(.bot($0), in: session.state) },
                open: open,
                menu: { AnyView(botMenu($0)) }
            )
        }
    }

    @ViewBuilder
    private func botMenu(_ bot: Bot) -> some View {
        Button { createThread(for: bot) } label: {
            Label("New thread", systemImage: "square.and.pencil")
        }
        .disabled(creatingThreads.contains(bot.id))
        Button { managingThreads = .bot(bot) } label: {
            Label("Manage threads", systemImage: "list.bullet")
        }
        if bot.id != session.state.unsectionedChief?.id {
            let isPinned = bot.pinned == true
            Button {
                Haptics.selection()
                Task { await session.setBotPinned(bot, pinned: !isPinned) }
            } label: {
                Label(isPinned ? "Unpin" : "Pin", systemImage: isPinned ? "pin.slash" : "pin")
            }
            if isPinned { reorderButton }
        }
    }

    private var reorderButton: some View {
        Button { reordering = true } label: {
            Label("Reorder", systemImage: "arrow.up.arrow.down")
        }
    }

    private func reorderSheet(_ sections: [HomeSection]) -> ReorderSheet {
        ReorderSheet(
            save: { pinnedIds, sectionIds in
                pinnedOrder = SavedOrder.encode(pinnedIds)
                sectionOrder = SavedOrder.encode(sectionIds)
            },
            pinned: pinned.map { ReorderSheet.Item(id: $0.id, title: $0.name, bot: $0) },
            sections: sections.map { ReorderSheet.Item(id: $0.id, title: $0.title, count: $0.rows.count) }
        )
    }

    // MARK: - Sections

    @ViewBuilder
    private func sections(_ summaries: [ChatSummary], waiting: Set<String>) -> some View {
        ForEach(homeSections(summaries)) { section in
            sectionHeader(section)
            if !isCollapsed(section.id) {
                rows(section.rows, waiting: waiting)
            }
        }
    }

    private func homeSections(_ summaries: [ChatSummary]) -> [HomeSection] {
        let state = session.state
        let byId = Dictionary(summaries.map { ($0.chat.id, $0) }, uniquingKeysWith: { first, _ in first })
        func newestFirst(_ ids: [String]) -> [ChatSummary] {
            CompanionState.newestFirst(ids.compactMap { byId[$0] })
        }
        var result: [HomeSection] = []
        func add(_ id: String, _ title: String, _ ids: [String]) {
            let rows = newestFirst(ids)
            if !rows.isEmpty { result.append(HomeSection(id: id, title: title, rows: rows)) }
        }
        add("groups", String(localized: "Groups"), state.unsectionedChannels.map(\.id))
        add("bot-threads", String(localized: "Bot threads"), state.botChats.map(\.id))
        add("bots", String(localized: "Bots"), state.unsectionedBots.map(\.id))
        for section in state.sidebarSections {
            add("section:\(section.name)", section.name,
                section.chiefs.map(\.id) + section.bots.map(\.id) + section.channels.map(\.id))
        }
        let sectionsById = Dictionary(result.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return SavedOrder.apply(SavedOrder.decode(sectionOrder), to: result.map(\.id)).compactMap { sectionsById[$0] }
    }

    private func isCollapsed(_ id: String) -> Bool {
        collapsedSections.split(separator: "\n").contains { $0 == id }
    }

    private func sectionHeader(_ section: HomeSection) -> some View {
        let collapsed = isCollapsed(section.id)
        return Button {
            Haptics.selection()
            withAnimation(.snappy(duration: 0.25)) {
                var ids = collapsedSections.split(separator: "\n").map(String.init).filter { $0 != section.id }
                if !collapsed { ids.append(section.id) }
                collapsedSections = ids.joined(separator: "\n")
            }
        } label: {
            HStack(spacing: 6) {
                Text(verbatim: section.title)
                if collapsed {
                    Text(verbatim: "\(section.rows.count)")
                        .foregroundStyle(Color.secondary.opacity(0.6))
                }
                Image(systemName: collapsed ? "chevron.right" : "chevron.down")
                    .font(.footnote)
                    .foregroundStyle(Color.secondary.opacity(0.6))
                Spacer(minLength: 0)
            }
            .font(.body)
            .foregroundStyle(Color.secondary)
            .padding(.horizontal, HomeLayout.margin)
            .padding(.top, 18)
            .padding(.bottom, 6)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu { reorderButton }
        .accessibilityValue(collapsed ? Text("Collapsed") : Text("Expanded"))
        .accessibilityIdentifier("section-header.\(section.id)")
    }

    private func rows(_ rows: [ChatSummary], waiting: Set<String>) -> some View {
        let state = session.state
        return ForEach(rows) { summary in
            let row = Button { open(summary) } label: {
                HomeRow(
                    chat: summary.chat,
                    members: members(of: summary.chat),
                    preview: summary.preview,
                    at: summary.lastActivity,
                    today: today,
                    face: MausState.forChat(summary.chat, in: state),
                    waiting: waiting.contains(summary.chat.threadId)
                )
                .equatable()
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("chat-row.\(summary.chat.id)")
            if case let .bot(bot) = summary.chat {
                row.contextMenu { botMenu(bot) }
            } else {
                row
            }
        }
    }

    // MARK: - Search

    @ViewBuilder
    private func searchResults(_ matches: [ChatSummary], waiting: Set<String>) -> some View {
        if !searchHits.isEmpty {
            HStack {
                searchLabel(Text("Messages"))
                Spacer()
                if searching { ProgressView().controlSize(.small) }
            }
            .padding(.top, 10)
            .padding(.bottom, 4)
            ForEach(searchHits) { hit in
                Button {
                    Task {
                        if let chat = await session.open(hit) {
                            Haptics.selection()
                            path.append(chat)
                        }
                    }
                } label: {
                    SearchHitRow(hit: hit)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, HomeLayout.margin)
            }
            if !matches.isEmpty {
                searchLabel(Text("Bots"))
                    .padding(.top, 14)
                    .padding(.bottom, 4)
            }
        } else if searching {
            ProgressView()
                .controlSize(.small)
                .frame(maxWidth: .infinity)
                .padding(.top, 24)
        }
        rows(matches, waiting: waiting)
    }

    private func searchLabel(_ text: Text) -> some View {
        text
            .font(.callout)
            .foregroundStyle(Color.secondary)
            .padding(.horizontal, HomeLayout.margin)
    }

    // MARK: - Bottom

    /// Kara and the pinned bots when they sit at the bottom, then the bar.
    private func bottomArea(updates: [ChatUpdate]) -> some View {
        let showsFavorites = pinnedAtBottom && query.isEmpty && !searchOpen && (chief != nil || !pinned.isEmpty)
        return VStack(spacing: 0) {
            if showsFavorites {
                favorites
                    .padding(.top, 18)
                    .padding(.bottom, 12)
            }
            bottomBar(updates: updates)
        }
        .background {
            if showsFavorites {
                LinearGradient(
                    stops: [
                        .init(color: homeFill.opacity(0), location: 0),
                        .init(color: homeFill, location: 0.12),
                    ],
                    startPoint: .top, endPoint: .bottom
                )
                .ignoresSafeArea(edges: .bottom)
            }
        }
    }

    private func bottomBar(updates: [ChatUpdate]) -> some View {
        GlassGroup(spacing: 10) {
            HStack(spacing: 10) {
                if searchOpen {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.secondary)
                        TextField("Search bots", text: $query)
                            .font(.system(size: 17))
                            .submitLabel(.search)
                            .autocorrectionDisabled()
                            .focused($searchFocused)
                        if !query.isEmpty {
                            Button {
                                query = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill").foregroundStyle(Color.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .frame(height: Self.barHeight)
                    .glassCapsule()

                    Button("Cancel") {
                        query = ""
                        searchOpen = false
                        searchFocused = false
                    }
                    .font(.system(size: 17))
                    .foregroundStyle(Color.primary)
                    .padding(.horizontal, 16)
                    .frame(height: Self.barHeight)
                    .glassCapsule()
                } else {
                    UpdatesPill(updates: updates) {
                        Haptics.selection()
                        showingUpdates = true
                    }
                    .frame(height: Self.barHeight)

                    GlassButton(systemImage: "magnifyingglass", size: Self.barHeight, weight: .semibold) {
                        Haptics.selection()
                        searchOpen = true
                        searchFocused = true
                    }
                    .accessibilityLabel("Search")
                    .accessibilityIdentifier("open-search")
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .animation(.snappy(duration: 0.25), value: searchOpen)
    }

    private static let barHeight: CGFloat = 54

    // MARK: - Data

    private var activity: ActivityDetail { ActivityDetail(rawValue: activityDetail) ?? .phoneDefault }

    /// Every chat with its preview line, which `previewCache` folds again
    /// only once its thread has changed. A thread whose messages this phone
    /// has not loaded shows its title instead.
    private func rosterSummaries() -> [ChatSummary] {
        let state = session.state
        let all = state.chatSummaries()
        previewCache.keepOnly(Set(all.map(\.chat.threadId)))
        return all.map { summary in
            let line = previewCache.preview(forThread: summary.chat.threadId, in: state, detail: activity)
            return ChatSummary(
                chat: summary.chat,
                preview: line.isEmpty ? threadTitle(summary.chat) : line,
                lastActivity: summary.lastActivity
            )
        }
    }

    private func threadTitle(_ chat: Chat) -> String {
        guard case let .bot(bot) = chat else { return "" }
        return bot.tasks?.first { $0.threadId == bot.threadId }?.displayTitle ?? ""
    }

    private func searchMatches(_ all: [ChatSummary]) -> [ChatSummary] {
        let queued = session.state.queuedThreadIds
        return all.filter {
            $0.chat.name.localizedCaseInsensitiveContains(query)
                || $0.chat.subtitle.localizedCaseInsensitiveContains(query)
                || $0.preview.localizedCaseInsensitiveContains(query)
                || matchesThread($0.chat, queued: queued)
        }
    }

    private func matchesThread(_ chat: Chat, queued: Set<String>) -> Bool {
        guard case let .bot(bot) = chat else { return false }
        return !bot.threadGroups(matching: query, queuedThreadIds: queued).isEmpty
    }

    private func open(_ summary: ChatSummary) {
        path.append(summary.chat)
    }

    /// A face opens the bot's main conversation, as its row would.
    private func open(_ bot: Bot) {
        path.append(Chat.bot(atHomeThread(bot)))
    }

    private func atHomeThread(_ bot: Bot) -> Bot {
        bot.projected(forThread: session.state.homeThread(of: bot)) ?? bot
    }

    private func createThread(for bot: Bot) {
        guard creatingThreads.insert(bot.id).inserted else { return }
        Task {
            defer { creatingThreads.remove(bot.id) }
            if let created = await session.createRosterThread(for: bot) {
                path.append(Chat.bot(created))
            }
        }
    }

    /// Thread ids, not chats: a row shows one thread and opens it.
    private func waitingChats(_ approvals: [(threadId: String, message: Message)]) -> Set<String> {
        Set(approvals.map(\.threadId))
    }

    private func members(of chat: Chat) -> [Bot] {
        guard case let .room(room) = chat else { return [] }
        return room.memberIds.compactMap { session.state.bot($0) }
    }

    private func rosterIsEmpty(matches: [ChatSummary]) -> Bool {
        if query.isEmpty {
            return session.state.bots.allSatisfy { $0.hidden == true } && session.state.rooms.isEmpty
        }
        return matches.isEmpty && searchHits.isEmpty && !searching
    }
}

/// One titled group of rows on home.
private struct HomeSection: Identifiable {
    /// "groups", "bot-threads", "bots", or "section:<name>"; the collapsed
    /// and saved orders key on it.
    let id: String
    let title: String
    let rows: [ChatSummary]
}

/// The floating pill: who is doing what right now, at a glance.
struct UpdatesPill: View {
    let updates: [ChatUpdate]
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if !updates.isEmpty {
                    MascotStack(colors: Array(updates.prefix(3).map(\.chat.color)))
                }
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        if let first = updates.first {
                            switch first.kind {
                            case .needsYou:
                                Image(systemName: "hand.raised.fill")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(MausPalette.color(first.chat.color))
                                Text("\(first.chat.name) needs you")
                            case .working:
                                Text("\(first.chat.name) is working")
                            case .toReview:
                                Text("\(first.chat.name) has an update")
                            }
                        } else {
                            Text("All quiet")
                        }
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(updates.isEmpty ? Color.secondary : Color.primary)
                    .lineLimit(1)

                    Text(subline)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.up")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color.secondary)
            }
            .padding(.leading, updates.isEmpty ? 16 : 7)
            .padding(.trailing, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .glassCapsule()
        .accessibilityLabel("Updates")
        .accessibilityIdentifier("updates-button")
    }

    private var subline: String {
        guard let first = updates.first else { return "Nothing needs you" }
        let rest = updates.count - 1
        if rest == 0 { return first.line.isEmpty ? " " : first.line }
        return rest == 1 ? "1 more update" : "\(rest) more updates"
    }
}

/// Up to three mascots overlapping, the way a group of faces reads at a glance.
struct MascotStack: View {
    let colors: [String]
    var size: CGFloat = 28
    var overlap: CGFloat = 12
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage(PrefKey.chatBackdrop) private var chatBackdropRaw = ChatBackdrop.fallback.rawValue

    var body: some View {
        HStack(spacing: -overlap) {
            ForEach(Array(colors.enumerated()), id: \.offset) { _, color in
                MausAvatar(color: color, size: size, state: .idle, animated: false)
                    .padding(2)
                    .background(Circle().fill(ChatBackdrop.screenFill(stored: chatBackdropRaw, scheme: colorScheme)))
            }
        }
    }
}

struct SearchHitRow: View {
    let hit: SearchHit

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: hit.role == .user ? "person.fill" : "bubble.left.fill")
                .foregroundStyle(Color.secondary)
                .frame(width: 26, height: 26)
                .background(Circle().fill(Color.secondary.opacity(0.13)))

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(hit.name).font(.system(size: 15, weight: .semibold))
                    if let task = hit.task, !task.isEmpty {
                        Text(task).font(.system(size: 12)).foregroundStyle(Color.secondary)
                    }
                    Spacer()
                    Text(RelativeStamp.list(hit.at))
                        .font(.system(size: 12))
                        .foregroundStyle(Color.secondary)
                }
                Text(hit.snippet)
                    .font(.system(size: 14))
                    .foregroundStyle(Color.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

/// Timestamps the way a messaging app writes them.
enum RelativeStamp {
    /// Today's times as "02:15", whatever the phone's 12/24-hour setting.
    private static let clock: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    /// Roster: time today, weekday this week, date beyond that.
    static func list(_ at: Double) -> String {
        guard at > 0 else { return "" }
        let date = Date(timeIntervalSince1970: at / 1000)
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            return clock.string(from: date)
        }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        if let week = calendar.date(byAdding: .day, value: -6, to: Date()), date > week {
            return date.formatted(.dateTime.weekday(.wide))
        }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }

    /// In a transcript: enough to place a gap in the conversation.
    static func separator(_ date: Date) -> String {
        let calendar = Calendar.current
        let time = date.formatted(date: .omitted, time: .shortened)
        if calendar.isDateInToday(date) { return "Today \(time)" }
        if calendar.isDateInYesterday(date) { return "Yesterday \(time)" }
        return "\(date.formatted(.dateTime.day().month(.abbreviated))) \(time)"
    }
}
