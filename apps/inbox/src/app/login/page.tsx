import { LoginForm } from "@/components/login-form";
import { ERROR_PARAM, NEXT_PARAM } from "@/lib/constants";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = params[NEXT_PARAM];
  const error = params[ERROR_PARAM];
  return (
    <LoginForm
      next={typeof next === "string" ? next : null}
      error={typeof error === "string" ? error : null}
    />
  );
}
