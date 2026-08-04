import { renderChatList, renderMessages } from './render.js';

const LS_PROFILES = 'devilos.profiles';
const LS_ACTIVE_PROFILE = 'devilos.active';
const LS_CHATS = 'devilos.chats';
const LS_ACTIVE_CHAT = 'devilos.activeChat';

// ---------- estado ----------
export let state = {
  profiles: {},
  activeProfile: null,
  chats: {},
  activeChatId: null,
  models: [],
  selectedModel: 'deepseek-chat',
  pendingAttachments: [],
};

// Generación en curso por chat: { [chatId]: { controller, msgIndex } }
// Permite pausar la generación de un chat, cambiar a otro (o enviar/continuar
// otro mensaje) y seguir viendo el estado correcto de cada uno por separado.
export const activeStreams = {};
export function isChatStreaming(chatId){ return !!activeStreams[chatId]; }
export function currentChatStreaming(){ return isChatStreaming(state.activeChatId); }

// ---------- helpers de storage ----------
export function loadState(){
  try{ state.profiles = JSON.parse(localStorage.getItem(LS_PROFILES) || '{}'); }catch{ state.profiles = {}; }
  state.activeProfile = localStorage.getItem(LS_ACTIVE_PROFILE) || null;
  try{ state.chats = JSON.parse(localStorage.getItem(LS_CHATS) || '{}'); }catch{ state.chats = {}; }
  state.activeChatId = localStorage.getItem(LS_ACTIVE_CHAT) || null;
}
export function saveProfiles(){ localStorage.setItem(LS_PROFILES, JSON.stringify(state.profiles)); }
export function saveChats(){ localStorage.setItem(LS_CHATS, JSON.stringify(state.chats)); }
export function setActiveProfile(username){
  state.activeProfile = username;
  if(username) localStorage.setItem(LS_ACTIVE_PROFILE, username);
  else localStorage.removeItem(LS_ACTIVE_PROFILE);
}
export function setActiveChat(id){
  state.activeChatId = id;
  if(id) localStorage.setItem(LS_ACTIVE_CHAT, id);
  else localStorage.removeItem(LS_ACTIVE_CHAT);
}

export function currentProfile(){
  return state.activeProfile ? state.profiles[state.activeProfile] : null;
}

// ============================================================
// CHATS — CRUD
// ============================================================
export function genId(){ return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

export function createChat(){
  const id = genId();
  state.chats[id] = {
    id,
    title: 'Nuevo chat',
    model: state.selectedModel,
    messages: [],
    createdAt: Date.now(),
    apiSessionId: null,
    apiParentMessageId: null,
  };
  saveChats();
  setActiveChat(id);
  renderChatList();
  renderMessages();
  return id;
}

export function ensureActiveChat(){
  Object.values(state.chats).forEach(c => {
    if(c.apiSessionId === undefined) c.apiSessionId = null;
    if(c.apiParentMessageId === undefined) c.apiParentMessageId = null;
  });
  if(!state.activeChatId || !state.chats[state.activeChatId]){
    const ids = Object.keys(state.chats);
    if(ids.length){
      setActiveChat(ids.sort((a,b) => state.chats[b].createdAt - state.chats[a].createdAt)[0]);
    }
  }
}

export function deleteChat(id){
  delete state.chats[id];
  saveChats();
  if(state.activeChatId === id){
    setActiveChat(null);
    ensureActiveChat();
  }
  renderChatList();
  renderMessages();
}

export function getChat(){
  return state.chats[state.activeChatId] || null;
}

export function updateChatTitleFromFirstMessage(chat){
  if(chat.title !== 'Nuevo chat') return;
  const firstUser = chat.messages.find(m => m.role === 'user');
  if(firstUser){
    const raw = (firstUser.displayText || firstUser.content).trim() || (firstUser.attachments && firstUser.attachments.length ? firstUser.attachments[0].name : '');
    const t = raw.slice(0, 42);
    chat.title = t.length < raw.length ? t + '…' : (t || 'Nuevo chat');
  }
}
