import { useMemo } from "react";
import type { Action } from "@/app/actions.ts";
import type { IsoDate } from "@/domain/dates.ts";
import { dosesDone, dosesExpected, planFor } from "@/domain/care.ts";
import { courseRunsOn } from "@/domain/courses.ts";
import { exacerbationRules } from "@/domain/exacerbation.ts";
import { formatLong } from "@/domain/format.ts";
import { emptyDay } from "@/domain/state.ts";
import {
  BLOOD_LOOKS,
  BLOOD_VOLUMES,
  SEVERITY_LABELS,
  SPUTUM_COLOURS,
  SPUTUM_TEXTURES,
  SPUTUM_VOLUMES,
  SYMPTOMS,
  CUSTOM_SYMPTOM_PREFIX,
  symptomLabel,
} from "@/domain/scales.ts";
import type { AppState, DayEntry, Severity } from "@/domain/types.ts";
import { CareRing } from "../components/CareRing.tsx";
import { Seg } from "../components/Seg.tsx";
import { Slider } from "../components/Slider.tsx";
import { Stepper } from "../components/Stepper.tsx";

interface Props {
  state: AppState;
  dispatch: (action: Action) => void;
  date: IsoDate;
  today: IsoDate;
}

const SPUTUM_RAMP = `linear-gradient(90deg, ${SPUTUM_COLOURS.map((c) => c.hex).join(", ")})`;

