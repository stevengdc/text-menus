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
const tinyMceLicenseKeyInput = document.getElementById("tinyMceLicenseKey");
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
let tinyEditor = null;
let tinyMceLicenseKey = "";
let suppressTinyChange = false;

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
    "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "FONT", "IMG", "UL", "OL", "LI",
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

    const attributes = Object.fromEntries([...element.attributes].map(attribute => [attribute.name, attribute.value]));
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);

    if (element.tagName === "A") {
      const href = attributes.href || "";
      if (/^(https?:|mailto:|tel:|#)/i.test(href)) element.setAttribute("href", href);
      if (attributes.title) element.setAttribute("title", attributes.title.slice(0, 200));
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }

    if (element.tagName === "FONT") {
      if (/^#[0-9a-f]{6}$/i.test(attributes.color || "")) element.setAttribute("color", attributes.color);
      if (/^[\w -]{1,40}$/.test(attributes.face || "")) element.setAttribute("face", attributes.face);
      if (/^[1-7]$/.test(attributes.size || "")) element.setAttribute("size", attributes.size);
    }

    if (element.tagName === "IMG") {
      const src = attributes.src || "";
      if (/^https:\/\//i.test(src) || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) {
        element.setAttribute("src", src);
        element.setAttribute("alt", (attributes.alt || "Imagem").slice(0, 200));
      } else {
        element.remove();
        continue;
      }
    }

    const safeStyles = [];
    for (const declaration of String(attributes.style || "").split(";")) {
      const [rawProperty, ...rawValue] = declaration.split(":");
      const property = rawProperty?.trim().toLowerCase();
      const styleValue = rawValue.join(":").trim();
      const color = /^(#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\)|[a-z]{1,20})$/i;
      if (["color", "background-color"].includes(property) && color.test(styleValue)) {
        safeStyles.push(`${property}: ${styleValue}`);
      } else if (property === "font-family" && /^[\w\s,'"-]{1,100}$/.test(styleValue)) {
        safeStyles.push(`${property}: ${styleValue}`);
      } else if (property === "font-size" && /^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i.test(styleValue)) {
        safeStyles.push(`${property}: ${styleValue}`);
      } else if (property === "text-decoration" && /^(?:none|underline|line-through)(?:\s+(?:underline|line-through))?$/i.test(styleValue)) {
        safeStyles.push(`${property}: ${styleValue}`);
      } else if (property === "text-align" && /^(left|center|right|justify)$/i.test(styleValue)) {
        safeStyles.push(`${property}: ${styleValue}`);
      } else if (["width", "height"].includes(property) && /^\d+(?:\.\d+)?(?:px|%)$/i.test(styleValue)) {
        safeStyles.push(`${property}: ${styleValue}`);
      }
    }
    if (safeStyles.length && ["SPAN", "P", "DIV", "H1", "H2", "H3", "TH", "TD", "TABLE", "IMG"].includes(element.tagName)) {
      element.setAttribute("style", safeStyles.join("; "));
    }

    if (["P", "DIV", "H1", "H2", "H3", "TH", "TD"].includes(element.tagName)) {
      const aligned = attributes.align || attributes.style?.match(/text-align\s*:\s*(left|center|right|justify)/i)?.[1];
      if (/^(left|center|right|justify)$/i.test(aligned || "")) element.setAttribute("align", aligned.toLowerCase());
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

function htmlToPlainText(value) {
  const template = document.createElement("template");
  template.innerHTML = sanitizeHtml(value);
  template.content.querySelectorAll("br").forEach(element => element.replaceWith("\n"));
  template.content.querySelectorAll("p, div, h1, h2, h3, li, blockquote, tr").forEach(element => {
    element.append("\n");
  });
  return (template.content.textContent || "").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function plainTextToHtml(value) {
  const escaped = document.createElement("div");
  escaped.textContent = value || "";
  return escaped.innerHTML.replace(/\r?\n/g, "<br>");
}

function sanitizeConfigHtml(nodes) {
  for (const node of nodes || []) {
    if (node.type === "item" && node.contentType === "html") node.text = sanitizeHtml(node.text);
    if (node.children) sanitizeConfigHtml(node.children);
  }
}

function getVisualHtml() {
  return tinyEditor ? tinyEditor.getContent() : visualEditor.value;
}

function setVisualHtml(value) {
  const html = sanitizeHtml(value);
  visualEditor.value = html;
  if (tinyEditor) {
    suppressTinyChange = true;
    tinyEditor.setContent(html);
    suppressTinyChange = false;
  }
}

async function ensureTinyEditor() {
  if (tinyEditor) return tinyEditor;
  if (!window.tinymce) throw new Error("O TinyMCE local não foi carregado.");

  const editors = await window.tinymce.init({
    target: visualEditor,
    base_url: chrome.runtime.getURL("vendor/tinymce"),
    suffix: ".min",
    license_key: tinyMceLicenseKey || "gpl",
    language: "pt_PT",
    language_url: chrome.runtime.getURL("vendor/tinymce/langs/pt_PT.js"),
    plugins: "image link lists table",
    menubar: "edit insert format table",
    toolbar: "undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist | link table image | removeformat",
    height: 380,
    resize: true,
    branding: false,
    promotion: false,
    convert_urls: false,
    paste_data_images: true,
    automatic_uploads: false,
    content_style: "body { font-family: Arial, sans-serif; font-size: 14px; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #9aa0a6; padding: 7px; } img { max-width: 100%; height: auto; }",
    file_picker_types: "image",
    file_picker_callback: callback => {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "image/png,image/jpeg,image/gif,image/webp";
      picker.addEventListener("change", () => {
        const [file] = picker.files || [];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          alert("A imagem deve ter no máximo 2 MB para não tornar o backup demasiado grande.");
          return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () => callback(reader.result, { alt: file.name }));
        reader.readAsDataURL(file);
      });
      picker.click();
    },
    setup: editor => {
      editor.on("input change undo redo", () => {
        if (suppressTinyChange || !editingNode) return;
        editorDirty = true;
        editorStatus.textContent = "Alterações por guardar";
      });
    }
  });

  tinyEditor = editors[0] || null;
  if (!tinyEditor) throw new Error("Não foi possível iniciar o TinyMCE.");
  return tinyEditor;
}

function setEditorMode(mode) {
  if (mode === editorMode) return;
  editorMode = mode;
  document.getElementById("plainMode").classList.toggle("active", mode === "text");
  document.getElementById("htmlMode").classList.toggle("active", mode === "html");
  plainEditorPanel.hidden = mode !== "text";
  htmlEditorPanel.hidden = mode !== "html";
  editorDirty = true;
}

async function setHtmlView(view) {
  if (view !== htmlView) {
    if (view === "source") {
      sourceEditor.value = sanitizeHtml(getVisualHtml());
    } else {
      await ensureTinyEditor();
      setVisualHtml(sourceEditor.value);
    }
  }

  htmlView = view;
  visualPanel.hidden = view !== "visual";
  sourcePanel.hidden = view !== "source";
  document.getElementById("visualTab").classList.toggle("active", view === "visual");
  document.getElementById("sourceTab").classList.toggle("active", view === "source");
  document.getElementById("visualTab").setAttribute("aria-selected", String(view === "visual"));
  document.getElementById("sourceTab").setAttribute("aria-selected", String(view === "source"));
}

async function openContentEditor(node) {
  editingNode = node;
  editorItemName.textContent = node.title || "Texto sem nome";
  plainEditor.value = node.contentType === "text" ? node.text || "" : "";
  const html = node.contentType === "html" ? sanitizeHtml(node.text) : "";
  visualEditor.value = html;
  sourceEditor.value = html;
  const initialMode = node.contentType || "text";
  editorMode = initialMode === "text" ? "html" : "text";
  editorDirty = false;
  setEditorMode(initialMode);
  editorDirty = false;
  htmlView = "visual";
  visualPanel.hidden = false;
  sourcePanel.hidden = true;
  document.getElementById("visualTab").classList.add("active");
  document.getElementById("sourceTab").classList.remove("active");
  editorStatus.textContent = "";
  contentEditor.showModal();
  if (initialMode === "html") {
    try {
      await ensureTinyEditor();
      setVisualHtml(html);
    } catch (error) {
      console.error("Não foi possível iniciar o TinyMCE.", error);
      editorStatus.textContent = "Editor visual indisponível — utilize o código-fonte.";
      await setHtmlView("source");
    }
  }
}

function closeContentEditor() {
  if (editorDirty && !confirm("Fechar sem guardar as alterações ao conteúdo?")) return;
  editorDirty = false;
  editingNode = null;
  contentEditor.close();
}

async function saveContentEditor() {
  if (!editingNode) return;
  const previous = { contentType: editingNode.contentType, text: editingNode.text };
  editingNode.contentType = editorMode;
  editingNode.text = editorMode === "text"
    ? plainEditor.value
    : sanitizeHtml(htmlView === "source" ? sourceEditor.value : getVisualHtml());
  const saved = await save();
  if (!saved) {
    editingNode.contentType = previous.contentType;
    editingNode.text = previous.text;
    editorDirty = true;
    editorStatus.textContent = "Não foi possível guardar — reduza o tamanho das imagens.";
    return;
  }
  editorDirty = false;
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
  const previousConfig = structuredClone(config);
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
    sanitizeConfigHtml(config.menus);
    collapsedNodes.clear();
    collapseTextItems(config.menus);
    generalTitle.value = config.generalTitle;
    if (!(await save({ showError: false }))) throw new Error("O backup excede o espaço disponível.");
    render();
    notify("Backup importado");
  } catch (error) {
    config = previousConfig;
    generalTitle.value = config.generalTitle;
    alert(`Não foi possível importar o backup. ${error.message}`);
  } finally {
    backupFile.value = "";
  }
}

async function load() {
  const data = await chrome.storage.local.get(["config", "helpSeen", "tinyMceLicenseKey"]);
  config = data.config || structuredClone(DEFAULT_CONFIG);
  tinyMceLicenseKey = typeof data.tinyMceLicenseKey === "string" ? data.tinyMceLicenseKey.trim() : "";
  tinyMceLicenseKeyInput.value = tinyMceLicenseKey;
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

async function save({ showError = true } = {}) {
  try {
    const bytes = new Blob([JSON.stringify({ config })]).size;
    const quota = chrome.storage.local.QUOTA_BYTES;
    if (quota && bytes > quota * 0.95) {
      throw new Error("A configuração está demasiado grande. Remova ou reduza algumas imagens.");
    }
    await chrome.storage.local.set({ config });
    notify("Guardado");
    return true;
  } catch (error) {
    console.error("Não foi possível guardar a configuração.", error);
    if (showError) alert(`Não foi possível guardar. ${error.message}`);
    return false;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), 250);
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
  if (editorMode === "text") return;
  plainEditor.value = htmlToPlainText(htmlView === "source" ? sourceEditor.value : getVisualHtml());
  setEditorMode("text");
});

document.getElementById("htmlMode").addEventListener("click", async () => {
  if (editorMode === "html") return;
  const html = plainTextToHtml(plainEditor.value);
  sourceEditor.value = html;
  setEditorMode("html");
  try {
    await ensureTinyEditor();
    setVisualHtml(html);
  } catch (error) {
    console.error("Não foi possível iniciar o TinyMCE.", error);
    editorStatus.textContent = "Editor visual indisponível — utilize o código-fonte.";
    await setHtmlView("source");
  }
});

document.getElementById("visualTab").addEventListener("click", async () => {
  try {
    await setHtmlView("visual");
  } catch (error) {
    console.error("Não foi possível abrir o editor visual.", error);
    editorStatus.textContent = "Editor visual indisponível — continue no código-fonte.";
  }
});
document.getElementById("sourceTab").addEventListener("click", () => setHtmlView("source"));

[plainEditor, sourceEditor].forEach(editor => {
  editor.addEventListener("input", () => {
    editorDirty = true;
    editorStatus.textContent = "Alterações por guardar";
  });
});

tinyMceLicenseKeyInput.addEventListener("change", async () => {
  tinyMceLicenseKey = tinyMceLicenseKeyInput.value.trim();
  await chrome.storage.local.set({ tinyMceLicenseKey });
  if (tinyEditor) {
    tinyEditor.remove();
    tinyEditor = null;
  }
  notify(tinyMceLicenseKey ? "Chave TinyMCE guardada localmente" : "Modo GPL ativado");
});

document.getElementById("toggleTinyMceKey").addEventListener("click", event => {
  const show = tinyMceLicenseKeyInput.type === "password";
  tinyMceLicenseKeyInput.type = show ? "text" : "password";
  event.currentTarget.textContent = show ? "Ocultar" : "Mostrar";
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
