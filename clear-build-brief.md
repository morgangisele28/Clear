# Build brief: Clear

A private, local-only log for people with bronchiectasis. Build it as an installable web app.

Everything below is a specification, not a suggestion, **except section 6 (design)**, where you should aim to beat what is described rather than match it.

---

## 1. Who it is for, and the actual problem

The user has bronchiectasis and a chronic *Pseudomonas* colonisation. She has two children in preschool, so she catches viruses constantly, and those turn into chest infections. She is not a patient in a clinic; she is a person managing a lifelong condition alone, mostly at 6am, often while feeling terrible.

Her problem is not "I want to track my health". It is this:

> Every time I get sick again, I cannot remember what happened last time. How long was I ill? Did I see anyone? What did they prescribe, at what dose, for how long, and did it work? What did my symptoms do day by day?

Two consequences that should shape every decision:

- **This is an episode record, not a daily diary.** The unit of meaning is an illness episode, not a day. Days are how data gets in; episodes are what she asks questions about.
- **Her success metric is longer gaps between episodes and fewer episodes per year.** Not streaks, not points, not engagement. The app should make that metric visible and should celebrate progress against it.

The single most valuable output is a **written handover she can paste into a message to her respiratory team**.

---

## 2. Hard constraints

**Privacy and architecture**

- All data stays on the user's device in browser storage. No account, no login, no server, no database, no analytics, no telemetry, no error reporting, no fonts or scripts loaded from a CDN at runtime.
- Ship as a self-contained static build that works from any static host. Fonts and icons embedded. It must run correctly opened from a plain URL with no build step on the host.
- Installable: web app manifest, `apple-mobile-web-app-capable`, apple touch icon, standalone display, portrait. Must work added to an iPhone home screen.
- Service worker for offline use. Never cache API responses.
- Call `navigator.storage.persist()` on load. Browsers evict storage for sites not visited for a week, and this app may go unopened during a good month. Show the user whether persistence was granted.
- **JSON export and import are first-class features, not an afterthought.** Full round trip: export must restore exactly. Offer export via `navigator.share()` with a File so one tap sends it to iCloud or Drive, falling back to download. Also offer a CSV export for spreadsheets, clearly labelled as not restorable.
- Nudge the user when their last backup is more than 30 days old.
- The only permitted outbound request is an air quality lookup (below), and only when the user opts into it.

**Mobile first.** Design for a 390px viewport. Desktop is for reading reports and printing.

**Accessibility.** Every interactive element needs an accessible label. Never encode meaning in colour alone. Honour `prefers-reduced-motion` by disabling all animation. Minimum 44px touch targets.

---

## 3. Data model

Persist one JSON object under one storage key. Version it and write forward migrations, because the schema will change and users will already have months of data.

```
AppState {
  v: number                       // schema version
  days: { [YYYY-MM-DD]: Day }
  courses: Course[]               // medication courses
  regimen: RegimenItem[]          // the configurable daily care plan
  prnMeds: string[]               // as-needed medications the user has added
  customDrugs: {name,dose,days}[] // drugs the user has added, remembered for next time
  customSymptoms: string[]
  tags: string[]                  // user-managed tag vocabulary
  locations: {name,lat,lon}[]     // for air quality
  rescue: RescueItem[]            // standby antibiotics kept at home
  appt: { date, who }
  questions: { id, text, done }[] // things to raise at the next appointment
  meta: { seenMilestones: number[] }
}

RegimenItem { id, name, target, note, active }
  // target = doses per day, 0 to 4. note is a free-text dose, e.g. "1 puff".

Day {
  status: 'well' | 'unwell' | null
  care: { [regimenItemId]: number }   // doses actually taken; may exceed target
  plan: {id,name,target}[]            // SNAPSHOT of the regimen this day was scored against
  sputum: { color: 0..7|null, volume: 0..6|null, texture: 0..6|null }
  blood: 'none' | 'streaks' | 'frank' | null
  symptoms: { [key]: 0..3 }
  symptomsReviewed: boolean|undefined
  prn: { [medName]: number }
  temp, spo2, peakFlow, restHr: string   // blank when not taken
  aqi: { value, pm25, source, location, at } | null
  sampleSent: boolean
  organism: string
  tags: string[]
  notes: string
  onsetChecked: boolean
}

Course { id, drug, dose, startDate, days|null, outcome, outcomeNote }
RescueItem { id, name, dose, expiry, lastUsed }
```

