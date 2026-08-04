import { attachBtn, attachMenu, attachChips, fileInputCamera, fileInputImage, fileInputFile, messagesEl } from './dom.js';
import { state, currentProfile, getChat } from './state.js';
import { escapeHtml } from './markdown.js';
import { openAuthModal } from './auth.js';
import { updateComposerState } from './composer.js';

// ============================================================
// ADJUNTOS
// ============================================================
attachBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if(!currentProfile()){
    attachMenu.classList.remove('open');
    attachBtn.classList.remove('open');
    openAuthModal();
    return;
  }
  const isOpen = attachMenu.classList.toggle('open');
  attachBtn.classList.toggle('open', isOpen);
});
document.addEventListener('click', (e) => {
  if(!e.target.closest('.attach-wrap')){
    attachMenu.classList.remove('open');
    attachBtn.classList.remove('open');
  }
});
attachMenu.querySelectorAll('.attach-option').forEach(btn => {
  btn.addEventListener('click', () => {
    attachMenu.classList.remove('open');
    attachBtn.classList.remove('open');
    const action = btn.dataset.action;
    if(action === 'camera') fileInputCamera.click();
    else if(action === 'image') fileInputImage.click();
    else if(action === 'file') fileInputFile.click();
  });
});

[fileInputCamera, fileInputImage, fileInputFile].forEach(input => {
  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    files.forEach(handleFileSelected);
    input.value = '';
  });
});

export function handleFileSelected(file){
  // Se aceptan todos los tipos de archivo (documentos, comprimidos
  // como zip/rar, etc.) — el backend decide qué hacer con cada uno.
  const localId = 'att' + Date.now() + Math.random().toString(36).slice(2,6);
  const isImage = /^image\//.test(file.type);
  const item = {
    localId, name: file.name, size: file.size, type: file.type,
    status: 'uploading', previewUrl: isImage ? URL.createObjectURL(file) : null,
    _file: file, // se conserva para poder reintentar si falla la subida
  };
  state.pendingAttachments.push(item);
  renderAttachChips();
  uploadAttachment(item, file);
}

export async function uploadAttachment(item, file){
  item.status = 'uploading';
  item.errorMsg = null;
  renderAttachChips();
  try{
    const profile = currentProfile();
    if(!profile) throw new Error('Sin conexión configurada.');
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('purpose', 'assistants');
    const res = await fetch(profile.baseUrl.replace(/\/+$/, '') + '/v1/files', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + profile.token },
      body: form,
    });
    if(!res.ok){
      let msg = 'Error HTTP ' + res.status;
      try{
        const j = await res.json();
        if(j && j.error && j.error.message) msg = j.error.message;
      }catch{
        try{
          const t = await res.text();
          if(t) msg = t.slice(0, 200);
        }catch{}
      }
      throw new Error(msg);
    }
    const data = await res.json();
    item.status = 'ready';
    item.fileId = data.id;
  }catch(err){
    item.status = 'error';
    item.errorMsg = (err && err.message) || 'Error al subir el archivo.';
  }
  renderAttachChips();
}

export function retryAttachment(localId){
  const item = state.pendingAttachments.find(a => a.localId === localId);
  if(!item || !item._file) return;
  uploadAttachment(item, item._file);
}

export function removeAttachment(localId){
  const item = state.pendingAttachments.find(a => a.localId === localId);
  if(item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  state.pendingAttachments = state.pendingAttachments.filter(a => a.localId !== localId);
  renderAttachChips();
}

export function renderAttachChips(){
  if(!state.pendingAttachments.length){
    attachChips.innerHTML = '';
    return;
  }
  attachChips.innerHTML = state.pendingAttachments.map(a => {
    const thumb = a.previewUrl ? `<img class="attach-chip-thumb" src="${a.previewUrl}">` : '';
    let statusIcon = '';
    if(a.status === 'uploading') statusIcon = '<span class="chip-status">…</span>';
    else if(a.status === 'ready') statusIcon = '<span class="chip-status">✓</span>';
    else if(a.status === 'error') statusIcon = '<span class="chip-status">!</span>';
    const retryBtn = (a.status === 'error' && a._file) ? `<button type="button" class="attach-chip-retry" data-retry="${a.localId}" aria-label="Reintentar subida">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
    </button>` : '';
    const errorLine = (a.status === 'error' && a.errorMsg) ? `<div class="attach-chip-error">${escapeHtml(a.name)}: ${escapeHtml(a.errorMsg)}</div>` : '';
    return `<div class="attach-chip-wrap">
      <span class="attach-chip ${a.status}">
        ${thumb}
        <span class="chip-name">${escapeHtml(a.name)}</span>
        ${statusIcon}
        ${retryBtn}
        <button type="button" class="attach-chip-remove" data-remove="${a.localId}" aria-label="Quitar">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </span>
      ${errorLine}
    </div>`;
  }).join('');
  attachChips.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeAttachment(btn.dataset.remove));
  });
  attachChips.querySelectorAll('[data-retry]').forEach(btn => {
    btn.addEventListener('click', () => retryAttachment(btn.dataset.retry));
  });
  updateComposerState();
}

