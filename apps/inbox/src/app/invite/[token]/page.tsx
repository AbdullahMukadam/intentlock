import { InviteForm } from "@/components/auth/invite-form";
import { ERROR_PARAM } from "@/lib/constants";

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const error = (await searchParams)[ERROR_PARAM];
  return <InviteForm token={token} error={typeof error === "string" ? error : null} />;
}
