import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "@gateway";
import { activeProfile, emptySettings, isProfileConfigured } from "@gateway";
import type { ProjectManifest } from "@domain";
import { isDesktop } from "./desktop";
import { HomeView } from "./HomeView";
import { SettingsDialog } from "./SettingsDialog";
import { WorkbenchView } from "./WorkbenchView";
import type { Project } from "./project";

export function App() {
  const [view, setView] = useState<"home" | "workbench">("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recents, setRecents] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [settings, setSettings] = useState<AppSettings>(emptySettings());

  const profile = activeProfile(settings);
  const configured = isProfileConfigured(profile);
  const modelLabel = profile ? (profile.name && profile.name !== profile.model ? `${profile.name} / ${profile.model}` : profile.model) : "";

  useEffect(() => {
    if (!isDesktop()) return;
    void (async () => {
      setSettings(await invoke<AppSettings>("settings_read"));
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
          worksDir={settings.works_dir}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenProject={openProject}
          onRecentsChange={setRecents}
        />
      ) : (
        <WorkbenchView
          project={current}
          profileId={profile?.id ?? ""}
          modelLabel={configured ? modelLabel : "未配置"}
          configured={configured}
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
        onSaved={setSettings}
      />
    </>
  );
}
