import { messagesEl, emptyState, chatScroll, scrollState } from './dom.js';
import { state, activeStreams, getChat, saveChats, createChat, updateChatTitleFromFirstMessage } from './state.js';
import { escapeHtml, renderMarkdown } from './markdown.js';
import { apiFetch, buildApiMessages, collectFileIdsFromMessages } from './api.js';
import {
  renderChatList, renderMessages, renderMessageHTML,
  hydrateReasoningToggles, hydrateMessageActions, updateThreadBadge,
} from './render.js';
import { updateComposerState } from './composer.js';

export async function sendMessage(text, attachments){
  attachments = attachments || [];
  scrollState.userScrolledUp = false;
  let chat = getChat();
  if(!chat){
    createChat();
    chat = getChat();
  }
  chat.model = state.selectedModel;

  let apiText = text;
  if(attachments.length){
    const refs = attachments.map(a => `[archivo adjunto: ${a.name} · id ${a.fileId}]`).join('\n');
    apiText = apiText ? `${apiText}\n\n${refs}` : refs;
  }

  chat.messages.push({
    role: 'user',
    content: apiText,
    displayText: text,
    attachments: attachments.map(a => ({ name: a.name, previewUrl: a.previewUrl, type: a.type, fileId: a.fileId })),
  });
  updateChatTitleFromFirstMessage(chat);
  const assistantMsg = { role: 'assistant', content: '', reasoning: '', reasoningOpen: true };
  chat.messages.push(assistantMsg);
  const msgIndex = chat.messages.length - 1;
  saveChats();
  renderChatList();
  renderMessages();

  const useThread = !!chat.apiSessionId;
  const body = {
    model: chat.model,
    stream: true,
    search_enabled: true,
  };
  if(attachments.length){
    // El texto '[archivo adjunto: ...]' solo es una referencia legible
    // para el historial/usuario; lo que realmente hace que DeepSeek vea
    // el contenido del archivo es ref_file_ids. Sin esto, el modelo solo
    // recibe el nombre/id como texto plano y no puede leer el archivo.
    body.ref_file_ids = attachments.map(a => a.fileId).filter(Boolean);
  }
  if(useThread){
    // Hilo persistente del lado del servidor: solo se manda el mensaje
    // nuevo, ligado a session_id/parent_message_id del chat.
    body.session_id = chat.apiSessionId;
    if(chat.apiParentMessageId != null) body.parent_message_id = chat.apiParentMessageId;
    body.messages = [{ role: 'user', content: apiText }];
  }else{
    // Sin hilo todavía (chat nuevo o antiguo): se manda el historial
    // completo como antes; la API abrirá sesión y devolverá los ids
    // para usarlos desde el siguiente turno.
    body.messages = buildApiMessages({ messages: chat.messages.slice(0, -1) });
    // Incluir también los file_id de adjuntos de turnos anteriores del
    // mismo historial, no solo los del mensaje que se está enviando ahora.
    const historicIds = collectFileIdsFromMessages(chat.messages.slice(0, -1));
    if(historicIds.length){
      const already = new Set(body.ref_file_ids || []);
      body.ref_file_ids = [...(body.ref_file_ids || []), ...historicIds.filter(id => !already.has(id))];
    }
  }

  await runStream(chat.id, msgIndex, '/v1/chat/completions', body, { isNew: true });
}

