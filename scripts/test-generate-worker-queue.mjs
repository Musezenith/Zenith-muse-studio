import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const HOST = "127.0.0.1";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makePayload() {
  return {
    schemaVersion: "2026-03-08",
    prompt: {
      brief: "worker queue integration test",
      preset: "Dior Chiaroscuro",
      rationale: "queue contract validation",
      positivePrompt: "fashion editorial portrait",
      negativePrompt: "watermark, logo",
      params: {
        cfg: 6,
        steps: 28,
        aspectRatio: "1:1",
      },
      qcChecklist: ["clean output"],
    },
    quality: { overall: 90 },
    generation: {
      provider: "mock",
      model: "imagen-mock",
      variants: 2,
      seedPolicy: "locked",
      seeds: [123, 124],
      aspectRatio: "1:1",
      cfg: 6,
      steps: 28,
    },
    createdAt: new Date().toISOString(),
  };
}

function futureDate(days = 2) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url, { method: "OPTIONS" });
      return;
    } catch (_) {
      await wait(120);
    }
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

function attachNoopOutputListeners(child) {
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
}

async function startApiServer(port, sharedEnv) {
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...sharedEnv,
      PORT: String(port),
    },
    stdio: "pipe",
  });
  attachNoopOutputListeners(child);
  await waitForServer(`http://${HOST}:${port}/api/vertex/imagen/generate`);
  return child;
}

async function startWorker(sharedEnv) {
  const child = spawn(process.execPath, ["server/imagenWorker.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...sharedEnv,
    },
    stdio: "pipe",
  });
  attachNoopOutputListeners(child);
  await wait(350);
  return child;
}

async function stopChild(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(resolve, 1000);
  });
}

async function postGenerate(port, payload) {
  const response = await fetch(`http://${HOST}:${port}/api/vertex/imagen/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  const json = await response.json();
  return { status: response.status, body: json };
}

async function getProviders(port) {
  const response = await fetch(`http://${HOST}:${port}/api/imagen/providers`);
  const json = await response.json();
  return { status: response.status, body: json };
}

async function getQueueHealth(port) {
  const response = await fetch(`http://${HOST}:${port}/api/health/queue`);
  const json = await response.json();
  return { status: response.status, body: json };
}

async function getQueueMetrics(port) {
  const response = await fetch(`http://${HOST}:${port}/api/metrics/queue`);
  const text = await response.text();
  return {
    status: response.status,
    text,
    contentType: response.headers.get("content-type") || "",
  };
}

async function getGenerationHealth(port) {
  const response = await fetch(`http://${HOST}:${port}/api/health/generation`);
  const json = await response.json();
  return { status: response.status, body: json };
}

async function getGenerationMetrics(port) {
  const response = await fetch(`http://${HOST}:${port}/api/metrics/generation`);
  const text = await response.text();
  return {
    status: response.status,
    text,
    contentType: response.headers.get("content-type") || "",
  };
}

function metricValue(metricsText, metricName) {
  const line = metricsText
    .split("\n")
    .find((entry) => entry.startsWith(`${metricName} `));
  if (!line) return null;
  return Number(line.split(" ")[1]);
}

async function createJob(port) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Queue Worker Client",
      brand: "Queue Worker Brand",
      contact_info: "worker@example.com",
      use_case: "Integration worker timeout validation",
      mood_style: "editorial",
      deliverables: "2 hero images",
      deadline: futureDate(5),
      references: "https://example.com/worker",
      notes: "worker timeout test",
      is_pilot: false,
      case_study_permission: true,
      testimonial_permission: true,
      reference_uploads: [],
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  return body.item;
}

async function setJobStatus(port, jobId, status) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, actor: "operator" }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  return body.item;
}

async function generateProofPack(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/proof-pack/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor: "operator" }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function updateProofPack(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/proof-pack`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hero_proof_summary: "Queue worker proof summary",
      snippets: {
        landing_page: "Landing snippet",
        sales_deck: "Deck snippet",
        outreach: "Outreach snippet",
        social: "Social snippet",
      },
      turnaround_proof: "Turnaround proof",
      testimonial_snippet: "Testimonial snippet",
      status: "approved",
      actor: "operator",
    }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function getProofPack(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/proof-pack`);
  const body = await response.json();
  return { status: response.status, body };
}

