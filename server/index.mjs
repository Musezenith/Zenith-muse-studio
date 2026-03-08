import http from "node:http";
import { randomUUID } from "node:crypto";
import {
  generateViaVertexImagen,
  getImagenProviderRuntimeInfo,
  getTimeoutMs,
} from "./imagenService.mjs";
import {
  clearArchiveRuns,
  deleteArchiveRun,
  listArchiveRuns,
  saveArchiveRun,
  updateArchiveRun,
} from "./archiveFileStore.mjs";
import {
  getS3UrlMode,
  getSignedAssetUrl,
  readStoredAsset,
} from "./assetStorage.mjs";
import {
  getDocumentBySlug,
  initializeDocumentsStore,
  listDocuments,
} from "./documentsStore.mjs";
import { buildCaseStudyDraft } from "./caseStudyStore.mjs";
import {
  createJob,
  getJobById,
  getJobsOverview,
  initializeJobsStore,
  recomputeJobSla,
  updateJobStatus,
  updateJobSlaMilestones,
} from "./jobsStore.mjs";
import {
  generateTestimonialDraft,
  getTestimonialByJob,
  updateTestimonial,
} from "./testimonialStore.mjs";
import {
  generateProofAssetPack,
  getProofAssetPackByJob,
  updateProofAssetPack,
} from "./proofAssetPackStore.mjs";
import {
  buildQuoteDraft,
  createQuoteVersion,
  getQuoteById,
  initializeQuotesStore,
  listQuotesByJob,
} from "./quotesStore.mjs";
import { AUDIT_ACTIONS, initializeAuditStore, listAuditLogsForEntity } from "./auditStore.mjs";
import {
  createGenerationCostRun,
  initializeGenerationCostStore,
} from "./generationCostStore.mjs";
import {
  enqueueImagenJob,
  getImagenQueueDiagnostics,
  getImagenQueueSweeperConfig,
  getImagenJobByRequestId,
  getImagenRuntimeState,
  getImagenQueueRetryConfig,
  getImageQueueMode,
  initializeImagenQueueStore,
} from "./imagenQueueStore.mjs";
import { applyGenerationResultSideEffects } from "./imagenRuntimeHooks.mjs";
import { deriveQueueHealthStatus } from "./queueHealthStatus.mjs";
import { deriveQueueHealthSummary } from "./queueHealthSummary.mjs";
import { renderQueueMetrics } from "./queueMetrics.mjs";
import { deriveQueueLatency } from "./queueLatency.mjs";
import { deriveQueueAlertPolicy } from "./queueAlertPolicy.mjs";
import {
  getGenerationTelemetryDiagnostics,
  recordGenerationTelemetry,
} from "./generationTelemetryStore.mjs";
import { deriveGenerationHealthSummary } from "./generationHealthSummary.mjs";
import { renderGenerationMetrics } from "./generationMetrics.mjs";
import { getStudioPresetById, listStudioPresets } from "./studioPresets.mjs";

const port = Number(process.env.PORT || 8787);
const corsOrigin = process.env.CORS_ORIGIN || "*";

function writeJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function writeText(res, statusCode, body, contentType = "text/plain; version=0.0.4; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJsonBody(req) {
  const maxBodyBytes = Number(process.env.MAX_JSON_BODY_BYTES || 8_000_000);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxBodyBytes) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
      }
    });
    req.on("end", () => {
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        resolve(parsed);
      } catch (error) {
        reject(Object.assign(new Error("Invalid JSON body"), { status: 400 }));
      }
    });
    req.on("error", (error) => {
      reject(Object.assign(error, { status: 400 }));
    });
  });
}

