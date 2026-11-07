import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { CHROME_EYES, CHROME_GRADIENT, MAUS_COLORS, type MausColor, type MausMotion, type MausState } from "@/lib/mascot";
import { CursorAvatar, EFFECTS, type CursorAvatarHandle } from "./CursorAvatar";
import { avatarCropRadius, botAvatarProfile, clampAvatarFocus, clampAvatarZoom, mascotFaceInk, type BotAvatarCrop, type MascotFaceColor } from "../../shared/bot-avatar";
import { MASCOT_BODIES, botMascotBody } from "../../shared/mascot-bodies";
import { isHalloweenBody, type BotBodyId } from "../../shared/bot-body";
import { useHalloweenDressed, wornBody } from "@/lib/halloween-dress";
import { t } from "@/lib/i18n";
import { CarvedAvatar } from "./CarvedAvatar";
import { steelBodyImage } from "@/lib/steel-body";
import { WorkingRing } from "./WorkingRing";

export const EYE_SCALE = 1.12;
export const MOUTH_WEIGHT = 11;

const POINTER_GAZE = { forward: 1, authored: 0.25 };

interface MotionFaces
  extends Partial<
    Record<Exclude<MausMotion, "none">, { state?: MausState; blink?: boolean; spin?: number }>
  > {}

const MOTION_FACE: MotionFaces = {
  arrive: { state: "spawning", spin: 900 },
  switch: { state: "waking", spin: 620 },
  customize: { state: "proud", blink: true },
  alert: { state: "alerting" },
  thinking: { state: "thinking" },
  working: { state: "working" },
  launch: { state: "loading" },
  success: { state: "happy", blink: true },
  celebrate: { state: "celebrate", spin: 700 },
  blink: { blink: true },
  surprise: { state: "surprised", blink: true },
  failure: { state: "sad" },
};

export const MOTION_FACE_MS = 1400;

function mix(hex: string, toward: string, t: number): string {
  const a = Number.parseInt(hex.slice(1), 16);
  const b = Number.parseInt(toward.slice(1), 16);
  const channel = (shift: number) => {
    const va = (a >> shift) & 0xff;
    const vb = (b >> shift) & 0xff;
    return Math.round(va + (vb - va) * t);
  };
  return `#${[channel(16), channel(8), channel(0)]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("")}`;
}

const gradientFor = (color: MausColor): [string, string, string] => {
  if (color === "chrome") return CHROME_GRADIENT;
  const fill = MAUS_COLORS[color] ?? MAUS_COLORS.green;
  return [mix(fill, "#ffffff", 0.55), fill, mix(fill, "#000000", 0.42)];
};

export function roomAvatarGradient(color: MausColor): [string, string, string] {
  const fill = `var(--identity-${color})`;
  return [
    `color-mix(in srgb, ${fill} 82%, #ffffff)`,
    fill,
    `color-mix(in srgb, ${fill} 82%, #000000)`,
  ];
}

export type MausAvatarHandle = CursorAvatarHandle;

export type MausAvatarProps = {
  color: MausColor;
  state?: MausState;
  expression?: number;
  size?: number;
  label?: string;
  motion?: MausMotion;
  motionKey?: number;
  turn?: number;
  gaze?: { x?: number; y?: number };
  spring?: number;
  eyeScale?: number;
  showMouth?: boolean;
  mouthStroke?: number;
  forward?: boolean;
  lookAround?: number;
  trackPointer?: boolean;
  animated?: boolean;
  effects?: boolean;
  /** false turns off the face's own orbit trails, judged on the face it actually shows, motion beats included. */
  trails?: boolean;
  still?: boolean;
  bodyId?: BotBodyId;
  gradient?: [string, string, string];
  faceColor?: MascotFaceColor | null;
};

function MausAvatarComponent(props: MausAvatarProps, ref: React.Ref<MausAvatarHandle>) {
  const { bodyId, color, size, state, motion, motionKey, gaze, trackPointer, animated, label } = props;
  if (isHalloweenBody(bodyId)) {
    return (
      <CarvedAvatar
        ref={ref}
        body={bodyId}
        color={color}
        faceColor={props.faceColor}
        size={size}
        state={state}
        motion={motion}
        motionKey={motionKey}
        gaze={gaze}
        trackPointer={trackPointer}
        animated={props.still ? false : animated}
        label={label}
      />
    );
  }
  return <GradientAvatar ref={ref} {...props} />;
}

