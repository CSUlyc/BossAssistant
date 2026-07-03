import { DEFAULT_CONFIG, normalizeConfig, type AssistantConfig } from "./config";

const CONFIG_KEY = "bossassistant/config";

export async function getConfig(): Promise<AssistantConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  return normalizeConfig(result[CONFIG_KEY] as Partial<AssistantConfig> | undefined);
}

export async function saveConfig(config: AssistantConfig): Promise<AssistantConfig> {
  const normalized = normalizeConfig(config);
  await chrome.storage.local.set({ [CONFIG_KEY]: normalized });
  return normalized;
}

export async function resetConfig(): Promise<AssistantConfig> {
  await chrome.storage.local.set({ [CONFIG_KEY]: DEFAULT_CONFIG });
  return DEFAULT_CONFIG;
}
