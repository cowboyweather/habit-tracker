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
      title="habit tracker"
      subtitle="small steps, tracked one day at a time."
      action={login}
      primaryLabel="log in"
      footerPrompt="new here?"
      footerLinkLabel="sign up"
      footerHref="/signup"
      searchParams={params}
    />
  );
}
