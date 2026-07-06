"use client";

import { useRouter } from "next/navigation";

import { LoginForm } from "@/components/pages/login/LoginForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginView() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen p-6 gap-4">
      <div className="flex flex-col justify-center-safe w-1/3">
        {/* <div className="text-center text-2xl font-bold mb-4">Company Name</div> */}
        <Card className="flex w-full">
          <CardHeader>
            <CardTitle className="text-lg text-center">Login</CardTitle>
          </CardHeader>
          <CardContent className="">
            <LoginForm onSuccess={() => router.push("/landing")} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-1 items-center justify-center bg-gray-600">Company image or logo</div>
    </main>
  );
}
