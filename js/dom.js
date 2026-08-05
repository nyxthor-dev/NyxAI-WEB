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
  // true mientras el usuario tiene el dedo apoyado en la pantalla (o la
  // rueda del mouse activa) dentro del área de scroll del chat. Se usa
  // para congelar el auto-scroll DURANTE el gesto, no solo después:
  // en iOS el evento "scroll" no siempre llega hasta soltar el dedo, así
  // que sin esto el auto-scroll seguía empujando al fondo en cada frame
  // de streaming mientras el usuario intentaba subir con el dedo puesto,
  // dando la sensación de que el chat estaba "trabado".
  userInteracting: false,
};
chatScroll.addEventListener('scroll', () => {
  if(scrollState.autoScrolling){ scrollState.autoScrolling = false; return; }
  const distanceFromBottom = chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight;
  scrollState.userScrolledUp = distanceFromBottom > 40;
});
// Congelar el auto-scroll apenas empieza el gesto (touch o rueda), sin
// esperar a que el navegador calcule la nueva posición. Se escucha en
// captura y con passive:true para no interferir con el scroll nativo
// (incluido el de los bloques de código anidados).
['touchstart', 'wheel'].forEach(evt => {
  chatScroll.addEventListener(evt, () => {
    scrollState.userInteracting = true;
  }, { passive: true, capture: true });
});
['touchend', 'touchcancel'].forEach(evt => {
  chatScroll.addEventListener(evt, () => {
    // Pequeño margen para que el último frame de auto-scroll en vuelo
    // (RAF ya encolado) no se ejecute justo al soltar el dedo.
    setTimeout(() => { scrollState.userInteracting = false; }, 50);
  }, { passive: true });
});
window.addEventListener('mouseup', () => { scrollState.userInteracting = false; }, { passive: true });

export const composerForm = $('#composerForm');
export const composerInput = $('#composerInput');
export const composerBox = $('#composerBox');
export const sendBtn = $('#sendBtn');
export const newChatBtn = $('#newChatBtn');
export const threadBadge = $('#threadBadge');
export const threadBadgeLabel = $('#threadBadgeLabel');
export const tokenCounter = $('#tokenCounter');
export const tokenCounterLabel = $('#tokenCounterLabel');

export const openSearchBtn = $('#openSearchBtn');
export const closeSearchBtn = $('#closeSearchBtn');
export const searchOverlay = $('#searchOverlay');
export const searchInput = $('#searchInput');
export const searchResults = $('#searchResults');

export const chatItemMenu = $('#chatItemMenu');
export const chatMenuRename = $('#chatMenuRename');
export const chatMenuPin = $('#chatMenuPin');
export const chatMenuPinLabel = $('#chatMenuPinLabel');
export const chatMenuDelete = $('#chatMenuDelete');

export const attachBtn = $('#attachBtn');
export const attachMenu = $('#attachMenu');
export const attachChips = $('#attachChips');
export const activeSkillChipWrap = $('#activeSkillChipWrap');
export const fileInputCamera = $('#fileInputCamera');
export const fileInputImage = $('#fileInputImage');
export const fileInputFile = $('#fileInputFile');

export const skillsBtn = $('#skillsBtn');
export const skillsMenu = $('#skillsMenu');
export const skillsMenuList = $('#skillsMenuList');
export const skillsMenuForm = $('#skillsMenuForm');
export const skillsSearchInput = $('#skillsSearchInput');
export const skillsAddBtn = $('#skillsAddBtn');
export const skillsList = $('#skillsList');
export const skillsFormBack = $('#skillsFormBack');
export const skillsFormTitle = $('#skillsFormTitle');
export const skillNameInput = $('#skillNameInput');
export const skillDescInput = $('#skillDescInput');
export const skillContentInput = $('#skillContentInput');
export const skillFormCancel = $('#skillFormCancel');
export const skillFormSave = $('#skillFormSave');

export const skillItemMenu = $('#skillItemMenu');
export const skillMenuEdit = $('#skillMenuEdit');
export const skillMenuDelete = $('#skillMenuDelete');

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
