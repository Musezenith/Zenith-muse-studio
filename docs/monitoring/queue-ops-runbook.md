# Imagen Queue Ops Runbook

## Scope
Operational guide for `IMAGE_QUEUE=worker` monitoring signals exposed at:
- `/api/health/queue` (JSON)
- `/api/metrics/queue` (Prometheus text)

## Primary Signals
- `imagen_queue_alert_state`
  - `0=ok`, `1=warn`, `2=critical`
- `imagen_worker_running`
- `imagen_queue_queued`, `imagen_queue_processing`, `imagen_queue_failed`
- `imagen_queue_stale_processing`
- `imagen_queue_end_to_end_avg_ms` and threshold gauges

## Triage Flow
1. Check `imagen_queue_alert_state`.
2. If `critical`:
   - Confirm `imagen_worker_running`.
   - Check stale work: `imagen_queue_stale_processing`.
   - Compare latency vs threshold gauges.
3. Open `/api/health/queue` and inspect:
   - `status`, `status_reasons`
   - `policy.alert_state`, `policy.alert_reasons`
   - `counts`, `latency`, `timing`

## Common Incidents
### Worker down with backlog
Symptoms:
- `imagen_worker_running=0`
- `imagen_queue_has_backlog=1`
Actions:
1. Restart worker process (`npm run dev:imagen-worker` or service unit).
2. Verify heartbeat recovers (`imagen_worker_running=1`).
3. Confirm queued count trends down.

### Stale processing work
Symptoms:
- `imagen_queue_stale_processing>0`
- policy reason includes `STALE_WORK_PRESENT`
Actions:
1. Check worker logs for sweeper errors.
2. Validate DB file lock/contention and disk health.
3. Confirm stale count returns to zero after recovery.

### Latency breach
Symptoms:
- avg/last latency metrics above warn/critical thresholds.
Actions:
1. Check backlog and retry pressure metrics.
2. Review provider health and timeout settings.
3. Scale worker concurrency/process count if needed.
4. Re-check end-to-end latency after mitigation.

## Post-Incident Validation
- `imagen_queue_alert_state` returns to `0`.
- `imagen_queue_stale_processing=0`.
- `imagen_worker_running=1`.
- `imagen_queue_queued` decreasing or stable at normal baseline.
