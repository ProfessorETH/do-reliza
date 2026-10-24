# Visual decisions and commissions — 2026-10-25

- Events show participants, a short situation, and separate labelled outcome pills for time, project reserve, trust, mood and gameplay changes. Full context and recorded character lines remain in disclosures. Timers and persisted choices use existing engine behavior.
- Life outcomes include the previously omitted +6 morale for helping with noise/computer incidents. Tension affects both participants; ideas affect the team or author. Technical choices expose code workload separately from immediate hours.
- Commissions show actual mission geometry from MISSIONS. Desktop compares three cards side by side; mobile uses one column. Release payout, mission premium and unlock are separate. Confirmation shows studio cash before/after payroll and expanded-team support.
- Office purchases show cash, price and resulting balance before confirmation. Reserve is labelled as project money. Existing purchase locks and transaction validation are preserved.
- Fixed employee HUD reopening the first character after dismissal. Explicit selection now controls rendering; close, repeated click and Escape collapse it. Dialog replacements reset scroll; clicking a modal backdrop closes the information dialog.

Validation: npm run check; npm test (113 passed); npm run build; npm run test:hosting (4 passed); prepare-hosting. Tests compare event UI effects and commission balances against actual engine transactions.

Browser QA: 1440px desktop order comparison and HUD open/close/Escape; 390px events with decision timer and applied decision; 390px real 3D employee close/reopen/Escape; 320px purchase confirmation and transaction. No reported page errors or horizontal overflow in checked flows. Local ignored screenshots: outputs/decision-*.png.

Local server 5192 serves dist/demo-v05. No public deployment.
