# Release note — Control Loop Performance v2.5

**Deployed to the Marun plant on 26 September 2026.** Version tag `v2.5`, source commit `aae3c77a`,
analysis engine jar `2dc8788a`.

This note says what the release contains, what you will see on the screens during the first day, and
what is still waiting on the OT gateway team and on Instrumental. Sections 5 and 6 are addressed to
those two teams and can be sent to them on their own.

---

## 1. What this release is about

v2.4 told you a loop's score. v2.5 tells you whether that score deserved to be believed, and shows
you the evidence it was computed from.

Three ideas run through everything below:

1. **Data is qualified before it is analysed.** An unknown quality, a stale reading or a missing
   controller mode now excludes a window with a named reason instead of quietly passing as good.
2. **Every result carries its identity.** Which engine version, which configuration, which
   measurement run. You can open any cell and see the numbers behind it.
3. **A finding is a hypothesis until something confirms it.** The system separates what it observed
   from what it concluded, and says which confirmations it could not obtain.

---

## 2. What was deployed

| Component | What it carries |
|---|---|
| Ingestion service | Per-role time and quality, protocol-specific quality decoding, non-finite values rejected rather than analysed |
| Analysis engines (Flink, 7 jobs) | Corrected gate semantics, fusion v2, run identity, evidence artifacts, system-response analysis, transmitter-health context |
| Performance API | Identity columns, evidence store, five new consumers, the new endpoints behind every page below |
| Historian service | Source, verified and emission timestamps on live values |
| Web application | Evidence Workbench, System Response, Gate Configuration, health filters, episode views |
| Authentication and gateway | Token revocation fix, and a rate limiter that no longer fails closed during a cache stall |

Seventeen diagnostics (G0 to G15) are installed and announced by the running engines. The engine
version is visible in the application, so what you see on screen always names the build that produced it.

---

## 3. What is new, feature by feature

### 3.1 Qualified data

Quality is decoded against the protocol the source declares. The three tokens `GOOD`, `UNCERTAIN` and
`BAD` are understood; anything else, including a missing field, is `UNKNOWN`, and `UNKNOWN` is never
treated as good. Values that are not finite are set aside and counted rather than fed into the analysis.
Each signal carries its own timestamp and its own quality, so a frozen valve-position reading no longer
passes as live evidence.

### 3.2 Corrected diagnostics and a fast condition path

Setpoint activity, actuator effort, actuator limits and measurement health were all re-specified. A
separate fast path reports limit dwell and sensor freeze within minutes instead of waiting for a long
window to close.

### 3.3 Fusion v2 — observations, hypotheses, confirmation

The fused verdict now states three things separately: what was observed, which fault hypotheses those
observations support, and whether any hypothesis was confirmed. A hypothesis that could not be
confirmed says so and names the missing input, rather than being presented as a conclusion.

### 3.4 Episodes

A loop's history is split into episodes with a start, an end and a cause. Availability problems are
kept apart from condition problems, so a loop that was out of service does not read as a loop that was
performing badly.

### 3.5 Run identity and the Evidence Workbench

Every result cell carries an immutable measurement-run identifier. Clicking it opens the Evidence
Workbench, which shows the samples, the intermediate series and the checks that produced that number,
with a checksum on every artifact.

**Results produced before this release cannot be opened.** They read `LEGACY_FLAG_ONLY` and the
workbench button is disabled on them. This is permanent and by design: those rows were never given an
identity, and inventing one after the fact would be a fiction. Results from the switch onwards are
fully traceable.

### 3.6 System response (G12)

Where the process is disturbed by a real setpoint or input move, the system now identifies the loop's
dynamics from that move: dead time, time constant and gain, with a validation verdict on the fit and a
stated uncertainty. It never writes anything to the DCS, and any tuning figure it offers is a suggestion
for a person to consider.

### 3.7 Transmitter health

A read-only subscriber for instrument device state to the NE107 standard. Until Instrumental publishes
(section 6), every loop reads "not configured", which is the intended state and not a fault.

