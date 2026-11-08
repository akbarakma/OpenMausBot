// The `live.call` frame the harness still sends. The app has no Live call
// screen, so the state is decoded and stored but never shown.
import Foundation

public struct LiveCallState: Codable, Hashable, Sendable {
    public enum Status: String, Codable, Sendable {
        case connecting, live, ending, ended
        /// A status this build has never heard of. Read as "still running":
        /// the harness says `ended` when it is over.
        case unknown

        public init(from decoder: any Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = Status(rawValue: raw) ?? .unknown
        }
    }

    public var callId: String
    public var botId: String
    public var threadId: String
    /// Which app holds the microphone: "desktop", "ios" or "android".
    /// Self-declared by that app, so for display only.
    public var client: String
    public var voice: String
    /// Epoch milliseconds on the Mac's clock.
    public var startedAt: Double
    public var status: Status
    /// hung-up · idle · expired · content · remote-hangup · connection-lost
    /// · sideband-lost · deleted · shutdown · error — free text on the wire.
    public var endReason: String?
    /// Short and user-facing; present when the call ended on a problem.
    public var error: String?

    public init(
        callId: String, botId: String, threadId: String, client: String, voice: String,
        startedAt: Double, status: Status, endReason: String? = nil, error: String? = nil
    ) {
        self.callId = callId
        self.botId = botId
        self.threadId = threadId
        self.client = client
        self.voice = voice
        self.startedAt = startedAt
        self.status = status
        self.endReason = endReason
        self.error = error
    }

    public var isRunning: Bool { status != .ended }
}
