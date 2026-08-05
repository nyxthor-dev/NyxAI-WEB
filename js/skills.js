import {
  skillsBtn, skillsMenu, skillsMenuList, skillsMenuForm,
  skillsSearchInput, skillsAddBtn, skillsList,
  skillsFormBack, skillsFormTitle,
  skillNameInput, skillDescInput, skillContentInput,
  skillFormCancel, skillFormSave,
  skillItemMenu, skillMenuEdit, skillMenuDelete,
  activeSkillChipWrap,
} from './dom.js';
import { state, getChat, createSkill, updateSkill, deleteSkill, setActiveSkillForChat } from './state.js';
import { escapeHtml } from './markdown.js';

let editingSkillId = null; // null = creando una nueva
let menuSkillId = null;    // skill sobre la que está abierto el "···"

// ============================================================
// ABRIR / CERRAR panel principal
// ============================================================
skillsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = skillsMenu.classList.toggle('open');
  skillsBtn.classList.toggle('open', isOpen);
  if(isOpen) showListView();
});
document.addEventListener('click', (e) => {
  if(!e.target.closest('.skills-wrap')){
    skillsMenu.classList.remove('open');
    skillsBtn.classList.remove('open');
  }
});

function closeSkillsPanel(){
  skillsMenu.classList.remove('open');
  skillsBtn.classList.remove('open');
}

// ============================================================
// VISTA LISTA
// ============================================================
function showListView(){
  skillsMenuForm.classList.remove('open');
  skillsMenuList.classList.add('open');
  skillsSearchInput.value = '';
  renderSkillsList('');
}

function showFormView(skillId){
  editingSkillId = skillId || null;
  const skill = skillId ? state.skills[skillId] : null;
  skillsFormTitle.textContent = skill ? 'Editar skill' : 'Nueva skill';
  skillNameInput.value = skill ? skill.name : '';
  skillDescInput.value = skill ? skill.description : '';
  skillContentInput.value = skill ? skill.content : '';
  skillsMenuList.classList.remove('open');
  skillsMenuForm.classList.add('open');
  requestAnimationFrame(() => skillNameInput.focus());
}

skillsAddBtn.addEventListener('click', () => showFormView(null));
skillsFormBack.addEventListener('click', showListView);
skillFormCancel.addEventListener('click', showListView);

skillFormSave.addEventListener('click', () => {
  const name = skillNameInput.value.trim();
  const description = skillDescInput.value.trim();
  const content = skillContentInput.value.trim();
  if(!name || !content){
    if(!name) skillNameInput.focus();
    else skillContentInput.focus();
    return;
  }
  if(editingSkillId){
    updateSkill(editingSkillId, name, description, content);
  }else{
    createSkill(name, description, content);
  }
  showListView();
});

skillsSearchInput.addEventListener('input', () => renderSkillsList(skillsSearchInput.value));

function renderSkillsList(rawQuery){
  const query = rawQuery.trim().toLowerCase();
  const chat = getChat();
  const activeId = chat ? chat.activeSkillId : null;

  let ids = Object.keys(state.skills).sort((a,b) => state.skills[b].createdAt - state.skills[a].createdAt);
  if(query){
    ids = ids.filter(id => {
      const s = state.skills[id];
      return s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query);
    });
  }

  if(!ids.length){
    skillsList.innerHTML = `<div class="skills-empty-hint">${query ? 'Sin resultados.' : 'Sin skills todavía.<br>Toca + para crear una.'}</div>`;
    return;
  }

  skillsList.innerHTML = ids.map(id => {
    const s = state.skills[id];
    const active = id === activeId ? 'active' : '';
    return `<div class="skill-item ${active}" data-skill="${id}" tabindex="0">
      <div class="skill-item-text">
        <span class="skill-item-name">${escapeHtml(s.name)}</span>
        ${s.description ? `<span class="skill-item-desc">${escapeHtml(s.description)}</span>` : ''}
      </div>
      <button class="chat-item-more" data-skill-more="${id}" title="Más opciones" aria-label="Más opciones">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
      </button>
    </div>`;
  }).join('');

  skillsList.querySelectorAll('.skill-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if(e.target.closest('[data-skill-more]')) return;
      const chatNow = getChat();
      if(!chatNow) return;
      setActiveSkillForChat(chatNow.id, el.dataset.skill);
      renderSkillsList(skillsSearchInput.value);
      renderActiveSkillChip();
      closeSkillsPanel();
    });
  });
  skillsList.querySelectorAll('[data-skill-more]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openSkillItemMenu(el.dataset.skillMore, el);
    });
  });
}

// ============================================================
// CHIP de skill activa, encima del composer (con botón para quitarla)
// ============================================================
export function renderActiveSkillChip(){
  const chat = getChat();
  const skill = chat && chat.activeSkillId ? state.skills[chat.activeSkillId] : null;
  if(!skill){
    activeSkillChipWrap.innerHTML = '';
    return;
  }
  activeSkillChipWrap.innerHTML = `<span class="active-skill-chip">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    <span>${escapeHtml(skill.name)}</span>
    <button type="button" class="active-skill-chip-remove" id="activeSkillChipRemove" aria-label="Quitar skill">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </span>`;
  const removeBtn = activeSkillChipWrap.querySelector('#activeSkillChipRemove');
  if(removeBtn){
    removeBtn.addEventListener('click', () => {
      if(!chat) return;
      setActiveSkillForChat(chat.id, chat.activeSkillId);
      renderActiveSkillChip();
    });
  }
}

// ============================================================
// MENÚ CONTEXTUAL "···" de cada skill (Editar / Eliminar)
// ============================================================
function openSkillItemMenu(skillId, anchorBtn){
  menuSkillId = skillId;
  const rect = anchorBtn.getBoundingClientRect();
  skillItemMenu.classList.add('open');
  const menuRect = skillItemMenu.getBoundingClientRect();
  let top = rect.bottom + 4;
  let left = rect.right - menuRect.width;
  if(top + menuRect.height > window.innerHeight - 8){
    top = rect.top - menuRect.height - 4;
  }
  if(left < 8) left = 8;
  skillItemMenu.style.top = `${top}px`;
  skillItemMenu.style.left = `${left}px`;
  anchorBtn.classList.add('menu-open');
  skillItemMenu._anchorBtn = anchorBtn;
}

function closeSkillItemMenu(){
  skillItemMenu.classList.remove('open');
  if(skillItemMenu._anchorBtn) skillItemMenu._anchorBtn.classList.remove('menu-open');
  skillItemMenu._anchorBtn = null;
  menuSkillId = null;
}

document.addEventListener('click', (e) => {
  if(!skillItemMenu.classList.contains('open')) return;
  if(e.target.closest('#skillItemMenu') || e.target.closest('[data-skill-more]')) return;
  closeSkillItemMenu();
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    closeSkillItemMenu();
    if(skillsMenu.classList.contains('open')) closeSkillsPanel();
  }
});

skillMenuEdit.addEventListener('click', () => {
  const id = menuSkillId;
  closeSkillItemMenu();
  if(!id || !state.skills[id]) return;
  showFormView(id);
});

skillMenuDelete.addEventListener('click', () => {
  const id = menuSkillId;
  const skill = state.skills[id];
  closeSkillItemMenu();
  if(!skill) return;
  if(confirm(`¿Eliminar la skill "${skill.name}"?`)){
    deleteSkill(id);
    renderSkillsList(skillsSearchInput.value);
    renderActiveSkillChip();
  }
});