// Edita un mensaje de usuario ya enviado y reemplaza la respuesta que
// le sigue. Si había una generación en curso en el chat (de este u
// otro mensaje), se pausa primero. El mensaje de usuario se actualiza
// en su misma posición; la respuesta que le seguía se conserva como
// versión anterior del mismo mensaje asistente (mismo patrón que
// regenerateMessage), así que el selector </> queda disponible para
// volver a verla.
//
// Si el backend nunca llegó a exponer un apiMessageId para este
// mensaje de usuario (o no hay hilo persistente todavía), no hay forma
// de llamar a /api/chat/edit_message — en ese caso se hace un fallback:
// se reenvía el historial completo truncado hasta este mensaje por
// /v1/chat/completions, igual que un mensaje nuevo. El resultado para
// el usuario es el mismo (el mensaje queda editado y la conversación
// continúa desde ahí); solo cambia el mecanismo por debajo.
export async function editMessage(chatId, msgIndex, newText, attachments){
  attachments = attachments || [];
  const chat = state.chats[chatId];
  if(!chat) return;
  const userMsg = chat.messages[msgIndex];
  if(!userMsg || userMsg.role !== 'user') return;

  // 1. Pausar cualquier generación en curso de este chat antes de editar.
  if(activeStreams[chatId]){
    await stopGeneration(chatId);
  }

  let apiText = newText;
  if(attachments.length){
    const refs = attachments.map(a => `[archivo adjunto: ${a.name} · id ${a.fileId}]`).join('\n');
    apiText = apiText ? `${apiText}\n\n${refs}` : refs;
  }

  // 2. Actualizar el mensaje de usuario en su posición.
  userMsg.content = apiText;
  userMsg.displayText = newText;
  userMsg.attachments = attachments.map(a => ({ name: a.name, previewUrl: a.previewUrl, type: a.type, fileId: a.fileId }));

  // 3. La respuesta que seguía a este mensaje (si existe) se conserva
  // como versión anterior del mismo mensaje asistente, en vez de
  // descartarse — igual que al regenerar. Cualquier otro mensaje que
  // hubiera después de esa respuesta sí se descarta, porque ya no
  // corresponde a la nueva rama de la conversación.
  const oldAssistantMsg = chat.messages[msgIndex + 1] && chat.messages[msgIndex + 1].role === 'assistant'
    ? chat.messages[msgIndex + 1]
    : null;

  let assistantMsg;
  if(oldAssistantMsg){
    assistantMsg = oldAssistantMsg;
    if(!assistantMsg.versions) assistantMsg.versions = [];
    if((assistantMsg.content || '').trim() || (assistantMsg.versions.length)){
      // Guarda la respuesta actual (previa a la edición) como una
      // versión más, para no perderla.
      assistantMsg.versions.push({
        content: assistantMsg.content,
        reasoning: assistantMsg.reasoning,
        apiMessageId: assistantMsg.apiMessageId,
      });
    }
    assistantMsg.content = '';
    assistantMsg.reasoning = '';
    assistantMsg.reasoningOpen = true;
    assistantMsg.error = null;
    assistantMsg.stopped = false;
    chat.messages.length = msgIndex + 2; // conserva el usuario editado + este asistente, descarta el resto
  }else{
    assistantMsg = { role: 'assistant', content: '', reasoning: '', reasoningOpen: true };
    chat.messages.length = msgIndex + 1;
    chat.messages.push(assistantMsg);
  }
  const newMsgIndex = msgIndex + 1;

  saveChats();
  renderChatList();
  renderMessages();

  const canUseEditEndpoint = userMsg.apiMessageId != null && !!chat.apiSessionId;

  if(canUseEditEndpoint){
    const body = {
      session_id: chat.apiSessionId,
      message_id: userMsg.apiMessageId,
      prompt: newText,
      search_enabled: true,
      thinking_enabled: /reason/i.test(chat.model || ''),
      stream: true,
    };
    if(attachments.length){
      body.ref_file_ids = attachments.map(a => a.fileId);
    }
    await runStream(chatId, newMsgIndex, '/api/chat/edit_message', body, { isEdit: true });
  }else{
    // Fallback: sin id remoto del mensaje, se reenvía el historial
    // truncado como una conversación nueva desde este punto.
    const body = {
      model: chat.model,
      stream: true,
      search_enabled: true,
      messages: buildApiMessages({ messages: chat.messages.slice(0, -1) }),
    };
    const allIds = [
      ...attachments.map(a => a.fileId),
      ...collectFileIdsFromMessages(chat.messages.slice(0, -1)),
    ].filter(Boolean);
    if(allIds.length){
      body.ref_file_ids = [...new Set(allIds)];
    }
    await runStream(chatId, newMsgIndex, '/v1/chat/completions', body, { isEdit: true, isNew: !chat.apiSessionId });
  }
}

