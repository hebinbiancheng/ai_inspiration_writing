import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModelProfile } from "@gateway";
import { PROFILE_ID, desktopHint, isDesktop } from "./desktop";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (profile: ModelProfile | null, hasSecret: boolean) => void;
};

export function SettingsDialog({ open, onClose, onSaved }: Props) {
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:11434/v1");
  const [model, setModel] = useState("qwen3");
  const [apiKey, setApiKey] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) return;
    setApiKey("");
    setStatus("");
    if (!isDesktop()) return;
    void (async () => {
      const profile = await invoke<ModelProfile | null>("profile_read");
      const saved = await invoke<boolean>("secret_has", { profileId: PROFILE_ID });
      if (profile) {
        setBaseUrl(profile.base_url);
        setModel(profile.model);
      }
      setHasSecret(saved);
    })();
  }, [open]);

  if (!open) return null;

  async function save() {
    if (!isDesktop()) { setStatus(desktopHint()); return; }
    try {
      if (apiKey.trim()) {
        await invoke("secret_save", { profileId: PROFILE_ID, apiKey: apiKey.trim() });
      }
      const profile: ModelProfile = { base_url: baseUrl.trim(), model: model.trim(), profile_id: PROFILE_ID };
      await invoke("profile_save", { profile });
      const saved = await invoke<boolean>("secret_has", { profileId: PROFILE_ID });
      onSaved(profile, saved);
      onClose();
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function clearKey() {
    if (!isDesktop()) { setStatus(desktopHint()); return; }
    await invoke("secret_delete", { profileId: PROFILE_ID });
    setHasSecret(false);
    setApiKey("");
    const profile = await invoke<ModelProfile | null>("profile_read");
    onSaved(profile, false);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <h2>AI 设置</h2>
        {isDesktop() ? (
          <p className="modal-hint">OpenAI 兼容接口。Ollama 可填 http://127.0.0.1:11434/v1。API Key 写入系统凭据库，不会出现在作品文件夹里。</p>
        ) : (
          <p className="modal-hint">{desktopHint()}</p>
        )}
        <label>Base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1 或 http://127.0.0.1:11434/v1" /></label>
        <label>API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasSecret ? "已保存，输入则覆盖" : "本地 Ollama 可留空"} /></label>
        <label>模型名称<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="qwen3 或 gpt-4.1" /></label>
        {status ? <p className="modal-hint">{status}</p> : null}
        <div className="modal-actions">
          {hasSecret ? <button className="button" onClick={() => void clearKey()}>清除已保存的 Key</button> : null}
          <button className="button" onClick={onClose}>取消</button>
          <button className="generate" onClick={() => void save()}>保存</button>
        </div>
      </section>
    </div>
  );
}
