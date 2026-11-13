"use client";

import { useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * One generated block: label, editable text, and its own copy button.
 *
 * The copy button copies the CURRENT text, not the original generation — the
 * point of the editable field is that the user fixes the wording and sends what
 * is on screen. A LinkedIn limit renders a live counter and turns red past it.
 */
export function CopyField({
  label,
  value,
  onChange,
  multiline = true,
  rows = 7,
  limit,
  maxLength,
  placeholder,
  hint,
  actions,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  limit?: number;
  maxLength?: number;
  placeholder?: string;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const fieldId = useId();
  const [copied, setCopied] = useState(false);
  const over = typeof limit === "number" && value.length > limit;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* non-secure context or permission denied */
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-surface/50", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <label htmlFor={fieldId} className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {typeof limit === "number" && (
            <span className={cn("text-[11px] tabular-nums", over ? "font-semibold text-red-500" : "text-faint")}>
              {value.length}/{limit}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={copy} disabled={!value.trim()} aria-label={`Copy ${label}`}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      {multiline ? (
        <textarea
          id={fieldId}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-brand/20"
        />
      ) : (
        <input
          id={fieldId}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-brand/20"
        />
      )}
      {(hint || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-faint">
          <span className="min-w-0">{hint}</span>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}
