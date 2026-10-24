# Scene clock and visual cards — 2026-10-25

- Physical wall clock and deadline display use `shiftTime` and the existing game clock; the large header time strip is removed. Clicking the physical clock or compact scene readout opens an accessible time summary. The summary pauses the shift like other menus.
- Employee popover uses portrait, three labelled meters and short actions. Projection now accounts for canvas offsets. Detailed conditions and action rules remain in the employee dialog.
- Office catalog has illustrated item cards, Available / Later / Purchased filters, price and brief effect. Mission unlocks, cash limits and stage restrictions remain enforced. Economy and mission explanations move into disclosures.
- Checked real browser at 1440 and 390 px with five employees: scene renders, selected employee fits, auto advances 09:00 to 09:01, time pauses in dialog, no page errors or horizontal overflow.
- Checked 320 and 768 px with lite renderer: catalog purchase confirmation succeeds, owned count increments, no dialog overflow.
- `npm run check`, `npm test` (109), `npm run build`, `npm run test:hosting` (4) passed.
- Screenshots are local QA files in ignored outputs/scene-*.png. Local 5192 serves dist/demo-v05; no public deployment.
