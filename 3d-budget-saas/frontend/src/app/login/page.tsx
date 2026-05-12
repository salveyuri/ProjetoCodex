import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10 text-foreground">
      <Suspense
        fallback={
          <Card className="h-80 w-full max-w-md animate-pulse p-6" />
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}