async function getAudit(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/audit`);
  const body = await response.json();
  return { status: response.status, body };
}

async function listFilesRecursive(rootPath) {
  try {
    const rootStats = await stat(rootPath);
    if (!rootStats.isDirectory()) return [];
  } catch (_) {
    return [];
  }
  const files = [];
  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  await walk(rootPath);
  return files;
}

function readQueueJobByRequestId(dbPathAbs, requestId) {
  const db = new DatabaseSync(dbPathAbs);
  try {
    db.exec("PRAGMA busy_timeout = 2000;");
    const row = db
      .prepare(
        `SELECT id, request_id, status, result_json, error_json, attempt_count, max_attempts,
                next_run_at, last_error_code, created_at, updated_at, started_at, completed_at
         FROM imagen_jobs
         WHERE request_id = ?
         LIMIT 1`
      )
      .get(String(requestId || ""));
    if (!row) return null;
    let result = null;
    let error = null;
    try {
      result = row.result_json ? JSON.parse(row.result_json) : null;
    } catch (_) {
      result = null;
    }
    try {
      error = row.error_json ? JSON.parse(row.error_json) : null;
    } catch (_) {
      error = null;
    }
    return {
      id: row.id,
      request_id: row.request_id,
      status: row.status,
      attempt_count: Number(row.attempt_count || 0),
      max_attempts: Number(row.max_attempts || 1),
      next_run_at: row.next_run_at || null,
      last_error_code: row.last_error_code || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      result,
      error,
    };
  } finally {
    db.close();
  }
}

async function waitForQueueJob(
  dbPathAbs,
  requestId,
  predicate,
  { timeoutMs = 10000, pollMs = 50 } = {}
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = readQueueJobByRequestId(dbPathAbs, requestId);
    if (job && predicate(job)) return job;
    await wait(pollMs);
  }
  throw new Error(`Timed out waiting for queue job request_id=${requestId}`);
}

async function waitForCondition(checkFn, { timeoutMs = 5000, pollMs = 100 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await checkFn();
    if (value) return true;
    await wait(pollMs);
  }
  return false;
}

async function waitForLatestRequestId(dbPathAbs, { timeoutMs = 3000, pollMs = 30 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const db = new DatabaseSync(dbPathAbs);
    try {
      db.exec("PRAGMA busy_timeout = 2000;");
      const row = db
        .prepare("SELECT request_id FROM imagen_jobs ORDER BY created_at DESC LIMIT 1")
        .get();
      if (row?.request_id) return row.request_id;
    } finally {
      db.close();
    }
    await wait(pollMs);
  }
  throw new Error("Failed to discover queued request_id");
}

function forceJobToStaleProcessing(
  dbPathAbs,
  requestId,
  { attemptCount = 1, maxAttempts = 1, staleAgeMs = 4000 } = {}
) {
  const db = new DatabaseSync(dbPathAbs);
  try {
    db.exec("PRAGMA busy_timeout = 2000;");
    const oldIso = new Date(Date.now() - Math.max(1000, Number(staleAgeMs || 4000))).toISOString();
    db.prepare(
      `UPDATE imagen_jobs
       SET status = 'processing',
           worker_id = 'dead-worker',
           attempt_count = ?,
           max_attempts = ?,
           next_run_at = NULL,
           last_error_code = NULL,
           started_at = ?,
           updated_at = ?,
           completed_at = NULL,
           result_json = NULL,
           error_json = NULL
       WHERE request_id = ?`
    ).run(
      Math.max(1, Number(attemptCount || 1)),
      Math.max(1, Number(maxAttempts || 1)),
      oldIso,
      oldIso,
      String(requestId || "")
    );
  } finally {
    db.close();
  }
}

async function runWithRuntime(
  {
    port,
    envOverrides = {},
    startWorkerImmediately = true,
  },
  runScenario
) {
  const runId = `${Date.now()}-${process.pid}`;
  const storageDir = `data/object-assets-worker-test-${port}-${runId}`;
  const dbPath = `data/studio-worker-test-${port}-${runId}.db`;
  const storageDirAbs = path.resolve(process.cwd(), storageDir);
  const dbPathAbs = path.resolve(process.cwd(), dbPath);
  await rm(storageDirAbs, { recursive: true, force: true });
  await rm(dbPathAbs, { force: true });

  const sharedEnv = {
    IMAGE_QUEUE: "worker",
    IMAGE_PROVIDER: "mock",
    MOCK_IMAGEN: "1",
    STORAGE_PROVIDER: "filesystem",
    STORAGE_LOCAL_DIR: storageDir,
    DOCUMENTS_DB_PATH: dbPath,
    IMAGE_QUEUE_WAIT_TIMEOUT_MS: "10000",
    ...envOverrides,
  };

  let apiChild = null;
  let workerChild = null;
  try {
    apiChild = await startApiServer(port, sharedEnv);
    if (startWorkerImmediately) {
      workerChild = await startWorker(sharedEnv);
    }
    await runScenario({
      port,
      sharedEnv,
      dbPathAbs,
      startWorker: async () => {
        if (workerChild) return workerChild;
        workerChild = await startWorker(sharedEnv);
        return workerChild;
      },
      storageDirAbs,
    });
  } finally {
    await stopChild(workerChild);
    await stopChild(apiChild);
    await rm(storageDirAbs, { recursive: true, force: true });
    await rm(dbPathAbs, { force: true });
  }
}

async function testWorkerSuccessPath() {
  const port = 8821;
  await runWithRuntime({ port }, async ({ port: activePort }) => {
    const providerRes = await getProviders(activePort);
    assert.equal(providerRes.status, 200);
    assert.equal(providerRes.body.active_provider, "mock");
    assert.equal(providerRes.body.queue_mode, "worker");

    const { status, body } = await postGenerate(activePort, makePayload());
    assert.equal(status, 200);
    assert.equal(body.provider, "mock");
    assert.equal(body.queue_mode, "worker");
    assert.equal(typeof body.queue_job_id, "string");
    assert.equal(typeof body.generation_time_ms, "number");
    assert.ok(Array.isArray(body.images));
    assert.equal(body.images.length, 2);
    const firstImage = body.images[0];
    assert.equal(typeof firstImage.url, "string");
    assert.equal(firstImage.provider, "mock");
    assert.equal(typeof firstImage.asset_key, "string");
    assert.equal(typeof firstImage.width, "number");
    assert.equal(typeof firstImage.height, "number");
    assert.ok(Object.prototype.hasOwnProperty.call(firstImage, "size_bytes"));
    assert.ok(Array.isArray(body.assets));
    assert.equal(body.assets.length, 2);
  });
}

async function testWorkerDelayedStartStillValidContract() {
  const port = 8822;
  await runWithRuntime(
    {
      port,
      startWorkerImmediately: false,
      envOverrides: {
        IMAGE_QUEUE_WAIT_TIMEOUT_MS: "12000",
      },
    },
    async ({ port: activePort, startWorker }) => {
      const providerRes = await getProviders(activePort);
      assert.equal(providerRes.status, 200);
      assert.equal(providerRes.body.queue_mode, "worker");

      const pendingRequest = postGenerate(activePort, makePayload());
      await wait(800);
      await startWorker();
      const { status, body } = await pendingRequest;

      assert.equal(status, 200);
      assert.equal(body.queue_mode, "worker");
      assert.equal(typeof body.queue_job_id, "string");
      assert.equal(body.provider, "mock");
      assert.equal(typeof body.generation_time_ms, "number");
      assert.ok(Array.isArray(body.images));
      assert.ok(body.images.length >= 1);
    }
  );
}

async function testWorkerTimeoutFailurePath() {
  const port = 8823;
  await runWithRuntime(
    {
      port,
      envOverrides: {
        MOCK_IMAGEN_DELAY_MS: "1200",
        VERTEX_TIMEOUT_MS: "50",
        IMAGE_QUEUE_WAIT_TIMEOUT_MS: "6000",
        IMAGE_QUEUE_MAX_ATTEMPTS: "1",
      },
    },
    async ({ port: activePort, storageDirAbs, dbPathAbs }) => {
      const providerRes = await getProviders(activePort);
      assert.equal(providerRes.status, 200);
      assert.equal(providerRes.body.queue_mode, "worker");

      const job = await createJob(activePort);
      await setJobStatus(activePort, job.id, "exported");

      const generated = await generateProofPack(activePort, job.id);
      assert.equal(generated.status, 200);
      const updated = await updateProofPack(activePort, job.id);
      assert.equal(updated.status, 200);

      const beforeProofPack = await getProofPack(activePort, job.id);
      assert.equal(beforeProofPack.status, 200);

      const beforeFiles = await listFilesRecursive(storageDirAbs);
      const payload = {
        ...makePayload(),
        job_id: job.id,
      };
      const failed = await postGenerate(activePort, payload);
      assert.equal(failed.status, 504);
      assert.equal(typeof failed.body.requestId, "string");
      assert.equal(failed.body?.error?.code, "TIMEOUT");
      assert.equal(typeof failed.body?.error?.message, "string");
      const queueJob = readQueueJobByRequestId(dbPathAbs, failed.body.requestId);
      assert.ok(queueJob);
      assert.equal(queueJob.status, "failed");
      assert.equal(queueJob.attempt_count, 1);
      assert.equal(queueJob.max_attempts, 1);
      assert.equal(queueJob?.error?.code, "TIMEOUT");

      const afterFiles = await listFilesRecursive(storageDirAbs);
      assert.equal(afterFiles.length, beforeFiles.length);

      const afterProofPack = await getProofPack(activePort, job.id);
      assert.equal(afterProofPack.status, 200);
      assert.deepEqual(afterProofPack.body.item, beforeProofPack.body.item);

      const audit = await getAudit(activePort, job.id);
      assert.equal(audit.status, 200);
      const actionTypes = (audit.body.items || []).map((entry) => entry.action_type);
      assert.ok(actionTypes.includes("proof_pack_generated"));
      assert.ok(actionTypes.includes("proof_pack_updated"));
    }
  );
}

async function testAutoRetryThenSuccessPath() {
  const port = 8824;
  await runWithRuntime(
    {
      port,
      envOverrides: {
        IMAGE_QUEUE_MAX_ATTEMPTS: "3",
        IMAGE_QUEUE_RETRY_BASE_MS: "300",
        IMAGE_QUEUE_WAIT_TIMEOUT_MS: "9000",
        MOCK_IMAGEN_FAIL_FIRST_ATTEMPTS: "1",
      },
    },
    async ({ port: activePort, dbPathAbs, storageDirAbs }) => {
      const providerRes = await getProviders(activePort);
      assert.equal(providerRes.status, 200);
      assert.equal(providerRes.body.queue_mode, "worker");

      const beforeFiles = await listFilesRecursive(storageDirAbs);
      const result = await postGenerate(activePort, makePayload());
      assert.equal(result.status, 200);
      assert.equal(result.body.queue_mode, "worker");
      assert.equal(typeof result.body.queue_job_id, "string");
      assert.equal(result.body.provider, "mock");
      assert.equal(typeof result.body.generation_time_ms, "number");
      assert.ok(Array.isArray(result.body.images));
      assert.equal(result.body.images.length, 2);

      const job = readQueueJobByRequestId(dbPathAbs, result.body.requestId);
      assert.ok(job);
      assert.equal(job.status, "succeeded");
      assert.equal(job.attempt_count, 2);
      assert.equal(job.max_attempts, 3);

      const afterFiles = await listFilesRecursive(storageDirAbs);
      assert.equal(afterFiles.length, beforeFiles.length + 2);
    }
  );
}

async function testRetryExhaustedThenFailPath() {
  const port = 8825;
  await runWithRuntime(
    {
      port,
      envOverrides: {
        IMAGE_QUEUE_MAX_ATTEMPTS: "2",
        IMAGE_QUEUE_RETRY_BASE_MS: "250",
        IMAGE_QUEUE_WAIT_TIMEOUT_MS: "9000",
        MOCK_IMAGEN_ALWAYS_FAIL: "1",
      },
    },
    async ({ port: activePort, storageDirAbs, dbPathAbs }) => {
      const providerRes = await getProviders(activePort);
      assert.equal(providerRes.status, 200);
      assert.equal(providerRes.body.queue_mode, "worker");

      const beforeFiles = await listFilesRecursive(storageDirAbs);
      const failed = await postGenerate(activePort, makePayload());
      assert.equal(failed.status, 504);
      assert.equal(typeof failed.body.requestId, "string");
      assert.equal(failed.body?.error?.code, "TIMEOUT");

      const job = readQueueJobByRequestId(dbPathAbs, failed.body.requestId);
      assert.ok(job);
      assert.equal(job.status, "failed");
      assert.equal(job.attempt_count, 2);
      assert.equal(job.max_attempts, 2);
      assert.equal(job.last_error_code, "TIMEOUT");
      assert.equal(job.next_run_at, null);

      const afterFiles = await listFilesRecursive(storageDirAbs);
      assert.equal(afterFiles.length, beforeFiles.length);
    }
  );
}

async function testRetryBackoffSchedulingMetadata() {
  const port = 8826;
  await runWithRuntime(
    {
      port,
      envOverrides: {
        IMAGE_QUEUE_MAX_ATTEMPTS: "3",
        IMAGE_QUEUE_RETRY_BASE_MS: "900",
        IMAGE_QUEUE_WAIT_TIMEOUT_MS: "12000",
        IMAGEN_WORKER_POLL_MS: "50",
        MOCK_IMAGEN_ALWAYS_FAIL: "1",
      },
    },
    async ({ port: activePort, dbPathAbs }) => {
      const resultPromise = postGenerate(activePort, makePayload());
      const requestId = await waitForLatestRequestId(dbPathAbs);

      const firstBackoffJob = await waitForQueueJob(
        dbPathAbs,
        requestId,
        (job) => job.status === "queued" && job.attempt_count === 1 && Boolean(job.next_run_at),
        { timeoutMs: 6000, pollMs: 25 }
      );
      const secondBackoffJob = await waitForQueueJob(
        dbPathAbs,
        requestId,
        (job) => job.status === "queued" && job.attempt_count === 2 && Boolean(job.next_run_at),
        { timeoutMs: 9000, pollMs: 25 }
      );

      const firstDelayMs =
        Date.parse(firstBackoffJob.next_run_at) - Date.parse(firstBackoffJob.updated_at || firstBackoffJob.created_at);
      const secondDelayMs =
        Date.parse(secondBackoffJob.next_run_at) - Date.parse(secondBackoffJob.updated_at || secondBackoffJob.created_at);
      assert.ok(firstDelayMs >= 700);
      assert.ok(secondDelayMs >= firstDelayMs);

      const finalResponse = await resultPromise;
      assert.equal(finalResponse.status, 504);
      assert.equal(finalResponse.body?.error?.code, "TIMEOUT");
      const finalJob = readQueueJobByRequestId(dbPathAbs, requestId);
      assert.ok(finalJob);
      assert.equal(finalJob.status, "failed");
      assert.equal(finalJob.attempt_count, 3);
      assert.equal(finalJob.max_attempts, 3);
    }
  );
}

async function testStaleProcessingRecoveryRequeuesWhenBudgetRemains() {
  const port = 8827;
  await runWithRuntime(
    {
      port,
      startWorkerImmediately: false,
      envOverrides: {
        IMAGE_QUEUE_MAX_ATTEMPTS: "3",
        IMAGE_QUEUE_RETRY_BASE_MS: "200",
        IMAGE_QUEUE_WAIT_TIMEOUT_MS: "10000",
        IMAGE_QUEUE_SWEEPER_ENABLED: "1",
        IMAGE_QUEUE_SWEEP_INTERVAL_MS: "50",
        IMAGE_QUEUE_STALE_MS: "120",
      },
    },
    async ({ port: activePort, dbPathAbs, storageDirAbs, startWorker }) => {
      const beforeFiles = await listFilesRecursive(storageDirAbs);
      const pendingRequest = postGenerate(activePort, makePayload());
      const requestId = await waitForLatestRequestId(dbPathAbs);
      forceJobToStaleProcessing(dbPathAbs, requestId, {
        attemptCount: 1,
        maxAttempts: 3,
      });

      await startWorker();
      await waitForQueueJob(
        dbPathAbs,
        requestId,
        (job) => job.status === "queued" && job.last_error_code === "STALE_PROCESSING_RECOVERED",
        { timeoutMs: 5000, pollMs: 25 }
      );

      const response = await pendingRequest;
      assert.equal(response.status, 200);
      assert.equal(response.body.queue_mode, "worker");
      assert.equal(typeof response.body.queue_job_id, "string");
      assert.equal(response.body.provider, "mock");
      assert.ok(Array.isArray(response.body.images));
      assert.equal(response.body.images.length, 2);

      const finalJob = readQueueJobByRequestId(dbPathAbs, requestId);
      assert.ok(finalJob);
      assert.equal(finalJob.status, "succeeded");
      assert.equal(finalJob.attempt_count, 2);
      assert.equal(finalJob.max_attempts, 3);

      const afterFiles = await listFilesRecursive(storageDirAbs);
      assert.equal(afterFiles.length, beforeFiles.length + 2);
      for (const image of response.body.images) {
        const assetRes = await fetch(`http://${HOST}:${activePort}${image.url}`);
        assert.equal(assetRes.status, 200);
      }
    }
  );
}