**Three model decisions that matter and are easy to get wrong:**

1. **`Day.plan` is a snapshot, deliberately.** When the care plan changes, days already logged must keep the plan they were scored against, or historical adherence percentages silently rewrite themselves. Days predating the snapshot get a migration-assigned plan matching what they were originally scored on. Never retroactively improve or worsen past history.

2. **`symptomsReviewed` distinguishes "absent" from "never answered".** Without it, "no cough" and "did not fill this in" are the same zero, which poisons every severity trend. Marking a day unwell initialises every symptom to an explicit 0 and sets `symptomsReviewed: false`; the first interaction with the list sets it true. Days where it is false are excluded from burden charts rather than counted as clean zeros.

3. **Blank is not zero.** Unlogged days are gaps, never interpolated, never assumed well. Every statistic must state its denominator: "22 of 30 days logged".

**Scales**

- Sputum colour, 8 steps: clear, white, cream, pale yellow, yellow, yellow-green, green, brown/rust. This is an ordinal clinical scale modelled on printed sputum colour charts. **Do not offer a colour picker or free colour choice** — the entire value is that a reading in July is comparable to one next February, and free colour selection guarantees drift.
- Volume, 7 steps: none, trace, scant, small, moderate, large, copious. Show a physical anchor under each (a smear, under a teaspoon, a teaspoon, a tablespoon, two tablespoons, more than an eggcup). Without anchors the user is inconsistent with herself over months.
- Texture, 7 steps: watery, runny, thin, medium, thick, sticky, rubbery. The top end is clinically distinct — tenacious sputum that will not shift is not merely "thick".
- Symptom severity, 4 steps: none, mild, moderate, severe. Coarse on purpose; a 0–10 scale would not be rated consistently across years.
- Default symptoms: cough, more sputum than usual, breathlessness, fatigue, chest tightness or pain, lung sensitivity, wheeze, fever or chills, nasal or sinus, sore throat. User can add their own, and they persist.

---

## 4. Derived logic

All of this is computed, never asked for.

**Episodes.** An episode is a run of days marked unwell. A gap of more than 7 days with no unwell day closes it. This rule is robust to missing entries, which matters because the user will not log every day. Derive per episode: start, end, calendar span, days actually logged, peak sputum colour, whether blood occurred, max temperature, lowest peak flow, mean AQI, cultures grown, overlapping medication courses, tags.

**Onset backfill.** The first day a user marks unwell and the previous day was not, ask when it actually started, with a date picker going back 120 days plus quick options for yesterday, 2, 3 and 7 days ago. Show the consequence live ("that makes today day 8"). Without this, every episode is truncated at the point she remembered to open the app, and duration statistics skew short. Backfilled days are marked unwell with no detail and the UI says so.

**Exacerbation features.** The standard clinical definition is three or more of: increased cough, increased sputum volume, increased purulence, breathlessness, fatigue, haemoptysis. Count them from what has been logged. When three or more are present, name which ones and state that three or more sustained over 48 hours is the usual threshold for contacting a team rather than waiting. **Say explicitly that this is a count of logged entries and not a diagnosis.**

**Sputum change against baseline.** Compare today's colour to the median of the last seven recorded days. A shift of two or more steps toward purulent gets a callout, because that is the actionable early signal.

**Course response, derived not self-reported.** When a medication course ends, read the symptom log across it and report, per symptom present at the start, whether it eased and on which day, whether it resolved, plus the sputum colour at start versus end. Output reads: "cough gone by day 4, breathlessness eased from day 3, fatigue no change, sputum green to cream". Ask the user only the one thing that cannot be derived — did it feel like it cleared, partly helped, or did nothing — plus a free note for side effects. State how many days of the course were actually logged, since unlogged days mean a symptom may have turned earlier than shown.

**Peak flow zones.** Read against the user's own personal best, never against predicted-normal tables, which are a poor guide in structural lung disease. Personal best = highest reading on a **well** day in the last 12 months, requiring at least 5 such readings before saying anything. Zones: green 80–100%, amber 50–80%, red below 50%, with the standard action-plan meaning of each. Always add that if their team has written them a personal best, theirs is the one to use.

