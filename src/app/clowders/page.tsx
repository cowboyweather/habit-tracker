import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClowderPanel } from "@/components/ClowderPanel";

export default async function ClowdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <ClowderPanel />;
}
