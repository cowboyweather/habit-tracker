import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClowderSettings } from "@/components/ClowderSettings";
import type { ClowderMemberSummary } from "@/lib/clowder";

export default async function ClowderSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // The settings button is already hidden from non-leaders in the UI, but
  // that's not the enforcement — rename_clowder itself rejects a
  // non-leader's call regardless. This redirect is the second, independent
  // layer: even a direct visit to this URL can't render the form for
  // someone who isn't the leader.
  const { data } = await supabase.rpc("get_my_clowder_summary");
  const rows = (data as ClowderMemberSummary[] | null) ?? [];
  const me = rows.find((r) => r.clowder_id === id && r.is_you);

  if (!me || !me.is_leader) redirect(`/clowders/${id}`);

  return <ClowderSettings clowderId={id} initialName={me.clowder_name} />;
}
