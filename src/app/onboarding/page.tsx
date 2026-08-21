import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "@/components/OnboardingFlow";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: pet } = await supabase
    .from("pets")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pet) redirect("/");

  return <OnboardingFlow />;
}
