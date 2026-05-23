import { render, type RenderResult } from "@testing-library/react";
import { I18nProvider } from "../components/I18nProvider";
import { ThemeProvider } from "../components/ThemeProvider";

export function renderWithProviders(ui: React.ReactElement): RenderResult {
  return render(
    <I18nProvider>
      <ThemeProvider>{ui}</ThemeProvider>
    </I18nProvider>,
  );
}