async function testStaleProcessingRecoveryFailsWhenBudgetExhausted() {
  const port = 8828;
  await runWithRuntime(
    {
      port,
      startWorkerImmediately: false,
      envOverrides: {
        IMAGE_QUEUE_MAX_ATTEMPTS: "1",
        IMAGE_QUEUE_RETRY_BASE_MS: "200",
        IMAGE_QUEUE_WAIT_TIMEOUT_MS: "9000",
        IMAGE_QUEUE_SWEEPER_ENABLED: "1",
        IMAGE_QUEUE_SWEEP_INTERVAL_MS: "50",
        IMAGE_QUEUE_STALE_MS: "120",
      },
    },
    async ({ port: activePort, dbPathAbs, storageDirAbs, startWorker }) => {
      const proofJob = await createJob(activePort);
      await setJobStatus(activePort, proofJob.id, "exported");
      const generated = await generateProofPack(activePort, proofJob.id);
      assert.equal(generated.status, 200);
      const updated = await updateProofPack(activePort, proofJob.id);
      assert.equal(updated.status, 200);
      const beforePack = await getProofPack(activePort, proofJob.id);
      assert.equal(beforePack.status, 200);
      const beforeAudit = await getAudit(activePort, proofJob.id);
      assert.equal(beforeAudit.status, 200);
      const beforeProofGeneratedCount = (beforeAudit.body.items || []).filter(
        (item) => item.action_type === "proof_pack_generated"
      ).length;
      const beforeProofUpdatedCount = (beforeAudit.body.items || []).filter(
        (item) => item.action_type === "proof_pack_updated"
      ).length;

      const beforeFiles = await listFilesRecursive(storageDirAbs);
      const pendingRequest = postGenerate(activePort, {
        ...makePayload(),
        job_id: proofJob.id,
      });
      const requestId = await waitForLatestRequestId(dbPathAbs);
      forceJobToStaleProcessing(dbPathAbs, requestId, {
        attemptCount: 1,
        maxAttempts: 1,
      });

      await startWorker();
      const response = await pendingRequest;
      assert.equal(response.status, 500);
      assert.equal(response.body?.error?.code, "UPSTREAM_ERROR");
      assert.equal(typeof response.body?.requestId, "string");

      const finalJob = readQueueJobByRequestId(dbPathAbs, requestId);
      assert.ok(finalJob);
      assert.equal(finalJob.status, "failed");
      assert.equal(finalJob.attempt_count, 1);
      assert.equal(finalJob.max_attempts, 1);
      assert.equal(finalJob.last_error_code, "STALE_PROCESSING_EXHAUSTED");
      assert.equal(finalJob.next_run_at, null);

      const afterFiles = await listFilesRecursive(storageDirAbs);
      assert.equal(afterFiles.length, beforeFiles.length);

      const afterPack = await getProofPack(activePort, proofJob.id);
      assert.equal(afterPack.status, 200);
      assert.deepEqual(afterPack.body.item, beforePack.body.item);

      const afterAudit = await getAudit(activePort, proofJob.id);
      assert.equal(afterAudit.status, 200);
      const afterProofGeneratedCount = (afterAudit.body.items || []).filter(
        (item) => item.action_type === "proof_pack_generated"
      ).length;
      const afterProofUpdatedCount = (afterAudit.body.items || []).filter(
        (item) => item.action_type === "proof_pack_updated"
      ).length;
      assert.equal(afterProofGeneratedCount, beforeProofGeneratedCount);
      assert.equal(afterProofUpdatedCount, beforeProofUpdatedCount);
    }
  );
}

