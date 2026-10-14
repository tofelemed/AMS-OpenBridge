# SME review — round 2 (received 2026-10-14)

Second review of the CPA (control-loop performance) application by the SME, after v2.7.1 / v2.7.2.
Each point is checked against the code and the lab (verdict + evidence + proposed fix) in
[SME_review_2_check.md](SME_review_2_check.md) before anything is changed.

## What the SME confirms (keep)

1. Menu grouping is better now: find problems, check loop, understand cause and setup. Keep this structure.
2. Selected-loop header and context are available, and several direct links carry loop selection. Need verify complete flow, but this does not need full redesign.
3. Explorer has time-range controls, historical values, separate OP scale, fit-to-data and evaluated-window highlighting. These previous requests are substantially implemented.
4. Evidence score is now explained as a score rather than probability. Loop notes without an open event and VP applicability configuration are also available. Keep these improvements.
5. Filters, tooltips, dialogs and navigation are responding in checked cases. App does have working interactive features. Main concern is how these features and information are presented.

## Correctness and consistency

6. Use same diagnosis wording and band everywhere for same result. Explorer showing "detected" while gate result says "suspected" is confusing. Summary, matrix, Investigation, Events and export should agree, with historical results clearly identified.
7. Correct "Ruled out" section. Sensor and external disturbance are listed there while explanation says they could not be checked fully. Separate evidence against a cause from cause not assessed. Missing input cannot prove cause is absent.
8. Calculations showing blank latest value with green OK need clarification. Show whether assessment belongs to displayed metric or separate gate result. Unavailable value should say not measured/not available, with reason. It should not look like verified measurement.
9. Reconcile calculation windows. Page can show latest 12-hour diagnosis while some rows refer to 60-minute metrics. Show actual start/end and duration for each value. When opening proof from KPI, open the matching metric and window.
10. Remove top-50 basis from default fleet headline metrics. Use full eligible selected scope and show denominator and exclusions. If subset view is required, make it explicit user selection.
11. Verify fleet MAE is not combining different engineering units directly. Use documented normalization or group compatible loops. Per-loop normalized error and fleet aggregate should have clear units and basis.
12. Review acceptable-performance classification. INSUFFICIENT_EVIDENCE or no qualified fault should not automatically mean loop is performing acceptably. Acceptable control needs its own performance criteria. Keep performance assessment separate from diagnostic certainty.
13. Correct change labels. Difference between 73% and 50% is 23 percentage points, not 23% relative change. Show proper units for percentage, score and physical-value changes.
14. Recommendations should be diagnosis-specific. Excessive effort should not automatically get same VP/bump-test recommendation as suspected valve fault. Explain what to inspect next and why, based on actual evidence and configured equipment.
15. Fix date/time labels in System Response history. Different dates are showing repeated time labels. Use date and time appropriate to range, clear parameter units and readable uncertainty presentation.
16. Keep layout stable during loading and show feedback in affected section. Verify rapid loop/range switching cannot let earlier response overwrite latest selection. Loading failure should give retry option and clear reason.
17. Export download works, but export label is unclear. Historical CSV contains evaluated windows and diagnoses. Provide separate labelled options for signal samples, evaluated windows and evidence package. Include loop identity, period, timezone and units where applicable.
18. Evidence reconstruction should preserve original run identity, configuration, versions and input basis. Original result and reconstructed result must be distinguishable if they differ. User should know whether he is viewing retained proof, historian context or reconstructed evidence.
19. Complete VP applicability behaviour. Option is available now; verify that declaring "not installed/not applicable" removes incorrect missing-mapping warning, persists after reload and only limits relevant diagnosis. It must not falsely confirm a valve fault.

## Presentation and interaction

20. Shorten main loop summary. Diagnosis, severity, main reason and next action should be compact at top. Trend and relevant KPIs should come immediately below. Long basis, limitations and method explanation can expand when needed.
21. Remove repeated information between Explorer, Investigation and Workbench. Explorer should give quick condition, Investigation should explain cause and action, Workbench should provide calculation proof. Same full explanation does not need to appear everywhere.
22. Reduce equal emphasis on all KPI cards. Group control performance, actuator activity and evidence quality. Highlight metrics relevant to current finding. Use neutral styling for context-only values; green should not imply acceptable performance just because measurement exists.
23. Improve readability once. Secondary text, legends and table labels are small. Use consistent heading/body sizes, sensible spacing and readable numbers. Avoid very wide paragraphs, unnecessary empty areas and excessive decimal precision.
24. Gate matrix should remain advanced view. Default should show checks affecting current result with readable names. Full G0–G15 matrix can remain available. Symbols must clearly distinguish symptom evidence, failed check, exclusion and no evaluation.
25. Compact Events and calculation tables. Keep column headings visible, make selected row clear and provide useful sorting/filtering. User should compare cases without scrolling through large repeated rows or several nested scroll areas.
26. Make charts central to investigation. Clicking KPI should highlight relevant signal/interval. Clicking finding should open exact evaluated period. Previous/current comparison should use aligned time presentation and compatible scales. Keep units and shaded-band meaning visible.
27. Use small, meaningful interaction feedback to remove dead feeling: clear hover/selected states, smooth panel opening, linked chart highlighting and visible action completion. Constant animation, flashing cards and moving numbers are not required. Main issue is too much passive text and too little direct exploration.
28. Registry fields need enough space to inspect full signal paths. Provide expand/copy and clear validation. Before saving, show changed settings and expected effect. Fixed pipeline explanation can remain under help instead of adding unnecessary steps to editing.
29. Finish loading and empty-state messages. Explain what is unavailable and give useful next action. Disabled buttons should explain why. Do not leave user at a mostly empty page with technical explanation and no practical route forward.
