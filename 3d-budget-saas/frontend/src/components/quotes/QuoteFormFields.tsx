"use client";

import type { LucideIcon } from "lucide-react";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}

export const TextField = ({
  label,
  value,
  onChange,
  type = "text",
  required,
  disabled,
}: TextFieldProps) => (
  <label className="grid min-w-0 gap-2">
    <span className="text-sm font-medium text-foreground">{label}</span>
    <input
      type={type}
      value={value}
      required={required}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
    />
  </label>
);

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export const SelectField = ({
  label,
  value,
  onChange,
  disabled,
  children,
}: SelectFieldProps) => (
  <label className="grid min-w-0 gap-2">
    <span className="text-sm font-medium text-foreground">{label}</span>
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </select>
  </label>
);

interface NumberFieldProps {
  icon: LucideIcon;
  label: string;
  suffix: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const NumberField = ({
  icon: Icon,
  label,
  suffix,
  value,
  onChange,
  disabled,
}: NumberFieldProps) => (
  <label className="grid min-w-0 gap-2">
    <span className="text-sm font-medium text-foreground">{label}</span>
    <span className="flex min-h-11 min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-border bg-background px-3 transition focus-within:border-primary has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60">
      <Icon className="h-4 w-4 text-muted" />
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none disabled:cursor-not-allowed"
      />
      <span className="text-xs font-semibold uppercase text-muted">{suffix}</span>
    </span>
  </label>
);

interface SummaryLineProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

export const SummaryLine = ({ icon: Icon, label, value }: SummaryLineProps) => (
  <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3">
    <span className="flex items-center gap-2 text-sm text-muted">
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </span>
    <span className="text-sm font-semibold text-foreground">{value}</span>
  </div>
);
