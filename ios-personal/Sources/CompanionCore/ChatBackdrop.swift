import Foundation

/// Dark-mode background behind the app's screens. Light mode keeps the system one.
/// A stored name this build no longer has falls back to Ink.
public enum ChatBackdrop: String, CaseIterable, Sendable {
    case black
    case ink

    public static let fallback = ChatBackdrop.ink

    public var red: Double {
        switch self {
        case .black: 0
        case .ink: 18 / 255
        }
    }

    public var green: Double {
        switch self {
        case .black: 0
        case .ink: 20 / 255
        }
    }

    public var blue: Double {
        switch self {
        case .black: 0
        case .ink: 28 / 255
        }
    }

    public var title: String {
        switch self {
        case .black: "Black"
        case .ink: "Ink"
        }
    }
}
