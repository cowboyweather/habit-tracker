const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

// Supabase accounts always need an email under the hood. `.invalid` is a
// reserved TLD (RFC 2606) guaranteed to never resolve or receive mail, so
// there's no chance of colliding with or emailing a real address.
const FAKE_EMAIL_DOMAIN = "habit-tracker.invalid";

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function usernameToEmail(username: string): string {
  return `${username}@${FAKE_EMAIL_DOMAIN}`;
}
