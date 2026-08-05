import { $, newChatBtn, modelSelectBtn, modelDropdown, openSearchBtn } from './dom.js';
import { createChat } from './state.js';
import { updateComposerState } from './composer.js';
import { openSearchOverlay } from './search.js';
import { renderActiveSkillChip } from './skills.js';

// ============================================================
// SIDEBAR toggle (desktop collapse + mobile drawer)
// ============================================================
// El colapso/apertura del sidebar SOLO ocurre con estos dos controles
// (botón de colapsar y tocar el scrim fuera del panel). Seleccionar un
// chat de la lista nunca debe disparar este comportamiento.
$('#toggleSidebar').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-collapsed');
});
$('#openSidebar').addEventListener('click', () => {
  document.body.classList.add('sidebar-open');
});
$('#sidebarScrim').addEventListener('click', closeSidebarMobile);
export function closeSidebarMobile(){ document.body.classList.remove('sidebar-open'); }

newChatBtn.addEventListener('click', () => { createChat(); updateComposerState(); renderActiveSkillChip(); closeSidebarMobile(); });

openSearchBtn.addEventListener('click', () => { openSearchOverlay(); });

// ============================================================
// MODEL DROPDOWN toggle
// ============================================================
modelSelectBtn.addEventListener('click', () => {
  modelDropdown.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if(!e.target.closest('.model-select-wrap')) modelDropdown.classList.remove('open');
});