function toErrorResponse(error, requestId) {
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
      ? error.status
      : 500;
  const code =
    status === 400
      ? "BAD_REQUEST"
      : status === 413
      ? "PAYLOAD_TOO_LARGE"
      : status === 504
      ? "TIMEOUT"
      : status >= 500 && status < 600
      ? "UPSTREAM_ERROR"
      : "REQUEST_FAILED";

  return {
    status,
    body: {
      requestId,
      error: {
        code,
        message: error.message || "Request failed",
        details: error.body || null,
      },
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.floor(number));
}

function readQueuePolicyThresholdConfig() {
  return {
    queue_wait_warn_ms: parsePositiveInt(process.env.IMAGE_QUEUE_WAIT_WARN_MS, 10000),
    queue_wait_critical_ms: parsePositiveInt(process.env.IMAGE_QUEUE_WAIT_CRITICAL_MS, 30000),
    processing_warn_ms: parsePositiveInt(process.env.IMAGE_QUEUE_PROCESSING_WARN_MS, 30000),
    processing_critical_ms: parsePositiveInt(
      process.env.IMAGE_QUEUE_PROCESSING_CRITICAL_MS,
      90000
    ),
    end_to_end_warn_ms: parsePositiveInt(process.env.IMAGE_QUEUE_END_TO_END_WARN_MS, 45000),
    end_to_end_critical_ms: parsePositiveInt(
      process.env.IMAGE_QUEUE_END_TO_END_CRITICAL_MS,
      120000
    ),
  };
}

function recordGenerationTelemetrySafe(requestId, values) {
  try {
    recordGenerationTelemetry(requestId, values);
  } catch (_) {
    // non-blocking telemetry write
  }
}

async function waitForQueuedGeneration(requestId, timeoutMs) {
  const pollMs = Math.max(100, Number(process.env.IMAGE_QUEUE_POLL_MS || 200));
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const job = getImagenJobByRequestId(requestId);
    if (job?.status === "succeeded") {
      return { ok: true, result: job.result, queueJobId: job.id };
    }
    if (job?.status === "failed") {
      const error = new Error(job?.error?.message || "Generation failed");
      error.status = Number(job?.error?.status || 500);
      error.body = job?.error?.details || null;
      throw error;
    }
    await sleep(pollMs);
  }
  const error = new Error(`Queued generation timed out after ${timeoutMs}ms`);
  error.status = 504;
  throw error;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname;

  if (pathname.startsWith("/api/assets/s3/") && req.method === "GET") {
    const encoded = pathname.replace("/api/assets/s3/", "");
    const key = decodeURIComponent(encoded || "");
    if (!key || key.includes("..")) {
      writeJson(res, 404, {
        error: {
          code: "NOT_FOUND",
          message: "Asset not found",
        },
      });
      return;
    }

    if (getS3UrlMode() === "signed") {
      const signedUrl = await getSignedAssetUrl({ provider: "s3", key });
      if (!signedUrl) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Asset not found",
          },
        });
        return;
      }
      res.writeHead(302, {
        Location: signedUrl,
        "Cache-Control": "no-store",
      });
      res.end();
      return;
    }

    const asset = await readStoredAsset({ provider: "s3", key });
    if (!asset) {
      writeJson(res, 404, {
        error: {
          code: "NOT_FOUND",
          message: "Asset not found",
        },
      });
      return;
    }

    res.writeHead(200, {
      "Content-Type": asset.mimeType || "application/octet-stream",
      "Access-Control-Allow-Origin": corsOrigin,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    res.end(asset.bytes);
    return;
  }

  if (pathname === "/api/imagen/providers" && req.method === "GET") {
    const info = getImagenProviderRuntimeInfo();
    writeJson(res, 200, {
      ...info,
      queue_mode: getImageQueueMode(),
    });
    return;
  }

  if (pathname === "/api/studio/presets" && req.method === "GET") {
    try {
      const items = listStudioPresets();
      writeJson(res, 200, { items });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "STUDIO_PRESETS_LIST_FAILED",
          message: error.message || "Studio presets list failed",
        },
      });
    }
    return;
  }

  if (pathname.startsWith("/api/studio/presets/") && req.method === "GET") {
    try {
      const id = decodeURIComponent(pathname.replace("/api/studio/presets/", ""));
      if (!id) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Preset not found",
          },
        });
        return;
      }
      const item = getStudioPresetById(id);
      if (!item) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Preset not found",
          },
        });
        return;
      }
      writeJson(res, 200, { item });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "STUDIO_PRESET_DETAIL_FAILED",
          message: error.message || "Studio preset detail failed",
        },
      });
    }
    return;
  }

  if (pathname === "/api/health/queue" && req.method === "GET") {
    try {
      const diagnostics = getImagenQueueDiagnostics();
      const sweeperConfig = getImagenQueueSweeperConfig();
      const retryConfig = getImagenQueueRetryConfig();
      const policyThresholdConfig = readQueuePolicyThresholdConfig();
      const runtime = diagnostics.runtime_state || getImagenRuntimeState();
      const lastSeenAt = runtime.worker_last_seen_at?.value || null;
      const lastActivityAt = runtime.worker_last_activity_at?.value || null;
      const lastSweepAt = runtime.worker_last_sweep_at?.value || null;
      const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
      const running =
        Number.isFinite(lastSeenMs) &&
        Date.now() - lastSeenMs <= sweeperConfig.workerHeartbeatTtlMs;
      const healthSnapshot = {
        queue_mode: diagnostics.queue_mode,
        worker: {
          observable: true,
          running: Boolean(running),
          worker_id: runtime.worker_id?.value || null,
          last_seen_at: lastSeenAt,
          last_activity_at: lastActivityAt,
          last_sweep_at: lastSweepAt,
          sweeper_enabled: sweeperConfig.enabled,
        },
        counts: diagnostics.counts,
        config: {
          stale_ms: sweeperConfig.staleMs,
          sweep_interval_ms: sweeperConfig.sweepIntervalMs,
          worker_heartbeat_ttl_ms: sweeperConfig.workerHeartbeatTtlMs,
          retry_max_attempts: retryConfig.maxAttempts,
          retry_backoff_base_ms: retryConfig.baseMs,
          retry_backoff_max_ms: retryConfig.maxMs,
          ...policyThresholdConfig,
        },
        latency: deriveQueueLatency(diagnostics),
      };
      const derived = deriveQueueHealthStatus(healthSnapshot);
      const derivedSummary = deriveQueueHealthSummary(healthSnapshot, Date.now());
      const derivedPolicy = deriveQueueAlertPolicy({
        ...healthSnapshot,
        summary: derivedSummary.summary,
        thresholds: derivedSummary.thresholds,
      });
      writeJson(res, 200, {
        ...healthSnapshot,
        status: derived.status,
        status_reasons: derived.status_reasons,
        summary: derivedSummary.summary,
        timing: derivedSummary.timing,
        thresholds: derivedSummary.thresholds,
        latency: healthSnapshot.latency,
        policy: derivedPolicy,
      });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "QUEUE_HEALTH_FAILED",
          message: error.message || "Queue health failed",
        },
      });
    }
    return;
  }

  if (pathname === "/api/metrics/queue" && req.method === "GET") {
    try {
      const diagnostics = getImagenQueueDiagnostics();
      const sweeperConfig = getImagenQueueSweeperConfig();
      const retryConfig = getImagenQueueRetryConfig();
      const policyThresholdConfig = readQueuePolicyThresholdConfig();
      const runtime = diagnostics.runtime_state || getImagenRuntimeState();
      const lastSeenAt = runtime.worker_last_seen_at?.value || null;
      const lastActivityAt = runtime.worker_last_activity_at?.value || null;
      const lastSweepAt = runtime.worker_last_sweep_at?.value || null;
      const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
      const running =
        Number.isFinite(lastSeenMs) &&
        Date.now() - lastSeenMs <= sweeperConfig.workerHeartbeatTtlMs;
      const snapshot = {
        queue_mode: diagnostics.queue_mode,
        worker: {
          observable: true,
          running: Boolean(running),
          worker_id: runtime.worker_id?.value || null,
          last_seen_at: lastSeenAt,
          last_activity_at: lastActivityAt,
          last_sweep_at: lastSweepAt,
          sweeper_enabled: sweeperConfig.enabled,
        },
        counts: diagnostics.counts,
        config: {
          stale_ms: sweeperConfig.staleMs,
          sweep_interval_ms: sweeperConfig.sweepIntervalMs,
          worker_heartbeat_ttl_ms: sweeperConfig.workerHeartbeatTtlMs,
          retry_max_attempts: retryConfig.maxAttempts,
          retry_backoff_base_ms: retryConfig.baseMs,
          retry_backoff_max_ms: retryConfig.maxMs,
          ...policyThresholdConfig,
        },
        latency: deriveQueueLatency(diagnostics),
      };
      const derivedStatus = deriveQueueHealthStatus(snapshot);
      const derivedSummary = deriveQueueHealthSummary(snapshot, Date.now());
      const derivedPolicy = deriveQueueAlertPolicy({
        ...snapshot,
        summary: derivedSummary.summary,
        thresholds: derivedSummary.thresholds,
      });
      const metricsText = renderQueueMetrics(
        {
          ...snapshot,
          status: derivedStatus.status,
          status_reasons: derivedStatus.status_reasons,
          summary: derivedSummary.summary,
          timing: derivedSummary.timing,
          thresholds: derivedSummary.thresholds,
          latency: snapshot.latency,
          policy: derivedPolicy,
        },
        Date.now()
      );
      writeText(res, 200, metricsText);
    } catch (error) {
      writeText(
        res,
        500,
        `# queue metrics scrape failed\n# ${String(error?.message || "unknown error")}\n`
      );
    }
    return;
  }

  if (pathname === "/api/health/generation" && req.method === "GET") {
    try {
      const diagnostics = getGenerationTelemetryDiagnostics();
      const summary = deriveGenerationHealthSummary(diagnostics);
      writeJson(res, 200, {
        queue_mode: getImageQueueMode(),
        ...summary,
      });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "GENERATION_HEALTH_FAILED",
          message: error.message || "Generation health failed",
        },
      });
    }
    return;
  }

  if (pathname === "/api/metrics/generation" && req.method === "GET") {
    try {
      const diagnostics = getGenerationTelemetryDiagnostics();
      const summary = deriveGenerationHealthSummary(diagnostics);
      const text = renderGenerationMetrics(summary, Date.now());
      writeText(res, 200, text);
    } catch (error) {
      writeText(
        res,
        500,
        `# generation metrics scrape failed\n# ${String(error?.message || "unknown error")}\n`
      );
    }
    return;
  }

  if (pathname === "/api/generation-cost-runs" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const item = createGenerationCostRun(body);
      if (item?.job_id) {
        try {
          updateJobSlaMilestones(item.job_id, {
            first_output_at: item.created_at,
            actor: "system",
            audit_action_type: AUDIT_ACTIONS.FIRST_OUTPUT_CREATED,
          });
        } catch (_) {
          // non-blocking
        }
      }
      writeJson(res, 201, { item });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      writeJson(res, status, {
        error: {
          code: status === 400 ? "VALIDATION_ERROR" : "GENERATION_COST_CREATE_FAILED",
          message: error.message || "Generation cost create failed",
          details: error.body || null,
        },
      });
    }
    return;
  }

  if (pathname.startsWith("/api/assets/") && req.method === "GET") {
    const key = pathname.replace("/api/assets/", "");
    const asset = await readStoredAsset({ provider: "filesystem", key });
    if (!asset) {
      writeJson(res, 404, {
        error: {
          code: "NOT_FOUND",
          message: "Asset not found",
        },
      });
      return;
    }

    res.writeHead(200, {
      "Content-Type": asset.mimeType || "application/octet-stream",
      "Access-Control-Allow-Origin": corsOrigin,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    res.end(asset.bytes);
    return;
  }

  if (pathname === "/api/documents" && req.method === "GET") {
    try {
      const items = listDocuments();
      writeJson(res, 200, { items });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "DOCUMENTS_LIST_FAILED",
          message: error.message || "Documents list failed",
        },
      });
    }
    return;
  }

  if (pathname.startsWith("/api/documents/") && req.method === "GET") {
    try {
      const slug = decodeURIComponent(pathname.replace("/api/documents/", ""));
      if (!slug) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Document not found",
          },
        });
        return;
      }
      const item = getDocumentBySlug(slug);
      if (!item) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Document not found",
          },
        });
        return;
      }
      writeJson(res, 200, { item });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "DOCUMENTS_DETAIL_FAILED",
          message: error.message || "Document detail failed",
        },
      });
    }
    return;
  }

  if (pathname === "/api/archive/runs" && req.method === "GET") {
    try {
      const items = await listArchiveRuns();
      writeJson(res, 200, { items });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "ARCHIVE_LIST_FAILED",
          message: error.message || "Archive list failed",
        },
      });
    }
    return;
  }

  if (pathname === "/api/jobs" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const item = await createJob(body);
      writeJson(res, 201, { item });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      writeJson(res, status, {
        error: {
          code: status === 400 ? "VALIDATION_ERROR" : "JOB_CREATE_FAILED",
          message: error.message || "Job create failed",
          details: error.body || null,
        },
      });
    }
    return;
  }

  if (pathname.startsWith("/api/jobs/") && pathname.endsWith("/status") && req.method === "PUT") {
    try {
      const jobId = decodeURIComponent(
        pathname.replace("/api/jobs/", "").replace("/status", "")
      );
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const body = await readJsonBody(req);
      const item = updateJobStatus(jobId, {
        status: body?.status,
        actor: body?.actor || "operator",
      });
      if (!item) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      writeJson(res, 200, { item });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      writeJson(res, status, {
        error: {
          code: status === 400 ? "VALIDATION_ERROR" : "JOB_STATUS_UPDATE_FAILED",
          message: error.message || "Job status update failed",
          details: error.body || null,
        },
      });
    }
    return;
  }

  if (pathname.startsWith("/api/jobs/") && pathname.endsWith("/sla") && req.method === "PUT") {
    try {
      const jobId = decodeURIComponent(
        pathname.replace("/api/jobs/", "").replace("/sla", "")
      );
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const body = await readJsonBody(req);
      const item = updateJobSlaMilestones(jobId, {
        brief_received_at: body?.brief_received_at,
        first_output_at: body?.first_output_at,
        feedback_received_at: body?.feedback_received_at,
        final_delivered_at: body?.final_delivered_at,
        breach_reason_code: body?.breach_reason_code,
        breach_note: body?.breach_note,
        allow_clear_breach: Boolean(body?.allow_clear_breach),
        actor: body?.actor || "operator",
        audit_action_type: AUDIT_ACTIONS.MANUAL_SLA_EDIT,
      });
      if (!item) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      writeJson(res, 200, { item });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      writeJson(res, status, {
        error: {
          code: status === 400 ? "VALIDATION_ERROR" : "JOB_SLA_UPDATE_FAILED",
          message: error.message || "Job SLA update failed",
          details: error.body || null,
        },
      });
    }
    return;
  }

  if (pathname.startsWith("/api/jobs/") && pathname.endsWith("/sla/recompute") && req.method === "POST") {
    try {
      const tokenHeader = req.headers["x-admin-recompute-token"];
      const configuredToken = process.env.SLA_RECOMPUTE_ADMIN_TOKEN || "";
      const body = await readJsonBody(req);
      const adminBypass = body?.admin === true;
      if (configuredToken) {
        if (String(tokenHeader || "") !== configuredToken) {
          writeJson(res, 403, {
            error: {
              code: "FORBIDDEN",
              message: "Admin token required",
            },
          });
          return;
        }
      } else if (!adminBypass) {
        writeJson(res, 403, {
          error: {
            code: "FORBIDDEN",
            message: "Admin mode required",
          },
        });
        return;
      }

      const jobId = decodeURIComponent(
        pathname.replace("/api/jobs/", "").replace("/sla/recompute", "")
      );
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const item = recomputeJobSla(jobId, {
        actor: body?.actor || "admin",
      });
      if (!item) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      writeJson(res, 200, { item });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      writeJson(res, status, {
        error: {
          code: status === 400 ? "VALIDATION_ERROR" : "JOB_SLA_RECOMPUTE_FAILED",
          message: error.message || "Job SLA recompute failed",
          details: error.body || null,
        },
      });
    }
    return;
  }

  if (pathname === "/api/jobs/overview" && req.method === "GET") {
    try {
      const limit = Number(requestUrl.searchParams.get("limit") || 25);
      const payload = getJobsOverview({ limit });
      writeJson(res, 200, payload);
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "JOBS_OVERVIEW_FAILED",
          message: error.message || "Jobs overview failed",
        },
      });
    }
    return;
  }

  if (
    pathname.startsWith("/api/jobs/") &&
    pathname.endsWith("/testimonial/generate") &&
    req.method === "POST"
  ) {
    try {
      const jobId = decodeURIComponent(
        pathname.replace("/api/jobs/", "").replace("/testimonial/generate", "")
      );
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const body = await readJsonBody(req);
      const item = await generateTestimonialDraft(jobId, {
        actor: body?.actor || "operator",
      });
      writeJson(res, 200, { item });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      writeJson(res, status, {
        error: {
          code:
            status === 400
              ? "VALIDATION_ERROR"
              : status === 404
              ? "NOT_FOUND"
              : "TESTIMONIAL_GENERATE_FAILED",
          message: error.message || "Testimonial generate failed",
          details: error.body || null,
        },
      });
    }
    return;
  }

  if (
    pathname.startsWith("/api/jobs/") &&
    pathname.endsWith("/testimonial") &&
    req.method === "GET"
  ) {
    try {
      const jobId = decodeURIComponent(pathname.replace("/api/jobs/", "").replace("/testimonial", ""));
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const item = getTestimonialByJob(jobId);
      if (!item) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      writeJson(res, 200, { item });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "TESTIMONIAL_FETCH_FAILED",
          message: error.message || "Testimonial fetch failed",
        },
      });
    }
    return;
  }

  if (
    pathname.startsWith("/api/jobs/") &&
    pathname.endsWith("/proof-pack/generate") &&
    req.method === "POST"
  ) {
    try {
      const jobId = decodeURIComponent(
        pathname.replace("/api/jobs/", "").replace("/proof-pack/generate", "")
      );
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const body = await readJsonBody(req);
      const item = await generateProofAssetPack(jobId, {
        actor: body?.actor || "operator",
      });
      writeJson(res, 200, { item });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      writeJson(res, status, {
        error: {
          code:
            status === 400
              ? "VALIDATION_ERROR"
              : status === 404
              ? "NOT_FOUND"
              : "PROOF_PACK_GENERATE_FAILED",
          message: error.message || "Proof pack generate failed",
          details: error.body || null,
        },
      });
    }
    return;
  }

  if (
    pathname.startsWith("/api/jobs/") &&
    pathname.endsWith("/proof-pack") &&
    req.method === "GET"
  ) {
    try {
      const jobId = decodeURIComponent(pathname.replace("/api/jobs/", "").replace("/proof-pack", ""));
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const item = getProofAssetPackByJob(jobId);
      if (!item) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      writeJson(res, 200, { item });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "PROOF_PACK_FETCH_FAILED",
          message: error.message || "Proof pack fetch failed",
        },
      });
    }
    return;
  }

  if (
    pathname.startsWith("/api/jobs/") &&
    pathname.endsWith("/proof-pack") &&
    req.method === "PUT"
  ) {
    try {
      const jobId = decodeURIComponent(pathname.replace("/api/jobs/", "").replace("/proof-pack", ""));
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const body = await readJsonBody(req);
      const item = updateProofAssetPack(jobId, {
        hero_proof_summary: body?.hero_proof_summary,
        snippets: body?.snippets,
        turnaround_proof: body?.turnaround_proof,
        testimonial_snippet: body?.testimonial_snippet,
        status: body?.status,
        actor: body?.actor || "operator",
      });
      writeJson(res, 200, { item });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      writeJson(res, status, {
        error: {
          code:
            status === 400
              ? "VALIDATION_ERROR"
              : status === 404
              ? "NOT_FOUND"
              : "PROOF_PACK_UPDATE_FAILED",
          message: error.message || "Proof pack update failed",
          details: error.body || null,
        },
      });
    }
    return;
  }

  if (
    pathname.startsWith("/api/jobs/") &&
    pathname.endsWith("/testimonial") &&
    req.method === "PUT"
  ) {
    try {
      const jobId = decodeURIComponent(pathname.replace("/api/jobs/", "").replace("/testimonial", ""));
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const body = await readJsonBody(req);
      const item = updateTestimonial(
        jobId,
        {
          prompt: body?.prompt,
          draft: body?.draft,
          status: body?.status,
          actor: body?.actor || "operator",
        }
      );
      writeJson(res, 200, { item });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      writeJson(res, status, {
        error: {
          code:
            status === 400
              ? "VALIDATION_ERROR"
              : status === 404
              ? "NOT_FOUND"
              : "TESTIMONIAL_UPDATE_FAILED",
          message: error.message || "Testimonial update failed",
          details: error.body || null,
        },
      });
    }
    return;
  }

  if (
    pathname.startsWith("/api/jobs/") &&
    pathname.endsWith("/case-study/draft") &&
    req.method === "GET"
  ) {
    try {
      const jobId = decodeURIComponent(
        pathname.replace("/api/jobs/", "").replace("/case-study/draft", "")
      );
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const item = await buildCaseStudyDraft(jobId);
      if (!item) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      writeJson(res, 200, { item });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "CASE_STUDY_DRAFT_FAILED",
          message: error.message || "Case study draft failed",
        },
      });
    }
    return;
  }

  if (
    pathname.startsWith("/api/jobs/") &&
    pathname !== "/api/jobs/overview" &&
    !pathname.endsWith("/quotes") &&
    !pathname.endsWith("/audit") &&
    !pathname.endsWith("/testimonial") &&
    !pathname.endsWith("/testimonial/generate") &&
    !pathname.endsWith("/proof-pack") &&
    !pathname.endsWith("/proof-pack/generate") &&
    !pathname.endsWith("/case-study/draft") &&
    !pathname.endsWith("/sla") &&
    !pathname.endsWith("/status") &&
    req.method === "GET"
  ) {
    try {
      const jobId = decodeURIComponent(pathname.replace("/api/jobs/", ""));
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const item = getJobById(jobId);
      if (!item) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      writeJson(res, 200, { item });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "JOB_DETAIL_FAILED",
          message: error.message || "Job detail failed",
        },
      });
    }
    return;
  }

  if (pathname === "/api/quotes/draft" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const item = buildQuoteDraft(body);
      writeJson(res, 200, { item });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      writeJson(res, status, {
        error: {
          code: status === 400 ? "VALIDATION_ERROR" : status === 404 ? "NOT_FOUND" : "QUOTE_DRAFT_FAILED",
          message: error.message || "Quote draft failed",
          details: error.body || null,
        },
      });
    }
    return;
  }

  if (pathname === "/api/quotes" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const item = createQuoteVersion(body);
      writeJson(res, 201, { item });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      writeJson(res, status, {
        error: {
          code: status === 400 ? "VALIDATION_ERROR" : status === 404 ? "NOT_FOUND" : "QUOTE_CREATE_FAILED",
          message: error.message || "Quote create failed",
          details: error.body || null,
        },
      });
    }
    return;
  }

  if (pathname.startsWith("/api/jobs/") && pathname.endsWith("/quotes") && req.method === "GET") {
    try {
      const jobId = decodeURIComponent(
        pathname.replace("/api/jobs/", "").replace("/quotes", "")
      );
      if (!jobId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Job not found",
          },
        });
        return;
      }
      const items = listQuotesByJob(jobId);
      writeJson(res, 200, { items });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "QUOTES_LIST_FAILED",
          message: error.message || "Quotes list failed",
        },
      });
    }
    return;
  }

  if (pathname.startsWith("/api/jobs/") && pathname.endsWith("/audit") && req.method === "GET") {
    try {
      const jobId = decodeURIComponent(
        pathname.replace("/api/jobs/", "").replace("/audit", "")
      );
      if (!jobId) {
        writeJson(res, 200, { items: [] });
        return;
      }
      const items = listAuditLogsForEntity({
        entity_type: "job",
        entity_id: jobId,
      });
      writeJson(res, 200, { items });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "AUDIT_LIST_FAILED",
          message: error.message || "Audit list failed",
        },
      });
    }
    return;
  }

  if (pathname.startsWith("/api/quotes/") && req.method === "GET") {
    try {
      const quoteId = decodeURIComponent(pathname.replace("/api/quotes/", ""));
      if (!quoteId) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Quote not found",
          },
        });
        return;
      }
      const item = getQuoteById(quoteId);
      if (!item) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Quote not found",
          },
        });
        return;
      }
      writeJson(res, 200, { item });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "QUOTE_DETAIL_FAILED",
          message: error.message || "Quote detail failed",
        },
      });
    }
    return;
  }

  if (pathname === "/api/archive/runs" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      if (!body || typeof body !== "object") {
        writeJson(res, 400, {
          error: {
            code: "BAD_REQUEST",
            message: "Invalid archive entry",
          },
        });
        return;
      }
      await saveArchiveRun(body);
      writeJson(res, 201, { ok: true });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "ARCHIVE_SAVE_FAILED",
          message: error.message || "Archive save failed",
        },
      });
    }
    return;
  }

  if (pathname === "/api/archive/runs" && req.method === "DELETE") {
    try {
      await clearArchiveRuns();
      writeJson(res, 200, { ok: true });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "ARCHIVE_CLEAR_FAILED",
          message: error.message || "Archive clear failed",
        },
      });
    }
    return;
  }

  if (pathname.startsWith("/api/archive/runs/") && req.method === "PUT") {
    try {
      const id = pathname.replace("/api/archive/runs/", "");
      const body = await readJsonBody(req);
      if (!id || !body || typeof body !== "object") {
        writeJson(res, 400, {
          error: {
            code: "BAD_REQUEST",
            message: "Invalid archive update payload",
          },
        });
        return;
      }
      const found = await updateArchiveRun(id, body);
      if (!found) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Archive entry not found",
          },
        });
        return;
      }
      writeJson(res, 200, { ok: true });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "ARCHIVE_UPDATE_FAILED",
          message: error.message || "Archive update failed",
        },
      });
    }
    return;
  }

  if (pathname.startsWith("/api/archive/runs/") && req.method === "DELETE") {
    try {
      const id = pathname.replace("/api/archive/runs/", "");
      if (!id) {
        writeJson(res, 400, {
          error: {
            code: "BAD_REQUEST",
            message: "Invalid archive id",
          },
        });
        return;
      }
      const deleted = await deleteArchiveRun(id);
      if (!deleted) {
        writeJson(res, 404, {
          error: {
            code: "NOT_FOUND",
            message: "Archive entry not found",
          },
        });
        return;
      }
      writeJson(res, 200, { ok: true });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          code: "ARCHIVE_DELETE_FAILED",
          message: error.message || "Archive delete failed",
        },
      });
    }
    return;
  }

  if (pathname !== "/api/vertex/imagen/generate" || req.method !== "POST") {
    writeJson(res, 404, {
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    });
    return;
  }

  const requestId = randomUUID();
  const timeoutMs = getTimeoutMs();
  const startedAt = Date.now();
  const queueMode = getImageQueueMode();
  recordGenerationTelemetrySafe(requestId, {
    queue_mode: queueMode,
    status: "received",
    request_received_at: new Date(startedAt).toISOString(),
  });

  try {
    const body = await readJsonBody(req);
    const payload = body?.payload;
    let result;
    let queueJobId = null;
    if (queueMode === "worker") {
      const queued = enqueueImagenJob({
        requestId,
        payload,
      });
      queueJobId = queued?.id || null;
      recordGenerationTelemetrySafe(requestId, {
        queue_mode: queueMode,
        status: "queued",
        queued_at: new Date().toISOString(),
      });
      const waitTimeoutMs = Math.max(
        1000,
        Number(process.env.IMAGE_QUEUE_WAIT_TIMEOUT_MS || timeoutMs)
      );
      const queuedResult = await waitForQueuedGeneration(requestId, waitTimeoutMs);
      result = queuedResult.result;
      queueJobId = queuedResult.queueJobId || queueJobId;
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        recordGenerationTelemetrySafe(requestId, {
          queue_mode: queueMode,
          status: "processing",
          provider_started_at: new Date().toISOString(),
        });
        result = await generateViaVertexImagen({
          payload,
          requestId,
          signal: controller.signal,
        });
        recordGenerationTelemetrySafe(requestId, {
          provider_finished_at: new Date().toISOString(),
          status: "post_processing",
          post_processing_started_at: new Date().toISOString(),
        });
        applyGenerationResultSideEffects({ payload, result });
        const completedAt = new Date().toISOString();
        recordGenerationTelemetrySafe(requestId, {
          post_processing_finished_at: completedAt,
          completed_at: completedAt,
          status: "succeeded",
        });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    writeJson(res, 200, {
      ...result,
      queue_mode: queueMode,
      ...(queueJobId ? { queue_job_id: queueJobId } : {}),
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      error.status = 504;
      error.message = `Imagen request timed out after ${timeoutMs}ms`;
    }
    const formatted = toErrorResponse(error, requestId);
    recordGenerationTelemetrySafe(requestId, {
      queue_mode: queueMode,
      status: "failed",
      error_code: formatted?.body?.error?.code || "REQUEST_FAILED",
      failed_at: new Date().toISOString(),
    });
    writeJson(res, formatted.status, formatted.body);
  }
});

async function startServer() {
  await initializeDocumentsStore();
  await initializeJobsStore();
  await initializeQuotesStore();
  await initializeAuditStore();
  await initializeGenerationCostStore();
  await initializeImagenQueueStore();
  server.listen(port, () => {
    console.log(`[muse-studio-api] listening on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("[muse-studio-api] failed to start", error);
  process.exit(1);
});
