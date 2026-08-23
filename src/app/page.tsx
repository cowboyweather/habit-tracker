import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SwipeShell } from "@/components/SwipeShell";
import { getPendingSeasonRecap } from "@/lib/season-recap";

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

  const pendingRecap = await getPendingSeasonRecap(supabase, user.id);
  if (pendingRecap) redirect("/season-recap");

  return <SwipeShell userId={user.id} createdAt={user.created_at} />;
}
