import { $, newChatBtn, clearChatBtn, modelSelectBtn, modelDropdown } from './dom.js';
import { createChat, getChat, saveChats, currentChatStreaming } from './state.js';
import { renderChatList, renderMessages, updateThreadBadge } from './render.js';
import { updateComposerState } from './composer.js';

// ============================================================
// SIDEBAR toggle (desktop collapse + mobile drawer)
// ============================================================
$('#toggleSidebar').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-collapsed');
});
$('#openSidebar').addEventListener('click', () => {
  document.body.classList.add('sidebar-open');
});
$('#sidebarScrim').addEventListener('click', closeSidebarMobile);
export function closeSidebarMobile(){ document.body.classList.remove('sidebar-open'); }

newChatBtn.addEventListener('click', () => { createChat(); updateComposerState(); closeSidebarMobile(); });
clearChatBtn.addEventListener('click', () => {
  const chat = getChat();
  if(!chat) return;
  if(currentChatStreaming()) return;
  if(!chat.messages.length) return;
  chat.messages = [];
  chat.title = 'Nuevo chat';
  chat.apiSessionId = null;
  chat.apiParentMessageId = null;
  saveChats();
  renderChatList();
  renderMessages();
  updateThreadBadge();
});

// ============================================================
// MODEL DROPDOWN toggle
// ============================================================
modelSelectBtn.addEventListener('click', () => {
  modelDropdown.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if(!e.target.closest('.model-select-wrap')) modelDropdown.classList.remove('open');
});
