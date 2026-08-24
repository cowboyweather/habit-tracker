import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClowderDetail } from "@/components/ClowderDetail";

export default async function ClowderDetailPage({
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

  return <ClowderDetail clowderId={id} />;
}
