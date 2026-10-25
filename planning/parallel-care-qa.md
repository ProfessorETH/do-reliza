# Parallel work during care — 2026-10-25

- Coffee and rest travel no longer block the shared shift clock, hourly ticks or mentoring another available colleague. Next-hour controls remain enabled. Dialog/event pauses keep their existing behavior.
- Only the absent employee's tasks are excluded. Outbound, coffee drinking and returning phases receive no idle recovery or work progress. A seated break still recovers once for its one game hour; coffee recovers once after the drink. Queued colleagues continue working at their computers.
- Clock ticks continue when ready tasks are waiting for absent employees. Release waits for pending care to finish, then settles without charging a further hour. Random desk incidents select present colleagues.
- Assignments and existing progress remain intact across travel, saved phases and return. The original task resumes automatically after the arrival callback clears the trip.

Validation: syntax checks, 149 tests, production build, four hosting tests and hosting compression. Added coverage for each coffee/rest phase, saved-state resume, idle recovery prevention, queued workers, all-waiting clock ticks, release completion, mentoring and incident participants.

Real browser desktop: while Mira went for coffee, time advanced to hour 1, her design remained at 25%, Iskra's code reached 26.25%; after return design reached 66.20%, assignment stayed Mira and auto stayed enabled. Mobile 390px rest produced the same parallel-work and resume result, with no page errors or horizontal overflow. Screenshots: ignored outputs/parallel-coffee-desktop.png and outputs/parallel-rest-mobile.png.

Local 5192 preview rebuilt; no public deployment.
