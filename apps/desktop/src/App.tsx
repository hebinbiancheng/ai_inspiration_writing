import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModelProfile } from "@gateway";
import type { ProjectManifest } from "@domain";
import { isDesktop } from "./desktop";
import { HomeView } from "./HomeView";
import { SettingsDialog } from "./SettingsDialog";
import { WorkbenchView } from "./WorkbenchView";
import type { Project } from "./project";

export function App() {
  const [view, setView] = useState<"home" | "workbench">("home");
  const [glass, setGlass] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recents, setRecents] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [profile, setProfile] = useState<ModelProfile | null>(null);

  const configured = Boolean(profile?.base_url && profile?.model);
  const modelLabel = profile?.model ?? "";

  useEffect(() => {
    if (!isDesktop()) return;
    void (async () => {
      const saved = await invoke<ModelProfile | null>("profile_read");
      setProfile(saved);
      const roots = await invoke<string[]>("list_recent_projects");
      const loaded: Project[] = [];
      for (const root of roots) {
        try {
          loaded.push({ root, manifest: await invoke<ProjectManifest>("read_manifest", { root }) });
        } catch {
          await invoke("forget_project", { root });
        }
      }
      setRecents(loaded);
    })();
  }, []);

  function openProject(project: Project) {
    setCurrent(project);
    setView("workbench");
  }

  return (
    <>
      {view === "home" || !current ? (
        <HomeView
          recents={recents}
          modelLabel={modelLabel}
          configured={configured}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenProject={openProject}
          onRecentsChange={setRecents}
        />
      ) : (
        <WorkbenchView
          project={current}
          modelLabel={configured ? modelLabel : "未配置"}
          configured={configured}
          glass={glass}
          onToggleGlass={() => setGlass((value) => !value)}
          onOpenSettings={() => setSettingsOpen(true)}
          onBackHome={() => setView("home")}
          onProjectChange={(project) => {
            setCurrent(project);
            setRecents((items) => [project, ...items.filter((item) => item.root !== project.root)]);
          }}
        />
      )}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(next) => { setProfile(next); }}
      />
    </>
  );
}