### 3.8 Loop model

Each loop can state what it actually is: its service family, whether it is self-regulating or
integrating, its control objective, its topology and what its output drives. The diagnostics use this
instead of inferring it from the tag name.

### 3.9 Governed gate configuration

Thresholds are no longer edited in place. A change is drafted, validated, approved by someone other
than the author, and deployed as a signed bundle that the running engines acknowledge. Every result
records the bundle it was computed under, so a threshold change is visible in the history rather than
silently rewriting the past.

### 3.10 Episode shelving

Shelving an episode is now its own lifecycle with a duration, a reason, an expiry and a full history,
separate from acknowledgement.

---

## 4. What you will see during the first day

All of the following are expected. None is a fault.

| Observation | Why | How long |
|---|---|---|
| Results from before 26 September read `LEGACY_FLAG_ONLY`, workbench disabled | those rows carry no run identity | permanent, by design |
| Short windows read insufficient data, then normal | window state was rebuilt from scratch | about one hour |
| 12 and 24 hour verdicts absent, then appearing | the long tiers must fill first | up to one day |
| Oscillation, spectral and response diagnostics read `LIMITED : BANDWIDTH` on flow and liquid pressure loops | see section 5, request O9 | until the sample rate increases |
| System response events read `LIMITED` where the output path is uncertain | see section 5, request O7 | until the exception list is supplied |
| Interaction analysis (G13) reads `NOT_CONFIGURED` | no loop peer relationships are declared yet | until peers are declared |
| Transmitter health reads `NOT_CONFIGURED` on every loop | see section 6 | until Instrumental publishes |
| Final-element faults never reach "confirmed" | confirmation needs valve position feedback, which the feed does not carry | see section 5, request O5 |
| Gate Configuration shows the factory thresholds everywhere | no site bundle has been drafted yet | until a site drafts and approves one |

Everyone must refresh the browser once with Ctrl+F5 to pick up the new application.

**Current feed state, measured at the switch:** 175 loops registered, 144 publishing, 17 idle and 13
never published by the DCS. Of 1,662,395 samples examined across sixteen hours, every one carried
quality `GOOD`.

---

## 5. Pending on the OT gateway team

**The good news first: nothing in v2.5 requires a change on your side.** The release parses exactly the
payload you publish today, the new fields are additive and optional, and the feed has been running on it
since the switch. The requests below unlock capability that is currently limited. They are not defects.

The full detail, with the reasoning for each, is in `docs/pre-prod/v2.5-ot-instrumental-requests.md`.

### Ranked by what they unlock

