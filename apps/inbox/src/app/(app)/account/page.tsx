import { AccountView } from "@/components/account/account-view";
import { ERROR_PARAM, LINKED_PARAM } from "@/lib/constants";

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const params = await searchParams;
  const linked = params[LINKED_PARAM];
  const error = params[ERROR_PARAM];
  return (
    <AccountView
      linked={typeof linked === "string" ? linked : null}
      error={typeof error === "string" ? error : null}
    />
  );
}
