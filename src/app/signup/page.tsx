import { AuthCard } from "@/components/AuthCard";
import { signup } from "@/lib/auth-actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; field?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      title="create account"
      subtitle="pick a username — no email required."
      action={signup}
      primaryLabel="sign up"
      footerPrompt="already have an account?"
      footerLinkLabel="log in"
      footerHref="/login"
      searchParams={params}
    />
  );
}
