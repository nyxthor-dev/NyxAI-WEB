import { chatList, messagesEl, emptyState, chatScroll, threadBadge, threadBadgeLabel, scrollState } from './dom.js';
import { state, getChat, setActiveChat, deleteChat, isChatStreaming } from './state.js';
import { saveChats } from './state.js';
import { escapeHtml, renderMarkdown } from './markdown.js';
import { regenerateMessage, continueMessage, switchVersion, editMessage, stopGeneration } from './streaming.js';
import { updateComposerState } from './composer.js';
import { closeSidebarMobile } from './sidebar.js';
import { attachFileToEdit, removeEditAttachment } from './attachments.js';

// ============================================================
// RENDER: sidebar chat list
// ============================================================
export function renderChatList(){
  const ids = Object.keys(state.chats).sort((a,b) => state.chats[b].createdAt - state.chats[a].createdAt);
  if(!ids.length){
    chatList.innerHTML = `<div class="sidebar-empty-hint">Sin sesiones todavía.<br>Crea un chat nuevo para empezar.</div>`;
    return;
  }
  chatList.innerHTML = ids.map(id => {
    const c = state.chats[id];
    const active = id === state.activeChatId ? 'active' : '';
    return `<div class="chat-item ${active}" data-id="${id}" tabindex="0">
      <span class="chat-item-title">${escapeHtml(c.title)}</span>
      <button class="chat-item-del" data-del="${id}" title="Eliminar" aria-label="Eliminar chat">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>`;
  }).join('');

  chatList.querySelectorAll('.chat-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if(e.target.closest('[data-del]')) return;
      scrollState.userScrolledUp = false;
      setActiveChat(el.dataset.id);
      renderChatList();
      renderMessages();
      updateComposerState();
      closeSidebarMobile();
    });
  });
  chatList.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteChat(el.dataset.del);
    });
  });
}

// ============================================================
// RENDER: messages
// ============================================================
export function renderMessages(){
  const chat = getChat();
  if(!chat || chat.messages.length === 0){
    messagesEl.innerHTML = '';
    emptyState.classList.remove('hidden');
    updateThreadBadge();
    return;
  }
  emptyState.classList.add('hidden');
  messagesEl.innerHTML = chat.messages.map((m, idx) => renderMessageHTML(m, idx)).join('');
  hydrateReasoningToggles();
  hydrateMessageActions();
  scrollToBottom();
  updateThreadBadge();
}

export function updateThreadBadge(){
  if(!threadBadge) return;
  const chat = getChat();
  const active = chat && chat.apiSessionId;
  threadBadge.classList.toggle('active', !!active);
  if(active){
    threadBadgeLabel.textContent = 'hilo activo';
    threadBadge.title = 'Sesión persistente: ' + chat.apiSessionId.slice(0, 12) + '…';
  }else{
    threadBadgeLabel.textContent = 'nuevo hilo';
    threadBadge.title = 'Sin hilo persistente todavía — se abre con el primer mensaje';
  }
}

