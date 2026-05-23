import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";
import { renderWithProviders } from "../../test/renderWithProviders";

type MockHermesAPI = Partial<NonNullable<typeof window.hermesAPI>>;

function installApi(overrides: MockHermesAPI = {}): void {
  window.hermesAPI = {
    getLocale: vi.fn().mockResolvedValue("en"),
    setLocale: vi.fn().mockResolvedValue("en"),
    getHermesHome: vi.fn().mockResolvedValue("~/.activi-agent"),
    getAppVersion: vi.fn().mockResolvedValue("0.4.5"),
    getConnectionConfig: vi.fn().mockResolvedValue({
      mode: "remote",
      remoteUrl: "https://agent.example",
      hasApiKey: true,
      apiKeyLength: 24,
      ssh: {
        host: "host",
        port: 22,
        username: "user",
        keyPath: "~/.ssh/id_rsa",
        remotePort: 8642,
        localPort: 18642,
      },
    }),
    getConfig: vi.fn().mockResolvedValue(""),
    getHermesVersion: vi
      .fn()
      .mockResolvedValue("Activi Agent v0.14.0 (2026.5.16) Python: 3.11.15"),
    checkOpenClaw: vi.fn().mockResolvedValue({ found: false, path: null }),
    setConnectionConfig: vi.fn().mockResolvedValue(true),
    setSshConfig: vi.fn().mockResolvedValue(true),
    testRemoteConnection: vi.fn().mockResolvedValue(true),
    testSshConnection: vi.fn().mockResolvedValue(true),
    setConfig: vi.fn().mockResolvedValue(true),
    runHermesDoctor: vi.fn().mockResolvedValue("ok"),
    runHermesDump: vi.fn().mockResolvedValue("dump"),
    refreshHermesVersion: vi.fn().mockResolvedValue(null),
    runHermesUpdate: vi.fn().mockResolvedValue({ success: true }),
    runClawMigrate: vi.fn().mockResolvedValue({ success: true }),
    onInstallProgress: vi.fn().mockReturnValue(() => undefined),
    readLogs: vi.fn().mockResolvedValue({ content: "logs", path: "/tmp/log" }),
    ...overrides,
  } as NonNullable<typeof window.hermesAPI>;
}

describe("Settings screen", () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    installApi();
  });

  it("preserves stored remote API key when only the URL is edited", async () => {
    const setConnectionConfig = vi.fn().mockResolvedValue(true);
    installApi({ setConnectionConfig });

    renderWithProviders(<Settings profile="agentme" />);

    const remoteUrl = await screen.findByDisplayValue("https://agent.example");
    fireEvent.change(remoteUrl, {
      target: { value: "https://agent.example/v1" },
    });
    fireEvent.blur(remoteUrl);

    await waitFor(() => {
      expect(setConnectionConfig).toHaveBeenCalledWith(
        "remote",
        "https://agent.example/v1",
        undefined,
      );
    });
  });

  it("saves SSH connection settings without touching server data", async () => {
    const setSshConfig = vi.fn().mockResolvedValue(true);
    installApi({
      setSshConfig,
      getConnectionConfig: vi.fn().mockResolvedValue({
        mode: "ssh",
        remoteUrl: "",
        hasApiKey: false,
        apiKeyLength: 0,
        ssh: {
          host: "old-host",
          port: 22,
          username: "old-user",
          keyPath: "~/.ssh/id_rsa",
          remotePort: 8642,
          localPort: 18642,
        },
      }),
    });

    renderWithProviders(<Settings profile="agentme" />);

    fireEvent.change(await screen.findByLabelText("SSH Host"), {
      target: { value: "new-host" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "new-user" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(setSshConfig).toHaveBeenCalledWith(
        "new-host",
        22,
        "new-user",
        "~/.ssh/id_rsa",
        8642,
        18642,
      );
    });
  });
});