export function Today({ state, dispatch, date, today }: Props) {
  const day: DayEntry = useMemo(
    () => ({ ...emptyDay(), ...state.days[date] }),
    [state.days, date],
  );

  const patch = (p: Partial<DayEntry>) => dispatch({ type: "day/patch", date, patch: p });

  if (!day.status) {
    return <StatusFork date={date} today={today} dispatch={dispatch} />;
  }

  return (
    <>
      <CareCard state={state} day={day} date={date} today={today} dispatch={dispatch} />
      <SputumCard day={day} onPatch={patch} />
      {day.status === "unwell" ? (
        <SymptomCard state={state} day={day} date={date} dispatch={dispatch} />
      ) : null}
      <ExacerbationCount state={state} day={day} />
      <NotesCard day={day} onPatch={patch} />
      <div className="btnrow" style={{ marginTop: 18 }}>
        <button className="btn" onClick={() => dispatch({ type: "day/clear", date })}>
          Clear this day
        </button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The first thing asked on a day with nothing on it.
 *
 * Marking yourself well does not close the day down. On a good day you are still
 * trying to do two nebs and your clearance device, and that is the part hardest
 * to keep up, so the care card stays exactly where it is either way.
 */
function StatusFork({
  date,
  today,
  dispatch,
}: {
  date: IsoDate;
  today: IsoDate;
  dispatch: (action: Action) => void;
}) {
  return (
    <div className="card">
      <div className="card__title">
        <h2>{date === today ? "How is today?" : formatLong(date)}</h2>
      </div>
      <p className="note" style={{ marginTop: 0 }}>
        Either answer opens the same day. Marking yourself well does not put the
        care plan away.
      </p>
      <div className="btnrow" style={{ marginTop: 14 }}>
        <button className="btn btn--primary" onClick={() => dispatch({ type: "day/markWell", date })}>
          Well
        </button>
        <button
          className="btn btn--alarm"
          onClick={() => dispatch({ type: "day/setStatus", date, status: "unwell" })}
        >
          Not well
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CareCard({
  state,
  day,
  date,
  today,
  dispatch,
}: Props & { day: DayEntry }) {
  const plan = planFor(day, state.regimen);
  const done = dosesDone(day, state.regimen);
  const expected = dosesExpected(plan);

  // Anything on a course is counted separately, in the same card, so the two
  // numbers never quietly change what the other one means.
  const running = state.courses.filter((c) => courseRunsOn(c, date, today));

  return (
    <div className="card">
      <div className="card__title">
        <h2>Today's care</h2>
        <span className="hint">{day.status === "unwell" ? "Not well" : "Well"}</span>
      </div>

      {plan.length === 0 ? (
        <p className="note">
          No plan set up yet. Add your treatments and the ring will follow them.
        </p>
      ) : (
        <>
          <div className="care">
            <CareRing done={done} total={expected} />
          </div>
          <div className="doses">
            {plan.map((row) => (
              <Stepper
                key={row.id}
                label={row.name}
                count={day.care[row.id] ?? 0}
                target={row.target}
                onChange={(count) =>
                  dispatch({
                    type: "day/setCare",
                    date,
                    treatmentId: row.id,
                    count,
                    regimen: state.regimen,
                  })
                }
              />
            ))}
          </div>
        </>
      )}

      {running.length > 0 ? (
        <>
          <div className="rowlab">On a course</div>
          <div className="doses">
            {running.map((course) => (
              <Stepper
                key={course.id}
                label={course.drug}
                hint={course.dose}
                count={day.courseDoses[course.id] ?? 0}
                target={course.freq || 1}
                onChange={(count) =>
                  dispatch({ type: "course/setDose", date, id: course.id, count })
                }
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SputumCard({ day, onPatch }: { day: DayEntry; onPatch: (p: Partial<DayEntry>) => void }) {
  const { sputum } = day;

  return (
    <div className="card">
      <div className="card__title">
        <h2>Sputum</h2>
        <span className="hint">fixed scales, so July compares with February</span>
      </div>

      <Slider
        label="Colour"
        value={sputum.color}
        max={SPUTUM_COLOURS.length - 1}
        valueLabel={sputum.color == null ? "Not set" : SPUTUM_COLOURS[sputum.color]!.label}
        track={SPUTUM_RAMP}
        onChange={(v) => onPatch({ sputum: { ...sputum, color: v as never } })}
      />

      <Slider
        label="Volume"
        value={sputum.volume}
        max={SPUTUM_VOLUMES.length - 1}
        valueLabel={sputum.volume == null ? "Not set" : SPUTUM_VOLUMES[sputum.volume]!.label}
        {...(sputum.volume != null && SPUTUM_VOLUMES[sputum.volume]!.hint
          ? { hint: SPUTUM_VOLUMES[sputum.volume]!.hint }
          : {})}
        onChange={(v) => onPatch({ sputum: { ...sputum, volume: v as never } })}
      />

      <Slider
        label="Thickness"
        value={sputum.texture}
        max={SPUTUM_TEXTURES.length - 1}
        valueLabel={sputum.texture == null ? "Not set" : SPUTUM_TEXTURES[sputum.texture]!}
        onChange={(v) => onPatch({ sputum: { ...sputum, texture: v as never } })}
      />

      <div className="rowlab">Any blood?</div>
      <Seg
        label="Blood over the day"
        options={BLOOD_VOLUMES.map((b) => ({ value: b.v, label: b.label }))}
        value={day.blood}
        alarmFrom={4}
        onChange={(v) => onPatch({ blood: v })}
      />
      {day.blood && day.blood !== "none" ? (
        <>
          <div className="rowlab">What did it look like?</div>
          <Seg
            label="Appearance"
            options={BLOOD_LOOKS.map((b) => ({ value: b.v, label: b.label }))}
            value={day.bloodLook}
            onChange={(v) => onPatch({ bloodLook: v })}
          />
          {day.blood === "teacup" || day.blood === "more" ? (
            <p className="banner banner--alarm">
              {BLOOD_VOLUMES.find((b) => b.v === day.blood)!.hint}. This is one to
              ring about rather than log and wait.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SymptomCard({
  state,
  day,
  date,
  dispatch,
}: {
  state: AppState;
  day: DayEntry;
  date: IsoDate;
  dispatch: (action: Action) => void;
}) {
  const keys = [
    ...SYMPTOMS.map((s) => s.key),
    ...state.customSymptoms.map((n) => CUSTOM_SYMPTOM_PREFIX + n),
  ];
  const unreviewed = day.symptomsReviewed === false;

  return (
    <div className="card">
      <div className="card__title">
        <h2>Symptoms</h2>
        {day.symptomsReviewed === false ? (
          <span className="hint">not answered yet</span>
        ) : null}
      </div>

      {day.symptomsReviewed === false ? (
        <p className="note" style={{ marginTop: -4, marginBottom: 12 }}>
          Marking a day unwell fills this in as none so that a blank and a real
          none stay different things. Nothing here counts as answered until you
          touch it.
        </p>
      ) : null}

      {keys.map((key) => (
        <div key={key} className="symptom">
          <div className="rowlab">{symptomLabel(key)}</div>
          <Seg
            label={symptomLabel(key)}
            options={SEVERITY_LABELS.map((label, i) => ({ value: i as Severity, label }))}
            // While the list is unreviewed the stored zeros are a placeholder, not
            // an answer, so nothing is shown as chosen. Showing a confident "None"
            // would have the screen claim the question was answered when the rest
            // of the app is carefully treating it as unanswered.
            value={unreviewed ? null : (day.symptoms[key] ?? null)}
            onChange={(severity) => dispatch({ type: "day/setSymptom", date, key, severity })}
          />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The count sits outside everything foldable on purpose: it is the one thing on
 * this screen that must not be rolled away out of sight.
 */
function ExacerbationCount({ state, day }: { state: AppState; day: DayEntry }) {
  const rules = exacerbationRules(day, state.conditions);
  const met = rules.filter((r) => r.met);
  if (!met.length) return null;

  return (
    <>
      {met.map((rule) => (
        <div key={rule.key} className="banner banner--watch">
          {rule.count} of {rule.label} are present today ({rule.present.join(", ")}).{" "}
          {rule.threshold} or more is the usual threshold for ringing your team rather
          than waiting it out. This counts what you logged. It is not a diagnosis.
        </div>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function NotesCard({ day, onPatch }: { day: DayEntry; onPatch: (p: Partial<DayEntry>) => void }) {
  return (
    <div className="card">
      <div className="card__title">
        <h2>Anything else</h2>
      </div>
      <textarea
        className="inp"
        rows={3}
        placeholder="Anything worth remembering about today"
        value={day.notes}
        onChange={(e) => onPatch({ notes: e.target.value })}
      />
    </div>
  );
}
