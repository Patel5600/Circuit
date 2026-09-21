import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon, IconName } from "./Icon";

/** Shared, presentation-only building blocks. No protocol knowledge here. */

export type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "",
  success: "pill--success",
  warning: "pill--warning",
  danger: "pill--danger",
  accent: "pill--accent",
};

export const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--text-2)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  accent: "var(--accent)",
};

/* -- Card ----------------------------------------------------------------- */

export function Card({
  title,
  action,
  children,
  footer,
  quiet = false,
  flush = false,
  as: Tag = "section",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  quiet?: boolean;
  flush?: boolean;
  as?: any;
}) {
  return (
    <Tag
      className={`card${quiet ? " card--quiet" : ""}${flush ? " card--flush" : ""}`}
    >
      {(title || action) && (
        <header className="card__head" style={flush ? { padding: 18, marginBottom: 0 } : undefined}>
          {typeof title === "string" ? (
            <h2 className="t-label" style={{ margin: 0 }}>
              {title}
            </h2>
          ) : (
            title
          )}
          {action}
        </header>
      )}
      {children}
      {footer && <footer className="card__foot">{footer}</footer>}
    </Tag>
  );
}

/* -- Pill / status -------------------------------------------------------- */

export function Pill({
  tone = "neutral",
  children,
  withDot = false,
  title,
}: {
  tone?: Tone;
  children: React.ReactNode;
  withDot?: boolean;
  title?: string;
}) {
  return (
    <span className={`pill ${TONE_CLASS[tone]}`} title={title}>
      {withDot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* -- Button --------------------------------------------------------------- */

type BtnVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  size,
  block = false,
  icon,
  iconRight,
  loading = false,
  children,
  className = "",
  ...rest
}: {
  variant?: BtnVariant;
  size?: "sm";
  block?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`btn btn--${variant}${size === "sm" ? " btn--sm" : ""}${
        block ? " btn--block" : ""
      } ${className}`}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Icon name="spinner" size={16} spin />
      ) : (
        icon && <Icon name={icon} size={16} />
      )}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={16} />}
    </button>
  );
}

/* -- Data row ------------------------------------------------------------- */

export function DataRow({
  label,
  value,
  tone,
  mono = false,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: Tone;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="drow">
      <span className="drow__k" title={hint}>
        {label}
      </span>
      <span
        className={`drow__v${mono ? " mono" : ""}`}
        style={tone ? { color: TONE_COLOR[tone] } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

/* -- Stat ----------------------------------------------------------------- */

export function Stat({
  label,
  value,
  sub,
  tone,
  loading = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  loading?: boolean;
}) {
  return (
    <div className="card">
      <div className="stat__label">{label}</div>
      {loading ? (
        <Skeleton height={30} width="72%" />
      ) : (
        <div
          className="stat__value"
          style={tone ? { color: TONE_COLOR[tone] } : undefined}
        >
          {value}
        </div>
      )}
      {sub && !loading && <div className="stat__sub">{sub}</div>}
    </div>
  );
}

/* -- Skeleton ------------------------------------------------------------- */

export function Skeleton({
  height = 14,
  width = "100%",
  radius,
  style,
}: {
  height?: number | string;
  width?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="skel"
      aria-hidden="true"
      style={{ height, width, borderRadius: radius, ...style }}
    />
  );
}

/** Announces loading to assistive tech while skeletons show visually. */
export function LoadingRegion({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}

/* -- Notice --------------------------------------------------------------- */

const NOTICE_ICON: Record<Tone, IconName> = {
  neutral: "info",
  success: "check",
  warning: "alert",
  danger: "cross",
  accent: "info",
};

export function Notice({
  tone = "neutral",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={`notice${tone !== "neutral" ? ` notice--${tone}` : ""}`}
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
    >
      <span className="notice__icon" style={{ color: TONE_COLOR[tone] }}>
        <Icon name={NOTICE_ICON[tone]} size={17} />
      </span>
      <div className="grow">
        <div className="notice__title">{title}</div>
        {children && <div className="notice__text">{children}</div>}
        {action && <div style={{ marginTop: 12 }}>{action}</div>}
      </div>
    </div>
  );
}

/* -- Empty state ---------------------------------------------------------- */

export function EmptyState({
  icon = "info",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="card stack g-12"
      style={{ alignItems: "center", textAlign: "center", padding: "40px 24px" }}
    >
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text-3)",
        }}
      >
        <Icon name={icon} size={21} />
      </span>
      <h3 className="t-title" style={{ margin: 0 }}>
        {title}
      </h3>
      {children && (
        <p className="t-sm muted" style={{ maxWidth: "42ch" }}>
          {children}
        </p>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

/* -- Disclosure (progressive detail) ------------------------------------- */

export function Disclosure({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        className="disc__btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="disc__chev">
          <Icon name="chevron" size={14} />
        </span>
        {label}
      </button>
      {open && (
        <div className="disc__panel" id={id}>
          {children}
        </div>
      )}
    </div>
  );
}

/* -- Copy button ---------------------------------------------------------- */

export function CopyButton({
  value,
  label = "address",
}: {
  value: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      /* Clipboard can be unavailable in insecure contexts; fail quietly. */
    }
  }, [value]);

  return (
    <>
      <button
        type="button"
        className="iconbtn"
        onClick={copy}
        aria-label={done ? `${label} copied` : `Copy ${label}`}
        title={done ? "Copied" : "Copy"}
        style={done ? { color: "var(--success)", borderColor: "var(--success)" } : undefined}
      >
        <Icon name={done ? "check" : "copy"} size={14} />
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {done ? `${label} copied to clipboard` : ""}
      </span>
    </>
  );
}

/* -- Segmented control ---------------------------------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          className="seg__btn"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* -- Modal ---------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Escape to dismiss, and focus moves into the dialog on open so keyboard and
  // screen-reader users are not left behind on the page underneath.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
      >
        <div className="row between g-12" style={{ marginBottom: 16 }}>
          <h2 id={titleId} className="t-title" style={{ margin: 0 }}>
            {title}
          </h2>
          {dismissable && (
            <button
              type="button"
              className="iconbtn"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export { Icon };
export type { IconName };
export { InkBarProvider, useInkBar, InkRouteTracker } from "./InkLoadingBar";
