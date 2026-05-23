import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Agents from "./Agents";
import { renderWithProviders } from "../../test/renderWithProviders";

const defaultProfile = {
  name: "default",
  path: "/home/user/.hermes",
  isDefault: true,
  isActive: true,
  model: "deepseek-v4-pro:cloud",
  provider: "auto",
  hasEnv: true,
  hasSoul: true,
  skillCount: 90,
  gatewayRunning: false,
};

type MockHermesAPI = Partial<NonNullable<typeof window.hermesAPI>>;

function installApi(overrides: MockHermesAPI = {}): void {
  window.hermesAPI = {
    getLocale: vi.fn().mockResolvedValue("en"),
    setLocale: vi.fn().mockResolvedValue("en"),
    listProfiles: vi.fn().mockResolvedValue([defaultProfile]),
    createProfile: vi.fn().mockResolvedValue({ success: true }),
    deleteProfile: vi.fn().mockResolvedValue({ success: true }),
    setActiveProfile: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as NonNullable<typeof window.hermesAPI>;
}

describe("Agents screen", () => {
  beforeEach(() => {
    localStorage.clear();
    installApi();
  });

  it("creates a cloned profile and reloads profiles after success", async () => {
    const listProfiles = vi
      .fn()
      .mockResolvedValueOnce([defaultProfile])
      .mockResolvedValueOnce([
        defaultProfile,
        { ...defaultProfile, name: "agentme", isDefault: false },
      ]);
    const createProfile = vi.fn().mockResolvedValue({ success: true });
    installApi({ listProfiles, createProfile });

    renderWithProviders(
      <Agents
        activeProfile="default"
        onSelectProfile={vi.fn()}
        onChatWith={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /new agent/i }));
    fireEvent.change(screen.getByPlaceholderText(/agent name/i), {
      target: { value: "Agent Me!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(createProfile).toHaveBeenCalledWith("agentme", true);
      expect(listProfiles).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the real create error and still refreshes profiles", async () => {
    const listProfiles = vi.fn().mockResolvedValue([defaultProfile]);
    const createProfile = vi
      .fn()
      .mockResolvedValue({ success: false, error: "profile already exists" });
    installApi({ listProfiles, createProfile });

    renderWithProviders(
      <Agents
        activeProfile="default"
        onSelectProfile={vi.fn()}
        onChatWith={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /new agent/i }));
    fireEvent.change(screen.getByPlaceholderText(/agent name/i), {
      target: { value: "agentme" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText("profile already exists")).toBeVisible();
    expect(listProfiles).toHaveBeenCalledTimes(2);
  });

  it("deletes a non-default profile and switches away if it was active", async () => {
    const deleteProfile = vi.fn().mockResolvedValue({ success: true });
    const onSelectProfile = vi.fn();
    installApi({
      deleteProfile,
      listProfiles: vi
        .fn()
        .mockResolvedValue([
          defaultProfile,
          { ...defaultProfile, name: "agentme", isDefault: false },
        ]),
    });

    renderWithProviders(
      <Agents
        activeProfile="agentme"
        onSelectProfile={onSelectProfile}
        onChatWith={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTitle("Delete agent"));
    fireEvent.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() => {
      expect(deleteProfile).toHaveBeenCalledWith("agentme");
      expect(onSelectProfile).toHaveBeenCalledWith("default");
    });
  });
});