**Early warning on rolling windows.** Everything above is same-day. Also compare recent runs against prior runs and surface only when several readings move together:

- sputum colour: mean of last 3 entries vs mean of the 8 before, flag at +1.3 steps
- sputum volume: same comparison, same threshold
- peak flow: mean of last 3 readings vs previous 6, flag at −8%
- resting heart rate: mean of last 3 vs median of well days, flag at +10%, needs 8 well-day readings
- care adherence: last 7 days vs previous 21, flag at a 22 percentage-point drop

Requires minimum data per signal and stays completely silent otherwise. **A warning system that fires on noise is ignored by week three.** Test explicitly that a steady month and an empty log produce nothing.

**Clear run and celebration.** Track the current run of days since the last episode ended, and the user's best historical gap. Show current against best. Beating the personal best is the celebration moment. Milestones at 30, 60, 90, 180, 270 and 365 days, each acknowledged once and never repeated. Personal best is the target rather than "fewer episodes than last year" because the annual metric is too slow a loop to motivate anything daily.

**Year on year.** Episodes in the last 12 months against the 12 before. State plainly that this is the number the whole app exists to move, and that it needs two years of data to mean anything.

**Association, not cause.** Where the app compares care adherence or air quality against episode timing, label it as association, note the confounds out loud (illness itself disrupts routines; in Bangkok, burning season and viral season overlap), and never imply causation.

**Air quality.** Optional. Default location configurable, with place search, and multiple saved locations because the user travels. Fetch US AQI and PM2.5 from Open-Meteo's free no-key air quality API, supporting past dates for backfill. Time out after 5 seconds and fall back to manual entry with a link out to a public AQI site. Colour bands should follow EPA breakpoints but **not** EPA signage colours, which are ugly and clash with any considered palette.

---

## 5. Screens

Three tabs. Not four: an earlier version split History into Trends and Episodes and it was one tab too many.

### Log

The default screen and the one that must be fast. Target: **one tap to log a well day.**

- Header: app name, month-view button, a 7-day strip with a dot under every logged day (distinctly coloured if that day was unwell), paging chevrons.
- A Well / Unwell segmented control. **Well must not auto-tick the care items** — a compliance display that fills itself in is decoration. It sets status and carries forward the previous sputum reading and prescribed doses so the day opens with sensible values rather than blanks.
- Hero: a segmented progress ring showing today's care doses completed against the day's plan total. Segment count is derived from the plan, so adding a treatment adds segments. Below it, the clear-run figure and a bar showing progress toward personal best.
- Three compact stats: today's sputum, seven-day care count, last peak flow with how stale it is.
- Then, in order: early warning if anything fires, reminders, daily airway care, sputum, symptoms and culture when unwell, measurements, medication courses, air quality, tags, notes, the 90-day sputum ribbon, and a clear-this-day action.

**Progressive disclosure is essential.** A well day should show care, sputum, tags and notes only. Measurements and medication courses collapse behind one button. Notes and tags collapse to an "Add" affordance and auto-expand if that day already has content. Blood only appears once sputum has been recorded, as No/Yes, with the streaks-versus-frank choice revealed only on Yes.

**Reminders must be the input, not a signpost.** The weekly peak flow prompt is a slim bar with a number field and a tick, plus a dismiss that snoozes for that day only. A reminder whose only action is "go elsewhere and do the thing" is not a reminder.

**Daily airway care is user-configurable and this is not optional.** Treatments have a name, a dose note, doses per day, and can be archived without deleting history. Never hardcode specific drugs — a version that hardcoded one particular inhaler was unusable by anyone else. Each item is a full-width pill that fills as you tap it, with a separate small control for extra sessions beyond the target. A maintenance inhaler is two things, not one: the **prescribed dose** (a neutral row, no progress styling, because a higher dose means worse lungs and must never read as achievement) and **adherence today** (the pill, where full means you took what was prescribed).

**The sputum ribbon** is the signature element: 90 days as a row of columns where colour is the sputum reading and height is volume, with a red mark under any day with blood and a faint dash for unlogged days. Tap a column to jump to that day. It makes a year of history legible at a glance and turns episodes into visible bands.

**Month view**: a calendar where each cell is tinted by that day's sputum colour, outlined if unwell, with a marker for full care and a dot for blood. Tap to jump.

### History

