import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { AppSettings, ModelProfile } from "@gateway";
import { emptySettings } from "@gateway";
import { desktopHint, isDesktop } from "./desktop";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (settings: AppSettings) => void;
};

function newProfile(index: number): ModelProfile {
  return {
    id: `profile-${Date.now()}-${index}`,
    name: index <= 1 ? "默认" : `模型 ${index}`,
    base_url: "http://127.0.0.1:11434/v1",
    model: "qwen3",
  };
}

export function SettingsDialog({ open, onClose, onSaved }: Props) {
  const [settings, setSettings] = useState<AppSettings>(emptySettings());
  const [selectedId, setSelectedId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"ok" | "fail" | "">("");
  const [testing, setTesting] = useState(false);

  const selected = settings.profiles.find((profile) => profile.id === selectedId) ?? settings.profiles[0] ?? null;

  useEffect(() => {
    if (!open) return;
    setApiKey("");
    setStatus("");
    setStatusKind("");
    if (!isDesktop()) return;
    void (async () => {
      const saved = await invoke<AppSettings>("settings_read");
      const next = saved.profiles.length ? saved : { ...saved, profiles: [newProfile(1)], active_profile_id: "" };
      if (!next.active_profile_id && next.profiles[0]) next.active_profile_id = next.profiles[0].id;
      setSettings(next);
      setSelectedId(next.active_profile_id || next.profiles[0]?.id || "");
      const id = next.active_profile_id || next.profiles[0]?.id;
      setHasSecret(id ? await invoke<boolean>("secret_has", { profileId: id }) : false);
    })();
  }, [open]);

  useEffect(() => {
    if (!open || !selectedId || !isDesktop()) return;
    void invoke<boolean>("secret_has", { profileId: selectedId }).then(setHasSecret);
    setApiKey("");
  }, [open, selectedId]);

  if (!open) return null;

  function updateSelected(patch: Partial<ModelProfile>) {
    setSettings((current) => ({
      ...current,
      profiles: current.profiles.map((profile) => profile.id === selectedId ? { ...profile, ...patch } : profile),
    }));
  }

  async function persist(next: AppSettings): Promise<AppSettings> {
    if (!isDesktop()) throw new Error(desktopHint());
    if (apiKey.trim() && selectedId) {
      await invoke("secret_save", { profileId: selectedId, apiKey: apiKey.trim() });
      setHasSecret(await invoke<boolean>("secret_has", { profileId: selectedId }));
    }
    const saved = await invoke<AppSettings>("settings_save", { settings: next });
    onSaved(saved);
    return saved;
  }

  async function save() {
    try {
      const saved = await persist(settings);
      setSettings(saved);
      setApiKey("");
      setHasSecret(selectedId ? await invoke<boolean>("secret_has", { profileId: selectedId }) : false);
      onClose();
    } catch (error) {
      setStatusKind("fail");
      setStatus(String(error));
    }
  }

  async function testConnection() {
    if (!selected) return;
    setTesting(true);
    setStatus("");
    setStatusKind("");
    try {
      await persist(settings);
      const message = await invoke<string>("ai_test", { profileId: selected.id });
      setStatusKind("ok");
      setStatus(message);
    } catch (error) {
      setStatusKind("fail");
      setStatus(String(error));
    } finally {
      setTesting(false);
    }
  }

  async function pickWorksDir() {
    if (!isDesktop()) { setStatusKind("fail"); setStatus(desktopHint()); return; }
    const selectedDir = await openDialog({ directory: true, multiple: false, title: "选择作品保存位置" });
    if (typeof selectedDir !== "string") return;
    setSettings((current) => ({ ...current, works_dir: selectedDir }));
  }

  function addProfile() {
    const profile = newProfile(settings.profiles.length + 1);
    setSettings((current) => ({
      ...current,
      active_profile_id: profile.id,
      profiles: [...current.profiles, profile],
    }));
    setSelectedId(profile.id);
    setHasSecret(false);
    setApiKey("");
  }

  async function removeProfile() {
    if (!selected || settings.profiles.length <= 1) return;
    if (isDesktop()) await invoke("secret_delete", { profileId: selected.id });
    const remaining = settings.profiles.filter((profile) => profile.id !== selected.id);
    const active = remaining[0]?.id ?? "";
    setSettings((current) => ({ ...current, profiles: remaining, active_profile_id: active }));
    setSelectedId(active);
  }

  async function clearKey() {
    if (!isDesktop() || !selected) return;
    await invoke("secret_delete", { profileId: selected.id });
    setHasSecret(false);
    setApiKey("");
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="settings-title">AI 设置</h2>
        {isDesktop() ? (
          <p className="modal-hint">可保存多套 OpenAI 兼容档案。API Key 写入系统凭据库，不会出现在作品文件夹里。新建作品会自动放进下面的保存位置。测试连接会先保存当前档案。</p>
        ) : (
          <p className="modal-hint">{desktopHint()}</p>
        )}

        <label>
          作品保存位置
          <div className="works-dir">
            <span className="path">{settings.works_dir || "尚未选择，新建作品前请先指定"}</span>
            <button className="button" type="button" onClick={() => void pickWorksDir()}>选择文件夹</button>
          </div>
        </label>

        <div className="profile-tabs">
          {settings.profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={`profile-tab ${profile.id === selectedId ? "active" : ""}`}
              onClick={() => {
                setSelectedId(profile.id);
                setSettings((current) => ({ ...current, active_profile_id: profile.id }));
              }}
            >
              {profile.name || profile.model || "未命名"}
            </button>
          ))}
          <button type="button" className="profile-tab add" onClick={addProfile}>＋ 添加档案</button>
        </div>

        {selected ? (
          <>
            <label>档案名称<input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} placeholder="例如 本地 Ollama 或 Kimi" /></label>
            <label>Base URL<input value={selected.base_url} onChange={(event) => updateSelected({ base_url: event.target.value })} placeholder="https://api.openai.com/v1 或 http://127.0.0.1:11434/v1" /></label>
            <label>API Key<input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} onInput={(event) => setApiKey(event.currentTarget.value)} placeholder={hasSecret ? "已保存，输入则覆盖" : "本地 Ollama 可留空"} /></label>
            <label>模型名称<input value={selected.model} onChange={(event) => updateSelected({ model: event.target.value })} placeholder="qwen3 或 moonshot-v1" /></label>
          </>
        ) : null}

        {status ? <p className={`modal-hint ${statusKind === "ok" ? "test-ok" : statusKind === "fail" ? "test-fail" : ""}`}>{status}</p> : null}

        <div className="modal-actions">
          {hasSecret ? <button className="button" onClick={() => void clearKey()}>清除 Key</button> : null}
          {settings.profiles.length > 1 ? <button className="button" onClick={() => void removeProfile()}>删除档案</button> : null}
          <button className="button" disabled={testing || !selected} onClick={() => void testConnection()}>{testing ? "测试中…" : "测试连接"}</button>
          <button className="button" onClick={onClose}>取消</button>
          <button className="generate" onClick={() => void save()}>保存</button>
        </div>
      </section>
    </div>
  );
}
