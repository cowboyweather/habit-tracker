import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HabitManager } from "@/components/HabitManager";

export default async function HabitsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <HabitManager userId={user.id} />;
}
