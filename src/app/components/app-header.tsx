import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickAddForm } from "./quick-add-form";

export function AppHeader({
  active,
  children
}: {
  active: "plan" | "tasks";
  children?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-4 py-2">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <CalendarDays className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">Task Calendar</span>
      </div>
      <nav className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
        <HeaderTab active={active === "plan"} href="/plan" label="Plan" />
        <HeaderTab active={active === "tasks"} href="/tasks" label="Tasks" />
      </nav>
      <QuickAddForm />
      {children}
    </header>
  );
}

function HeaderTab({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      className={cn(
        "rounded-md px-3 py-1 text-sm transition-colors",
        active
          ? "bg-card font-medium text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
      href={href}
    >
      {label}
    </Link>
  );
}
