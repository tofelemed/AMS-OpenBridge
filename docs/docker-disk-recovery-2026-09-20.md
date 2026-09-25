# Lab Docker disk recovery — 2026-09-20

## Incident and evidence

C: fell to about 1 GiB free and Docker stopped serving the lab. Docker logs recorded
ENOSPC/I/O errors and a read-only filesystem. The Docker data VHDX was about
173.25 GiB; its filesystem held about 69 GiB of live data before cleanup.
These measurements establish accumulated storage, not the exact attribution of
every byte written in the preceding hour.

The Flink writable layers were about 19.4 GB combined. The TaskManager contained
6.7 GiB of temporary directories and 5.6 GiB of file logs; the JobManager had
5.6 GiB of temporary directories plus 223 MiB of logs. Old process directories
survived container restarts, and each RocksDB recovery created another log family
outside its disposable database directory.

A duplicate long-diagnostics job (64b611af52aba0155cdb437887772103) repeatedly
restored checkpoint 1 and failed with FLINK-25920. The other copy
(c73fccb67dcf070b070ca6109f7f3ba4) was running with successful checkpoints
463/464. Only the failing duplicate was cancelled. Durable checkpoints remain.

## Persistent changes

- Base lab Compose mounts an INFO-level console-only Log4j configuration.
  Docker already rotates this stream at 10 MB, three files. No duplicate rolling
  file appender accumulates process-specific logs.
- RocksDB logs use the documented Flink 1.18 per-database fallback (/dev/null),
  WARN level, two files, 1 MB per file. Their lifecycle follows the database.
- Flink's entrypoint removes recognized prior-process temporary directories and
  old log families before starting the JVM, only when it is PID 1. Cleanup does
  not follow symlinks or cross filesystem boundaries. ZooKeeper/MinIO HA state,
  checkpoints/savepoints and /flink-checkpoints are not cleanup targets.
- Host WSL swap remains 8 GB but now lives at D:\\DockerSupport\\wsl-swap.vhdx.
  Existing 12 GB memory / six CPU settings remain. autoMemoryReclaim was moved
  to the correct experimental section.
- Host Docker builder GC target changed from 20 GB to 5 GB. Build cache was
  already zero during inspection: this is a future retention target, not a hard
  disk quota. New containers default to rotated local logs (10 MB, three files).
  Existing Compose containers retain their explicit rotated json-file policy.
- The guarded scripts/compact-lab-docker-disk.ps1 reclaims unused VHDX blocks
  offline. It requires Windows administrator rights, a stopped Docker backend,
  the exact expected path, and a detached dynamic disk. It does not shrink the
  virtual capacity, delete volumes, or format a filesystem.

## Recovery and backups

Docker's stale IPC socket directories were renamed and preserved under
LocalAppData; restarting then recovered the engine. The same IPC error recurred
after offline compaction. scripts/start-lab-docker.ps1 provides a guarded recovery
launcher: when Docker is stopped, it preserves only recognized zero-byte socket
directories before starting Desktop. It refuses unexpected contents and never
moves active sockets. This works around the observed Desktop startup failure;
it does not patch Docker Desktop itself. The regenerable npm download
cache was cleared to give Windows initial working space. No project dependencies
were removed.

Redis contract storage had a malformed 688-byte AOF tail. A complete original
copy is at D:\\DockerSupport\\redis-contract-before-repair-20260920. redis-check-aof
validated the base RDB and every preceding command, removed only that invalid
tail, and Redis successfully replayed the remaining AOF. Writes represented only
by the invalid tail cannot be recovered from that AOF; the original is retained.
No database or Docker volume was pruned.

Host configuration backups are in D:\\DockerSupport:
.wslconfig.before-20260920 and daemon.json.before-20260920.
Compaction output is compact-docker-20260920.log.

## Verification

