export interface ModelProfile {
  base_url: string;
  model: string;
  profile_id: string;
}

export interface CompleteRequest {
  profile_id: string;
  prompt: string;
}
