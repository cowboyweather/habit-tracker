"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LABEL_CLASS, FIELD_CLASS } from "@/lib/form-styles";

export function ClowderSettings({
  clowderId,
  initialName,
}: {
  clowderId: string;
  initialName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    setSaved(false);
    const { error } = await supabase.rpc("rename_clowder", {
      target_clowder_id: clowderId,
      new_name: trimmed,
    });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col gap-8 px-4 pt-8">
      <div className="flex items-center gap-3">
        <Link
          href={`/clowders/${clowderId}`}
          aria-label="back"
          className="text-lg text-muted transition hover:text-ink"
        >
          ←
        </Link>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          clowder settings
        </h1>
      </div>

      {error && <p className="text-xs text-red-500/80">{error}</p>}

      <div className="flex flex-col gap-3">
        <label className={LABEL_CLASS} htmlFor="rename-clowder">
          name
        </label>
        <input
          id="rename-clowder"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className={FIELD_CLASS}
        />
        <button
          type="button"
          disabled={
            pending || !name.trim() || name.trim() === initialName
          }
          onClick={handleSave}
          className="min-h-11 rounded-xl bg-ink text-white transition hover:bg-ink/90 active:scale-[0.98] disabled:opacity-60"
        >
          {saved ? "saved" : "save"}
        </button>
      </div>
    </div>
  );
}