- Compose config --quiet and entrypoint bash -n passed before deployment.
- The recreated TaskManager showed 4 KiB in /opt/flink/log and 374 MiB in /tmp
  during initial recovery, with the four RocksDB settings active.
- Redis reported Ready to accept connections after repair.
- Offline compaction succeeded: VHDX 186,020,528,128 -> 75,625,398,272
  bytes, reclaiming 110,395,129,856 bytes (102.81 GiB). C: reached 107.2 GiB
  free; after recovery it remained about 107 GiB free.
- The isolated cleanup regression passed, including preservation of a checkpoint
  file, an unrelated /tmp file, and the target of a temporary-directory symlink.
- After restart, Flink /overview returned HTTP 200: one TaskManager, 13 running
  jobs, zero failed jobs. No running container reported unhealthy/restarting.
- Chrome successfully loaded /cpm/explorer?loop=FIC10301 with registry and loop
  data. This is recovery verification, not completion of the separate CPA UI QA.

## Operating limits

Retention fixes prevent the identified accumulation; they are not a quota on
all application data. Database history, Kafka, images and checkpoints still need
their existing retention/capacity policies. D: has only about 47 GiB free, so
moving the complete Docker disk there is not currently a safe capacity solution.
Do not use system prune --volumes or delete the VHDX as a disk cleanup method.

References:
- https://nightlies.apache.org/flink/flink-docs-release-1.18/docs/deployment/config/
- https://learn.microsoft.com/en-us/windows/wsl/wsl-config
- https://docs.docker.com/build/cache/garbage-collection/
- https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/compact-vdisk

---

# Second exhaustion the same day (10:51) — root cause and permanent fix (CHG-032)

## What happened

| Time (local) | Event |
|---|---|
| 00:17–00:30 | Docker Desktop auto-updated 4.81 → 4.91; WSL updated to 2.7.14 (`wsl --update`). |
| 01:56–02:01 | First recovery above: `Optimize-VHD` 186 GB → 75.6 GB, C: 115 GB free (compaction log). |
| 02:03–10:51 | Engine running, 13 Flink jobs. `docker_data.vhdx` regrew 75.6 GB → 166.4 GB (~10 GB/h) while ext4 usage inside stayed ~57 GB. |
| 10:51 | C: reached 0. Hyper-V returned I/O errors to the VM, ext4 flipped to `emergency_ro`, dockerd died. |
| 10:53–11:37 | Docker Desktop restart loop: `wsl --unmount docker_data.vhdx` → "The disk failed to detach: Operation not permitted", then "Failed to attach disk … already attached"; VM rebooted every ~5 min; Docker Desktop exited 11:39. |
| 12:10 | `Optimize-VHD` alone reclaimed **25 MB** (no trim had happened: the previous shutdown was a crash). |
| 12:14–12:16 | Attached the disk to WSL, `e2fsck -f` (only extent-tree optimisations), `fstrim` (947 GiB discarded), detached, `Optimize-VHD` → **166.4 GB → 70.5 GB, C: 96 GB free**. |
| 12:18 | Docker Desktop started via `scripts/start-lab-docker.ps1`; Redis contract AOF loaded cleanly; gateway 200. |
| 12:19–12:30 | JobManager crash-looped (19× "Fatal error occurred in the cluster entrypoint"); TaskManager wrote 14 GB of block I/O in 12 min re-restoring RocksDB state; VHDX 70.5 → 81.7 GB. Stopped the JobManager; growth stopped. |

## Root cause

1. **Uncapped dynamic VHDX with no TRIM path.** `docker_data.vhdx` is a 1 TB dynamically
   expanding disk on a 480 GB C:. Every guest write into a 32 MB region not yet allocated
   in the file grows the file; freed guest blocks are never returned. The Docker Desktop VM
   image contains no `fstrim` service (the string exists only inside the busybox binary) and
   mounts the data disk without `discard`. The stack's write churn is high relative to its
   live data (ext4 lifetime writes 5.3 TB since 30 May for ~57 GB live), so the file inflates
   at ~10 GB/h in steady state.
