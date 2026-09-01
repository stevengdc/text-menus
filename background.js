const DEFAULT_CONFIG = {
  generalTitle: "Menus de Texto",
  menus: [
    {
      id: "menu_respostas",
      title: "Respostas",
      type: "menu",
      children: [
        {
          id: "item_obrigado",
          title: "Obrigado",
          type: "item",
          text: "Obrigado pelo contacto! Vou analisar e responder assim que possível."
        },
        {
          id: "menu_disponibilidade",
          title: "Disponibilidade",
          type: "menu",
          children: [
            {
              id: "item_disponivel",
              title: "Disponível",
              type: "item",
              text: "Sim, tenho disponibilidade nessa data."
            },
            {
              id: "item_indisponivel",
              title: "Indisponível",
              type: "item",
              text: "Infelizmente não tenho disponibilidade nessa data."
            }
          ]
        }
      ]
    }
  ]
};

let rebuildPromise = Promise.resolve();

async function getConfig() {
  const data = await chrome.storage.local.get("config");
  return data.config || DEFAULT_CONFIG;
}

function flattenItems(nodes, parentId = null, result = []) {
  for (const node of nodes || []) {
    result.push({ node, parentId });
    if (node.type === "menu" && node.children) {
      flattenItems(node.children, node.id, result);
    }
  }
  return result;
}

function createContextMenu(options) {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(options, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve();
      }
    });
  });
}

function rebuildContextMenus() {
  rebuildPromise = rebuildPromise
    .catch(() => {})
    .then(async () => {
      await chrome.contextMenus.removeAll();

      const config = await getConfig();
      const rootId = "text_menus_general_root";
      await createContextMenu({
        id: rootId,
        title: config.generalTitle || "Menus de Texto",
        contexts: ["all"]
      });
      const all = flattenItems(config.menus, rootId);

      // Criação sequencial evita colisões/condições de corrida
      // quando várias reconstruções são disparadas quase ao mesmo tempo.
      for (const { node, parentId } of all) {
        const options = {
          id: node.id,
          title: node.title || "Sem nome",
          contexts: ["all"]
        };

        if (parentId) {
          options.parentId = parentId;
        }

        await createContextMenu(options);
      }
    });

  return rebuildPromise;
}

function findNode(nodes, id) {
  for (const node of nodes || []) {
    if (node.id === id) return node;

    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }

  return null;
}

async function insertTextIntoTab(tabId, frameId, text) {
  if (!tabId || typeof text !== "string") return;

  try {
    await chrome.tabs.sendMessage(tabId, { type: "INSERT_TEXT", text }, Number.isInteger(frameId) ? { frameId } : undefined);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: Number.isInteger(frameId) ? { tabId, frameIds: [frameId] } : { tabId },
        files: ["content.js"]
      });

      await chrome.tabs.sendMessage(tabId, { type: "INSERT_TEXT", text }, Number.isInteger(frameId) ? { frameId } : undefined);
    } catch (error) {
      console.warn(
        "Não foi possível inserir o texto nesta página.",
        error
      );
    }
  }
}

chrome.runtime.onInstalled.addListener(async details => {
  const data = await chrome.storage.local.get("config");

  if (!data.config) {
    await chrome.storage.local.set({
      config: structuredClone(DEFAULT_CONFIG)
    });
  }

  await rebuildContextMenus();

  if (details.reason === "install") {
    await chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(() => {
  rebuildContextMenus();
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const config = await getConfig();
  const node = findNode(config.menus, info.menuItemId);

  if (node?.type === "item") {
    await insertTextIntoTab(tab?.id, info.frameId, node.text || "");
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.config) {
    rebuildContextMenus();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "REBUILD_MENUS") {
    rebuildContextMenus()
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: String(error) }));

    return true;
  }
});
