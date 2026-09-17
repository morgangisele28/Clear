import { useEffect, useState } from "react";
import { todayIso, type IsoDate } from "@/domain/dates.ts";

/** How often to re-check the clock while the app is open. */
const TICK_MS = 60_000;

/**
 * The current calendar day, watched rather than read once.
 *
 * An installed app resumes from the background instead of reloading, so somebody
 * who opens Clear at half past midnight having last used it the previous evening
 * would otherwise be writing into yesterday. Checking on resume and on focus
 * catches the common case; the interval catches the app being left open.
 */
export function useToday(): IsoDate {
  const [today, setToday] = useState<IsoDate>(() => todayIso());

  useEffect(() => {
    const check = () => setToday((previous) => (previous === todayIso() ? previous : todayIso()));
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, TICK_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, []);

  return today;
}
