import { modelSelectLabel, modelDropdown } from './dom.js';
import { loadState, ensureActiveChat, currentProfile } from './state.js';
import { renderChatList, renderMessages } from './render.js';
import { loadModels } from './api.js';
import { updateComposerState } from './composer.js';
import { updateProfileBadge, openAuthModal } from './auth.js';

// Los siguientes módulos solo registran listeners en el DOM al importarse
// (no exportan nada que se use aquí), pero deben cargarse para que la app
// quede completamente conectada.
import './sidebar.js';
import './attachments.js';
import './markdown.js';

// ============================================================
// INIT
// ============================================================
function init(){
  loadState();
  ensureActiveChat();
  updateProfileBadge();
  renderChatList();
  renderMessages();
  updateComposerState();
  if(currentProfile()){
    loadModels();
  }else{
    modelSelectLabel.textContent = 'sin modelo';
    modelDropdown.innerHTML = `<div class="model-dropdown-empty">Configura tu conexión para ver los modelos disponibles.</div>`;
    setTimeout(openAuthModal, 300);
  }
}

init();
