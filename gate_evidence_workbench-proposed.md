Yes—the episode should remain the same episode while the condition persists. Re-evaluating the loop must not create another full evidence package unless something materially changes.
Your proposed direction—evidence per episode, not per window—is correct. However, “three packages per episode” needs a bounded capture policy; otherwise every small confidence change becomes another “change,” and the storage problem returns.
1. My recommendation: 24-hour working cache, 90-day selected episode evidence
I would approve 24 hours for disposable Workbench artifacts. I would not approve deleting all episode evidence after 24 or 48 hours.
These are different data classes and should have different retention policies:
Data class	Recommended policy	Purpose
Automatically generated evidence for every window	Stop generating and persisting it.	This is the source of the write amplification.
On-demand calculation details and rendered plots	24-hour cache, subject to a hard byte limit	Fast investigation without permanently storing every array.
Selected episode evidence	90 days after episode closure, subject to an explicitly allocated storage budget	Preserve why the issue was opened, significant deterioration, and why it was resolved.
Evidence attached to an open episode	Retain selected opening/current representative evidence while the episode remains open; do not expire it merely because it is old	An unresolved issue must not lose its original justification.
Episode metadata and transition history	730 days proposed, aligned with your documented KPI horizon; retain longer only where your approved policy requires it	Recurrence, maintenance verification, audit, and bad-actor analysis.
Raw process history and scalar KPI history	Do not shorten these as part of this fix.	These are not the same thing as duplicated Workbench artifacts.
Engineer-approved investigation or validation packages	Explicitly pinned or exported, within a separate quota	Preserve confirmed faults, false-positive investigations, and acceptance-test evidence.
These durations are my engineering recommendation for your application, not a claim that an industry standard mandates 24 or 90 days.
The operating decision should be:
Keep the current per-window evidence writer off. Re-enable the Workbench after it supports episode-based capture, a 24-hour on-demand cache, idempotent writes, and an enforced storage budget.
Simply changing the existing retention setting from 90 days to one day is not a reliable production fix.
2. Why retention alone does not solve this
Using your reported rate of approximately 30 GB/day:
Retention	Approximate retained payload at the same write rate
24 hours	30 GB
48 hours	60 GB
90 days	2.7 TB
Those are planning calculations from your reported rate—not measurements of the engine after the watermark fix.
A 24-hour retention policy reduces the amount retained, but the application would still write approximately 30 GB/day, then delete approximately 30 GB/day once the retention cycle stabilizes. It does not eliminate serialization, database writes, index maintenance, or cleanup work.
The underlying problem is:
Evidence generation rate=evaluation rate×artifacts per evaluation×artifact size\text{Evidence generation rate} = \text{evaluation rate} \times \text{artifacts per evaluation} \times \text{artifact size}
Your reported evaluation rate is:
142×186=26,412 evaluations/hour142 \times 186 = 26{,}412\ \text{evaluations/hour} 26,412×24=633,888 evaluations/day26{,}412 \times 24 = 633{,}888\ \text{evaluations/day}
Even a perfectly working retention job cannot make that an efficient evidence architecture.
The “only on a finding” filter is also the wrong storage control when abnormal conditions are persistent. Detection prevalence must not determine whether the disk survives.
An important distinction
You need to retain:
Every required numerical result—not every materialized calculation array.
Keep scalar KPI history, gate outcomes, eligibility, configuration versions, and the episode timeline. Generate expensive arrays and plots selectively.
3. What the industrial benchmark actually supports
The strongest benchmark is condition lifecycle management with transition history, not a universal evidence-retention duration.
Primary source	Documented behavior	Application to CPA
OPC UA Alarms & Conditions	Conditions have identity, state, quality, severity, and retained state. Relevant conditions can be refreshed after reconnecting. Changes in quality, severity, and other condition properties can generate events.	Maintain a persistent condition/episode; do not interpret every evaluation as a new incident.
Ignition Alarm Journal	Records transitions such as active, cleared, and acknowledged. An active/clear/ack cycle has its own identity. Retention is configurable.	Store episode transitions and their context rather than duplicating the complete analytical input at every evaluation.
Prometheus alerting	Separates evaluation from pending/firing state; supports a persistence period and
keep_firing_for to reduce flapping and premature resolution.	Require sustained evidence to open or resolve an episode.
Grafana alert-state history	Records and displays alert-state changes.	A useful history is a transition journal, not a copy of every calculation’s intermediates.
Sources: OPC Foundation, Ignition, Prometheus, and Grafana documentation. (OPC UA Online Reference)
These are relevant industrial and monitoring patterns, not proof that every commercial CLPM product uses the same internal implementation.
I did not find a cross-vendor requirement saying that CPA must retain every FFT, filtered series, error array, and geometry artifact for 90 days. Your shipped 90-day setting should therefore be treated as a product default—not an established retention obligation.
4. How an existing episode should behave
Your intuition is right, with one correction:
Hold the episode until a new, valid, comparable evaluation changes the condition’s meaning—not merely until some numerical value changes.
A confidence score changing from 0.781 to 0.784 is not a new episode and normally is not a reason to capture new evidence.
Recommended lifecycle behavior
Incoming result	Episode behavior	Evidence behavior
First qualifying abnormal result, satisfying opening persistence	Open an episode	Capture opening evidence once
Same fault, same severity band, fresh valid evaluation	Keep the same episode; update latest evaluation time and scalar summaries	No new full package
Material deterioration or new diagnostic evidence	Keep the episode; record a transition	Capture selectively under the episode policy
One apparently healthy result	Enter recovery-pending, where applicable	Usually metadata only
Sustained valid recovery satisfying the clearing rule	Resolve the episode	Capture closing evidence once
Missing data, invalid window, excluded gate, or stopped job	Keep the unresolved episode, but mark current assessment stale/unavailable	Record the quality transition; do not manufacture recovery
Operator acknowledgement or shelving	Change workflow/visibility state, not the fault’s physical state	Metadata only
Historical replay or corrected old result	Store a revision or retrospective annotation	Do not silently rewrite the live operational episode
This is a proposed CPA lifecycle. The separation of condition state, quality, acknowledgement, and history follows the patterns above. (OPC UA Online Reference)
“Hold” must not mean “pretend it is still freshly verified”
Suppose the last valid evaluation was at 10:00 and the pipeline stops at 10:05.
The UI should say:
Unresolved stiction suspicion. Last valid evaluation: 10:00. Current assessment unavailable.
It should not say either:
“Healthy,” because no new finding arrived.
“Stiction currently verified,” based on an indefinitely old result.
Preserve both:
Episode lifecycleandEvaluation freshness\text{Episode lifecycle} \quad\text{and}\quad \text{Evaluation freshness}
They are independent.
Recovery also needs engineering context
For stiction, “no oscillation in the latest window” does not necessarily establish that the valve is repaired. The loop may be manual, unexcited, or in a different operating region.
Resolve the observed diagnostic episode only using the configured eligibility and clearing rules. Do not automatically close the maintenance case as “physically repaired.”
5. A six-hour example
Consider an episode identified at 08:00.
Time	Evaluation outcome	What is stored
08:00	Qualifying stiction suspicion	Episode opens; opening evidence package
08:01–10:59	Same suspicion, small KPI changes	Scalar KPI history and batched episode freshness updates
11:00	Sustained severity increase from moderate to high	Compact transition; selected escalation evidence
11:01–13:44	Same high-severity condition	Scalar history; no repeated evidence packages
13:45	First qualifying clear result	Recovery-pending metadata
14:00	Clearing persistence satisfied	Episode resolves; closing evidence package
Using your rate:
6×186=1,1166 \times 186 = 1{,}116
The old approach produces approximately 1,116 evaluation evidence sets for that loop.
The proposed approach produces three selected packages in this example, plus small numerical and lifecycle records.
The calculations continue throughout those six hours. Only the evidence materialization changes.
6. Define “material change” before implementing this
Without this definition, an episode-based implementation can still write constantly.
Appropriate automatic capture triggers
Use a bounded set of triggers such as:
A sustained severity-band escalation.
A substantial change in the diagnostic conclusion or required action.
New confirmation evidence, such as an approved valve test.
Verified recovery.
An engineer explicitly requesting a preserved investigation package.
Do not capture automatically because:
The window end advanced.
One more sample arrived.
A confidence score changed slightly.
The exact FFT array changed.
Another gate reported the same fault.
The same result was delivered again.
Do not detect episode changes by comparing entire JSON payloads. Window timestamps and numerical arrays almost always differ; that would recreate the existing problem.
A practical default
For an ordinary episode, retain:
Opening evidence + one selected representative/escalation package + closing evidence.
Record all material state transitions as compact metadata. Additional full packages should require an explicit capture rule and count against a quota.
“Three packages” is therefore a default selection policy, not a mathematical property of episodes.
7. Use the existing episode service, not a second competing lifecycle
I checked your documented CPA architecture. It already identifies:
analytics.cplm_event_frames as the episode store.
CplmEventFrameService.ApplyAsync as the episode-processing path.
Episode grouping by (loop_id, window_kind, family).
Separate replay results that do not rewrite the operational timeline.
Extend that authoritative lifecycle rather than building an independent “Workbench episode” engine.
Recommended flow:
Flink window evaluation
        │
        ├── Scalar KPI/gate results → existing history and live UI
        │
        └── Existing episode lifecycle service
                    │
                    ├── Same condition → update compact state only
                    │
                    └── Capture-worthy transition
                                │
                         Durable capture request
                                │
                         Evidence builder
                                │
                  Selected artifact + small manifest