function GradientAvatarComponent(
  {
    color,
    state = "idle",
    expression,
    size = 44,
    label,
    motion = "none",
    motionKey = 0,
    turn,
    gaze,
    spring,
    eyeScale,
    showMouth,
    mouthStroke,
    forward = true,
    lookAround,
    trackPointer = true,
    animated = true,
    effects,
    trails,
    still,
    bodyId,
    gradient,
    faceColor,
  }: MausAvatarProps,
  ref: React.Ref<MausAvatarHandle>,
) {
  const silhouette = MASCOT_BODIES[botMascotBody(bodyId)];
  const chrome = color === "chrome";
  const faceInk = mascotFaceInk(faceColor);
  const inner = useRef<CursorAvatarHandle>(null);
  useImperativeHandle(ref, () => ({
    blink: () => inner.current?.blink(),
    spin: (durationMs?: number) => inner.current?.spin(durationMs),
    setExpression: (index: number) => inner.current?.setExpression(index),
  }));

  const [motionState, setMotionState] = useState<MausState | null>(null);
  useEffect(() => {
    if (motion === "none" || !animated) return;
    const beat = MOTION_FACE[motion];
    if (!beat) return;
    if (beat.blink) inner.current?.blink();
    if (beat.spin) inner.current?.spin(beat.spin);
    if (!beat.state) return;
    setMotionState(beat.state);
    const timer = setTimeout(() => setMotionState(null), MOTION_FACE_MS);
    return () => {
      clearTimeout(timer);
      setMotionState(null);
    };
  }, [motion, motionKey, animated]);

  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const range = forward ? POINTER_GAZE.forward : POINTER_GAZE.authored;
  const onPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!trackPointer || !animated) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)) * range,
      y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)) * range,
    });
  };
  const onPointerLeave = () => setPointer({ x: 0, y: 0 });

  return (
    <span
      className="inline-flex shrink-0"
      onPointerMove={trackPointer && animated ? onPointerMove : undefined}
      onPointerLeave={trackPointer && animated ? onPointerLeave : undefined}
    >
      <CursorAvatar
        ref={inner}
        state={motionState ?? state}
        expression={expression}
        size={size}
        silhouette={silhouette}
        gradient={gradient ?? gradientFor(color)}
        picture={chrome && !faceInk ? steelBodyImage(silhouette.id, size, globalThis.devicePixelRatio ?? 1) : null}
        eyeColor={faceInk ?? (chrome ? CHROME_EYES : undefined)}
        title={label ?? null}
        lookAround={lookAround ?? (forward ? 0 : 1)}
        gaze={{ x: (gaze?.x ?? 0) + pointer.x, y: (gaze?.y ?? 0) + pointer.y }}
        turn={turn}
        spring={spring}
        eyeScale={eyeScale}
        showMouth={showMouth}
        mouthStroke={mouthStroke}
        paused={!animated}
        still={still}
        effects={trails === false && EFFECTS[motionState ?? state]?.trails ? false : effects}
      />
    </span>
  );
}

const GradientAvatar = forwardRef(GradientAvatarComponent);

export const MausAvatar = memo(forwardRef(MausAvatarComponent));

export type BotAvatarProps = Omit<MausAvatarProps, "color" | "gradient"> & {
  readable?: boolean;
  /** Keep it a boolean at a call site that shows work: switching to or from undefined remounts the face. */
  working?: boolean;
  greet?: boolean;
  restingSince?: number | null;
  bot: {
    name?: string;
    color: MausColor;
    avatarUrl?: string | null;
    avatarCrop?: BotAvatarCrop;
    avatarZoom?: number;
    avatarFocusX?: number;
    avatarFocusY?: number;
    mascotBody?: BotBodyId | null;
    mascotFaceColor?: MascotFaceColor | null;
  };
};

export type BotAvatarOutcome = "flatImage" | "gradientMascot";

/** Mirrored name for name by resolveBotAvatarOutcome in ios/Sources/CompanionCore/BotAvatarRendering.swift. */
export function resolveBotAvatarOutcome(params: {
  avatarCrop: BotAvatarCrop;
  hasUrl: boolean;
  imageFailed: boolean;
}): BotAvatarOutcome {
  const { avatarCrop, hasUrl, imageFailed } = params;
  if (!hasUrl) return "gradientMascot";
  if (avatarCrop === "mascot") return "gradientMascot";
  if (imageFailed) return "gradientMascot";
  return "flatImage";
}

