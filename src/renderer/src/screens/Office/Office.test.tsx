import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Office from "./Office";
import { renderWithProviders } from "../../test/renderWithProviders";

const readyStatus = {
  cloned: true,
  installed: true,
  devServerRunning: false,
  adapterRunning: false,
  port: 3000,
  portInUse: false,
  wsUrl: "ws://localhost:18789",
  running: false,
  error: "",
  remoteUrl: null,
  remoteSource: null,
};

type MockHermesAPI = Partial<NonNullable<typeof window.hermesAPI>>;

function installApi(overrides: MockHermesAPI = {}): void {
  window.hermesAPI = {
    getLocale: vi.fn().mockResolvedValue("en"),
    setLocale: vi.fn().mockResolvedValue("en"),
    claw3dStatus: vi.fn().mockResolvedValue(readyStatus),
    claw3dSetup: vi.fn().mockResolvedValue({ success: true }),
    onClaw3dSetupProgress: vi.fn().mockReturnValue(() => undefined),
    claw3dStartAll: vi.fn().mockResolvedValue({ success: true }),
    claw3dStopAll: vi.fn().mockResolvedValue(true),
    claw3dSetPort: vi.fn().mockResolvedValue(true),
    claw3dSetWsUrl: vi.fn().mockResolvedValue(true),
    claw3dGetLogs: vi.fn().mockResolvedValue("logs"),
    openExternal: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as NonNullable<typeof window.hermesAPI>;
}

describe("Office screen", () => {
  beforeEach(() => {
    localStorage.clear();
    installApi();
  });

  it("starts Office Kombiteks for the active profile", async () => {
    const claw3dStartAll = vi.fn().mockResolvedValue({ success: true });
    installApi({ claw3dStartAll });

    renderWithProviders(<Office profile="agentme" visible />);

    fireEvent.click(await screen.findByRole("button", { name: /^start$/i }));

    await waitFor(() => {
      expect(claw3dStartAll).toHaveBeenCalledWith("agentme");
    });
  });

  it("surfaces Office start errors", async () => {
    installApi({
      claw3dStartAll: vi
        .fn()
        .mockResolvedValue({ success: false, error: "adapter port in use" }),
    });

    renderWithProviders(<Office profile="agentme" visible />);

    fireEvent.click(await screen.findByRole("button", { name: /^start$/i }));

    expect(await screen.findByText("adapter port in use")).toBeVisible();
  });

  it("saves Office port and websocket settings", async () => {
    const claw3dSetPort = vi.fn().mockResolvedValue(true);
    const claw3dSetWsUrl = vi.fn().mockResolvedValue(true);
    installApi({ claw3dSetPort, claw3dSetWsUrl });

    renderWithProviders(<Office profile="agentme" visible />);

    fireEvent.click(await screen.findByTitle("Settings"));
    const portInput = screen.getByLabelText("Port");
    fireEvent.change(portInput, { target: { value: "3010" } });
    fireEvent.blur(portInput);

    const wsInput = screen.getByLabelText("WebSocket URL");
    fireEvent.change(wsInput, { target: { value: "ws://localhost:19999" } });
    fireEvent.blur(wsInput);

    await waitFor(() => {
      expect(claw3dSetPort).toHaveBeenCalledWith(3010);
      expect(claw3dSetWsUrl).toHaveBeenCalledWith("ws://localhost:19999");
    });
  });
});
