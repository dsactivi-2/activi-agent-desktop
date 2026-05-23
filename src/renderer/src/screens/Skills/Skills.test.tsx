import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Skills from "./Skills";
import { renderWithProviders } from "../../test/renderWithProviders";

type MockHermesAPI = Partial<NonNullable<typeof window.hermesAPI>>;

function installApi(overrides: MockHermesAPI = {}): void {
  window.hermesAPI = {
    getLocale: vi.fn().mockResolvedValue("en"),
    setLocale: vi.fn().mockResolvedValue("en"),
    listInstalledSkills: vi.fn().mockResolvedValue([
      {
        name: "docker-management",
        category: "DevOps",
        description: "Manage Docker",
        path: "/skills/docker-management/SKILL.md",
      },
    ]),
    listBundledSkills: vi.fn().mockResolvedValue([
      {
        name: "hindsight-docs",
        category: "MLOps",
        description: "Memory docs",
        source: "bundled",
        installed: false,
      },
    ]),
    getSkillContent: vi.fn().mockResolvedValue("# Docker Management"),
    installSkill: vi.fn().mockResolvedValue({ success: true }),
    uninstallSkill: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  } as NonNullable<typeof window.hermesAPI>;
}

describe("Skills screen", () => {
  beforeEach(() => {
    localStorage.clear();
    installApi();
  });

  it("loads installed skills for the active profile", async () => {
    const listInstalledSkills = vi.fn().mockResolvedValue([]);
    installApi({ listInstalledSkills });

    renderWithProviders(<Skills profile="agentme" />);

    await waitFor(() => {
      expect(listInstalledSkills).toHaveBeenCalledWith("agentme");
    });
    expect(await screen.findByText("No skills installed yet")).toBeVisible();
  });

  it("installs bundled skills into the active profile", async () => {
    const installSkill = vi.fn().mockResolvedValue({ success: true });
    const listInstalledSkills = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          name: "hindsight-docs",
          category: "MLOps",
          description: "Memory docs",
          path: "/skills/hindsight-docs/SKILL.md",
        },
      ]);
    installApi({ installSkill, listInstalledSkills });

    renderWithProviders(<Skills profile="agentme" />);

    fireEvent.click(await screen.findByRole("button", { name: /browse/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^install$/i }));

    await waitFor(() => {
      expect(installSkill).toHaveBeenCalledWith("hindsight-docs", "agentme");
      expect(listInstalledSkills).toHaveBeenCalledTimes(2);
    });
  });

  it("uninstalls a selected installed skill from the active profile", async () => {
    const uninstallSkill = vi.fn().mockResolvedValue({ success: true });
    installApi({ uninstallSkill });

    renderWithProviders(<Skills profile="agentme" />);

    fireEvent.click(await screen.findByRole("button", { name: /docker/i }));
    fireEvent.click(await screen.findByRole("button", { name: /uninstall/i }));

    await waitFor(() => {
      expect(uninstallSkill).toHaveBeenCalledWith(
        "docker-management",
        "agentme",
      );
    });
  });
});
