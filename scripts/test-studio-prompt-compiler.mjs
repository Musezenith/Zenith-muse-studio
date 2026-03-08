import assert from "node:assert/strict";
import { compileStudioPrompt } from "../server/studioPromptCompiler.mjs";

function assertPromptOrder(text) {
  const markers = [
    "subject and identity:",
    "wardrobe and styling:",
    "pose and framing:",
    "lighting recipe:",
    "environment:",
    "camera look:",
    "color grade and texture:",
  ];
  let lastIndex = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    assert.ok(index >= 0, `missing marker ${marker}`);
    assert.ok(index > lastIndex, `marker out of order ${marker}`);
    lastIndex = index;
  }
}

function makePayload(overrides = {}) {
  return {
    preset: "dior_chiaroscuro",
    subject: "female East African model, high cheekbone structure, direct gaze",
    wardrobe: "black silk corset gown with structured shoulders and matte leather gloves",
    pose: "standing contrapposto with left shoulder forward",
    framing: "mid-shot portrait, negative space on right third",
    environment: "dark studio cyclorama with subtle haze",
    mood: "dramatic editorial authority, refined luxury",
    restrictions: "no logo; no watermark; no text",
    identity_lock: false,
    ...overrides,
  };
}

function testBasicCompilation() {
  const result = compileStudioPrompt(makePayload());
  assert.equal(typeof result.positive_prompt, "string");
  assert.equal(typeof result.negative_prompt, "string");
  assert.equal(typeof result.params, "object");
  assert.ok(Array.isArray(result.qc_tags));
  assertPromptOrder(result.positive_prompt);
  assert.ok(result.positive_prompt.includes("preserve pores"));
  assert.ok(result.positive_prompt.includes("preserve micro skin texture"));
  assert.ok(result.positive_prompt.includes("avoid plastic skin"));
  assert.ok(result.positive_prompt.includes("real fabric physics"));
}

function testIdentityLockBehavior() {
  const unlocked = compileStudioPrompt(
    makePayload({
      preset: "balenciaga_raw_flash",
      mood: "aggressive raw flash editorial energy",
      identity_lock: false,
    })
  );
  const locked = compileStudioPrompt(
    makePayload({
      preset: "balenciaga_raw_flash",
      mood: "aggressive raw flash editorial energy",
      identity_lock: true,
    })
  );
  assert.ok(locked.params.identity_strength > unlocked.params.identity_strength);
  assert.ok(locked.positive_prompt.includes("identity-preserved face"));
  assert.ok(locked.positive_prompt.includes("controlled flash"));
  assert.ok(!locked.positive_prompt.includes("raw flash editorial"));
}

function testRestrictionsArray() {
  const result = compileStudioPrompt(
    makePayload({
      restrictions: ["No jewelry", "no tattoos", "no text"],
    })
  );
  assert.ok(result.negative_prompt.toLowerCase().includes("no jewelry"));
  assert.ok(result.negative_prompt.toLowerCase().includes("no tattoos"));
}

function testPresetVariants() {
  const payloads = [
    makePayload({ preset: "vogue_cover", mood: "commanding cover energy" }),
    makePayload({ preset: "prada_intellectual", mood: "quiet intellectual tension" }),
    makePayload({ preset: "kpop_glow", mood: "youthful luminous confidence" }),
    makePayload({ preset: "minimal", mood: "clean restrained elegance" }),
    makePayload({ preset: "avant_garde", mood: "experimental art-house drama" }),
  ];
  for (const payload of payloads) {
    const result = compileStudioPrompt(payload);
    assertPromptOrder(result.positive_prompt);
    assert.equal(typeof result.params.steps, "number");
    assert.equal(typeof result.params.cfg, "number");
    assert.equal(typeof result.params.aspect_ratio, "string");
    assert.equal(typeof result.params.seed_policy, "string");
  }
}

function testInvalidPayloads() {
  assert.throws(() => compileStudioPrompt(null), /input must be an object/);
  assert.throws(() => compileStudioPrompt(makePayload({ preset: "unknown" })), /unknown preset/);
  assert.throws(() => compileStudioPrompt(makePayload({ subject: "" })), /subject is required/);
}

function run() {
  testBasicCompilation();
  testIdentityLockBehavior();
  testRestrictionsArray();
  testPresetVariants();
  testInvalidPayloads();
  console.log("Studio prompt compiler tests passed");
}

run();
