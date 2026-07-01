"use client";

import { useRouter } from "next/navigation";

import { LoginForm } from "@/components/pages/login/LoginForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginView() {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Login</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm onSuccess={() => router.push("/dashboard")} />
        </CardContent>
      </Card>
    </main>
  );
}