A segmented control in the header switching **Episodes** and **Patterns**, in the same position as Well/Unwell on the Log tab, so the header is consistently where you change what you are looking at.

- **Episodes**: all-time counts, then a card per episode, newest first — dates, duration, well days before it, a colour strip of the episode, and tags for peak sputum, haemoptysis, cultures, treatments with outcomes, and how many of its days were logged. Opening one gives a day-by-day table, the written handover, and notes.
- **Patterns**: year-on-year episode count, care adherence per treatment, care and air quality compared against episode timing, peak flow over time, days between episodes, symptom burden through the most recent episode.

### Report

For the clinic. Range selector, print-to-PDF plus a copy-as-text fallback because mobile print dialogs are unreliable. Summary figures, open appointment questions, current medication, an episode table with onset, duration, gap, peak sputum, culture, lowest peak flow and treatment with outcomes, then day-by-day tables for recent episodes. Also holds the appointment card, rescue pack editor, and the backup and restore controls.

**Printed output should keep clinical naming even though the app is called Clear.** A file named "clear.csv" tells a respiratory consultant nothing.

### The handover

The highest-value output. A one-to-two paragraph written summary of an episode, generated **deterministically from the logged data**. Dates and duration, what it opened with, the sputum trajectory, blood, peak temperature, lowest peak flow as a percentage of personal best, treatment and derived response, culture result, care adherence through it, and when it settled. First person, plain language, ready to paste into a message.

**Do not use a language model to write this.** It is a document that changes what the user gets prescribed. A model can round a figure, merge two symptoms, or invent a plausible detail. Templated prose that cannot be wrong is worth more than prose that reads slightly better. Tell the user in the UI that it was written from their log and not generated. Handle the awkward cases: a culture that grew nothing must not read "grew No growth", and an ongoing episode says "so this is day 6" rather than pretending it ended.

---

## 6. Design direction — improve on this

The constraints below are load-bearing. Everything else is yours to make better, and you should.

**Fixed constraints**

- No serif typefaces anywhere.
- **Sputum colour swatches and the ribbon must sit on pure white, never on a tint, gradient or glass surface.** Colour accuracy is the entire clinical point of that control and a blue cast shifts how yellow and green read.
- Red is reserved for haemoptysis and genuine alarms. Nothing else.
- The sputum ramp should be the most saturated thing on screen, because it is the only colour carrying clinical meaning.
- Avoid anything visceral. An earlier version rendered a vial of sputum that filled and changed viscosity. It was accurate, and the user hated it. Abstract the data.

**The organising metaphor: clear lungs, clear sky.** The app's name, its success state and its background are the same idea. The header is a sky. As the user's clear run lengthens toward their personal best, the sky visibly clears — haze lifts, cloud thins, light increases. Airborne particulate drift scales with the actual measured AQI, so on a bad air day the app looks like the air outside. There are no badges and no confetti: the thing she opens every morning simply looks better when she is doing well. **This is the best idea in the app and it deserves better execution than it has had.**

Previous attempts and their failure modes, so you can skip them:

- Radial-gradient ellipses as clouds read as flat beige smears. Neutral white at high opacity over blue desaturates into putty.
- Fractal-noise turbulence with an alpha threshold gives genuine wispy silhouettes, but tiling two identical noise sheets to loop a drift produces a hard vertical seam at every join, and clipping the filter region at the element edge sharpens it further.
- Whatever technique you use, verify there are no seams, that it composites on the GPU using transform and opacity only, and that it costs nothing while scrolling. This app is opened every day on mobile data by someone who is often unwell.

**Where I would push hardest if I were you**

- The sky. Volumetric depth, parallax that feels physical, light that behaves like light. Aim for the quality bar of Apple's Weather app, where the background reports the condition rather than decorating it.
- Charts. The existing ones are functional and plain. There is real craft available in how a 90-day sputum record or a two-year episode timeline is drawn.
- Micro-interactions. Filling a dose, completing the day's care, crossing a milestone. Each should feel like something.
- Empty states. A new user sees a lot of nothing, and nothing is currently made of it.
- Iconography. There is none, deliberately, because generic icon sets cheapen a considered interface. A small purpose-drawn set for the treatments and the tab bar would earn its place.
- Typography at the extremes: the hero numerals, the small uppercase labels, and tabular figures in the tables.

