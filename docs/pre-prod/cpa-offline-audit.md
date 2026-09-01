# CPA air-gap audit — libraries & runtime internet dependencies

**Date:** 2026-09-01. **Scope:** the Marun CPA cut only (`--profile cpa` per
[docker-compose.marun.yml](../../migration/deploy/docker-compose.marun.yml)): frontend, gateway,
auth-service, asset-model, binding-resolver, cplm-api, historian-bff, ingestion-service,
audit-service, sparkplug-edge-node, 4 Flink jobs, redis×2, iotdb(+init), minio(+init), emqx(+init).
**Method:** five parallel sweeps (frontend incl. built `dist/` bundle, .NET, Node, Java, Docker/compose/VM scripts)
grepping every dependency, URL literal, entrypoint, healthcheck, and env default.

## Verdict

**The application code is air-gap clean.** No first-party code in any language calls a public
internet host at runtime. The three real defects are all **infrastructure/config**: two stock
images phone home by default (EMQX, MinIO), and one .NET package (AWS SDK) is a latent landmine
behind a config flag. All are one-line to a few-line fixes. Everything else found is either a
"breaks on the VM but not internet" item or build-box hygiene.

The existing [OFFLINE_DEPLOYMENT_GUIDE.md](../../migration/OFFLINE_DEPLOYMENT_GUIDE.md) internet-call
inventory is accurate for what it covers (fonts, Grafana, npm/NuGet/Maven, CloudBeaver) but has
**no EMQX or MinIO row** — A1/A2 below are its gaps. Update it when fixing.

---

## A — Blockers: confirmed runtime internet calls (fix before building the bundle)

### A1. EMQX telemetry → `telemetry.emqx.io` (active, every boot + weekly)
`emqx/emqx:5.6.0` OSS ships `telemetry.enable = true`. No `emqx.conf` is mounted (only `acl.conf`)
and repo-wide grep for `EMQX_TELEMETRY` is empty, so the default stands: an HTTPS POST of
node/OS/plugin info shortly after boot, then every 7 days. On the plant VM it becomes recurring
failed-DNS noise forever; on any network with a route out it's a data leak.
**Fix** — [infra/docker/docker-compose.yml](../../infra/docker/docker-compose.yml) `emqx.environment`:
`EMQX_TELEMETRY__ENABLE: "false"`.

### A2. MinIO startup update check → `dl.min.io` (active, every start, stalls startup)
`minio/minio:RELEASE.2024-06-13…` runs `checkUpdate()` during server bootstrap unless
`MINIO_UPDATE=off`; the repo never sets it. On a no-route network the DNS + TCP timeouts delay
readiness, pressing against the 15 s healthcheck `start_period` and the
`minio-init → flink-jobmanager → flink-taskmanager` dependency chain.
**Fix** — `minio.environment`: `MINIO_UPDATE: "off"`. Belt-and-braces on `minio-init`: `MC_UPDATE: "off"`.