// ============================================================
// STREAM COMÚN — usado por sendMessage, continueMessage y
// regenerateMessage. Actualiza el mensaje por su índice fijo en el
// arreglo (msgIndex), así que si el usuario cambia de chat mientras
// se genera, la respuesta sigue completándose en su propia posición
// y no se mezcla con el chat que quede activo en pantalla.
// ============================================================
export async function runStream(chatId, msgIndex, path, body, opts){
  opts = opts || {};
  const chat = state.chats[chatId];
  if(!chat) return;
  const assistantMsg = chat.messages[msgIndex];
  if(!assistantMsg) return;
  // El mensaje de usuario que precede a esta respuesta (si existe) recibe
  // su propio apiMessageId cuando el backend lo informa, para poder
  // editarlo más adelante con /api/chat/edit_message.
  const precedingUserMsg = msgIndex > 0 ? chat.messages[msgIndex - 1] : null;

  const controller = new AbortController();
  activeStreams[chatId] = { controller, msgIndex };
  if(chatId === state.activeChatId) updateComposerState();

  try{
    const res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if(!res.ok || !res.body){
      let errText = 'Error HTTP ' + res.status;
      try{ const j = await res.json(); errText = (j.error && j.error.message) || errText; }catch{}
      throw new Error(errText);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while(true){
      const { value, done } = await reader.read();
      if(done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for(const line of lines){
        const trimmed = line.trim();
        if(!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if(payload === '[DONE]') continue;
        let json;
        try{ json = JSON.parse(payload); }catch{ continue; }

        // Chunk meta (no-OpenAI): trae session_id/parent_message_id para
        // mantener el hilo persistente en el siguiente turno. El backend
        // manda el id del mensaje de respuesta como "parent_message_id"
        // (y a veces "message_id"); ambos identifican este mismo mensaje
        // del asistente para poder continuarlo/regenerarlo/detenerlo.
        if(json.session_id !== undefined || json.parent_message_id !== undefined){
          if(json.session_id) chat.apiSessionId = json.session_id;
          if(json.parent_message_id != null) chat.apiParentMessageId = json.parent_message_id;
          if(chatId === state.activeChatId) updateThreadBadge();
        }
        if(json.message_id !== undefined && json.message_id !== null){
          assistantMsg.apiMessageId = json.message_id;
        }else if(json.parent_message_id !== undefined && json.parent_message_id !== null){
          assistantMsg.apiMessageId = json.parent_message_id;
        }
        // Id del mensaje de usuario (si el backend lo expone) para poder
        // editarlo luego. Si no llega explícito, se aproxima como
        // apiMessageId - 1 (ids consecutivos por turno), igual que hace
        // el backend internamente entre pregunta/respuesta.
        if(precedingUserMsg && precedingUserMsg.apiMessageId == null){
          if(json.user_message_id != null){
            precedingUserMsg.apiMessageId = json.user_message_id;
          }else if(assistantMsg.apiMessageId != null){
            precedingUserMsg.apiMessageId = assistantMsg.apiMessageId - 1;
          }
        }

        const choice = (json.choices && json.choices[0]) || null;
        if(!choice) continue;
        const delta = choice.delta || {};
        if(delta.reasoning_content){
          assistantMsg.reasoning += delta.reasoning_content;
        }
        if(delta.content){
          assistantMsg.content += delta.content;
        }
        renderAssistantLive(chatId, msgIndex, assistantMsg);
      }
    }
    assistantMsg.reasoningOpen = false;
    assistantMsg.stopped = false;

    // FIX: si solo vino razonamiento, convertirlo en respuesta
    const hasContent = (assistantMsg.content || '').trim();
    const hasReasoning = (assistantMsg.reasoning || '').trim();
    if (!hasContent && hasReasoning) {
      assistantMsg.content = assistantMsg.reasoning;
      assistantMsg.reasoning = '';
    }

    // FIX: eliminar "FINISHED" al final
    assistantMsg.content = (assistantMsg.content || '').replace(/\s*FINISHED\s*$/i, '').trim();
    assistantMsg.reasoning = (assistantMsg.reasoning || '').replace(/\s*FINISHED\s*$/i, '').trim();

    // Si este mensaje tiene historial de regeneraciones, la respuesta
    // recién completada se agrega como nueva versión al final.
    if(assistantMsg.versions && assistantMsg.versions.length){
      assistantMsg.versions.push({
        content: assistantMsg.content,
        reasoning: assistantMsg.reasoning,
        apiMessageId: assistantMsg.apiMessageId,
      });
      assistantMsg.versionIndex = assistantMsg.versions.length - 1;
    }
  }catch(err){
    if(err.name === 'AbortError'){
      assistantMsg.stopped = true;
      if(!((assistantMsg.content || '').trim())) assistantMsg.error = 'Generación detenida.';
    }else{
      assistantMsg.error = err.message || 'Error de conexión con la API.';
    }
  }finally{
    delete activeStreams[chatId];
    saveChats();
    if(chatId === state.activeChatId){
      renderChatList();
      finalizeAssistantMessage(chatId, msgIndex);
      updateComposerState();
    }else{
      renderChatList();
    }
  }
}

// Detiene la generación en curso de un chat concreto llamando al
// endpoint real de stop; el AbortController corta el stream local.
export async function stopGeneration(chatId){
  const stream = activeStreams[chatId];
  if(!stream) return;
  const chat = state.chats[chatId];
  const assistantMsg = chat && chat.messages[stream.msgIndex];
  stream.controller.abort();
  if(chat && chat.apiSessionId && assistantMsg && assistantMsg.apiMessageId != null){
    try{
      await apiFetch('/api/chat/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: chat.apiSessionId,
          message_id: assistantMsg.apiMessageId,
        }),
      });
    }catch(e){ /* el abort local ya detuvo el stream en la UI */ }
  }
}

