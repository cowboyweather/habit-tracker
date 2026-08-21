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
      title="Create account"
      subtitle="Pick a username — no email required."
      action={signup}
      primaryLabel="Sign up"
      footerPrompt="Already have an account?"
      footerLinkLabel="Log in"
      footerHref="/login"
      searchParams={params}
    />
  );
}
