// ============================================================
// DOM refs — referencias compartidas a los elementos del documento
// ============================================================
export const $ = (sel) => document.querySelector(sel);

export const sidebar = $('#sidebar');
export const chatList = $('#chatList');
export const profileBtn = $('#profileBtn');
export const profileDot = $('#profileDot');
export const profileName = $('#profileName');
export const profileSub = $('#profileSub');
export const modelSelectBtn = $('#modelSelectBtn');
export const modelSelectLabel = $('#modelSelectLabel');
export const modelDropdown = $('#modelDropdown');
export const messagesEl = $('#messages');
export const emptyState = $('#emptyState');
export const chatScroll = $('#chatScroll');

// Si el usuario hace scroll manualmente hacia arriba mientras la IA está
// generando, el auto-scroll deja de forzar el fondo hasta que el usuario
// vuelva a estar pegado abajo por sí mismo.
// Se agrupa en un objeto (en vez de "let" sueltos) para poder mutarlo
// desde otros módulos sin perder la referencia importada.
export const scrollState = {
  userScrolledUp: false,
  autoScrolling: false,
};
chatScroll.addEventListener('scroll', () => {
  if(scrollState.autoScrolling){ scrollState.autoScrolling = false; return; }
  const distanceFromBottom = chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight;
  scrollState.userScrolledUp = distanceFromBottom > 40;
});

export const composerForm = $('#composerForm');
export const composerInput = $('#composerInput');
export const composerBox = $('#composerBox');
export const sendBtn = $('#sendBtn');
export const newChatBtn = $('#newChatBtn');
export const clearChatBtn = $('#clearChatBtn');
export const threadBadge = $('#threadBadge');
export const threadBadgeLabel = $('#threadBadgeLabel');

export const attachBtn = $('#attachBtn');
export const attachMenu = $('#attachMenu');
export const attachChips = $('#attachChips');
export const fileInputCamera = $('#fileInputCamera');
export const fileInputImage = $('#fileInputImage');
export const fileInputFile = $('#fileInputFile');

export const authScrim = $('#authScrim');
export const authUsername = $('#authUsername');
export const authBaseUrl = $('#authBaseUrl');
export const authToken = $('#authToken');
export const authStatus = $('#authStatus');
export const authTestBtn = $('#authTestBtn');
export const authSaveBtn = $('#authSaveBtn');
export const authDeleteBtn = $('#authDeleteBtn');
export const authCloseBtn = $('#authCloseBtn');
export const profileListEl = $('#profileList');
