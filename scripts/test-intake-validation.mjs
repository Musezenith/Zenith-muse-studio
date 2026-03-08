import assert from "node:assert/strict";
import { validateIntakeForm } from "../src/lib/intakeValidation.js";

function futureDate(days = 1) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function run() {
  const valid = validateIntakeForm(
    {
      client_name: "Client",
      brand: "Brand",
      contact_info: "contact@example.com",
      use_case: "Use case",
      mood_style: "Style",
      deliverables: "Deliverables",
      deadline: futureDate(2),
      references: "",
      notes: "",
    },
    []
  );
  assert.equal(valid.ok, true);

  const invalid = validateIntakeForm(
    {
      client_name: "",
      brand: "",
      contact_info: "",
      use_case: "",
      deliverables: "",
      deadline: "1999-01-01",
    },
    new Array(13).fill({})
  );
  assert.equal(invalid.ok, false);
  assert.equal(typeof invalid.errors.client_name, "string");
  assert.equal(typeof invalid.errors.deadline, "string");
  assert.equal(typeof invalid.errors.reference_uploads, "string");
}

run();
console.log("Intake validation tests passed");
