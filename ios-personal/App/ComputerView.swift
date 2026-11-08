// A bot's computer, live.
//
// The harness already screenshots a working bot every few seconds and pushes
// the frame to any client that asked for it. This is that, and nothing more:
// no clicking, no typing, no control. Watching is the useful half on a phone
// — you want to know what it is doing, not to do it yourself on a screen the
// size of a playing card. Driving the bot's browser is the "Open browser"
// button.
//
// Frames are expensive (hundreds of kilobytes of base64 each), so they are
// off unless this view is on screen. `watchScreen` reopens the stream asking
// for them and `stopWatchingScreen` reopens it asking not to; both resume
// from the cursor, so the reconnect costs nothing but a round trip.
import SwiftUI
import CompanionCore
// Unconditional for the same reason as ChatView: `UIImage` is used below
// without a guard, so a conditional import would only change which error a
// non-UIKit build fails with.
import UIKit

struct ComputerView: View {
    let bot: Bot
    @EnvironmentObject private var session: Session
    @State private var showingBrowser = false
    /// The picture on screen, decoded once per new frame. Decoding in `body`
    /// base64- and PNG-decoded the same desktop frame on every Session
    /// publish (~12 a second while a fleet streams). Until the next one is
    /// decoded, the last stays up.
    @State private var shownImage: UIImage?

    private var frame: ScreenFrame? { session.state.screens[bot.id] }

    /// The bot as the stream last described it — `busy` is what tells us
    /// whether more frames are coming or this is the last one.
    /// Projected onto the thread this view was opened from, so a task thread
    /// pictures its own computer, not the bot's default conversation.
    private var current: Bot { session.state.bot(bot.id)?.projected(forThread: bot.threadId) ?? bot }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let image = shownImage {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    // The desktop is wider than the phone, so it lands as a
                    // letterbox. Pinch-to-zoom would be the obvious next
                    // thing; scaledToFit is the honest starting point.
                    .accessibilityLabel("\(current.name)'s computer")
            } else {
                streamWaiting
            }
        }
        .navigationTitle(current.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                // Busy is the difference between "the picture is a moment old"
                // and "the picture is however it was left" — worth saying,
                // because a still frame looks identical either way.
                Text(current.busy == true ? "Preview" : "Idle")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(current.busy == true ? Color.green : Color.secondary)
            }
        }
        .navigationDestination(isPresented: $showingBrowser) {
            if let client = session.browserLiveClient() {
                BrowserControlView(bot: current, client: client)
            } else {
                VStack(spacing: 12) {
                    Text("Browser unavailable").font(.headline)
                    Text("The active connection is no longer available.")
                }
                .padding()
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button {
                showingBrowser = true
            } label: {
                Label("Open browser", systemImage: "safari")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(session.browserLiveClient() == nil)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
        }
        .onAppear {
            session.watchScreen(of: bot.id)
        }
        .onDisappear {
            session.stopWatchingScreen(of: bot.id)
        }
        .task(id: frame?.png) { await decodeFrame() }
    }

    /// Desktop frames are drawn across the screen, so they are decoded at
    /// full size; the point is doing it once per frame, off the main actor.
    private func decodeFrame() async {
        guard let png = frame?.png else { return }
        let decoded = await Task.detached(priority: .userInitiated) {
            ImageDownsampler.decode(base64: png)
        }.value
        guard !Task.isCancelled else { return }
        shownImage = decoded.map { UIImage(cgImage: $0.cgImage) }
    }

    private var streamWaiting: some View {
        VStack(spacing: 12) {
            ProgressView().tint(.white)
            Text(current.busy == true ? "Waiting for a frame…" : "Nothing to show yet")
                .font(.system(size: 15))
                .foregroundStyle(Color.white.opacity(0.7))
            // An idle bot is not being screenshotted at all, so this would
            // otherwise be an indefinite spinner with no explanation.
            if current.busy != true {
                Text("This bot's computer is only captured while it is working.")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.white.opacity(0.45))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
        }
    }
}
