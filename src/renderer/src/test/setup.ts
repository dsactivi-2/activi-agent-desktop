import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

function createStorageMock(): Storage {
  let store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => {
      store = new Map<string, string>();
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
  };
}

beforeEach(() => {
  if (!globalThis.localStorage) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createStorageMock(),
    });
  }

  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});
