import { CaretLeft, Gear, Minus, Square, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktop } from "./desktop";

type Props = {
  showBack?: boolean;
  onBack?: () => void;
  trailing?: ReactNode;
  onOpenSettings: () => void;
};

async function runWindow(action: "min" | "max" | "close") {
  const window = getCurrentWindow();
  if (action === "min") await window.minimize();
  if (action === "max") await window.toggleMaximize();
  if (action === "close") await window.close();
}

export function TitleBar({ showBack, onBack, trailing, onOpenSettings }: Props) {
  const desktop = isDesktop();

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        {showBack ? (
          <button className="titlebar-back" type="button" aria-label="返回首页" onClick={onBack}>
            <CaretLeft size={18} weight="bold" />
          </button>
        ) : null}
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>灵感</span>
        </div>
      </div>
      <div
        className="titlebar-drag"
        data-tauri-drag-region
        onDoubleClick={() => {
          if (desktop) void runWindow("max");
        }}
      />
      <div className="titlebar-right">
        {trailing}
        <button className="icon-button" type="button" aria-label="设置" onClick={onOpenSettings}>
          <Gear size={18} weight="regular" />
        </button>
        {desktop ? (
          <div className="window-controls">
            <button type="button" aria-label="最小化" onClick={() => void runWindow("min")}>
              <Minus size={14} weight="bold" />
            </button>
            <button type="button" aria-label="最大化" onClick={() => void runWindow("max")}>
              <Square size={12} weight="bold" />
            </button>
            <button className="close" type="button" aria-label="关闭" onClick={() => void runWindow("close")}>
              <X size={14} weight="bold" />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
