import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktop, isMacOS } from "./desktop";

export async function bootDesktopChrome() {
  if (!isDesktop()) return;
  document.documentElement.classList.add("is-desktop");
  if (isMacOS()) document.documentElement.classList.add("is-macos");
  const window = getCurrentWindow();
  try {
    await window.unminimize();
    await window.show();
    await window.setFocus();
  } catch {
    // Window show permissions may be missing in browser preview.
  }
}