| # | Request | What it unlocks | Effort for you |
|---|---|---|---|
| **O9** | Publish flow and pressure loops faster than the present 5 second grid, ideally 1 second | This is the single biggest limitation. The diagnostic packs need eight samples across a loop's fastest oscillation period. Flow loops declare a 10 second period and liquid pressure loops 5 seconds, so a 5 second grid gives two samples or one against eight needed. Every oscillation, spectral and response result on those loops therefore reads `LIMITED : BANDWIDTH` and cannot be trusted as a verdict | a gateway sampling change on one loop class |
| **O7** | Per loop, what the output actually drives: a control valve, a variable speed drive, or another controller's setpoint. Plus the cascade master and slave pairs | Removes an assumption we are currently carrying (section 8). A loop whose output is a drive or a slave setpoint but is assumed to be a valve will have its findings labelled as valve problems | a list, ideally from the DCS configuration |
| **O5** | Valve position feedback published as `…/PIDParams/VP` for loops whose positioner reports it, plus a list of which loops have a positioner at all | Without it, a suspected valve fault can be raised but never confirmed. Final-element confirmation is the one conclusion the system cannot reach on this feed | one extra tag per equipped loop |
| **O8** | Engineering ranges, minimum and maximum, for PV and OP in the units you publish, for the loops we still show as undeclared. Also confirm the 171 ranges already loaded | Setpoint bands, error bands, saturation and limit dwell are all computed as a fraction of declared span. Without a range those diagnostics cannot be scaled | a table |
| **O6** | The complete controller mode enumeration for this DCS. We currently map 1 to auto, 2 to manual, 3 to cascade, 4 to initialising manual. Are there others such as remote out, tracking or local? | An unmapped mode is treated as "not in automatic" and excludes the loop from scoring, so a missing value silently reduces coverage | the enumeration from the DCS |
| **O2** | Keep our broker user across your container recreates, and tell us before broker maintenance | On 22 September a broker recreate deleted our user and the feed died silently for three days. Your broker configuration directory is not persistent, so every recreate removes it | put the user in the stack's configuration source |
| **O3** | Confirm the supported endpoint: plain 1883, or is TLS 8883 returning? If TLS, the server certificate needs the host name or address in its subject alternative name | The ingestion source is configured for one endpoint and one trust chain. A listener change stops the feed until we reconfigure | one answer, plus the CA certificate if TLS |
| **O4** | Synchronise the gateway clock, and the DCS OPC server, to plant time | The gateway measured 132 seconds ahead. Every analysis window is cut on your timestamp, so drift moves results. Beyond 300 seconds ahead, samples are rejected outright | NTP source |
| **O1** | Confirm the quality vocabulary, specifically what you publish when the OPC status is bad or uncertain | Largely answered from our own data: every one of 1.66 million samples read `GOOD`, so the good token is confirmed. What remains unknown is the bad and uncertain tokens. If they are anything other than `BAD` and `UNCERTAIN`, those windows will be excluded as unknown quality at exactly the moment the data matters | one line |
| O10 | The 14 tags the DCS has never published, and the six process variables that stopped reporting around 8 September | They sit in the registry with no data. We will keep or retire them on your answer | confirm which are decommissioned |
| O11 | Tuning parameter semantics: is P a proportional band in percent or a gain, is I in seconds or minutes, what is GW, and which algorithm form does the controller use | Enables controller margin calculation and a tuning suggestion, never written to the DCS | a short answer |
| O12 | Whether any identity field can differ from the topic, and units on every message | Identity fields are cross-checked against the topic; units label chart axes | one line |
| O13 | Whether the `diagnostics` group or `PIDParams` is going away, since they carry the same values | We subscribe to one only. Subscribing both would double count | one line |

### One observation for you, no action needed

About 14.6 percent of the messages we receive are set aside because they are not control-loop data.
Almost all of it, 10,520 messages of 10,538, is a single source: the Bender insulation monitor at
`OT/HDPE/BENDER/SYSTEM-1/EG` publishing an item called `VNS`. The remainder is electrical metering and
a few level and flow indicators that have no setpoint or output. Nothing is lost and no loop data is
affected. We will narrow our subscription to stop collecting it.

---

## 6. Pending on Instrumental — transmitter health and instrument mapping

v2.5 adds a **read-only** subscriber for your NE107 device state. We never write to your system, and
acknowledging a loop episode never acknowledges a device condition. Until your publisher exists, every
loop reads "transmitter health: not configured", which is intended.

The full contract with JSON schemas is `docs/next-release/instrumental-health-contract.md` and
`contracts/instrumental-health/v1/*.schema.json`. The schema is strict: unexpected field names are
rejected rather than guessed at.

| # | Request | Why |
|---|---|---|
| **I1** | Approve contract v1, or send the changes you need | It is still marked proposed, and the ingestion, analysis and API are all built to it |
| **I2** | Which broker will your publisher use, ours at `192.168.190.91:1883` with authentication, or the PI archiver broker? With or without TLS? | We configure one data source per publisher with its address, credentials and certificate authority. We will issue you a username and password if you choose ours |
| **I3** | Identity values (`tenant_id`, `site_id`, `source_id`, `producer_id`) and your device inventory, with `device_id` and `installation_id` | The subscriber accepts only its configured tenant and site. Device identity is never inferred from a tag name |
| **I4** | **Which loop signal each device feeds**, as `<loop tag>.<ROLE>`, for example `FIC10302.PV` or `FIC10302.VP`, using the DCS loop tags in our registry | This is the mapping. It is how a device diagnostic reaches the right loop |
| I5 | Publishing behaviour: a retained state snapshot per device, non-retained events, retained availability with an offline last will, quality of service 1, and `scan_interval_s` set | Freshness expiry is three scan intervals or 120 seconds, whichever is longer. A stale device state must be recognisable as stale |
| I6 | Use of the four NE107 flags with a measurement impact per diagnostic, plus cause and remedy text | A failure on the measuring transmitter makes a loop ineligible for identification; a check condition limits it; maintenance is context only. We never infer impact ourselves |
| I7 | Reference format for source records, and the message limits | Drill-down from the user interface |