**Restraint that must survive.** No scroll-triggered reveal animations. This is opened at 6am, every day, for years, by someone coughing. Animation on arrival becomes latency you have to sit through. Micro-interactions on touch, yes. Cinematics, no.

---

## 7. Voice

Write like a knowledgeable friend, not a product.

- Short sentences. No corporate register. No exclamation marks. No emoji anywhere.
- Never congratulate generically. At a personal best, say something true and specific: *"The longest run you have on record. Whatever you have been doing these past few months, this is it working."*
- State limits out loud rather than hiding them. *"Counted over the 22 days you actually logged, each against the plan in force that day, so they don't flatter you for days you skipped."*
- Never scold. Missed days are neutral grey, never red, and there is no language of failure anywhere.

---

## 8. Safety

- Not a medical device. Say so, in the app and in any README.
- Never diagnose. Report counts and comparisons; name the standard thresholds as general reference points, not as a plan written for this person.
- Route to their clinical team for anything concerning, with a specific timeframe: frank blood is a same-day call; SpO2 under 92 on a home meter is worth checking today; three or more exacerbation features sustained over 48 hours is the usual point to make contact.
- Temper home readings honestly. A low SpO2 should first prompt a retake on a warm still hand, because cold fingers and movement throw pulse oximeters off far more often than lungs do.
- Never fabricate a figure. If data is missing, say it is missing.

---

## 9. Anti-patterns from the first build

Every one of these was built, shipped and rejected. They are the most useful part of this brief.

1. **Card soup.** Every section as an identical white rounded rectangle with a 1px grey border. No hierarchy, nowhere for the eye to go. Fix: a tinted canvas with genuinely floating white cards, diffused shadow instead of border, and one thing per screen that is unambiguously the most important.
2. **No typeface.** The system font stack has no voice. Choose deliberately and embed it.
3. **Fixed geometry that breaks on real data.** A progress ring with a hardcoded four segments and a fixed gap looked fine until the plan grew, at which point round line caps grew into each other and it rendered as one solid circle. Make geometry proportional and test it across the full plausible range.
4. **Reminders that only navigate.** See section 5.
5. **A hero that shows the wrong number.** The prominent figure was days-since-last-episode; the user pointed out the screen's job is the thing she opened it to do, which is today's care. Rank by task, not by data volume.
6. **A "well" shortcut that lied.** Covered above, and it undermined the one metric meant to drive behaviour.
7. **A fixed care regimen.** Hardcoding one person's nebuliser and inhaler made the app useless to everyone else and to her own future self.
8. **A 4-step scale where 7 was needed.** Volume and texture were too coarse to capture what she was actually observing. Ask, then migrate existing data preserving relative position — never reset it.
9. **Silent failures.** A blocked network request was caught and swallowed, so "blocked by the platform" looked identical to "nothing happened". Surface what failed and what to do instead.
10. **Trusting that storage worked.** Prove it with a write-read-compare round trip on load and tell the user if it failed. Storage that silently discards data is worse than storage that is absent.
11. **A destructive sample-data loader sitting next to the backup button.** If you ship demo data, hide the loader once real data exists.
12. **Assuming the calendar day.** An installed app resumes from background rather than reloading, so a date computed once at startup goes stale overnight. Watch for the day changing on visibility, focus and an interval, recompute everything derived from today, and only move the user's selected date forward if they were sitting on what used to be today.

---

## 10. Acceptance tests

Automate these. Most bugs in the first build would have been caught by them.

1. Logging a well day takes one tap.
2. Export, wipe, import: state is identical.
3. Sputum entries on the old 4-step scale migrate to 7 steps preserving relative position.
4. Changing the care plan does not alter any previously computed adherence figure.
5. A month of steady readings and an empty log both produce zero early-warning signals.
6. Each early-warning signal fires in isolation on a synthetic series that should trigger it.
7. Episodes group correctly across unlogged gaps of 1 to 7 days, and split at 8.
8. The care ring renders discrete segments at plan totals from 1 to 16.
9. The handover reads correctly for: an ongoing episode, one with no antibiotics, one with a culture that grew nothing, and one with a single logged day.
10. A day with no entry appears as a gap everywhere and is excluded from every denominator.
11. The app opened at 23:59 shows the new day at 00:01 without a reload.
12. Everything renders and is usable at 390px wide.
13. With `prefers-reduced-motion`, nothing animates.
