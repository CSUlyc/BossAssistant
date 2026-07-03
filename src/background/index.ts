import { MESSAGE_TYPES, type ExtensionMessage } from "../shared/messages";
import type { BossPageStatus } from "../shared/page";
import { DEFAULT_TASK_STATE, type TaskState } from "../shared/task";
import { getConfig, saveConfig } from "../shared/storage";

const tabStatuses = new Map<number, BossPageStatus>();
const tabTaskStates = new Map<number, TaskState>();

function getActiveTab(callback: (tab: chrome.tabs.Tab | undefined) => void) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => callback(tabs[0]));
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.PAGE_STATUS_CHANGED && sender.tab?.id !== undefined) {
    tabStatuses.set(sender.tab.id, message.payload);
    return false;
  }

  if (message.type === MESSAGE_TYPES.TASK_STATE_CHANGED && sender.tab?.id !== undefined) {
    tabTaskStates.set(sender.tab.id, message.payload);
    return false;
  }

  if (message.type === MESSAGE_TYPES.GET_ACTIVE_PAGE_STATUS) {
    getActiveTab((tab) => {
      sendResponse(tab?.id === undefined ? null : tabStatuses.get(tab.id) ?? null);
    });
    return true;
  }

  if (message.type === MESSAGE_TYPES.GET_ACTIVE_TASK_STATE) {
    getActiveTab((tab) => {
      sendResponse(tab?.id === undefined ? DEFAULT_TASK_STATE : tabTaskStates.get(tab.id) ?? DEFAULT_TASK_STATE);
    });
    return true;
  }

  if (message.type === MESSAGE_TYPES.GET_CONFIG) {
    void getConfig().then(sendResponse);
    return true;
  }

  if (message.type === MESSAGE_TYPES.SAVE_CONFIG) {
    void saveConfig(message.payload).then(sendResponse);
    return true;
  }

  if (message.type === MESSAGE_TYPES.TASK_COMMAND) {
    getActiveTab((tab) => {
      if (tab?.id === undefined) {
        sendResponse({ ok: false, error: "未找到当前标签页" });
        return;
      }

      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: "当前页面未注入 BossAssistant 控制面板" });
          return;
        }

        sendResponse(response ?? { ok: true });
      });
    });
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStatuses.delete(tabId);
  tabTaskStates.delete(tabId);
});