### What we need as a file

A CSV, one row per bound signal:

```
loop_tag, role, device_id, installation_id, source_id, valid_from
```

where `role` is one of `PV`, `VP`, `SP`, `OP`. We load it through
`POST /api/v1/cpm/loops/{loopId}/instrument-bindings`, which in v2.5 is an interface call scripted in
bulk rather than a screen.

### How a transmitter maps to a loop

1. **The binding is the mapping.** It joins a loop tag and a signal role to one device, effective from a
   date and open ended. One primary device per signal at any instant, and the database refuses
   overlapping claims. A replaced transmitter is a new binding from its installation date, and the
   previous one is kept as history rather than overwritten.
2. **Nothing is matched by name.** A device is never associated with a loop because their tags look
   similar. The binding is explicit, or there is no binding.
3. **Device state becomes per-signal eligibility.** Your device intervals are turned into a verdict per
   loop and per role: eligible, limited, ineligible, unknown, or not configured. That verdict appears on
   the loop, in the historical and evidence views, and it is used by the analysis. A failed measuring
   transmitter excludes the affected window with the reason recorded as instrument health, never a
   silent pass.
4. **Reads are as of a moment.** Asking what device fed a signal last Tuesday returns the binding that
   was in force last Tuesday, not today's.

### What we owe you

A broker user on our side if you choose our broker, the loop tag list with roles so you can fill
`affected_variable_ids`, and a test window on our laboratory system where your first messages can be
validated against the schema before they reach the plant.

---

## 7. Known limitations and carried assumptions

| | |
|---|---|
| **Output path assumed** | 169 of 175 loops are currently recorded as driving a control valve, set by a sweep rather than by knowledge. Any drive-driven loop or cascade master among them will have its findings labelled as a valve problem. Nothing can reach "confirmed" on that basis, because confirmation needs valve position feedback which the feed does not carry. Corrected by request O7, one update per loop |
| **Bandwidth limit** | On flow and liquid pressure loops, oscillation, spectral and response results are limited by the sample rate and are not verdicts. Corrected by request O9 |
| **No peer relationships** | Interaction analysis reads not configured until loop peers are declared |
| **Producer reconnection** | The ingestion service does not always reconnect to the message broker by itself after a broker restart. If the sample count stops growing after broker maintenance, restarting the ingestion service restores it. A fix is scheduled |
| **Evidence retention** | Set to 3 days at this plant, deliberately conservative while growth is measured. Evidence pinned to an investigation is never removed. Raising it later is safe |
| **Shared host** | The performance system shares its disk, database and message broker with the Instrumental platform. Disk is the constraint to watch |

---

## 8. Operational notes

- **Disk.** The plant filesystem was extended during the deployment and has about 15 GB free. It is
  worth a daily glance for the first week while evidence growth settles.
- **Rollback.** The previous images, database contents and configuration were captured before the
  switch and are held on the plant.
- **What changed in Kafka.** Eight new topics were created and message retention was reduced to the
  minimum each consumer can recover from. No existing topic was deleted or recreated.
- **Nothing is written to the DCS.** The system reads MQTT and nothing else. Every tuning figure,
  every diagnosis and every recommendation is for a person to act on.

---

*Questions on this note go to the performance system team. Sections 5 and 6 are written to be forwarded
to the OT gateway and Instrumental teams respectively.*