// Navega entre las versiones regeneradas de un mensaje (botones < / >).
// Solo cambia lo que se muestra: no vuelve a pedir nada al backend.
export function switchVersion(chatId, msgIndex, direction){
  const chat = state.chats[chatId];
  if(!chat) return;
  const msg = chat.messages[msgIndex];
  if(!msg || !msg.versions || !msg.versions.length) return;
  if(activeStreams[chatId]) return;

  const newIndex = (msg.versionIndex || 0) + direction;
  if(newIndex < 0 || newIndex >= msg.versions.length) return;

  msg.versionIndex = newIndex;
  const v = msg.versions[newIndex];
  msg.content = v.content;
  msg.reasoning = v.reasoning;
  msg.apiMessageId = v.apiMessageId;
  saveChats();
  if(chatId === state.activeChatId){
    const el = messagesEl.querySelector(`.msg.assistant[data-idx="${msgIndex}"]`);
    if(el){
      el.outerHTML = renderMessageHTML(msg, msgIndex);
      hydrateReasoningToggles();
      hydrateMessageActions();
    }
  }
}

// Continúa un mensaje de asistente que quedó incompleto (detenido).
// Mantiene el mensaje en su misma posición del hilo: se actualiza el
// mismo objeto por índice, no se agrega uno nuevo al final.
export async function continueMessage(chatId, msgIndex){
  const chat = state.chats[chatId];
  if(!chat) return;
  const assistantMsg = chat.messages[msgIndex];
  if(!assistantMsg || assistantMsg.apiMessageId == null || !chat.apiSessionId) return;
  if(activeStreams[chatId]) return;

  assistantMsg.stopped = false;
  assistantMsg.error = null;
  activeStreams[chatId] = { controller: null, msgIndex };
  if(chatId === state.activeChatId) renderMessages();

  const body = {
    session_id: chat.apiSessionId,
    message_id: assistantMsg.apiMessageId,
    stream: true,
  };
  await runStream(chatId, msgIndex, '/api/chat/continue', body, { isContinue: true });
}

