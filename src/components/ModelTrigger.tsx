import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { InstanceInfo } from "@/state/store";
import { InstanceProviderMark } from "./ProviderIcons";
import { UsageBars } from "./EngineUsage";

export function ModelTrigger({ active, attention, model, variant, engine, label, ...button }: ComponentProps<"button"> & {
  active: InstanceInfo | undefined;
  attention: string | undefined;
  model: string;
  variant?: string;
  engine: string;
  label?: ReactNode;
}) {
  const mark = (
    <span className="relative mr-1.5 flex shrink-0 self-center group-disabled:opacity-50">
      {active
        ? <InstanceProviderMark instance={active} size={14} subtle />
        : <span className="size-3.5 rounded-full bg-ink/[0.08]" aria-hidden="true" />}
      {attention && <span data-model-attention className="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-warning ring-[1.5px] ring-app" />}
    </span>
  );
  const name = (
    <>
      <span className="min-w-0 max-w-[160px] truncate">{model}</span>
      {variant !== undefined && <span className="shrink-0 whitespace-pre">{variant}</span>}
    </>
  );
  return (
    <button {...button}>
      {label === undefined ? <>{mark}{name}</> : (
        <span className="flex min-w-0 flex-1 items-baseline gap-2.5 [&>svg]:self-center">
          {label}
          <span className="ml-auto flex min-w-0 items-baseline">{mark}{name}</span>
        </span>
      )}
      <UsageBars engine={engine} className="ml-1.5" />
      <ChevronDown size={12} strokeWidth={2} aria-hidden="true" className="ml-1 shrink-0 text-ink-tertiary group-hover:text-ink-secondary" />
    </button>
  );
}
