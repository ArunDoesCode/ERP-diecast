import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function OperatorPwaShell() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center p-4 sm:p-6">
      <Card>
        <CardHeader>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Production & Shop Floor
          </p>
          <CardTitle className="text-2xl">Operator PWA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Shell-less operator workspace ready. Keep this route outside
            protected app shell to support touch-first flows.
          </p>
          <p>
            Next step: wire offline queue, machine assignment, and step logging
            APIs.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
