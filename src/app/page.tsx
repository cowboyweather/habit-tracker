import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HomeDashboard } from "@/components/HomeDashboard";

export default async function Home() {
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

  if (!pet) redirect("/onboarding");

  const username = (user.user_metadata.username as string) ?? "there";

  return <HomeDashboard userId={user.id} username={username} />;
}
