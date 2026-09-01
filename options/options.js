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
const contentEditor = document.getElementById("contentEditor");
const editorItemName = document.getElementById("editorItemName");
const plainEditorPanel = document.getElementById("plainEditorPanel");
const htmlEditorPanel = document.getElementById("htmlEditorPanel");
const plainEditor = document.getElementById("plainEditor");
const visualEditor = document.getElementById("visualEditor");
const sourceEditor = document.getElementById("sourceEditor");
const visualPanel = document.getElementById("visualPanel");
const sourcePanel = document.getElementById("sourcePanel");
const editorStatus = document.getElementById("editorStatus");

let config = null;
let saveTimer = null;
const collapsedNodes = new Set();
let editingNode = null;
let editorMode = "text";
let htmlView = "visual";
let editorDirty = false;

function id() {
  return "node_" + crypto.randomUUID();
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function looksLikeHtml(value) {
  return typeof value === "string" && /<\/?[a-z][\s\S]*>/i.test(value);
}

function normalizeContentTypes(nodes) {
  for (const node of nodes || []) {
    if (node.type === "item" && !["text", "html"].includes(node.contentType)) {
      node.contentType = looksLikeHtml(node.text) ? "html" : "text";
    }
    if (node.children) normalizeContentTypes(node.children);
  }
}

function sanitizeHtml(value) {
  const allowedTags = new Set([
    "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI",
    "A", "BLOCKQUOTE", "H1", "H2", "H3", "DIV", "SPAN", "TABLE", "THEAD",
    "TBODY", "TR", "TH", "TD"
  ]);
  const template = document.createElement("template");
  template.innerHTML = String(value || "");

  for (const element of [...template.content.querySelectorAll("*")]) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    for (const attribute of [...element.attributes]) {
      const keepLink = element.tagName === "A" && ["href", "title"].includes(attribute.name);
      if (!keepLink) element.removeAttribute(attribute.name);
    }

    if (element.tagName === "A") {
      const href = element.getAttribute("href") || "";
      if (!/^(https?:|mailto:|tel:|#)/i.test(href)) element.removeAttribute("href");
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  }

  return template.innerHTML;
}

function contentSummary(node) {
  if (!node.text) return "Sem conteúdo";
  if (node.contentType === "html") {
    const template = document.createElement("template");
    template.innerHTML = sanitizeHtml(node.text);
    return template.content.textContent.trim().replace(/\s+/g, " ") || "HTML sem texto visível";
  }
  return node.text.trim().replace(/\s+/g, " ") || "Sem conteúdo";
}

function setEditorMode(mode) {
  editorMode = mode;
  document.getElementById("plainMode").classList.toggle("active", mode === "text");
  document.getElementById("htmlMode").classList.toggle("active", mode === "html");
  plainEditorPanel.hidden = mode !== "text";
  htmlEditorPanel.hidden = mode !== "html";
  editorDirty = true;
}

function setHtmlView(view) {
  if (view === "source") {
    sourceEditor.value = sanitizeHtml(visualEditor.innerHTML);
  } else {
    visualEditor.innerHTML = sanitizeHtml(sourceEditor.value);
  }

  htmlView = view;
  visualPanel.hidden = view !== "visual";
  sourcePanel.hidden = view !== "source";
  document.getElementById("visualTab").classList.toggle("active", view === "visual");
  document.getElementById("sourceTab").classList.toggle("active", view === "source");
  document.getElementById("visualTab").setAttribute("aria-selected", String(view === "visual"));
  document.getElementById("sourceTab").setAttribute("aria-selected", String(view === "source"));
}

function openContentEditor(node) {
  editingNode = node;
  editorItemName.textContent = node.title || "Texto sem nome";
  plainEditor.value = node.contentType === "text" ? node.text || "" : "";
  const html = node.contentType === "html" ? sanitizeHtml(node.text) : "";
  visualEditor.innerHTML = html;
  sourceEditor.value = html;
  editorMode = node.contentType || "text";
  editorDirty = false;
  setEditorMode(editorMode);
  editorDirty = false;
  setHtmlView("visual");
  editorStatus.textContent = "";
  contentEditor.showModal();
}

function closeContentEditor() {
  if (editorDirty && !confirm("Fechar sem guardar as alterações ao conteúdo?")) return;
  editorDirty = false;
  editingNode = null;
  contentEditor.close();
}

async function saveContentEditor() {
  if (!editingNode) return;
  editingNode.contentType = editorMode;
  editingNode.text = editorMode === "text"
    ? plainEditor.value
    : sanitizeHtml(htmlView === "source" ? sourceEditor.value : visualEditor.innerHTML);
  editorDirty = false;
  await save();
  contentEditor.close();
  editingNode = null;
  render();
  notify("Conteúdo guardado");
}

function isValidNode(node, ids) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  if (typeof node.id !== "string" || !node.id || ids.has(node.id)) return false;
  if (typeof node.title !== "string" || !["menu", "item"].includes(node.type)) return false;

  ids.add(node.id);

  if (node.type === "item") {
    return typeof node.text === "string" &&
      (node.contentType === undefined || ["text", "html"].includes(node.contentType));
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
    normalizeContentTypes(config.menus);
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
  normalizeContentTypes(config.menus);
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
  return { id: id(), title, type: "item", contentType: "text", text };
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

  const collapse = el.querySelector(".collapse");
  if (collapse) {
    collapse.addEventListener("click", event => {
      const collapsed = el.classList.toggle("collapsed");
      if (collapsed) collapsedNodes.add(node.id);
      else collapsedNodes.delete(node.id);
      event.currentTarget.title = collapsed ? "Expandir" : "Minimizar";
      event.currentTarget.setAttribute("aria-label", event.currentTarget.title);
    });
  }

  el.querySelector(".delete").addEventListener("click", () => {
    if (!confirm(`Apagar "${node.title}"?`)) return;

    if (removeNode(config.menus, node.id)) {
      save();
      render();
    }
  });

  if (node.type === "item") {
    const badge = el.querySelector(".content-type-badge");
    badge.textContent = node.contentType === "html" ? "HTML" : "TEXTO";
    badge.classList.toggle("html", node.contentType === "html");
    const preview = el.querySelector(".content-preview");
    preview.textContent = contentSummary(node);
    preview.title = preview.textContent;
    el.querySelector(".edit-content").addEventListener("click", () => openContentEditor(node));
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
    normalizeContentTypes(config.menus);
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

document.getElementById("plainMode").addEventListener("click", () => {
  if (editorMode === "html" && !plainEditor.value) {
    const template = document.createElement("template");
    template.innerHTML = sanitizeHtml(htmlView === "source" ? sourceEditor.value : visualEditor.innerHTML);
    plainEditor.value = template.content.textContent || "";
  }
  setEditorMode("text");
});

document.getElementById("htmlMode").addEventListener("click", () => {
  if (editorMode === "text" && !visualEditor.innerHTML && plainEditor.value) {
    const escaped = document.createElement("div");
    escaped.textContent = plainEditor.value;
    const html = escaped.innerHTML.replace(/\r?\n/g, "<br>");
    visualEditor.innerHTML = html;
    sourceEditor.value = html;
  }
  setEditorMode("html");
});

document.getElementById("visualTab").addEventListener("click", () => setHtmlView("visual"));
document.getElementById("sourceTab").addEventListener("click", () => setHtmlView("source"));

document.querySelectorAll(".format-toolbar [data-command]").forEach(button => {
  button.addEventListener("click", () => {
    visualEditor.focus();
    document.execCommand(button.dataset.command, false);
    editorDirty = true;
  });
});

document.querySelectorAll(".format-toolbar [data-block]").forEach(button => {
  button.addEventListener("click", () => {
    visualEditor.focus();
    document.execCommand("formatBlock", false, button.dataset.block);
    editorDirty = true;
  });
});

document.getElementById("createLink").addEventListener("click", () => {
  const url = prompt("Endereço da ligação (https://...):");
  if (!url) return;
  if (!/^(https?:|mailto:|tel:|#)/i.test(url)) {
    alert("Use um endereço iniciado por https://, http://, mailto: ou tel:.");
    return;
  }
  visualEditor.focus();
  document.execCommand("createLink", false, url);
  editorDirty = true;
});

[plainEditor, visualEditor, sourceEditor].forEach(editor => {
  editor.addEventListener("input", () => {
    editorDirty = true;
    editorStatus.textContent = "Alterações por guardar";
  });
});

document.getElementById("closeEditor").addEventListener("click", closeContentEditor);
document.getElementById("cancelEditor").addEventListener("click", closeContentEditor);
document.getElementById("saveEditor").addEventListener("click", saveContentEditor);
contentEditor.addEventListener("cancel", event => {
  event.preventDefault();
  closeContentEditor();
});

backupFile.addEventListener("change", () => {
  const [file] = backupFile.files;
  if (file) importBackup(file);
});

load();
