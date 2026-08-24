// Snake-case to match get_my_clowder_summary()'s raw RPC return shape
// directly, same convention as LogRow/HabitRecord elsewhere in the app.
export type ClowderMemberSummary = {
  clowder_id: string;
  clowder_name: string;
  invite_code: string;
  user_id: string;
  username: string;
  cat_name: string;
  expression: "content" | "happy" | "restless" | "scruffy";
  logged_today: boolean;
  current_streak: number;
  is_you: boolean;
};
