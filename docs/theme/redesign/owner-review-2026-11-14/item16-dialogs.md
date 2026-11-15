# Item 16: every dialog, reviewed (CHG-192)

Owner review 2026-11-14, item 16, with the owner decisions of 2026-11-15 (Q1 technical details removed on Pipeline Health and
Administration too; Q4 "↗" links stay links; Q5 no time display changes; Q6 no "Record details"). The standard applied is
the approved sample `17-buttons-SAMPLE.png`, Look 1: the solid cyan band with the title and, where useful, the object the
dialog acts on under it; label / value rows; no caps labels; no explanatory sentence where a ? does; one primary on the right
of the footer with Cancel / Close secondary; destructive confirms in the destructive look. Every field and every server call
is kept. The shared wide size is 880 px (was 720 px), so the Performance gate dialog's foot fits one line at 1440.

Paths are under `src/frontend-ob/src/`. Visible text changes are in `../text-changes.md` under `## CHG-192`.

## Changed in CHG-192

| Dialog | Page | File | What changed |
|---|---|---|---|
| Edit user | Administration › Users | `components/Administration/users/UserEditorDialog.tsx` | The username under the title (its Username field is not shown in an edit) |
| Delete user, Delete data source, Delete alias, Delete Site / Area / … | Administration | `components/Administration/AdminConfirmDialog.tsx` (callers `UserManagementConfig`, `DataSourcesConfig`, `AliasConfig`, `PlantModelConfig`) | The last button is destructive; Cancel secondary. The question names the object, so no subtitle (each fact once) |
| Reset to default | Administration › Roles | `components/Administration/AdminConfirmDialog.tsx`, `RolesConfig.tsx` | The role under the title (the question does not name it); destructive button (the reset loses the changes made on the page) |
| Delete role | Administration › Roles | `components/Administration/roles/RoleDialogs.tsx` | Title "Delete role" with the role under it (was `Delete role "Supervisor"`); destructive button |
| Edit data source | Administration › Data sources | `components/Administration/DataSourceWizard.tsx` | The source name under the title |
| Edit MODE map | Administration › Data sources | `components/Administration/ModeMapDialog.tsx` | The source name under the title; the explanatory paragraph became the heading "Source MODE value → engine token" with its rule behind a ? |
| Edit configuration | Loop Registry | `components/Cpm/AddLoopWizard.tsx` | The loop under the title |
| Retire loop / Restore loop | Loop Registry | `components/Cpm/registry/RetireLoopDialog.tsx` | The loop under the title; Retire loop is destructive (its "Write a reason first" stays under it), Restore loop the primary. The consequence sentence stays: it is the confirmation |
| Loop model & setup | Loop Explorer | `components/Cpm/explorer/LoopModelCard.tsx` | Title "Loop model & setup" with the loop under it (was "FIC10401 · Loop model & setup") |
| Loop summary (Open details) | Loop Explorer | `components/Cpm/explorer/summary/LoopSummaryRow.tsx`, `styles/cpm-loop-summary.css` | Row labels in sentence case (were caps). No subtitle: the band names the loop (CHG-158) |
| Gate status key | Loop Explorer (Gate key), Evidence Workbench (Key) | `components/Cpm/GateLegend.tsx`, `evidence/GateRail.tsx`, `styles/cpm-evidence-layout.css` | Group names in sentence case (were caps) |
| How to read | Performance | `components/Cpm/performance/HowToReadDialog.tsx` | The gate key inside it: group names in sentence case (same rule); nothing else |
| Fleet tile dialog (Good-error time, Median error, Periodic diagnosis, Diagnostic capability) | Performance | `components/Cpm/performance/PerformanceKpis.tsx`, `styles/cpm-perf-list.css` | Paragraphs → rows "Basis", "Meaning" and (health filter on) "Scope", same words; "Show the loops" is the primary (was a flat button) |
| Prepare bundle draft | Gate Configuration › Bundles | `components/Cpm/config/DraftBundleDialog.tsx` | "Nothing changes for a loop until a bundle is activated." moved behind the Level ? |
| Workers | Gate Configuration › Effective | `components/Cpm/config/WorkersDialog.tsx`, `DetailsDialog.tsx` | The loop under the title; the heading "APPLY acknowledgements" (a caps engine word, and it repeated the title and the columns) removed. The readable job names stay (item0-sweep: the dialog's subject) |
| Shelve / Update shelf | Loop Events | `components/Cpm/events/ShelveDialog.tsx`, `eventsState.ts` | The episode (loop · finding) under the title. Its sentence stays word for word (owner answer, CHG-167) |
| Unshelve | Loop Events | `components/Cpm/events/UnshelveDialog.tsx` | The episode under the title; sentences word for word (CHG-167) |
| Full history | Loop Events | `components/Cpm/events/EpisodeActivity.tsx` | The episode under the title |
| Re-run this window | Evidence Replay | `components/Cpm/replay/RerunDialog.tsx` | "Configuration" in sentence case (was a caps field label). The description stays: it is the action's caveat (the result can differ) |
| Run details | Evidence Replay, Calculations | `components/Cpm/replay/RunDetailsDialog.tsx` | "Complete retention shows the proof was kept, not that it was sufficient." moved behind a ? beside "Proof retained" |
| Feature flags, Engine & timing | Window Inspector | `components/Cpm/windows/WindowDialogs.tsx`, `SelectedWindow.tsx` | The loop and window size under the title, as Compare window sizes |
| Sample density | Window Inspector | `components/Cpm/windows/SampleDensityDialog.tsx` | The same subtitle; "8,640 raw points" became the row "Raw points" |
| Review system model | System Response › Models | `components/Cpm/response/ModelReviewDialog.tsx`, `styles/cpm-response.css`, `styles/cpm.css` | Was a page-local overlay without the band (caps eyebrow "MODEL REVIEW", lowercase row labels, caps field labels). Now the shared `ui/Dialog` (band, focus trap, Escape): title "Review system model", the model (family · path) under it, rows State / Revision / Estimator / uncertainty / parameters, the form as label / value rows, Cancel then Record decision. The revision stays (the decision is bound to it, item0-sweep). The dead `.cpm-modal` CSS went |

## Already done in CHG-183 … CHG-191 (carried fixes noted)

| Dialog | Page | File | Status |
|---|---|---|---|
| Every `ui/Dialog` and `shared/Modal` | all | `ui/Dialog.tsx`, `components/shared/Modal.tsx` | Band and subtitle: CHG-183 |
| Evaluate a window | Evidence Workbench | `components/Cpm/evidence/EvaluateWindow.tsx` | CHG-188 |
| Reconstruct evidence | Evidence Workbench | `components/Cpm/evidence/ReconstructDialog.tsx` | CHG-188 |
| Measured vs required | Evidence Workbench | `components/Cpm/evidence/MeasuredCheck.tsx` | CHG-187; now 880 px wide (checked) |
| Loop notes | Evidence Replay, Investigation › Review | `components/Cpm/investigation/LoopNotes.tsx`, `NoteList.tsx` | CHG-189; CHG-192: a card's Save in Edit is secondary, so "Save note" is the one primary |
| Evidence package | Evidence Replay | `components/Cpm/replay/PackageDialog.tsx` | CHG-189 |
| Compare window sizes | Window Inspector | `components/Cpm/windows/CompareAcrossKinds.tsx` | CHG-190; now 880 px wide (checked) |
| Method | Calculations | `components/Cpm/calc/MethodDialog.tsx` | CHG-190 |
| Gate dialog | Performance | `components/Cpm/performance/PerformanceGateDialog.tsx`, `blocks/GateDialog.tsx` | CHG-191; CHG-192: 880 px wide, the foot is one line at 1440 |
| Gate dialog | Loop Explorer (Summary, Calculations tabs) | `components/Cpm/explorer/summary/SummaryGateDetail.tsx` | CHG-191; 880 px |
| Calculation proof | Investigation › Evidence | `components/Cpm/investigation/GateProofDialog.tsx` | CHG-191 (tier label); CHG-192: "Calculated values" is a plain heading (was a caps eyebrow) |
| Loop KPI dialog | Loop Explorer › Summary | `components/Cpm/explorer/summary/LoopKpiDialog.tsx` | No change needed: rows Value / Judged by / Meaning, the proof link, then "Inspect Gn →" primary |
| Record details (Loop Events, Window Inspector, Calculations, Loop Registry, Gate Configuration band, data source, job, verification) | several | — | Removed in CHG-184 (Q6) |

## Reviewed, no change needed

| Dialog | Page | File | Why |
|---|---|---|---|
| Add user | Administration › Users | `components/Administration/users/UserEditorDialog.tsx` | No object yet; Account / Access parts (CHG-172); Create user primary |
| Bulk import users | Administration › Users | `components/Administration/BulkImportModal.tsx` | CHG-172 tabs File · Preview · Result; one primary per step; parts in sentence case |
| Add custom role | Administration › Roles | `components/Administration/roles/RoleDialogs.tsx` | One part; Create primary with its reason |
| Add data source | Administration › Data sources | `components/Administration/DataSourceWizard.tsx` | No object yet; CHG-172 tabs; one primary |
| Add tag alias | Administration › Tag aliases | `components/Administration/aliases/AliasDialogs.tsx` | Hints behind ? (CHG-172); Create alias primary |
| Import tag aliases from CSV | Administration › Tag aliases | `components/Administration/aliases/AliasDialogs.tsx` | CHG-172 Columns part holds the import's columns and rule (owner-approved) |
| Add / Edit Site, Area, Unit, Device, Measurement | Administration › Plant model | `components/Administration/plant/AssetEditorDialog.tsx` | The Place part names the parent / path once (CHG-172); the identity sentence under Path segment is owner-approved |
| Import plant model from CSV | Administration › Plant model | `components/Administration/PlantModelImport.tsx` | CHG-172 tabs; one primary per step |
| How to read | Administration | `components/Administration/AdminHowToRead.tsx` | The dialog is the explanation; titled parts in sentence case; no actions |
| Add loop | Loop Registry | `components/Cpm/AddLoopWizard.tsx` | No object yet; CHG-168 tabs, "Next: X →" primary |
| Bulk import (loops) | Loop Registry | `components/Cpm/BulkImportDialog.tsx` | CHG-168 tabs; one primary per step |
| How to read | Overview, Loop Events, Loop Registry, Gate Configuration, Governance, Pipeline Health | `components/Cpm/overview/OverviewHowToRead.tsx`, `events/EventsHowToRead.tsx`, `registry/RegistryHowToRead.tsx`, `config/ConfigHowToRead.tsx`, `governance/GovernanceHowToRead.tsx`, `pipeline/PipelineHowToRead.tsx` | Explanation dialogs: titled parts in sentence case, keys in two columns, no actions. Pipeline Health's was already cleared of engine names (CHG-184, Q1) |
| Effective property | Gate Configuration, Loop Explorer effective drawer | `components/Cpm/config/EffectivePropertyDialog.tsx` | Read-only rows Value / Source / Class / Unit / Type / Factory default / What it does; titled by the property |
| Roll back to the previous bundle | Gate Configuration › Deployments | `components/Cpm/config/RollbackDialog.tsx` | Rows Rolls back / Active again; Roll back primary (not a delete or retire, so not destructive) |
| Result key | Historical | `components/Cpm/historical/ChartFoot.tsx` | A key: Result lane / Mode lane terms, one line, Close |
| All N gates | Investigation › Evidence | `components/Cpm/investigation/AllGatesDialog.tsx` | Titled by the gates; the band names the loop (CHG-160) |
| Mode context | Investigation | `components/Cpm/investigation/InvestigationDialogs.tsx` | The guidance is its content; Historical ↗ link |
| Response event states | System Response | `components/Cpm/response/ResponseSteps.tsx` | A key of the four states; Close |
| Run end-to-end verification | Pipeline Health | `components/Cpm/pipeline/VerificationCard.tsx` | CHG-170 owner-approved parts Loop · What it does: the sentence says what the write does before Start; Start verification primary |
| Verify audit chain | Governance | `components/Cpm/governance/VerifyDialog.tsx` | CHG-174 parts Answer · Run at · Not served; Run again and Close (a read, no primary). It names "audit-service" as the Governance page, How to read and empty state do: see Owner questions |
| Record details, Build details | Governance | `components/Cpm/governance/RecordDialog.tsx` | Kept: item0-sweep owner questions 2 and 3 (the audit record itself; change traceability) |
| Signed out / Session ended | every page | `components/shared/SessionTimeoutDialog.tsx` | One sentence; Sign in primary (owner, 12 Nov) |
| Component gallery dialog | dev build only | `pages/cpa/ComponentGallery.tsx` | Dev-only sample (`VITE_CPA_COMPONENT_GALLERY=1`) |

## Not dialogs in this standard

| Surface | File | Note |
|---|---|---|
| Inspector drawer (below 1280 px) | `ui/Inspector.tsx` | `role="dialog"`; wears the band since CHG-183 |
| Navigation drawer | `ui/shell/AppShell.tsx` | `role="dialog"` (the phone menu) |
| Command palette | `components/CommandPalette.tsx` | A search overlay |
| Toggletip panels, popovers (Go to date, More ▾) | `ui/Toggletip.tsx`, `ui/Popover.tsx` | `role="group"`, not dialogs |

## Outside the CPA slice

| Dialog | File | Status |
|---|---|---|
| Designer: New display, Custom symbol, My views, Share, Version history, confirm / prompt | `components/Designer/DisplayList.tsx`, `CustomSymbolPanel.tsx`, `PersonalViewsDialog.tsx`, `ShareDialog.tsx`, `VersionHistoryDialog.tsx`, `components/shared/dialogService.tsx` | Designer: header from CHG-183, not reviewed |
| Designer symbol catalogue dialog widget | `components/Designer/renderers/catalogRenderer.tsx` | A display widget (OpenBridge component), not an app dialog |
| Alarm Console: Acknowledge, Shelve, Suppress | `components/AlarmConsole/*Dialog.tsx` | Legacy module outside the CPA slice; header from CHG-183, not reviewed |
| Live Events: alarm detail | `components/LiveEvents/LiveAlarmDetailDialog.tsx` | Legacy module outside the CPA slice; header from CHG-183, not reviewed |
| Notifications | `components/Administration/NotificationsConfig.tsx` | Hidden module (not in the CPA slice); header from CHG-183, not reviewed |

## Owner questions (not changed)

1. **"audit-service"** is named in Governance's Verify audit chain dialog, its one-line result, How to read and the
   permission empty state. It is a service name (item 0). Replace it with "the audit service" across Governance?
2. **Window Inspector band** shows the engine job's name and checkpoint age ("CPLM Short Feature Engine · RUNNING · ckpt 12s
   ago"). Not a dialog and not in the item0-sweep list; item 0 would remove it. Remove?