export function renderAttachChipsHTML(attachments){
  if(!attachments || !attachments.length) return '';
  return `<div class="msg-attachments">${attachments.map(a => {
    const thumb = a.previewUrl
      ? `<img class="msg-attach-thumb" src="${a.previewUrl}">`
      : `<span class="msg-attach-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg></span>`;
    return `<span class="msg-attach-chip">${thumb}<span>${escapeHtml(a.name)}</span></span>`;
  }).join('')}</div>`;
}

export function renderMessageHTML(m, idx){
  if(m.role === 'user'){
    if(m.editing){
      return renderUserEditModeHTML(m, idx);
    }
    const shown = m.displayText !== undefined ? m.displayText : m.content;
    const attachHtml = renderAttachChipsHTML(m.attachments);
    const bodyHtml = shown ? `<div class="msg-body">${escapeHtml(shown)}</div>` : '';
    const streamingNow = isChatStreaming(state.activeChatId);
    const actionsHtml = `<div class="msg-actions msg-actions-user">
      <button type="button" class="btn-msg-action" data-edit="${idx}" ${streamingNow ? 'disabled' : ''} title="Editar mensaje" aria-label="Editar mensaje">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
      </button>
      <button type="button" class="btn-msg-action" data-copy="${idx}" title="Copiar mensaje" aria-label="Copiar mensaje">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
    </div>`;
    return `<div class="msg user" data-idx="${idx}">
      <div class="msg-role"><span class="role-dot"></span>tú</div>
      ${attachHtml}
      ${bodyHtml}
      ${actionsHtml}
    </div>`;
  }
  // assistant
  let reasoningHtml = '';
  if((m.reasoning || '').trim()){
    const isStreaming = !m.content && !m.error;
    reasoningHtml = `<div class="reasoning-block ${m.reasoningOpen ? 'open' : ''} ${isStreaming ? 'streaming' : ''}" data-idx="${idx}">
      <button type="button" class="reasoning-toggle">
        <span class="chevron"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></span>
        <span class="r-label">Razonamiento</span>
        <span class="r-status"></span>
      </button>
      <div class="reasoning-content">${escapeHtml(m.reasoning)}</div>
    </div>`;
  }
  const bodyHtml = m.content
    ? `<div class="msg-body md">${renderMarkdown(m.content)}</div>`
    : (m.error ? '' : `<div class="msg-status"><span class="dot-flash"><span></span><span></span><span></span></span>pensando</div>`);

  const errorHtml = m.error ? `<div class="msg-error">${escapeHtml(m.error)}</div>` : '';

  const canAct = m.apiMessageId != null && !isChatStreaming(state.activeChatId);
  const hasBody = !!(m.content || '').trim();
  const copyBtnHtml = hasBody ? `<button type="button" class="btn-msg-action" data-copy="${idx}" title="Copiar respuesta" aria-label="Copiar respuesta">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  </button>` : '';
  let actionsHtml = '';
  if(canAct){
    if(m.stopped){
      // Se detuvo antes de terminar: solo se puede continuar, DeepSeek
      // no permite regenerar un mensaje que quedó incompleto.
      actionsHtml = `<div class="msg-actions">
        <button type="button" class="btn-msg-action" data-continue="${idx}" title="Continuar generando" aria-label="Continuar generando">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        ${copyBtnHtml}
      </div>`;
    }else if(hasBody){
      let versionsHtml = '';
      if(m.versions && m.versions.length > 1){
        const cur = (m.versionIndex || 0) + 1;
        const total = m.versions.length;
        const prevDisabled = cur <= 1 ? 'disabled' : '';
        const nextDisabled = cur >= total ? 'disabled' : '';
        versionsHtml = `<div class="msg-versions">
          <button type="button" class="btn-version-nav" data-version-prev="${idx}" ${prevDisabled} aria-label="Respuesta anterior">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="version-count">${cur}/${total}</span>
          <button type="button" class="btn-version-nav" data-version-next="${idx}" ${nextDisabled} aria-label="Respuesta siguiente">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>`;
      }
      actionsHtml = `<div class="msg-actions">
        ${versionsHtml}
        <button type="button" class="btn-msg-action" data-regen="${idx}" title="Regenerar respuesta" aria-label="Regenerar respuesta">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
        ${copyBtnHtml}
      </div>`;
    }
  }else if(hasBody){
    // Sin apiMessageId todavía (streaming/otro estado) pero ya hay texto
    // para copiar: mostrar solo el botón de copiar.
    actionsHtml = `<div class="msg-actions">${copyBtnHtml}</div>`;
  }

  return `<div class="msg assistant" data-idx="${idx}">
    <div class="msg-role"><span class="role-dot"></span>Nykchat</div>
    ${reasoningHtml}
    ${bodyHtml}
    ${errorHtml}
    ${actionsHtml}
  </div>`;
}

// Modo edición de un mensaje de usuario: textarea con el texto actual,
// chips de los adjuntos (los ya existentes + los nuevos que se suban
// durante la edición), y botones Cancelar / Enviar.
function renderUserEditModeHTML(m, idx){
  const text = m.displayText !== undefined ? m.displayText : m.content;
  const attachments = m.editAttachments || [];
  const chipsHtml = attachments.length ? `<div class="edit-attach-chips" data-edit-chips="${idx}">${attachments.map(a => {
    const thumb = a.previewUrl ? `<img class="attach-chip-thumb" src="${a.previewUrl}">` : '';
    let statusIcon = '';
    if(a.status === 'uploading') statusIcon = '<span class="chip-status">…</span>';
    else if(a.status === 'ready') statusIcon = '<span class="chip-status">✓</span>';
    else if(a.status === 'error') statusIcon = `<span class="chip-status" title="${escapeHtml(a.errorMsg || '')}">!</span>`;
    return `<span class="attach-chip ${a.status}" title="${escapeHtml(a.errorMsg || a.name)}">
      ${thumb}
      <span class="chip-name">${escapeHtml(a.name)}</span>
      ${statusIcon}
      <button type="button" class="attach-chip-remove" data-edit-remove-attach="${idx}" data-local-id="${a.localId}" aria-label="Quitar">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </span>`;
  }).join('')}</div>` : '';

  return `<div class="msg user editing" data-idx="${idx}">
    <div class="msg-role"><span class="role-dot"></span>tú</div>
    <div class="msg-edit-box">
      ${chipsHtml}
      <textarea class="msg-edit-input" data-edit-input="${idx}" rows="1">${escapeHtml(text)}</textarea>
      <div class="msg-edit-controls">
        <div class="attach-wrap">
          <button type="button" class="btn-attach" data-edit-attach="${idx}" aria-label="Adjuntar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <div class="msg-edit-controls-right">
          <button type="button" class="btn-edit-cancel" data-edit-cancel="${idx}">Cancelar</button>
          <button type="button" class="btn-edit-send" data-edit-send="${idx}">Enviar</button>
        </div>
      </div>
    </div>
  </div>`;
}

export function hydrateMessageActions(){
  messagesEl.querySelectorAll('[data-regen]').forEach(btn => {
    btn.onclick = () => regenerateMessage(state.activeChatId, parseInt(btn.dataset.regen, 10));
  });
  messagesEl.querySelectorAll('[data-continue]').forEach(btn => {
    btn.onclick = () => continueMessage(state.activeChatId, parseInt(btn.dataset.continue, 10));
  });
  messagesEl.querySelectorAll('[data-version-prev]').forEach(btn => {
    btn.onclick = () => switchVersion(state.activeChatId, parseInt(btn.dataset.versionPrev, 10), -1);
  });
  messagesEl.querySelectorAll('[data-version-next]').forEach(btn => {
    btn.onclick = () => switchVersion(state.activeChatId, parseInt(btn.dataset.versionNext, 10), 1);
  });
  messagesEl.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = () => copyMessageText(btn, parseInt(btn.dataset.copy, 10));
  });
  messagesEl.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => enterEditMode(parseInt(btn.dataset.edit, 10));
  });
  hydrateEditControls();
}

// Copia el texto (visible) de un mensaje al portapapeles y da feedback
// visual breve cambiando el ícono del botón por un check.
function copyMessageText(btn, idx){
  const chat = getChat();
  const msg = chat && chat.messages[idx];
  if(!msg) return;
  const text = msg.role === 'user'
    ? (msg.displayText !== undefined ? msg.displayText : msg.content)
    : msg.content;
  if(!text) return;
  const doFeedback = () => {
    const original = btn.innerHTML;
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg>';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = original; btn.classList.remove('copied'); }, 1400);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(doFeedback).catch(() => fallbackCopy(text, doFeedback));
  }else{
    fallbackCopy(text, doFeedback);
  }
}

function fallbackCopy(text, cb){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try{ document.execCommand('copy'); }catch{}
  document.body.removeChild(ta);
  if(cb) cb();
}

// Entra en modo edición para un mensaje de usuario. Si hay una
// generación en curso en el chat, se pausa primero (misma regla que
// al enviar la edición, pero acá ya se corta apenas se abre el editor
// para que el usuario no siga viendo texto llegando mientras edita).
async function enterEditMode(idx){
  const chat = getChat();
  if(!chat) return;
  const msg = chat.messages[idx];
  if(!msg || msg.role !== 'user') return;
  if(isChatStreaming(state.activeChatId)){
    await stopGeneration(state.activeChatId);
  }
  msg.editing = true;
  msg.editAttachments = (msg.attachments || []).map(a => ({ ...a, status: 'ready' }));
  renderMessages();
  const ta = messagesEl.querySelector(`[data-edit-input="${idx}"]`);
  if(ta){
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    autoResizeEditInput(ta);
  }
}

function exitEditMode(idx){
  const chat = getChat();
  const msg = chat && chat.messages[idx];
  if(!msg) return;
  msg.editing = false;
  msg.editAttachments = null;
  renderMessages();
}

function autoResizeEditInput(ta){
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
}

function hydrateEditControls(){
  messagesEl.querySelectorAll('[data-edit-input]').forEach(ta => {
    autoResizeEditInput(ta);
    ta.oninput = () => autoResizeEditInput(ta);
    ta.onkeydown = (e) => {
      if(e.key === 'Enter' && !e.shiftKey){
        e.preventDefault();
        const idx = parseInt(ta.dataset.editInput, 10);
        submitEdit(idx);
      }else if(e.key === 'Escape'){
        exitEditMode(parseInt(ta.dataset.editInput, 10));
      }
    };
  });
  messagesEl.querySelectorAll('[data-edit-cancel]').forEach(btn => {
    btn.onclick = () => exitEditMode(parseInt(btn.dataset.editCancel, 10));
  });
  messagesEl.querySelectorAll('[data-edit-send]').forEach(btn => {
    btn.onclick = () => submitEdit(parseInt(btn.dataset.editSend, 10));
  });
  messagesEl.querySelectorAll('[data-edit-attach]').forEach(btn => {
    btn.onclick = () => attachFileToEdit(parseInt(btn.dataset.editAttach, 10));
  });
  messagesEl.querySelectorAll('[data-edit-remove-attach]').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.editRemoveAttach, 10);
      removeEditAttachment(idx, btn.dataset.localId);
    };
  });
}

async function submitEdit(idx){
  const chat = getChat();
  const msg = chat && chat.messages[idx];
  if(!msg) return;
  const ta = messagesEl.querySelector(`[data-edit-input="${idx}"]`);
  const text = ta ? ta.value.trim() : '';
  const attachments = (msg.editAttachments || []).filter(a => a.status === 'ready');
  if(!text && !attachments.length) return;
  if((msg.editAttachments || []).some(a => a.status === 'uploading')) return;
  msg.editing = false;
  msg.editAttachments = null;
  await editMessage(state.activeChatId, idx, text, attachments);
}

export function hydrateReasoningToggles(){
  messagesEl.querySelectorAll('.reasoning-block').forEach(block => {
    const btn = block.querySelector('.reasoning-toggle');
    btn.onclick = () => {
      block.classList.toggle('open');
      const idx = block.dataset.idx;
      const chat = getChat();
      if(chat && chat.messages[idx]){
        chat.messages[idx].reasoningOpen = block.classList.contains('open');
        saveChats();
      }
    };
  });
}

export function scrollToBottom(force){
  if(scrollState.userScrolledUp && !force) return;
  requestAnimationFrame(() => {
    scrollState.autoScrolling = true;
    chatScroll.scrollTop = chatScroll.scrollHeight;
  });
}
