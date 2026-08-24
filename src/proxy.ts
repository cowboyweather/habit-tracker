import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE_NAME, INVITE_COOKIE_MAX_AGE } from "@/lib/invite-cookie";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the session cookie if it's expired. Required so server
  // components can trust the session without each one re-verifying it.
  await supabase.auth.getUser();

  // The join page itself validates the code (get_clowder_preview) and
  // renders correctly for anyone — this cookie only exists to carry the
  // code through signup and onboarding for someone who wasn't logged in
  // yet, so it can be redeemed once there's an account to attach it to.
  const joinMatch = request.nextUrl.pathname.match(/^\/join\/([^/]+)$/);
  if (joinMatch) {
    const code = joinMatch[1].slice(0, 32); // defensive cap; real validation happens server-side
    supabaseResponse.cookies.set(INVITE_COOKIE_NAME, code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: INVITE_COOKIE_MAX_AGE,
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
