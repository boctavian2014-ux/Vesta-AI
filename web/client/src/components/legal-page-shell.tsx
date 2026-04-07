import type { ReactNode } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function LegalPageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [, navigate] = useHashLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-4 w-4" />
          Înapoi
        </Button>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-8 text-foreground">
        <h1 className="text-2xl font-bold tracking-tight mb-2">{title}</h1>
        <p className="text-xs text-muted-foreground mb-8 border-l-2 border-amber-500/50 pl-3 py-1">
          Text orientativ (draft). Înlocuiți cu versiune revizuită de un avocat înainte de producție.
        </p>
        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">
          {children}
        </div>
      </article>
    </div>
  );
}