2. **The only reclaim path is broken since the 4.91 / WSL 2.7.14 update.** Docker Desktop
   trims and compacts the data disk on a *clean* shutdown; since the update its
   `wsl --unmount` fails, it logs "skipping data disk compaction", and after a crash no trim
   happens at all — which is why `Optimize-VHD` without a preceding guest `fstrim` reclaimed
   nothing.
3. **Nothing caps or watches the disk.** When C: hit 0 the VM saw I/O errors, ext4 lost the
   async superblock writes, and MinIO acknowledged a Flink HA object
   (`ha/ams-lab/completedCheckpointf80e26567a44`, checkpoint 12805 of *AMS - Alarm State
   Machine*) that never reached disk. ZooKeeper still referenced it; Flink HA treats an
   unreadable latest checkpoint as fatal for the whole JobManager, and every JobManager
   restart makes the TaskManager re-restore every job's RocksDB state (~60 GB/h of fresh
   VHDX blocks). CHG-029 fixed the *live* accumulation in Flink; it could not address any of
   the three points above.

Measured write-set inside the disk 02:00–10:51 (files touched): Kafka 7 GB (gate.evidence
3.9 GB rolling 100 MB segments), Postgres 3.1 GB, MinIO 0.3 GB, everything else < 0.2 GB.
Per-container block I/O after the 12:18 restart: TaskManager 14 000 MB, IoTDB 216 MB, Kafka
33 MB, Postgres 25 MB.

## Permanent fix (scripts/, all guarded, all log to D:\DockerSupport)

| Script | Purpose | Needs |
|---|---|---|
| `reclaim-lab-docker-disk.ps1` | Graceful `docker desktop stop` → `wsl --shutdown` → attach → `e2fsck -f -p` → `fstrim` → detach → `Optimize-VHD` → start → verify (no unhealthy/restarting containers, ≥13 RUNNING Flink jobs, gateway 200). Replaces the vendor compaction that no longer runs. | admin |
| `watch-lab-disk.ps1` | Every 10 min: CSV of C: free + VHDX size + GB/h; WARN < 40 GB; below 20 GB stops Docker Desktop gracefully so the failure is a clean outage, not a read-only disk. | — |
| `install-lab-disk-guard.ps1` | Registers both as scheduled tasks for the logged-in user with highest privileges (nightly 03:30 / every 10 min) plus the event-log source. `-Uninstall` removes them. | admin |
| `cap-lab-docker-disk.ps1` | One-time hard cap: reclaim, `resize2fs` to 159 GiB, `Resize-VHD` to 160 GB, `DiskSizeMiB=163840` in settings-store.json, restart, verify. Aborts unchanged if Hyper-V reports a larger minimum size or usage > 70 %. | admin |
| `repair-flink-ha-checkpoints.ps1` | Sweeps every HA job's checkpoint references in ZooKeeper against MinIO; `-Apply` removes only references whose handle object is missing, never a job's last one. | JobManager stopped |
| `gc-flink-checkpoints.ps1` | Deletes MinIO checkpoint directories of jobs that are not live and older than 7 days (167 directories / 2 GB accumulated since 9 Aug because of RETAIN_ON_CANCELLATION). Dry-run by default. | Flink REST up |
| `start-ams-docker-full.ps1` | `docker image prune -f` after every `--build` (16.6 GB of dangling layers by 20 Sep). | — |
| `compact-lab-docker-disk.ps1` | Unchanged except a timestamped log name. Use `reclaim-lab-docker-disk.ps1` instead; this one reclaims nothing after a crash. | admin |

Still on C: and not Docker's: `C:\PISRV2018` (40.5 GB, a 2024 VMware image), pagefile 22 GB,
hiberfil 6.3 GB, `.gemini` caches 8.2 GB, Temp 6 GB. D: has 47 GB free, so the VHDX cannot
move there.