// Regenera un mensaje de asistente existente, reemplazando su
// contenido en su misma posición del hilo (no al final del chat).
// Guarda la versión anterior en assistantMsg.versions para poder
// navegar entre respuestas regeneradas con < / >.
export async function regenerateMessage(chatId, msgIndex){
  const chat = state.chats[chatId];
  if(!chat) return;
  const assistantMsg = chat.messages[msgIndex];
  if(!assistantMsg || assistantMsg.apiMessageId == null || !chat.apiSessionId) return;
  if(activeStreams[chatId]) return;

  if(!assistantMsg.versions) assistantMsg.versions = [];
  if(!assistantMsg.versions.length){
    // Primera regeneración: la respuesta original pasa a ser la
    // versión 0 del historial.
    assistantMsg.versions.push({
      content: assistantMsg.content,
      reasoning: assistantMsg.reasoning,
      apiMessageId: assistantMsg.apiMessageId,
    });
  }

  assistantMsg.content = '';
  assistantMsg.reasoning = '';
  assistantMsg.reasoningOpen = true;
  assistantMsg.error = null;
  assistantMsg.stopped = false;
  // Marcar como "generando" ya mismo (antes del render) para que los
  // botones de acción no aparezcan ni un frame de más mientras arranca
  // la petición al backend.
  activeStreams[chatId] = { controller: null, msgIndex };
  if(chatId === state.activeChatId) renderMessages();

  const body = {
    session_id: chat.apiSessionId,
    child_message_id: assistantMsg.apiMessageId,
    thinking_enabled: /reason/i.test(chat.model || ''),
    search_enabled: true,
    stream: true,
  };
  await runStream(chatId, msgIndex, '/api/chat/regenerate', body, { isRegenerate: true });
}

// ============================================================
// LIVE RENDERING — optimizado con RAF y sin re-render completo
// ============================================================
let liveRenderRaf = null;
let pendingLiveRender = null;

export function renderAssistantLive(chatId, msgIndex, assistantMsg){
  pendingLiveRender = { chatId, msgIndex, assistantMsg };
  if(liveRenderRaf) return;
  liveRenderRaf = requestAnimationFrame(() => {
    liveRenderRaf = null;
    const { chatId: cid, msgIndex: idx, assistantMsg: msg } = pendingLiveRender;
    if(cid !== state.activeChatId) return; // el chat activo cambió, no pintar
    _renderAssistantLiveImpl(idx, msg);
  });
}

