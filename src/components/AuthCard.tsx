import Link from "next/link";
import CatSprite from "@/components/CatSprite";
import { PasswordInput } from "@/components/PasswordInput";
import { LABEL_CLASS, FIELD_ERROR_CLASS, FIELD_CLASS } from "@/lib/form-styles";

export function AuthCard({
  title,
  subtitle,
  action,
  primaryLabel,
  footerPrompt,
  footerLinkLabel,
  footerHref,
  searchParams,
}: {
  title: string;
  subtitle: string;
  action: (formData: FormData) => void | Promise<void>;
  primaryLabel: string;
  footerPrompt: string;
  footerLinkLabel: string;
  footerHref: string;
  searchParams: { error?: string; field?: string };
}) {
  const generalError =
    searchParams.error && !searchParams.field ? searchParams.error : null;
  const usernameError =
    searchParams.field === "username" ? searchParams.error : null;
  const passwordError =
    searchParams.field === "password" ? searchParams.error : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[400px] flex-col justify-center gap-6 px-6 py-10">
      <div className="flex h-44 items-center justify-center rounded-2xl bg-gradient-to-br from-sky to-sand">
        <CatSprite expression="content" size={120} />
      </div>

      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>

      {generalError && (
        <p className="text-center text-xs text-red-500/80">{generalError}</p>
      )}

      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS} htmlFor="username">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            pattern="[a-z0-9_]{3,20}"
            title="3-20 characters: lowercase letters, numbers, underscore"
            className={FIELD_CLASS}
          />
          {usernameError && (
            <p className={FIELD_ERROR_CLASS}>{usernameError}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS} htmlFor="password">
            Password
          </label>
          <PasswordInput name="password" minLength={6} />
          {passwordError && (
            <p className={FIELD_ERROR_CLASS}>{passwordError}</p>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 pt-2">
          <button
            formAction={action}
            className="min-h-11 w-full rounded-xl bg-ink text-white transition hover:bg-ink/90 active:scale-[0.98]"
          >
            {primaryLabel}
          </button>
          <p className="text-sm text-muted">
            {footerPrompt}{" "}
            <Link
              href={footerHref}
              className="font-medium text-accent transition hover:text-accent/80"
            >
              {footerLinkLabel}
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