Keep the six windows as evidence sources—not six independent incidents by accident
Your existing episode key includes window_kind. That can be useful for retaining detector-specific histories, but it can also produce several episodes for one physical problem.
For the Workbench, introduce an explicit correlation policy:
One operational issue can have multiple window-specific observations, but those observations share an evidence context.
Do not simply remove window_kind and let a healthy one-minute result close a twenty-four-hour stiction episode. Use a designated diagnostic decision stream, or a parent issue containing the window-specific episodes.
Also, a gate warning is not automatically a diagnosis. Evidence capture should follow the qualified episode decision, not “any gate is WARN.”
8. Store evidence differently—but do not expect moving files to create disk capacity
PostgreSQL can store binary data, and its TOAST mechanism supports large values. The problem is not that binary storage is categorically forbidden. It is the multiplication of large, largely overlapping payloads and their retention. (PostgreSQL)
Recommended storage separation
Store	Content
IoTDB	Original process history and scalar KPI time series
PostgreSQL	Episode state, transitions, configuration versions, capture manifests, checksums, references
Bounded artifact directory or existing object store	Selected compressed evidence packages and short-lived generated plots
A directory on the same shared disk does not solve the capacity constraint. It merely makes artifact ownership and deletion simpler. Volume reduction and hard budgets remain mandatory.
Stop storing the same signals for every gate
A selected evidence context should contain or reference one shared input dataset. Individual gates should reference that dataset and add only their specific outputs.
For example:
Error can be regenerated from retained PV/SP and the formula version.
Filtered signals can be regenerated only when filter settings, initialization, and required preceding data are available.
FFT/ACF arrays can be regenerated from the exact retained analysis input and implementation version.
Several gates should not each contain a separate copy of the same PV/SP/OP series.
For overlapping selected windows, immutable time chunks can be shared. A whole-window hash alone will not deduplicate two different overlapping windows.
Preserve enough information for genuine reconstruction
A manifest should identify the source interval, sample selection, quality masks, resampling method, preprocessing, thresholds, loop profile, calculation build, and input checksum.
A reference to a deleted or changed source is not retained evidence.
For selected investigation packages that must survive raw-history expiry, retain the exact necessary inputs—not just a database path.
9. What you lose with 24 hours compared with the original 90 days
The answer depends on whether you implement the separation above.
Capability	Blanket reduction to 24 hours	Recommended 24-hour cache + selected episode evidence
Current monitoring and fresh gate values	Can continue	Continues
Episode start/change/end history	Lost if deleted with artifacts	Preserved
Opening justification for a week-old unresolved issue	Potentially lost	Preserved
Immediate viewing of every old intermediate array	Lost after one day	Not retained for every window; generated on demand where reproducible
Exact evidence already reviewed by an engineer	Potentially lost	Preserved when selected/pinned
Root-cause investigation after a weekend or maintenance delay	Weakened	Supported by episode evidence and history
Debugging an arbitrary evaluation from several weeks ago	Usually unavailable	Possible only if original inputs, versions, and a working replay route remain
Discovery of subtle evolution between selected captures	Full detail lost	Scalar history remains; intermediate detail depends on reconstruction
The real sacrifice is instant access to every historical intermediate array—not the ability to track the fault or retain its principal justification.
That is a reasonable trade on this constrained system. Losing the opening evidence for an unresolved fault after one day is not.
A specific limitation in your current design
Your architecture documents 90-day raw IoTDB retention and 730-day KPI retention, but says historical recompute currently re-reads Kafka, so its replay horizon is limited by Kafka retention—not automatically by IoTDB’s 90 days.
Therefore, do not justify deletion by saying “we can always regenerate it from IoTDB” until that route is implemented and tested.
Also, a historical calculation needs its whole lookback interval, not merely the raw sample at its window-end timestamp.
10. Your volume estimate is promising, but it is not yet a capacity guarantee
Your example is arithmetically correct:
300 episodes/day×3 packages/episode×30 KB/package=27 MB/day300\ \text{episodes/day} \times 3\ \text{packages/episode} \times 30\ \text{KB/package} = 27\ \text{MB/day} 27 MB/day×90=2.43 GB27\ \text{MB/day}\times90 = 2.43\ \text{GB}
However, that is payload only, under the stated assumptions.
Three qualifications matter.
First, count all gates together. The 30 KB must describe the complete selected package, not 30 KB per gate per window.
Second, validate actual package size. At one-second sampling, one hour of three double-precision signals plus an eight-byte timestamp is already:
3,600×(3×8+8)=115,200 bytes3{,}600\times(3\times8+8) = 115{,}200\ \text{bytes}
That is before quality, extra signals, and intermediates. Compression may reduce it, but 30 KB cannot be assumed for every exact-reproduction package.
Third, include open episodes, additional captures, metadata, indexes, WAL, temporary files, and cleanup headroom.
Use:
Bevidence=Bopen episodes+Bretained closed episodes+Bon-demand cache+Bmetadata/overheadB_{\text{evidence}} = B_{\text{open episodes}} + B_{\text{retained closed episodes}} + B_{\text{on-demand cache}} + B_{\text{metadata/overhead}}
Measure both daily physical growth and bytes written, not just the sum of logical payload sizes.
Even “small” per-evaluation records deserve attention: at your reported 633,888 evaluations/day, a 1 KB record is approximately 634 MB/day before database overhead. Do not leave a duplicate full-JSON evaluation archive growing permanently after removing the binary arrays.
11. Required safeguards before re-enabling the Workbench
A. Enforce byte budgets—not just age limits
Configure separate limits for:
Disposable cache.
Selected episode artifacts.
Manual/debug captures.
Total Workbench footprint.
The effective cache policy should be:
Keep until 24 hours old, or evict earlier if the byte budget is reached\text{Keep until 24 hours old, or evict earlier if the byte budget is reached}
On budget exhaustion, stop optional artifact capture and display a capture-status warning. Do not stop the gate calculations or falsely resolve episodes.
Selected evidence needs a different rule: do not silently delete protected opening or reviewed evidence to make room. Reject/defer optional captures and raise a capacity exception.
No retention duration can guarantee disk safety without knowing the allocated byte budget and the reserve required by the other system.
B. Make writes idempotent
The same logical evaluation delivered ten times must produce one evaluation revision—not ten captures and not ten persistence votes.
Use a stable evaluation identity containing the loop, window boundaries, window kind, source, calculation/configuration versions, and an explicit input revision. Give capture requests their own unique transition-based identity.
Flink’s Kafka exactly-once support depends on its configured transaction/checkpoint path; it does not deduplicate ten distinct records that application code deliberately emits. Downstream evidence persistence still needs application-level uniqueness. (Apache Nightlies)
This also protects diagnosis accuracy: repeated copies of the same result must not satisfy a “two of three evaluations” persistence rule.
C. Regression-test the timer defect
Flink’s timer service deduplicates timers for the same key and timestamp and checkpoints timers with state. Nevertheless, application logic can repeatedly schedule or emit work incorrectly. The reported fix needs a regression test at the logical window-output and evidence-write levels. (Apache Nightlies)
D. Reclaim existing PostgreSQL space safely
Deleting expired rows does not necessarily return that disk space to the operating system. Ordinary vacuum generally makes space reusable; VACUUM FULL rewrites the table and requires additional space and locking. On an already constrained shared disk, that distinction matters. (PostgreSQL)
Have the DBA plan reclamation. For future disposable evidence tables, time partitioning can make retention removal substantially cheaper than bulk row deletion. PostgreSQL explicitly documents this advantage. (PostgreSQL)
12. Acceptance criteria for the fix
Test	Required result
Six-hour unchanged abnormal condition	One episode; one opening capture; no per-window artifact growth
Qualifying escalation and subsequent recovery	Same episode, compact transitions, selected escalation/closing captures
Duplicate delivery or tenfold re-fire	No duplicate capture, no duplicate episode, no inflated persistence count
Loss of data or invalid windows	Episode remains unresolved; assessment becomes stale/unavailable
Conflicting short/long results	No arbitrary resolution based on whichever message arrived last
Cache expiry after 24 hours	Selected episode evidence and scalar history remain available
Seven-day open episode	Opening evidence remains accessible
Historical reconstruction	Reproduces the selected original result using retained inputs and versions
Storage quota exhausted	Optional capture stops; analytics and episode state continue
Sustained high finding rate across all 142 loops	Storage remains within its configured budget without depending on findings being rare
A replay can exercise transitions and duplicate handling quickly. Also run a wall-clock retention test beyond 24 hours to prove that cache expiry and physical cleanup actually work.
Final decision
Adopt 24 hours for disposable Workbench calculation artifacts, retain selected episode evidence for 90 days after closure, and preserve compact episode/KPI history separately.
Hold an existing episode while the condition persists. Update its current assessment, but create another full package only for a meaningful, qualified transition or an explicit investigation request.
The production fix is not “90 days becomes one day.” It is:
Evaluate every required window. Retain numerical history. Maintain one coherent episode. Capture expensive evidence selectively. Enforce a hard storage budget.
That preserves the engineering value of the Workbench without making its survival depend on the plant becoming healthy.
ConditionType – OPC Unified Architecture - Part 9: Alarms & Conditions
The ConditionType defines all general characteristics of a Condition . All other ConditionTypes derive from it. It is formally defined in Table 8 and Table 9 …
 