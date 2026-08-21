export function isDesktop(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function isMacOS(): boolean {
  return /Macintosh|Mac OS X/.test(window.navigator.userAgent);
}

export function desktopHint(): string {
  return "需要桌面应用才能访问本地文件夹、凭据和模型。";
}