export const REST_HOP_MS = 1300;
export const REST_CYCLE_MS = 4000;

function useRestHop(since: number | null): CSSProperties | null {
  const start = (at: number) => ({ since: at, delay: at - performance.now() });
  const [hop, setHop] = useState(() => (since === null ? null : start(since)));
  if (since !== null && hop?.since !== since) setHop(start(since));
  useEffect(() => {
    if (since !== null || hop === null) return;
    const into = (performance.now() - hop.since) % REST_CYCLE_MS;
    const timer = setTimeout(() => setHop(null), Math.max(REST_HOP_MS - into, 0));
    return () => clearTimeout(timer);
  }, [since, hop]);
  return hop && { animationDuration: `${REST_CYCLE_MS}ms`, animationDelay: `${hop.delay}ms` };
}

export function BotAvatar({ working, greet = false, restingSince = null, ...props }: BotAvatarProps) {
  const hop = useRestHop(restingSince);
  if (working === undefined) return <BotAvatarFace {...props} />;
  const profile = botAvatarProfile(props.bot);
  const ring = <WorkingRing active={working} greet={greet} state={props.state ?? "idle"} />;
  const overImage = Boolean(profile.avatarUrl) && profile.avatarCrop !== "mascot";
  return (
    <span className="relative inline-flex shrink-0">
      {!overImage && ring}
      <span className={cn("relative inline-flex", hop && !overImage && "bot-rest-hop")} style={overImage ? undefined : hop ?? undefined}>
        <BotAvatarFace {...props} still={restingSince !== null} trails={false} />
      </span>
      {overImage && ring}
    </span>
  );
}

function BotAvatarFace({ bot, size = 44, label, readable = false, ...mascotProps }: Omit<BotAvatarProps, "working" | "greet">) {
  const profile = botAvatarProfile(bot);
  const dressed = useHalloweenDressed();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [profile.avatarUrl]);

  const outcome = resolveBotAvatarOutcome({
    avatarCrop: profile.avatarCrop,
    hasUrl: Boolean(profile.avatarUrl),
    imageFailed,
  });

  if (outcome !== "flatImage") {
    return (
      <MausAvatar
        bodyId={wornBody(bot.mascotBody, bot.color, dressed)}
        {...mascotProps}
        color={bot.color}
        faceColor={bot.mascotFaceColor}
        gradient={readable ? roomAvatarGradient(bot.color) : undefined}
        size={size}
        label={label ?? bot.name}
      />
    );
  }

  const radius = avatarCropRadius(profile.avatarCrop);
  const zoom = clampAvatarZoom(bot.avatarZoom ?? 1);
  const focusX = clampAvatarFocus(bot.avatarFocusX ?? 0.5);
  const focusY = clampAvatarFocus(bot.avatarFocusY ?? 0.5);
  const origin = `${focusX * 100}% ${focusY * 100}%`;
  return (
    <span
      className="relative block shrink-0 overflow-hidden bg-raised"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <img
        src={profile.avatarUrl}
        alt={label ?? (bot.name ? t("avatar.alt", { name: bot.name }) : t("avatar.altFallback"))}
        width={size}
        height={size}
        draggable={false}
        onError={() => setImageFailed(true)}
        className="block size-full max-w-none object-cover"
        style={{
          width: size,
          height: size,
          objectPosition: origin,
          transform: zoom === 1 ? undefined : `scale(${zoom})`,
          transformOrigin: origin,
        }}
      />
    </span>
  );
}

export function InitialsAvatar({
  initials,
  avatarUrl,
  size = 32,
  fallback,
  fontSize,
  className,
}: {
  initials: string;
  avatarUrl?: string;
  size?: number;
  className?: string;
  /** drawn instead of the initials, for a person with no name or email to take them from */
  fallback?: ReactNode;
  fontSize?: number;
}) {
  // A picture that is gone (a restored backup carries the address, not the file) falls back to the initials.
  const [failed, setFailed] = useState<string | null>(null);
  if (avatarUrl && failed !== avatarUrl) {
    return <img src={avatarUrl} alt="" onError={() => setFailed(avatarUrl)} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-raised text-ink-secondary font-medium", className)}
      style={{ width: size, height: size, fontSize: fontSize ?? size * 0.38 }}
    >
      {fallback ?? initials}
    </div>
  );
}
