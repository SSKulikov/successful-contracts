import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthPage } from "./AuthPage";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

describe("AuthPage", () => {
  it("shows validation errors for empty submit", async () => {
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Введите email")).toBeInTheDocument();
    expect(await screen.findByText("Введите пароль")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
