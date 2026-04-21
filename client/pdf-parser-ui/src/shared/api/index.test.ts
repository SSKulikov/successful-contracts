import { beforeEach, describe, expect, it, vi } from "vitest";

const { httpMock } = vi.hoisted(() => ({
  httpMock: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  }
}));

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => httpMock)
  }
}));

import { approvalsApi, documentsApi } from "./index";

describe("documentsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps listMyDocuments response to ui rows", async () => {
    httpMock.get.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "DOC-7",
            type: "Договор",
            title: "Тестовый договор",
            status: "in_approval",
            initiator: "Иван",
            amount: "1000",
            createdAt: "2026-04-01T12:00:00.000Z"
          }
        ]
      }
    });

    const rows = await documentsApi.listMyDocuments({ q: "DOC", status: "На согласовании" });

    expect(httpMock.get).toHaveBeenCalledWith("/documents/my", {
      params: { q: "DOC", status: "in_approval" }
    });
    expect(rows[0]).toMatchObject({
      id: "DOC-7",
      status: "На согласовании",
      initiator: "Иван"
    });
  });
});

describe("approvalsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns normalized approvals list with meta", async () => {
    httpMock.get.mockResolvedValueOnce({
      data: {
        items: [{ id: "APR-1", title: "Согласование", waitingDays: "2" }],
        meta: { page: 2, pageSize: 10, total: 17 }
      }
    });

    const response = await approvalsApi.listMyApprovals({ q: "APR", page: 2, pageSize: 10 });

    expect(httpMock.get).toHaveBeenCalledWith("/approvals/my", {
      params: { q: "APR", page: 2, page_size: 10 }
    });
    expect(response.items[0]).toMatchObject({
      id: "APR-1",
      key: "APR-1",
      waitingDays: 2
    });
    expect(response.meta).toEqual({ page: 2, pageSize: 10, total: 17 });
  });
});
