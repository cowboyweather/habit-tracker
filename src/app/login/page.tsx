import { AuthCard } from "@/components/AuthCard";
import { login } from "@/lib/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; field?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      title="Habit Tracker"
      subtitle="Small steps, tracked one day at a time."
      action={login}
      primaryLabel="Log in"
      footerPrompt="New here?"
      footerLinkLabel="Sign up"
      footerHref="/signup"
      searchParams={params}
    />
  );
}
