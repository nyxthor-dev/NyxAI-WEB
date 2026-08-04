import { composerForm, composerInput, composerBox, sendBtn } from './dom.js';
import { state, currentProfile, currentChatStreaming } from './state.js';
import { stopGeneration, sendMessage } from './streaming.js';
import { openAuthModal } from './auth.js';
import { clearAttachmentsAfterSend } from './attachments.js';

// ============================================================
// COMPOSER
// ============================================================
export function updateComposerState(){
  const uploading = state.pendingAttachments.some(a => a.status === 'uploading');
  const streaming = currentChatStreaming();
  sendBtn.classList.toggle('is-stop', streaming);
  sendBtn.disabled = (streaming ? false : (!currentProfile() || uploading));
  sendBtn.setAttribute('aria-label', streaming ? 'Detener generación' : 'Enviar');
  sendBtn.title = streaming ? 'Detener generación' : 'Enviar';
  composerInput.disabled = false;
  if(!currentProfile()){
    composerInput.placeholder = 'Configura tu conexión para empezar…';
  } else {
    composerInput.placeholder = 'Envía un mensaje...';
  }
}

composerInput.addEventListener('input', () => {
  composerInput.style.height = 'auto';
  composerInput.style.height = Math.min(composerInput.scrollHeight, 200) + 'px';
});

composerInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    composerForm.requestSubmit();
  }
});

// Al tocar cualquier parte del composer (excepto botones), enfocar el textarea
if(composerBox){
  composerBox.addEventListener('click', (e) => {
    if(e.target === composerBox || e.target.classList.contains('composer-box')){
      composerInput.focus();
    }
  });
}

composerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if(currentChatStreaming()){
    stopGeneration(state.activeChatId);
    return;
  }
  const text = composerInput.value.trim();
  const attachments = state.pendingAttachments;
  if(!text && !attachments.length) return;
  if(!currentProfile()){
    openAuthModal();
    return;
  }
  if(attachments.some(a => a.status === 'uploading')) return;
  const readyAttachments = attachments.filter(a => a.status === 'ready');

  composerInput.value = '';
  composerInput.style.height = 'auto';
  clearAttachmentsAfterSend();
  sendMessage(text, readyAttachments);
});
