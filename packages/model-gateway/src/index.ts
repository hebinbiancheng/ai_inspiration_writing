export type ModelProvider = "openai-compatible" | "ollama" | "image";

export interface ModelRequest {
  provider: ModelProvider;
  model: string;
  prompt: string;
  temperature?: number;
}

export interface ModelEvent {
  type: "delta" | "done" | "error";
  text?: string;
  message?: string;
}

export interface TextModelAdapter {
  complete(request: ModelRequest): AsyncIterable<ModelEvent>;
  cancel(taskId: string): Promise<void>;
}
