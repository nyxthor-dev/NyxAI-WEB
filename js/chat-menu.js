import {
  chatItemMenu, chatMenuRename, chatMenuPin, chatMenuPinLabel,
  chatMenuDelete
} from './dom.js';
import { state, renameChat, toggleChatPin, deleteChat } from './state.js';
import { renderChatList, renderMessages } from './render.js';
import { renderActiveSkillChip } from './skills.js';

let menuChatId = null;

// ============================================================
// Abre el menú "···" anclado al botón que lo disparó, con las
// opciones: Renombrar, Fijar/Desfijar, Compartir, Eliminar.
// ============================================================
export function openChatItemMenu(chatId, anchorBtn){
  menuChatId = chatId;
  const chat = state.chats[chatId];
  if(!chat) return;

  chatMenuPinLabel.textContent = chat.pinned ? 'Desfijar' : 'Fijar';

  // Posiciona el menú cerca del botón que lo abrió, ajustando si se
  // sale de la ventana (por espacio abajo o a la derecha).
  const rect = anchorBtn.getBoundingClientRect();
  chatItemMenu.classList.add('open');
  const menuRect = chatItemMenu.getBoundingClientRect();
  let top = rect.bottom + 4;
  let left = rect.right - menuRect.width;
  if(top + menuRect.height > window.innerHeight - 8){
    top = rect.top - menuRect.height - 4;
  }
  if(left < 8) left = 8;
  chatItemMenu.style.top = `${top}px`;
  chatItemMenu.style.left = `${left}px`;

  anchorBtn.classList.add('menu-open');
  chatItemMenu.dataset.anchor = '';
  chatItemMenu._anchorBtn = anchorBtn;
}

function closeChatItemMenu(){
  chatItemMenu.classList.remove('open');
  if(chatItemMenu._anchorBtn) chatItemMenu._anchorBtn.classList.remove('menu-open');
  chatItemMenu._anchorBtn = null;
  menuChatId = null;
}

document.addEventListener('click', (e) => {
  if(!chatItemMenu.classList.contains('open')) return;
  if(e.target.closest('#chatItemMenu') || e.target.closest('[data-more]')) return;
  closeChatItemMenu();
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape') closeChatItemMenu();
});

chatMenuRename.addEventListener('click', () => {
  const id = menuChatId;
  const chat = state.chats[id];
  closeChatItemMenu();
  if(!chat) return;
  const next = prompt('Nuevo nombre del chat:', chat.title);
  if(next && next.trim()){
    renameChat(id, next.trim());
    renderChatList();
  }
});

chatMenuPin.addEventListener('click', () => {
  const id = menuChatId;
  closeChatItemMenu();
  if(!id) return;
  toggleChatPin(id);
  renderChatList();
});

chatMenuDelete.addEventListener('click', () => {
  const id = menuChatId;
  const chat = state.chats[id];
  closeChatItemMenu();
  if(!chat) return;
  if(confirm(`¿Eliminar el chat "${chat.title}"? Esta acción no se puede deshacer.`)){
    deleteChat(id);
    renderActiveSkillChip();
  }
});
