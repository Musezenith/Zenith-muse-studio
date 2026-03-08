import http from "node:http";
import { randomUUID } from "node:crypto";
import { generateViaVertexImagen, getTimeoutMs } from "./imagenService.mjs";
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
import { AUDIT_ACTIONS, appendAuditLog, initializeAuditStore, listAuditLogsForEntity } from "./auditStore.mjs";
import {
  createGenerationCostRun,
  initializeGenerationCostStore,
} from "./generationCostStore.mjs";

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
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = await readJsonBody(req);
    const payload = body?.payload;
    const result = await generateViaVertexImagen({
      payload,
      requestId,
      signal: controller.signal,
    });

    const jobId = typeof payload?.job_id === "string" ? payload.job_id.trim() : "";
    if (jobId) {
      try {
        appendAuditLog({
          entity_type: "job",
          entity_id: jobId,
          action_type:
            Number(payload?.generation?.rerun_count || 0) > 0
              ? AUDIT_ACTIONS.RERUN_TRIGGERED
              : AUDIT_ACTIONS.PROMPT_GENERATED,
          actor: "system",
          metadata: {
            model: payload?.generation?.model || result?.model || "imagen-3.0-generate-002",
            variants: Number(payload?.generation?.variants || 1),
          },
        });
        const costRun = createGenerationCostRun({
          job_id: jobId,
          provider: result?.meta?.provider || "vertex-imagen",
          model: result?.model || payload?.generation?.model || "imagen-3.0-generate-002",
          number_of_outputs: Array.isArray(result?.assets)
            ? result.assets.length
            : Array.isArray(result?.images)
            ? result.images.length
            : Number(payload?.generation?.variants || 1),
          rerun_count: Number(payload?.generation?.rerun_count || 0),
        });
        updateJobSlaMilestones(jobId, {
          first_output_at: costRun?.created_at || new Date().toISOString(),
          actor: "system",
          audit_action_type: AUDIT_ACTIONS.FIRST_OUTPUT_CREATED,
        });
      } catch (_) {
        // cost tracking should not block generation response
      }
    }

    writeJson(res, 200, {
      ...result,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      error.status = 504;
      error.message = `Imagen request timed out after ${timeoutMs}ms`;
    }
    const formatted = toErrorResponse(error, requestId);
    writeJson(res, formatted.status, formatted.body);
  } finally {
    clearTimeout(timeoutId);
  }
});

async function startServer() {
  await initializeDocumentsStore();
  await initializeJobsStore();
  await initializeQuotesStore();
  await initializeAuditStore();
  await initializeGenerationCostStore();
  server.listen(port, () => {
    console.log(`[muse-studio-api] listening on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("[muse-studio-api] failed to start", error);
  process.exit(1);
});
