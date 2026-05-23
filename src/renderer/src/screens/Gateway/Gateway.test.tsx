import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Gateway from "./Gateway";
import { renderWithProviders } from "../../test/renderWithProviders";

type MockHermesAPI = Partial<NonNullable<typeof window.hermesAPI>>;

function installApi(overrides: MockHermesAPI = {}): void {
  window.hermesAPI = {
    getLocale: vi.fn().mockResolvedValue("en"),
    setLocale: vi.fn().mockResolvedValue("en"),
    getEnv: vi.fn().mockResolvedValue({ TELEGRAM_BOT_TOKEN: "" }),
    setEnv: vi.fn().mockResolvedValue(true),
    gatewayStatus: vi.fn().mockResolvedValue(false),
    startGateway: vi.fn().mockResolvedValue(true),
    stopGateway: vi.fn().mockResolvedValue(true),
    getPlatformEnabled: vi.fn().mockResolvedValue({ telegram: false }),
    setPlatformEnabled: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as NonNullable<typeof window.hermesAPI>;
}

describe("Gateway screen", () => {
  beforeEach(() => {
    localStorage.clear();
    installApi();
  });

  it("loads and starts gateway for the active profile", async () => {
    const gatewayStatus = vi.fn().mockResolvedValue(false);
    const startGateway = vi.fn().mockResolvedValue(true);
    installApi({ gatewayStatus, startGateway });

    renderWithProviders(<Gateway profile="agentme" />);

    await waitFor(() => {
      expect(gatewayStatus).toHaveBeenCalledWith("agentme");
    });

    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));

    await waitFor(() => {
      expect(startGateway).toHaveBeenCalledWith("agentme");
    });
  });

  it("stops gateway for the active profile", async () => {
    const stopGateway = vi.fn().mockResolvedValue(true);
    installApi({
      gatewayStatus: vi.fn().mockResolvedValue(true),
      stopGateway,
    });

    renderWithProviders(<Gateway profile="agentme" />);

    await screen.findByText("Running");
    fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));

    await waitFor(() => {
      expect(stopGateway).toHaveBeenCalledWith("agentme");
    });
  });

  it("saves platform toggles and env fields for the active profile", async () => {
    const setPlatformEnabled = vi.fn().mockResolvedValue(true);
    const setEnv = vi.fn().mockResolvedValue(true);
    installApi({
      getPlatformEnabled: vi.fn().mockResolvedValue({ telegram: true }),
      setPlatformEnabled,
      setEnv,
    });

    renderWithProviders(<Gateway profile="agentme" />);

    const tokenInput = await screen.findByPlaceholderText("Telegram Bot Token");
    fireEvent.change(tokenInput, { target: { value: "token-value" } });
    fireEvent.blur(tokenInput);

    await waitFor(() => {
      expect(setEnv).toHaveBeenCalledWith(
        "TELEGRAM_BOT_TOKEN",
        "token-value",
        "agentme",
      );
    });

    const toggle = screen.getAllByRole("checkbox")[0];
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(setPlatformEnabled).toHaveBeenCalledWith(
        "telegram",
        false,
        "agentme",
      );
    });
  });
});
