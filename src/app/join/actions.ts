"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { INVITE_COOKIE_NAME } from "@/lib/invite-cookie";

// Redeems whatever invite code is pending in the cookie (set by proxy.ts
// when visiting /join/<code>), if any. Called once onboarding finishes —
// the invite has to survive signup, naming the cat, and adding first
// habits before there's even an account to attach a clowder membership to.
// Clears the cookie unconditionally: succeed, fail, or nothing pending at
// all, it shouldn't be redeemed twice or linger past this attempt.
export async function redeemPendingInvite(): Promise<
  { joined: true } | { joined: false; reason?: string }
> {
  const cookieStore = await cookies();
  const code = cookieStore.get(INVITE_COOKIE_NAME)?.value;

  if (!code) return { joined: false };

  cookieStore.delete(INVITE_COOKIE_NAME);

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_clowder_by_invite_code", {
    code,
  });

  if (error) {
    return { joined: false, reason: error.message };
  }
  return { joined: true };
}
