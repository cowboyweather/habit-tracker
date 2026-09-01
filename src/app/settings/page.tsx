import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PetSettings } from "@/components/PetSettings";
import type { Breed } from "@/components/CatSprite";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: pet } = await supabase
    .from("pets")
    .select("breed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!pet) redirect("/onboarding");

  return (
    <PetSettings userId={user.id} initialBreed={pet.breed as Breed} />
  );
}