async function testQueueHealthDiagnosticsEndpoint() {
  const port = 8829;
  await runWithRuntime(
    {
      port,
      startWorkerImmediately: false,
      envOverrides: {
        IMAGE_QUEUE_MAX_ATTEMPTS: "4",
        IMAGE_QUEUE_RETRY_BASE_MS: "321",
        IMAGE_QUEUE_RETRY_MAX_MS: "4321",
        IMAGE_QUEUE_SWEEPER_ENABLED: "1",
        IMAGE_QUEUE_SWEEP_INTERVAL_MS: "777",
        IMAGE_QUEUE_STALE_MS: "1200",
        IMAGE_QUEUE_WORKER_HEARTBEAT_TTL_MS: "5000",
        IMAGE_QUEUE_WAIT_TIMEOUT_MS: "10000",
      },
    },
    async ({ port: activePort, dbPathAbs, startWorker }) => {
      const initial = await getQueueHealth(activePort);
      assert.equal(initial.status, 200);
      assert.equal(initial.body.queue_mode, "worker");
      assert.equal(initial.body.config.stale_ms, 1200);
      assert.equal(initial.body.config.sweep_interval_ms, 777);
      assert.equal(initial.body.config.retry_max_attempts, 4);
      assert.equal(initial.body.config.retry_backoff_base_ms, 321);
      assert.equal(initial.body.config.retry_backoff_max_ms, 4321);
      assert.equal(initial.body.worker.sweeper_enabled, true);
      assert.equal(initial.body.status, "down");
      assert.ok(Array.isArray(initial.body.status_reasons));
      assert.ok(initial.body.status_reasons.includes("WORKER_NOT_RUNNING"));
      assert.equal(typeof initial.body.summary, "object");
      assert.equal(typeof initial.body.timing, "object");
      assert.equal(typeof initial.body.thresholds, "object");
      assert.equal(typeof initial.body.summary.has_backlog, "boolean");
      assert.equal(typeof initial.body.summary.has_failures, "boolean");
      assert.equal(typeof initial.body.summary.has_retries, "boolean");
      assert.equal(typeof initial.body.summary.has_stale_work, "boolean");
      assert.equal(typeof initial.body.summary.is_worker_live, "boolean");
      assert.equal(initial.body.summary.is_worker_live, false);
      assert.equal(typeof initial.body.thresholds.backlog_warn_count, "number");
      assert.equal(typeof initial.body.thresholds.backlog_critical_count, "number");
      assert.equal(typeof initial.body.thresholds.activity_stale_ms, "number");
      assert.equal(typeof initial.body.thresholds.sweep_stale_ms, "number");
      assert.equal(initial.body.timing.worker_heartbeat_age_ms, null);
      assert.equal(initial.body.timing.last_activity_age_ms, null);
      assert.equal(initial.body.timing.last_sweep_age_ms, null);
      assert.equal(typeof initial.body.latency, "object");
      assert.equal(initial.body.latency.sample_count, 0);
      assert.equal(initial.body.latency.queue_wait_avg_ms, null);
      assert.equal(initial.body.latency.processing_avg_ms, null);
      assert.equal(initial.body.latency.end_to_end_avg_ms, null);
      assert.equal(initial.body.latency.last_queue_wait_ms, null);
      assert.equal(initial.body.latency.last_processing_ms, null);
      assert.equal(initial.body.latency.last_end_to_end_ms, null);
      assert.equal(typeof initial.body.policy, "object");
      assert.equal(initial.body.policy.alert_state, "ok");
      assert.ok(Array.isArray(initial.body.policy.alert_reasons));
      assert.equal(typeof initial.body.policy.thresholds, "object");
      assert.equal(typeof initial.body.policy.thresholds.queue_wait_warn_ms, "number");
      assert.equal(typeof initial.body.policy.thresholds.queue_wait_critical_ms, "number");
      assert.equal(typeof initial.body.policy.thresholds.processing_warn_ms, "number");
      assert.equal(typeof initial.body.policy.thresholds.processing_critical_ms, "number");
      assert.equal(typeof initial.body.policy.thresholds.end_to_end_warn_ms, "number");
      assert.equal(typeof initial.body.policy.thresholds.end_to_end_critical_ms, "number");
      assert.equal(typeof initial.body.policy.thresholds.backlog_warn_count, "number");
      assert.equal(typeof initial.body.policy.thresholds.backlog_critical_count, "number");
      const initialMetrics = await getQueueMetrics(activePort);
      assert.equal(initialMetrics.status, 200);
      assert.ok(initialMetrics.contentType.includes("text/plain"));
      assert.ok(initialMetrics.text.includes("# HELP imagen_queue_queued"));
      assert.equal(metricValue(initialMetrics.text, "imagen_worker_running"), 0);
      assert.equal(metricValue(initialMetrics.text, "imagen_worker_heartbeat_age_ms"), -1);
      assert.equal(metricValue(initialMetrics.text, "imagen_queue_status"), 3);
      assert.equal(metricValue(initialMetrics.text, "imagen_queue_alert_state"), 0);
      assert.equal(metricValue(initialMetrics.text, "imagen_queue_queue_wait_avg_ms"), -1);
      assert.equal(metricValue(initialMetrics.text, "imagen_queue_processing_avg_ms"), -1);
      assert.equal(metricValue(initialMetrics.text, "imagen_queue_end_to_end_avg_ms"), -1);
      const initialGenHealth = await getGenerationHealth(activePort);
      assert.equal(initialGenHealth.status, 200);
      assert.equal(initialGenHealth.body.queue_mode, "worker");
      assert.equal(initialGenHealth.body.counts.total, 0);
      assert.equal(initialGenHealth.body.durations.end_to_end_avg_ms, null);
      const initialGenMetrics = await getGenerationMetrics(activePort);
      assert.equal(initialGenMetrics.status, 200);
      assert.ok(initialGenMetrics.contentType.includes("text/plain"));
      assert.equal(metricValue(initialGenMetrics.text, "imagen_generation_total"), 0);
      assert.equal(metricValue(initialGenMetrics.text, "imagen_generation_end_to_end_avg_ms"), -1);

      const pending = postGenerate(activePort, makePayload());
      const requestId = await waitForLatestRequestId(dbPathAbs);
      const queued = await getQueueHealth(activePort);
      assert.equal(queued.status, 200);
      assert.ok(Number(queued.body.counts.queued || 0) >= 1);
      assert.ok(Number(queued.body.counts.retry_eligible_queued || 0) >= 1);

      forceJobToStaleProcessing(dbPathAbs, requestId, {
        attemptCount: 1,
        maxAttempts: 4,
      });
      const stale = await getQueueHealth(activePort);
      assert.equal(stale.status, 200);
      assert.ok(Number(stale.body.counts.stale_processing || 0) >= 1);
      assert.equal(stale.body.status, "down");
      assert.equal(stale.body.summary.has_stale_work, true);
      assert.equal(stale.body.policy.alert_state, "critical");

      await startWorker();
      const response = await pending;
      assert.equal(response.status, 200);
      const job = readQueueJobByRequestId(dbPathAbs, requestId);
      assert.ok(job);
      assert.equal(job.status, "succeeded");

      await wait(250);
      const healthy = await getQueueHealth(activePort);
      assert.equal(healthy.status, 200);
      assert.equal(healthy.body.worker.observable, true);
      assert.equal(healthy.body.worker.running, true);
      assert.equal(typeof healthy.body.worker.last_seen_at, "string");
      assert.equal(typeof healthy.body.worker.last_sweep_at, "string");
      assert.equal(healthy.body.status, "healthy");
      assert.deepEqual(healthy.body.status_reasons, []);
      assert.equal(healthy.body.summary.is_worker_live, true);
      assert.equal(typeof healthy.body.timing.worker_heartbeat_age_ms, "number");
      assert.equal(typeof healthy.body.timing.last_activity_age_ms, "number");
      assert.equal(typeof healthy.body.timing.last_sweep_age_ms, "number");
      assert.ok(Number(healthy.body.latency.sample_count || 0) >= 1);
      assert.equal(typeof healthy.body.latency.queue_wait_avg_ms, "number");
      assert.equal(typeof healthy.body.latency.processing_avg_ms, "number");
      assert.equal(typeof healthy.body.latency.end_to_end_avg_ms, "number");
      const liveMetrics = await getQueueMetrics(activePort);
      assert.equal(liveMetrics.status, 200);
      assert.ok(liveMetrics.contentType.includes("text/plain"));
      assert.equal(metricValue(liveMetrics.text, "imagen_worker_running"), 1);
      assert.equal(metricValue(liveMetrics.text, "imagen_queue_status"), 0);
      assert.equal(metricValue(liveMetrics.text, "imagen_queue_alert_state"), 0);
      assert.ok(metricValue(liveMetrics.text, "imagen_queue_latency_samples") >= 1);
      assert.ok(metricValue(liveMetrics.text, "imagen_queue_queue_wait_avg_ms") >= 0);
      assert.ok(metricValue(liveMetrics.text, "imagen_queue_processing_avg_ms") >= 0);
      assert.ok(metricValue(liveMetrics.text, "imagen_queue_end_to_end_avg_ms") >= 0);
      const liveGenHealth = await getGenerationHealth(activePort);
      assert.equal(liveGenHealth.status, 200);
      assert.ok(liveGenHealth.body.counts.total >= 1);
      assert.equal(typeof liveGenHealth.body.durations, "object");
      const liveGenMetrics = await getGenerationMetrics(activePort);
      assert.equal(liveGenMetrics.status, 200);
      assert.ok(liveGenMetrics.contentType.includes("text/plain"));
      assert.ok(metricValue(liveGenMetrics.text, "imagen_generation_total") >= 1);
      assert.notEqual(
        metricValue(liveGenMetrics.text, "imagen_generation_provider_execution_avg_ms"),
        null
      );
      assert.notEqual(
        metricValue(liveGenMetrics.text, "imagen_generation_end_to_end_avg_ms"),
        null
      );
    }
  );
}

async function run() {
  await testWorkerSuccessPath();
  await testWorkerDelayedStartStillValidContract();
  await testWorkerTimeoutFailurePath();
  await testAutoRetryThenSuccessPath();
  await testRetryExhaustedThenFailPath();
  await testRetryBackoffSchedulingMetadata();
  await testStaleProcessingRecoveryRequeuesWhenBudgetRemains();
  await testStaleProcessingRecoveryFailsWhenBudgetExhausted();
  await testQueueHealthDiagnosticsEndpoint();
  console.log("Worker queue integration tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