function _renderAssistantLiveImpl(idx, assistantMsg){
  const chat = getChat();
  if(!chat) return;
  emptyState.classList.add('hidden');
  let el = messagesEl.querySelector(`.msg.assistant[data-idx="${idx}"]`);

  // PRIMERA VEZ: crear el mensaje completo
  if(!el){
    const html = renderMessageHTML(assistantMsg, idx);
    messagesEl.insertAdjacentHTML('beforeend', html);
    el = messagesEl.querySelector(`.msg.assistant[data-idx="${idx}"]`);
    if(el){
      const block = el.querySelector('.reasoning-block');
      if(block){
        const toggle = block.querySelector('.reasoning-toggle');
        toggle.onclick = () => {
          block.classList.toggle('open');
          assistantMsg.reasoningOpen = block.classList.contains('open');
        };
      }
    }
  }

  if(!el) return;

  // 1. Actualizar reasoning
  const reasoningBlock = el.querySelector('.reasoning-block');
  if(assistantMsg.reasoning){
    if(!reasoningBlock){
      const reasoningHtml = `<div class="reasoning-block open streaming" data-idx="${idx}">
        <button type="button" class="reasoning-toggle">
          <span class="chevron"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></span>
          <span class="r-label">Razonamiento</span>
          <span class="r-status">${assistantMsg.content ? '' : 'generando'}</span>
        </button>
        <div class="reasoning-content">${escapeHtml(assistantMsg.reasoning)}</div>
      </div>`;
      const role = el.querySelector('.msg-role');
      if(role) role.insertAdjacentHTML('afterend', reasoningHtml);
      const newBlock = el.querySelector('.reasoning-block');
      if(newBlock){
        newBlock.querySelector('.reasoning-toggle').onclick = () => {
          newBlock.classList.toggle('open');
          assistantMsg.reasoningOpen = newBlock.classList.contains('open');
        };
      }
    }else{
      const content = reasoningBlock.querySelector('.reasoning-content');
      if(content) content.textContent = assistantMsg.reasoning;
      const rStatus = reasoningBlock.querySelector('.r-status');
      if(rStatus) rStatus.textContent = assistantMsg.content ? '' : 'generando';
      if(!assistantMsg.content) reasoningBlock.classList.add('streaming');
      else reasoningBlock.classList.remove('streaming');
    }
  }

  // 2. Actualizar cuerpo del mensaje
  let body = el.querySelector('.msg-body.md');
  const hasContent = (assistantMsg.content || '').trim();

  if(hasContent){
    if(!body){
      const status = el.querySelector('.msg-status');
      if(status) status.remove();
      const ref = el.querySelector('.reasoning-block') || el.querySelector('.msg-role');
      if(ref) ref.insertAdjacentHTML('afterend', `<div class="msg-body md">${renderMarkdown(assistantMsg.content)}</div>`);
      body = el.querySelector('.msg-body.md');
    }else{
      // Antes de reemplazar el HTML (llega texto nuevo en cada frame),
      // se guarda la posición de scroll de cada bloque de código —
      // tanto vertical como horizontal — para restaurarla después.
      // Sin esto, cada actualización recreaba los `.code-scroll` desde
      // cero y el usuario no podía hacer scroll dentro de un bloque
      // largo mientras la respuesta seguía generándose: el navegador lo
      // devolvía a (0,0) varias veces por segundo.
      const scrollPositions = Array.from(body.querySelectorAll('.code-scroll')).map(elx => ({
        top: elx.scrollTop, left: elx.scrollLeft,
      }));
      body.innerHTML = renderMarkdown(assistantMsg.content);
      const newScrolls = body.querySelectorAll('.code-scroll');
      scrollPositions.forEach((pos, i) => {
        const target = newScrolls[i];
        if(target){ target.scrollTop = pos.top; target.scrollLeft = pos.left; }
      });
    }
  }else{
    if(!body && !el.querySelector('.msg-status')){
      const ref = el.querySelector('.reasoning-block') || el.querySelector('.msg-role');
      if(ref) ref.insertAdjacentHTML('afterend', `<div class="msg-status"><span class="dot-flash"><span></span><span></span><span></span></span>pensando</div>`);
    }
  }

  // 3. Mostrar error si existe
  let errEl = el.querySelector('.msg-error');
  if(assistantMsg.error){
    if(!errEl){
      el.insertAdjacentHTML('beforeend', `<div class="msg-error">${escapeHtml(assistantMsg.error)}</div>`);
    }else{
      errEl.textContent = assistantMsg.error;
    }
  }else if(errEl){
    errEl.remove();
  }

  // Scroll inteligente: solo sigue el fondo si el usuario no se alejó a propósito
  if(!scrollState.userScrolledUp){
    const nearBottom = chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 40;
    if(nearBottom){
      scrollState.autoScrolling = true;
      chatScroll.scrollTop = chatScroll.scrollHeight;
    }
  }
}

// Finaliza el mensaje del asistente en su posición fija (msgIndex).
// Re-renderiza ese mensaje completo para que queden los botones de
// continuar/regenerar correctos según cómo haya terminado.
function finalizeAssistantMessage(chatId, msgIndex){
  const chat = state.chats[chatId];
  if(!chat) return;
  const msg = chat.messages[msgIndex];
  if(!msg || msg.role !== 'assistant') return;
  if(chatId !== state.activeChatId) return;

  const el = messagesEl.querySelector(`.msg.assistant[data-idx="${msgIndex}"]`);
  if(!el){ renderMessages(); return; }

  el.outerHTML = renderMessageHTML(msg, msgIndex);
  hydrateReasoningToggles();
  hydrateMessageActions();
}
