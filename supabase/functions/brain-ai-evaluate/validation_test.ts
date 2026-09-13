import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hasActiveStaffAccess, isStructuredBrainAIResponse, validateBrainAIRequestEnvelope } from "./validation.ts";

const request = { request: { sessionId: "s1", phase: "INVESTIGATION", metrics: { liarExposure: null, roleExposure: {}, playerActivity: [], tableMetrics: [] }, decisions: [], allowedDirectorProposals: [], allowedMissionProposals: [], constraints: {} }, prompt: "bounded" };

Deno.test("accepts bounded request", () => assertEquals(validateBrainAIRequestEnvelope(request), { valid: true }));
Deno.test("rejects ScenarioTruth, personal data, and arbitrary fields", () => {
  assertEquals(validateBrainAIRequestEnvelope({ ...request, request: { ...request.request, ScenarioTruth: {} } }).valid, false);
  assertEquals(validateBrainAIRequestEnvelope({ ...request, request: { ...request.request, email: "x" } }).valid, false);
  assertEquals(validateBrainAIRequestEnvelope({ ...request, extra: true }).valid, false);
});
Deno.test("requires an active staff result", () => {
  assertEquals(hasActiveStaffAccess(undefined), false);
  assertEquals(hasActiveStaffAccess([]), false);
  assertEquals(hasActiveStaffAccess([{ staff_member_id: "staff-1" }]), true);
});
Deno.test("accepts only the structured response envelope", () => assertEquals(isStructuredBrainAIResponse({ recommendation: "NO_INTERVENTION", rationale: { decisionTypes: [], metricSignals: [], reasonCode: "NO_ACTION" }, confidence: "LOW" }), true));
Deno.test("rejects response prose and extra fields", () => {
  assertEquals(isStructuredBrainAIResponse("not json"), false);
  assertEquals(isStructuredBrainAIResponse({ recommendation: "NO_INTERVENTION", rationale: { decisionTypes: [], metricSignals: [], reasonCode: "NO_ACTION" }, confidence: "LOW", extra: true }), false);
});