export function clearAttachmentsAfterSend(){
  state.pendingAttachments.forEach(a => { if(a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
  state.pendingAttachments = [];
  renderAttachChips();
}

// ============================================================
// ADJUNTOS EN MODO EDICIÓN — un mensaje de usuario editándose tiene su
// propia lista de adjuntos (msg.editAttachments), independiente del
// composer principal. Se sube al mismo tiempo con el mismo endpoint;
// solo cambia dónde se guarda el resultado y cómo se re-pinta.
// ============================================================
let editFileInput = null;
function getEditFileInput(){
  if(editFileInput) return editFileInput;
  editFileInput = document.createElement('input');
  editFileInput.type = 'file';
  editFileInput.multiple = true;
  editFileInput.style.display = 'none';
  document.body.appendChild(editFileInput);
  return editFileInput;
}

export function attachFileToEdit(idx){
  if(!currentProfile()){ openAuthModal(); return; }
  const input = getEditFileInput();
  input.onchange = () => {
    const files = Array.from(input.files || []);
    files.forEach(file => handleEditFileSelected(idx, file));
    input.value = '';
  };
  input.click();
}

function handleEditFileSelected(idx, file){
  const chat = getChat();
  const msg = chat && chat.messages[idx];
  if(!msg) return;
  if(!msg.editAttachments) msg.editAttachments = [];
  const localId = 'att' + Date.now() + Math.random().toString(36).slice(2,6);
  const isImage = /^image\//.test(file.type);
  const item = {
    localId, name: file.name, size: file.size, type: file.type,
    status: 'uploading', previewUrl: isImage ? URL.createObjectURL(file) : null,
  };
  msg.editAttachments.push(item);
  renderEditChips(idx);
  uploadEditAttachment(idx, item, file);
}

async function uploadEditAttachment(idx, item, file){
  try{
    const profile = currentProfile();
    if(!profile) throw new Error('sin conexión');
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('purpose', 'assistants');
    const res = await fetch(profile.baseUrl.replace(/\/+$/, '') + '/v1/files', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + profile.token },
      body: form,
    });
    if(!res.ok){
      let msg = 'HTTP ' + res.status;
      try{ const j = await res.json(); msg = (j.error && j.error.message) || msg; }catch{}
      throw new Error(msg);
    }
    const data = await res.json();
    item.status = 'ready';
    item.fileId = data.id;
  }catch(err){
    item.status = 'error';
    item.errorMsg = err.message || 'error al subir';
  }
  renderEditChips(idx);
}

export function removeEditAttachment(idx, localId){
  const chat = getChat();
  const msg = chat && chat.messages[idx];
  if(!msg || !msg.editAttachments) return;
  const item = msg.editAttachments.find(a => a.localId === localId);
  if(item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  msg.editAttachments = msg.editAttachments.filter(a => a.localId !== localId);
  renderEditChips(idx);
}

// Re-pinta solo la franja de chips dentro de la caja de edición (sin
// re-renderizar todo el mensaje, para no perder el foco del textarea).
function renderEditChips(idx){
  const chat = getChat();
  const msg = chat && chat.messages[idx];
  if(!msg) return;
  const container = messagesEl.querySelector(`[data-edit-chips="${idx}"]`);
  const attachments = msg.editAttachments || [];
  const html = attachments.map(a => {
    const thumb = a.previewUrl ? `<img class="attach-chip-thumb" src="${a.previewUrl}">` : '';
    let statusIcon = '';
    if(a.status === 'uploading') statusIcon = '<span class="chip-status">…</span>';
    else if(a.status === 'ready') statusIcon = '<span class="chip-status">✓</span>';
    else if(a.status === 'error') statusIcon = '<span class="chip-status">!</span>';
    const errorLine = (a.status === 'error' && a.errorMsg) ? `<div class="attach-chip-error">${escapeHtml(a.name)}: ${escapeHtml(a.errorMsg)}</div>` : '';
    return `<div class="attach-chip-wrap">
      <span class="attach-chip ${a.status}">
        ${thumb}
        <span class="chip-name">${escapeHtml(a.name)}</span>
        ${statusIcon}
        <button type="button" class="attach-chip-remove" data-edit-remove-attach="${idx}" data-local-id="${a.localId}" aria-label="Quitar">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </span>
      ${errorLine}
    </div>`;
  }).join('');

  if(container){
    container.innerHTML = html;
    container.querySelectorAll('[data-edit-remove-attach]').forEach(btn => {
      btn.onclick = () => removeEditAttachment(idx, btn.dataset.localId);
    });
  }else if(attachments.length){
    // Aún no existía el contenedor de chips (primer adjunto de la
    // edición): insertarlo al inicio de la caja de edición.
    const box = messagesEl.querySelector(`.msg.user.editing[data-idx="${idx}"] .msg-edit-box`);
    if(box){
      box.insertAdjacentHTML('afterbegin', `<div class="edit-attach-chips" data-edit-chips="${idx}">${html}</div>`);
      const newContainer = messagesEl.querySelector(`[data-edit-chips="${idx}"]`);
      if(newContainer){
        newContainer.querySelectorAll('[data-edit-remove-attach]').forEach(btn => {
          btn.onclick = () => removeEditAttachment(idx, btn.dataset.localId);
        });
      }
    }
  }
}
