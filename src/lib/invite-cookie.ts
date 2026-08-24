// The invite code is the credential — no separate token. Stored in a
// cookie (not sessionStorage) specifically so it survives a link opened in
// an in-app browser (Instagram, etc.) and later reopened in the system
// browser, which loses sessionStorage entirely. That's a common path for a
// link shared in a DM.
export const INVITE_COOKIE_NAME = "pending_invite_code";
export const INVITE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
