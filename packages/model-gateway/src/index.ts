export interface ModelProfile {
  id: string;
  name: string;
  base_url: string;
  model: string;
}

export interface AppSettings {
  works_dir: string;
  active_profile_id: string;
  profiles: ModelProfile[];
}

export interface CompleteRequest {
  profile_id: string;
  prompt: string;
}

export function emptySettings(): AppSettings {
  return { works_dir: "", active_profile_id: "", profiles: [] };
}

export function activeProfile(settings: AppSettings | null | undefined): ModelProfile | null {
  if (!settings?.profiles.length) return null;
  return settings.profiles.find((profile) => profile.id === settings.active_profile_id) ?? settings.profiles[0] ?? null;
}

export function isProfileConfigured(profile: ModelProfile | null | undefined): boolean {
  return Boolean(profile?.base_url.trim() && profile?.model.trim());
}
