import { ref, watchEffect } from "vue";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "paste.theme";

function readStored(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export const theme = ref<ThemePreference>(readStored());

const media = window.matchMedia("(prefers-color-scheme: dark)");

function apply(preference: ThemePreference): void {
  const resolved = preference === "system" ? (media.matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

watchEffect(() => {
  apply(theme.value);
  localStorage.setItem(STORAGE_KEY, theme.value);
});

media.addEventListener("change", () => {
  if (theme.value === "system") apply("system");
});

export function cycleTheme(): void {
  theme.value = theme.value === "system" ? "light" : theme.value === "light" ? "dark" : "system";
}
