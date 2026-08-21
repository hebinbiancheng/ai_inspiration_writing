import { CaretLeft, Gear } from "@phosphor-icons/react";
import type { ReactNode } from "react";

type Props = {
  showBack?: boolean;
  onBack?: () => void;
  trailing?: ReactNode;
  onOpenSettings: () => void;
};

export function TitleBar({ showBack, onBack, trailing, onOpenSettings }: Props) {
  return (
    <header className="titlebar" data-tauri-drag-region>
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
      />
      <div className="titlebar-right">
        {trailing}
        <button className="icon-button" type="button" aria-label="设置" onClick={onOpenSettings}>
          <Gear size={18} weight="regular" />
        </button>
      </div>
    </header>
  );
}
