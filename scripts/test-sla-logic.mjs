import assert from "node:assert/strict";
import { deriveSlaState } from "../server/slaTracking.mjs";

function isoFromNow(hoursOffset) {
  return new Date(Date.now() + hoursOffset * 60 * 60 * 1000).toISOString();
}

function run() {
  const now = new Date();

  const onTime = deriveSlaState(
    {
      created_at: isoFromNow(-5),
      first_output_at: isoFromNow(-3),
      feedback_received_at: isoFromNow(-4),
      final_delivered_at: isoFromNow(-1),
    },
    now
  ).summary;
  assert.equal(onTime.status, "on-time");

  const atRisk = deriveSlaState(
    {
      created_at: isoFromNow(-20),
      first_output_at: null,
    },
    now
  ).summary;
  assert.equal(atRisk.status, "at-risk");

  const overdue = deriveSlaState(
    {
      created_at: isoFromNow(-30),
      first_output_at: null,
    },
    now
  ).summary;
  assert.equal(overdue.status, "overdue");

  const missing = deriveSlaState(
    {
      created_at: null,
      first_output_at: null,
      feedback_received_at: null,
      final_delivered_at: null,
    },
    now
  ).summary;
  assert.equal(missing.status, "unknown");
  assert.equal(missing.brief_to_first_output.hours, null);
  assert.equal(missing.feedback_to_final_delivery.status, "unknown");
}

run();
console.log("SLA logic tests passed");
