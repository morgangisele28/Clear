import { useMemo, useState } from "react";
import { useLog } from "@/app/useLog.ts";
import { useToday } from "@/app/useToday.ts";
import { addDays, type IsoDate } from "@/domain/dates.ts";
import { careRun } from "@/domain/care.ts";
import { buildEpisodes, wellRun } from "@/domain/episodes.ts";
import { earlyWarning, warningSignature } from "@/domain/analytics.ts";
import { formatLong } from "@/domain/format.ts";
import { backupStatus } from "@/storage/log.ts";
import { browserStore } from "@/storage/store.ts";
import { Today } from "./screens/Today.tsx";
import "./theme.css";

type Tab = "today" | "history" | "report";

const TAB_TITLES: Record<Tab, { title: string; sub: string }> = {
  today: { title: "Clear", sub: "" },
  history: { title: "History", sub: "everything on record" },
  report: { title: "Report", sub: "for your respiratory team" },
};

export function App() {
  const today = useToday();
  const store = useMemo(() => browserStore(), []);
  const { state, dispatch, ready, canSave, save } = useLog(today, store);

  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState<IsoDate>(today);

  const episodes = useMemo(
    () => buildEpisodes(state.days, state.courses, today),
    [state.days, state.courses, today],
  );
  const run = useMemo(() => wellRun(state.days, episodes, today), [state.days, episodes, today]);
  const care = useMemo(() => careRun(state.days, state.regimen, today), [state.days, state.regimen, today]);

  // The sky clears as care is kept up rather than as time passes since an
  // illness — the same picture, tied to something that can be done this morning.
  const clarity = care.hasPlan ? 0.25 + 0.75 * (care.rate ?? 0) : run.clarity;

  const warnings = useMemo(
    () => earlyWarning(state.days, state.regimen, today),
    [state.days, state.regimen, today],
  );
  const unseenWarnings =
    warnings.length && warningSignature(warnings) !== state.ewSeen ? warnings : [];

  const backup = backupStatus(store, today);

  if (!ready) {
    return (
      <div className="app">
        <header className="sky">
          <div className="wrap sky__title">
            <h1>Clear</h1>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="app">
      <header
        className={"sky" + (tab === "today" ? "" : " sky--compact")}
        style={{ "--clarity": clarity } as React.CSSProperties}
      >
        <div className="sky__haze" style={{ opacity: 0.42 * (1 - clarity) }} />
        <div className="wrap">
          <div className="sky__title">
            <h1>{TAB_TITLES[tab].title}</h1>
            <div className="sky__actions">
              {TAB_TITLES[tab].sub ? (
                <span className="sky__sub">{TAB_TITLES[tab].sub}</span>
              ) : null}
              <button
                type="button"
                className={`iconbtn backup backup--${backup.tone}`}
                onClick={() => setTab("report")}
                aria-label={`${backup.label}. Open backup.`}
                title={backup.label}
              >
                <span className="backup__dot" />
                <span>{backup.short}</span>
              </button>
            </div>
          </div>

          {tab === "today" ? (
            <DayBar date={date} today={today} onChange={setDate} />
          ) : null}
        </div>
      </header>

      <main className="wrap">
        {!canSave ? (
          <p className="banner banner--alarm">
            This browser will not let Clear save anything, so nothing you type here
            will still be here tomorrow. Private browsing is the usual cause.
          </p>
        ) : null}

        {save.status === "failed" ? (
          <p className="banner banner--alarm">
            {save.reason === "full"
              ? "There is no room left to save. Back up and then clear some space."
              : "That did not save. Nothing you have typed is stored yet."}
          </p>
        ) : null}

        {tab === "today" ? (
          <>
            {unseenWarnings.map((warning) => (
              <div key={warning.key} className={`banner banner--${warning.level}`}>
                {warning.text}
              </div>
            ))}
            {unseenWarnings.length ? (
              <div className="btnrow" style={{ marginTop: 8 }}>
                <button
                  className="btn"
                  onClick={() =>
                    dispatch({ type: "warnings/dismiss", signature: warningSignature(warnings) })
                  }
                >
                  Noted
                </button>
              </div>
            ) : null}
            <Today state={state} dispatch={dispatch} date={date} today={today} />
          </>
        ) : null}

        {tab === "history" ? <Placeholder name="History" /> : null}
        {tab === "report" ? <Placeholder name="Report" /> : null}
      </main>

      <nav className="tabs no-print" aria-label="Sections">
        {(["today", "history", "report"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className="tabs__tab"
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {TAB_TITLES[key].title === "Clear" ? "Today" : TAB_TITLES[key].title}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** The selected day, with a way back to today when you have wandered off it. */
function DayBar({
  date,
  today,
  onChange,
}: {
  date: IsoDate;
  today: IsoDate;
  onChange: (date: IsoDate) => void;
}) {
  return (
    <div className="daybar">
      <button
        type="button"
        className="iconbtn"
        onClick={() => onChange(addDays(date, -1))}
        aria-label="Previous day"
      >
        ‹
      </button>
      <span className="daybar__label">{date === today ? "Today" : formatLong(date)}</span>
      <button
        type="button"
        className="iconbtn"
        onClick={() => onChange(addDays(date, 1))}
        disabled={date >= today}
        aria-label="Next day"
        style={date >= today ? { opacity: 0.35 } : undefined}
      >
        ›
      </button>
    </div>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="card">
      <div className="card__title">
        <h2>{name}</h2>
      </div>
      <p className="note">
        Not rebuilt yet. The derivations behind this screen are ported and tested;
        the screen itself is still to come.
      </p>
    </div>
  );
}
