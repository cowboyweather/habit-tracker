"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidUsername, usernameToEmail } from "@/lib/username";

const USERNAME_RULES =
  "Usernames must be 3-20 characters: lowercase letters, numbers, underscore.";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const username = (formData.get("username") as string).toLowerCase();
  const password = formData.get("password") as string;

  if (!isValidUsername(username)) {
    redirect(
      `/login?field=username&error=${encodeURIComponent(USERNAME_RULES)}`,
    );
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error) {
    redirect(
      `/login?field=password&error=${encodeURIComponent("Incorrect username or password.")}`,
    );
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const username = (formData.get("username") as string).toLowerCase();
  const password = formData.get("password") as string;

  if (!isValidUsername(username)) {
    redirect(
      `/signup?field=username&error=${encodeURIComponent(USERNAME_RULES)}`,
    );
  }

  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username } },
  });

  if (error) {
    const message = error.message.includes("already registered")
      ? "That username is taken."
      : error.message;
    redirect(`/signup?field=username&error=${encodeURIComponent(message)}`);
  }

  if (!data.session) {
    redirect(
      `/signup?error=${encodeURIComponent(
        'Account created but not logged in — turn off "Confirm email" in Supabase (Authentication -> Providers -> Email) and try again.',
      )}`,
    );
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
