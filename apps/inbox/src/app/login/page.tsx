import { LoginForm } from "@/components/login-form";
import { NEXT_PARAM } from "@/lib/constants";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = (await searchParams)[NEXT_PARAM];
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <LoginForm next={typeof next === "string" ? next : null} />
    </main>
  );
}
