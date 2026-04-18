import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseApproverEmployeeIds } from "./parse-approver-employee-ids";

describe("parseApproverEmployeeIds", () => {
  it("returns empty for non-array", () => {
    assert.deepEqual(parseApproverEmployeeIds(undefined), []);
    assert.deepEqual(parseApproverEmployeeIds(null), []);
    assert.deepEqual(parseApproverEmployeeIds({}), []);
  });

  it("filters to positive integers", () => {
    assert.deepEqual(parseApproverEmployeeIds([1, 2, 3]), [1, 2, 3]);
    assert.deepEqual(parseApproverEmployeeIds(["4", 5]), [4, 5]);
    assert.deepEqual(parseApproverEmployeeIds([0, -1, 1.2, 6]), [6]);
    assert.deepEqual(parseApproverEmployeeIds([10, NaN, "x", 11]), [10, 11]);
  });
});
