import { modelDropdown, modelSelectLabel } from './dom.js';
import { state, currentProfile, getChat, saveChats } from './state.js';
import { escapeHtml } from './markdown.js';

// ============================================================
// API — models + chat completions (streaming)
// ============================================================
export async function apiFetch(path, opts = {}){
  const profile = currentProfile();
  if(!profile) throw new Error('No hay conexión configurada.');
  const base = profile.baseUrl.replace(/\/+$/, '');
  const headers = Object.assign({
    'Authorization': 'Bearer ' + profile.token,
  }, opts.headers || {});
  return fetch(base + path, Object.assign({}, opts, { headers }));
}

export async function loadModels(){
  const dropdown = modelDropdown;
  if(!currentProfile()){
    dropdown.innerHTML = `<div class="model-dropdown-empty">Configura tu conexión para ver los modelos disponibles.</div>`;
    return;
  }
  try{
    const res = await apiFetch('/v1/models');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.models = (data.data || []).map(m => m.id);
    if(!state.models.length) state.models = ['deepseek-chat', 'deepseek-reasoner'];
  }catch(e){
    state.models = ['deepseek-chat', 'deepseek-reasoner'];
  }
  if(!state.models.includes(state.selectedModel)){
    state.selectedModel = state.models[0];
  }
  modelSelectLabel.textContent = state.selectedModel;
  renderModelDropdown();
}

export function renderModelDropdown(){
  if(!state.models.length){
    modelDropdown.innerHTML = `<div class="model-dropdown-empty">Sin modelos disponibles.</div>`;
    return;
  }
  modelDropdown.innerHTML = state.models.map(id => {
    const active = id === state.selectedModel ? 'active' : '';
    const isReasoner = /reason/i.test(id);
    return `<div class="model-option ${active}" data-model="${escapeHtml(id)}" tabindex="0">
      <span>${escapeHtml(id)}</span>
      <span class="model-option-desc">${isReasoner ? 'con razonamiento extendido' : 'respuesta directa'}</span>
    </div>`;
  }).join('');
  modelDropdown.querySelectorAll('.model-option').forEach(el => {
    el.addEventListener('click', () => {
      state.selectedModel = el.dataset.model;
      modelSelectLabel.textContent = state.selectedModel;
      modelDropdown.classList.remove('open');
      renderModelDropdown();
      const chat = getChat();
      if(chat) { chat.model = state.selectedModel; saveChats(); }
    });
  });
}

export function buildApiMessages(chat){
  return chat.messages
    .filter(m => !m.error || m.content)
    .map(m => ({ role: m.role, content: m.content }));
}

// Recolecta todos los fileId de los adjuntos ya subidos en el historial
// de un chat, en orden. Se usa cuando se manda el historial completo sin
// hilo persistente (buildApiMessages), para que ref_file_ids incluya
// también los archivos de turnos anteriores y no solo el último.
export function collectFileIdsFromMessages(messages){
  const ids = [];
  for(const m of messages){
    if(!m.attachments) continue;
    for(const a of m.attachments){
      if(a.fileId && !ids.includes(a.fileId)) ids.push(a.fileId);
    }
  }
  return ids;
}
