import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktop } from "./desktop";

export async function bootDesktopChrome() {
  if (!isDesktop()) return;
  document.documentElement.classList.add("is-desktop");
  const window = getCurrentWindow();
  try {
    await window.unminimize();
    await window.show();
    await window.setFocus();
  } catch {
    // Window show permissions may be missing in browser preview.
  }
  try {
    await window.setEffects({ effects: [Effect.Acrylic] });
  } catch {
    try {
      await window.setEffects({ effects: [Effect.HudWindow] });
    } catch {
      // Browser preview and older WebView2 skip native acrylic.
    }
  }
}