### A3. audit-service WORM archiver → public AWS S3 (latent, config-triggered)
[WormArchiveWriter.cs:21](../../src/services/audit-service/Archival/WormArchiveWriter.cs#L21) constructs
a bare `new AmazonS3Client()` — default resolver → `https://<bucket>.s3.<region>.amazonaws.com`, and
with no credentials the SDK first probes link-local metadata endpoints (multi-second hangs).
The gate in `Program.cs:38-42` registers the archiver when **any** of `S3:AuditBucket` / `AWS:Region` /
`AWS_REGION` is set — exactly the knob a compliance requirement will make an operator turn. Dormant
today only because no compose file sets those vars. The stack already ships MinIO at `http://minio:9000`;
the wiring to it is simply missing (Flink does this correctly via `s3.endpoint`).
**Fix** — require an explicit `S3:ServiceUrl`, refuse `amazonaws.com`, use `BasicAWSCredentials` +
`ForcePathStyle=true`; add `mc mb --ignore-existing local/ams-audit-archive-worm` to `minio-init`
(with Object Lock enabled at creation if the WORM claim is to hold).

---

## B — Will break or misbehave on the plant VM (not internet calls)

| # | Finding | Fix |
|---|---|---|
| B1 | **MQTT fallback `ws://localhost:8083/mqtt`** ([mqttStore.ts:23,39](../../src/frontend-ob/src/store/mqttStore.ts#L23)) — if `VITE_MQTT_WS_URL` isn't baked into the build, "localhost" is the operator's workstation and live PV/SP/OP silently never arrives. | Fallback to same-origin `/mqtt-ws` (nginx already proxies it), matching the `SNAPSHOT_URL`/`HIST_URL` pattern. |
| B2 | **Marun overlay lost the `:?` guard on `MINIO_ROOT_PASSWORD`** in both `FLINK_PROPERTIES` blocks ([marun.yml:210,242](../../migration/deploy/docker-compose.marun.yml#L210)). Empty secret → `flink-s3-fs-presto` falls through to the AWS credential chain → every checkpoint stalls probing `169.254.169.254`. `deploy.sh` validates the var, but a direct `compose up` bypasses that. | Restore `${MINIO_ROOT_PASSWORD:?...}` in the overlay. |
| B3 | **`sparkplug-edge-node` has no explicit `image:`** (base compose declares only `build:`), and `deploy.sh` **builds by default** when `--prod`/`--no-build` is omitted — its Dockerfile hits Maven Central. | Pin `image: ams-sparkplug-edge-node:1.0-SNAPSHOT`; make no-build the default on the VM path. |
| B4 | **ams-api is off this cut but still referenced**: gateway `/api` catch-all + `/health` clusters → 502s; binding-resolver SignalR retry-churn against `ams-api:8000`. Absent names also make Docker's embedded DNS forward lookups to the host resolver — with an unreachable corporate DNS in `/etc/resolv.conf`, each miss burns the full resolver timeout. | Point gateway defaults away or accept 502s knowingly; blank binding-resolver's `Services:AmsApi`/`SignalRHub`; ensure the VM's `resolv.conf` has no dead nameserver. |
| B5 | **Host-port publications survive the overlay** on the shared VM: iotdb 6667/8181/9091, minio 9000/9001, flink 8082/9249/9250. `00-prerequisites-check.sh` only warns on 8081/8082/8088/1883/6667 — it misses 9000/9001/8181/9091/9249/9250 (Instrumental already owns 9090, kafka-ui 8080…). | `ports: !override []` for iotdb/minio (in-network consumers only); extend the prereq port list. |
| B6 | **Favicon 404**: `index.html` references `/vite.svg`, which doesn't exist in `public/` or `dist/` — console 404 on every page load, alarming during plant sign-off. | Ship a real self-hosted favicon or drop the `<link>`. |
| B7 | **Gateway `external-feed` cluster → `http://192.168.1.51:8010`** (LAN, not internet; flagged in-code as decommission candidate, no consumer). | Delete the route + cluster for the plant cut, or confirm subnet reachability. |
| B8 | **`migration/deploy/pull-images.sh` is a registry-pull foot-gun** sitting next to `deploy.sh` with no "build box only" banner; its pull list also omits the three init images (bundle via `prodimages.py` is complete — the script is just inconsistent). | Add the banner; sync the list with `prodimages.py PULL_SERVICES`. |

## C — Hygiene (build-box, security, ops)

- **C1 Build box needs more than the npm registry**: `bcrypt@5.1.1` downloads its prebuilt binary
  from `github.com` / `objects.githubusercontent.com` at `npm ci`; blocked download silently falls
  back to node-gyp compile, which `node:18-alpine` can't do (no python3/make/g++) — a confusing
  build break. Allowlist GitHub or pre-seed the tarball. Full build-box needs: npm registry,
  github.com (bcrypt), nuget.org, Maven Central, Docker Hub + mcr.microsoft.com. Target `linux/amd64`.
- **C2** `DOTNET_CLI_TELEMETRY_OPTOUT` is set nowhere — SDK build stages POST telemetry to
  `dc.services.visualstudio.com`. Build-box-only, but add `ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1`
  to every SDK stage so a restricted-network rebuild doesn't stall.
- **C3** historian-bff is the only Dockerfile with an `apt-get install wget` layer; siblings use the
  `/dev/tcp` healthcheck idiom. Drop it. (It's also the only service running non-root — propagate
  that the *other* direction.)
- **C4** Floating tags break bundle reproducibility: `timescale/timescaledb:latest-pg15`,
  `dpage/pgadmin4:latest`, `provectuslabs/kafka-ui:master`. Pin digests before `docker save`.
  Also add `PGADMIN_CONFIG_UPGRADE_CHECK_ENABLED: "False"` so a later `--profile lab-infra` on the
  VM doesn't hit `pgadmin.org`.
- **C5** `vite.config.ts` ships full sourcemaps (60+ `.map` files) — same-origin only, but publishes
  the TypeScript source to anyone with VM access. Use `sourcemap: false` or `'hidden'` for plant.
- **C6** sparkplug's IoTDB writer defaults to `root:root` and fire-and-forgets with
  `BodyHandlers.discarding()` — a 401 silently stops history accumulation. Set `IOTDB_USER`/`IOTDB_PASSWORD`
  in compose and consider logging non-2xx.
- **C7** JWT validation runs with 30 s `ClockSkew`; gateway and auth-service co-host today, but any
  future VM split needs **plant-internal NTP** — never `pool.ntp.org`/`time.windows.com`. Audit
  hash-chain and WORM midnight scheduling also assume a sane clock.
- **C8** Admin lockout is DB-intervention-only (seed script skips existing admin; no reset flow —
  by design, no email dependency). Add a runbook entry.
- **C9** Dead weight: `@tanstack/react-query-devtools` is a declared runtime dep but never imported;
  `chart.js@4.5.1` arrives as an undeclared transitive of OpenBridge. Neither is a network risk.
- **C10** Neither Maven shade config declares `ServicesResourceTransformer` — overlapping
  `META-INF/services` entries are last-one-wins; latent SPI hazard for the bundled Kafka/JDBC/fs factories.
- **C11** audit-service uses `EnsureCreated()` instead of `Migrate()` — schema-drift risk, unrelated
  to air-gap but plant-relevant.

---

## Verified clean (what was checked and passed)

| Domain | Verdict | Highlights |
|---|---|---|
| **Frontend** (incl. built `dist/`) | ✅ clean | Every `http(s)://` literal in the shipped bundle extracted and classified — all inert (license banners, error text, XML namespaces). Fonts self-hosted end-to-end via `@fontsource` (verified in emitted CSS). AG Grid **Community** — no license ping. ECharts: no geo/map/tile fetch. No telemetry/analytics/service worker/CDN loader. All API defaults root-relative. |
| **Auth-service (Node)** | ✅ clean | Zero HTTP clients in the entire service. RS256 keys generated locally on first start, persisted in a volume. No email/SMS/captcha/OAuth deps in the lockfile. Entrypoint never runs npm. Winston: local transports only. Kafka emitter no-ops if unset. |
| **.NET services ×7** | ✅ clean (A3 aside) | Zero telemetry SDKs (no AppInsights/Sentry/OTLP exporters). Metrics pull-only. Gateway: internal JWKS, **no OIDC discovery** (Authority/MetadataAddress never set), Swagger default-404, no CDN. `TraverseAuth.cs` byte-identical across all 11 copies, zero network calls. All HttpClient targets = compose DNS. No PDF/font-fetching packages. |
| **Flink jobs (4 on this cut)** | ✅ clean | Pure Kafka→compute→Kafka; grepped individually — zero JDBC/IoTDB/HTTP. Shaded JAR self-contained; config via classpath. S3 = `http://minio:9000`. Prometheus reporter is pull. No log4j HTTP appenders, no XML/DTD parsing anywhere. s3 plugin `cp`'d from inside the image, never downloaded. |
| **sparkplug-edge-node** | ✅ clean | One HTTP client → `http://iotdb:8181`; MQTT → emqx; Kafka → kafka-1/2/3; Jedis → redis-contract. No cloud SDK. Runtime = bare JRE + `java -jar`. |
| **Images / entrypoints** | ✅ (A1/A2 aside) | All 11 ON-service Dockerfiles: every fetch is in `RUN`/`FROM` (build box). No entrypoint fetches. `iotdb-init`/`emqx-init` target compose DNS only. CloudBeaver's Maven curl is build-time **and** profiled off **and** excluded from the bundle. |
| **Healthchecks** | ✅ all 27 | Every `test:` targets localhost/127.0.0.1/local socket — including profiled-off services. |
| **VM scripts** | ✅ clean (B8 aside) | `deploy.sh --prod` never pulls or builds; `prepare-vm.sh`, `00/04b/05`, `lib.sh`: no curl/wget/apt/pip to anywhere external. `migration/.env.example`: no public endpoints. |

## Fix order

1. **A1 + A2 (+C6-adjacent `MC_UPDATE`)** — 3 env lines in the base compose. Do first; costs nothing.
2. **A3** — small code change in audit-service + minio-init bucket. Before anyone enables WORM.
3. **B1, B6, C5** — frontend build tweaks (MQTT fallback, favicon, sourcemaps) before `npm run build` for the bundle.
4. **B2, B3, B5** — overlay/compose corrections, alongside the already-planned DNS/service-key fix.
5. **B4, B7, B8, C-items** — with the overlay work or as runbook entries.
6. Update `OFFLINE_DEPLOYMENT_GUIDE.md` inventory with EMQX/MinIO/AWS-SDK rows; re-run the no-NIC smoke test after fixes.
