import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function TradingPageShell(props: PageShellProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{props.title}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{props.description}</p>
        </div>
        {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
      </div>
      {props.children}
    </div>
  );
}
