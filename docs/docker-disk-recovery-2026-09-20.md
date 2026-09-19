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
