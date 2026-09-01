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

const tree = document.getElementById("tree");
const empty = document.getElementById("empty");
const toast = document.getElementById("toast");
const generalTitle = document.getElementById("generalTitle");
const rootDropZone = document.getElementById("rootDropZone");
const backupFile = document.getElementById("backupFile");
const helpDialog = document.getElementById("helpDialog");

let config = null;
let saveTimer = null;
const collapsedNodes = new Set();

function id() {
  return "node_" + crypto.randomUUID();
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function isValidNode(node, ids) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  if (typeof node.id !== "string" || !node.id || ids.has(node.id)) return false;
  if (typeof node.title !== "string" || !["menu", "item"].includes(node.type)) return false;

  ids.add(node.id);

  if (node.type === "item") {
    return typeof node.text === "string";
  }

  return Array.isArray(node.children) && node.children.every(child => isValidNode(child, ids));
}

function validateConfig(value) {
  const ids = new Set();

  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.generalTitle === "string" &&
    Array.isArray(value.menus) &&
    value.menus.every(node => isValidNode(node, ids))
  );
}

function exportBackup() {
  const backup = {
    format: "menus-de-texto-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    config
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `menus-de-texto-backup-${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
  notify("Backup exportado");
}

async function importBackup(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const importedConfig = parsed?.format === "menus-de-texto-backup" ? parsed.config : parsed;

    if (!validateConfig(importedConfig)) {
      throw new Error("Formato de backup inválido.");
    }

    if (!confirm("Importar este backup? A configuração atual será substituída.")) return;

    clearTimeout(saveTimer);
    config = structuredClone(importedConfig);
    collapsedNodes.clear();
    collapseTextItems(config.menus);
    generalTitle.value = config.generalTitle;
    await save();
    render();
    notify("Backup importado");
  } catch (error) {
    alert(`Não foi possível importar o backup. ${error.message}`);
  } finally {
    backupFile.value = "";
  }
}

async function load() {
  const data = await chrome.storage.local.get(["config", "helpSeen"]);
  config = data.config || structuredClone(DEFAULT_CONFIG);
  config.generalTitle ||= "Menus de Texto";
  generalTitle.value = config.generalTitle;
  collapseTextItems(config.menus);
  render();

  if (!data.helpSeen) helpDialog.showModal();
}

async function closeHelp() {
  helpDialog.close();
  await chrome.storage.local.set({ helpSeen: true });
}

function collapseTextItems(nodes) {
  for (const node of nodes || []) {
    if (node.type === "item") collapsedNodes.add(node.id);
    if (node.children) collapseTextItems(node.children);
  }
}

async function save() {
  await chrome.storage.local.set({ config });
  notify("Guardado");
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 250);
}

function newMenu(title = "Novo menu") {
  return { id: id(), title, type: "menu", children: [] };
}

function newItem(title = "Novo texto", text = "") {
  return { id: id(), title, type: "item", text };
}

function render() {
  tree.innerHTML = "";
  empty.hidden = config.menus.length !== 0;
  config.menus.forEach(node => tree.appendChild(renderNode(node)));
  enableDragDrop();
}

function renderNode(node) {
  const templateId =
    node.type === "menu" ? "menuTemplate" : "itemTemplate";

  const tpl = document.getElementById(templateId);
  const el = tpl.content.firstElementChild.cloneNode(true);

  el.dataset.id = node.id;
  el.dataset.type = node.type;
  if (collapsedNodes.has(node.id)) el.classList.add("collapsed");

  const title = el.querySelector(".title-input");
  title.value = node.title;

  title.addEventListener("input", () => {
    node.title = title.value;
    scheduleSave();
  });

  const location = findNodeAndParent(config.menus, node.id);
  const moveUp = el.querySelector(".move-up");
  const moveDown = el.querySelector(".move-down");
  moveUp.disabled = location.index === 0;
  moveDown.disabled = location.index === location.parentArray.length - 1;
  moveUp.addEventListener("click", () => moveNode(node.id, -1));
  moveDown.addEventListener("click", () => moveNode(node.id, 1));

  el.querySelector(".collapse").addEventListener("click", event => {
    const collapsed = el.classList.toggle("collapsed");
    if (collapsed) collapsedNodes.add(node.id);
    else collapsedNodes.delete(node.id);
    event.currentTarget.title = collapsed ? "Expandir" : "Minimizar";
    event.currentTarget.setAttribute("aria-label", event.currentTarget.title);
  });

  el.querySelector(".delete").addEventListener("click", () => {
    if (!confirm(`Apagar "${node.title}"?`)) return;

    if (removeNode(config.menus, node.id)) {
      save();
      render();
    }
  });

  if (node.type === "item") {
    const text = el.querySelector(".text-input");
    text.value = node.text || "";

    text.addEventListener("input", () => {
      node.text = text.value;
      scheduleSave();
    });
  } else {
    const children = el.querySelector(".children");

    el.querySelector(".add-submenu").addEventListener("click", () => {
      node.children ||= [];
      node.children.push(newMenu());
      save();
      render();
    });

    el.querySelector(".add-item").addEventListener("click", () => {
      node.children ||= [];
      node.children.push(newItem());
      save();
      render();
    });

    (node.children || []).forEach(child => {
      children.appendChild(renderNode(child));
    });
  }

  return el;
}

function moveNode(nodeId, direction) {
  const found = findNodeAndParent(config.menus, nodeId);
  if (!found) return;
  const nextIndex = found.index + direction;
  if (nextIndex < 0 || nextIndex >= found.parentArray.length) return;
  [found.parentArray[found.index], found.parentArray[nextIndex]] =
    [found.parentArray[nextIndex], found.parentArray[found.index]];
  save();
  render();
}

function removeNode(nodes, targetId) {
  const index = nodes.findIndex(node => node.id === targetId);

  if (index >= 0) {
    nodes.splice(index, 1);
    return true;
  }

  for (const node of nodes) {
    if (node.children && removeNode(node.children, targetId)) {
      return true;
    }
  }

  return false;
}

function findNodeAndParent(nodes, targetId, parent = null) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === targetId) {
      return {
        node: nodes[i],
        parentArray: nodes,
        index: i,
        parent
      };
    }

    if (nodes[i].children) {
      const found = findNodeAndParent(
        nodes[i].children,
        targetId,
        nodes[i]
      );

      if (found) return found;
    }
  }

  return null;
}

function containsId(node, targetId) {
  return (node.children || []).some(
    child =>
      child.id === targetId ||
      (child.type === "menu" && containsId(child, targetId))
  );
}

function enableDragDrop() {
  document.querySelectorAll(".node").forEach(el => {
    const handle = el.querySelector(".drag");
    handle.draggable = true;

    handle.addEventListener("dragstart", event => {
      event.dataTransfer.setData(
        "text/plain",
        el.dataset.id
      );
      event.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => {
        document.body.classList.add("is-dragging");
      });
    });

    handle.addEventListener("dragend", () => {
      document.body.classList.remove("is-dragging");
      rootDropZone.classList.remove("drag-over");
    });

    el.addEventListener("dragover", event => {
      event.preventDefault();
      event.stopPropagation();
      el.classList.add("drag-over");
    });

    el.addEventListener("dragleave", () => {
      el.classList.remove("drag-over");
    });

    el.addEventListener("drop", event => {
      event.preventDefault();
      event.stopPropagation();
      el.classList.remove("drag-over");

      const sourceId =
        event.dataTransfer.getData("text/plain");

      const targetId = el.dataset.id;

      if (!sourceId || sourceId === targetId) return;

      const source =
        findNodeAndParent(config.menus, sourceId);

      const target =
        findNodeAndParent(config.menus, targetId);

      if (!source || !target) return;

      if (
        source.node.type === "menu" &&
        containsId(source.node, targetId)
      ) {
        notify(
          "Não pode mover um menu para dentro de si próprio."
        );
        return;
      }

      source.parentArray.splice(source.index, 1);

      if (target.node.type === "menu") {
        target.node.children ||= [];
        target.node.children.push(source.node);
      } else {
        const refreshedTarget =
          findNodeAndParent(config.menus, targetId);

        refreshedTarget.parentArray.splice(
          refreshedTarget.index,
          0,
          source.node
        );
      }

      save();
      render();
    });
  });
}

rootDropZone.addEventListener("dragover", event => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  rootDropZone.classList.add("drag-over");
});

rootDropZone.addEventListener("dragleave", () => {
  rootDropZone.classList.remove("drag-over");
});

rootDropZone.addEventListener("drop", event => {
  event.preventDefault();
  const sourceId = event.dataTransfer.getData("text/plain");
  const source = findNodeAndParent(config.menus, sourceId);

  rootDropZone.classList.remove("drag-over");
  document.body.classList.remove("is-dragging");
  if (!source) return;

  source.parentArray.splice(source.index, 1);
  config.menus.push(source.node);
  save();
  render();
  notify("Movido para o nível principal");
});

document
  .getElementById("addRootMenu")
  .addEventListener("click", () => {
    config.menus.push(newMenu());
    save();
    render();
  });

generalTitle.addEventListener("input", () => {
  config.generalTitle = generalTitle.value;
  scheduleSave();
});

document
  .getElementById("reset")
  .addEventListener("click", () => {
    if (
      !confirm(
        "Repor os menus de exemplo? A configuração atual será substituída."
      )
    ) {
      return;
    }

    config = structuredClone(DEFAULT_CONFIG);
    save();
    render();
  });

document.getElementById("exportBackup").addEventListener("click", exportBackup);
document.getElementById("importBackup").addEventListener("click", () => backupFile.click());
document.getElementById("openHelp").addEventListener("click", () => helpDialog.showModal());
document.getElementById("closeHelp").addEventListener("click", closeHelp);
document.getElementById("confirmHelp").addEventListener("click", closeHelp);
helpDialog.addEventListener("cancel", event => {
  event.preventDefault();
  closeHelp();
});
backupFile.addEventListener("change", () => {
  const [file] = backupFile.files;
  if (file) importBackup(file);
});

load();
