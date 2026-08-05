import { searchOverlay, searchInput, searchResults, closeSearchBtn } from './dom.js';
import { state, setActiveChat } from './state.js';
import { renderChatList, renderMessages } from './render.js';
import { updateComposerState } from './composer.js';
import { escapeHtml } from './markdown.js';
import { closeSidebarMobile } from './sidebar.js';
import { renderActiveSkillChip } from './skills.js';

export function openSearchOverlay(){
  searchOverlay.classList.add('open');
  searchInput.value = '';
  renderSearchResults('');
  requestAnimationFrame(() => searchInput.focus());
}

function closeSearchOverlay(){
  searchOverlay.classList.remove('open');
}

closeSearchBtn.addEventListener('click', closeSearchOverlay);
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && searchOverlay.classList.contains('open')) closeSearchOverlay();
});

searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));

// Devuelve un fragmento del texto del mensaje que contiene la primera
// coincidencia, con el término resaltado, para dar contexto en el
// resultado (similar a como DeepSeek muestra el snippet).
function buildSnippet(text, query){
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if(idx === -1) return escapeHtml(text.slice(0, 90));
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 40);
  const before = escapeHtml(text.slice(start, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length, end));
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${before}<mark>${match}</mark>${after}${suffix}`;
}

function renderSearchResults(rawQuery){
  const query = rawQuery.trim();
  const ids = Object.keys(state.chats).sort((a,b) => state.chats[b].createdAt - state.chats[a].createdAt);

  let matches;
  if(!query){
    matches = ids.map(id => ({ id, chat: state.chats[id], snippet: null }));
  }else{
    const q = query.toLowerCase();
    matches = [];
    ids.forEach(id => {
      const chat = state.chats[id];
      if(chat.title.toLowerCase().includes(q)){
        matches.push({ id, chat, snippet: buildSnippet(chat.title, query) });
        return;
      }
      const hitMsg = chat.messages.find(m => {
        const t = m.displayText || m.content || '';
        return t.toLowerCase().includes(q);
      });
      if(hitMsg){
        const t = hitMsg.displayText || hitMsg.content || '';
        matches.push({ id, chat, snippet: buildSnippet(t, query) });
      }
    });
  }

  if(!matches.length){
    searchResults.innerHTML = `<div class="search-empty-hint">${query ? 'Sin resultados para "' + escapeHtml(query) + '".' : 'Sin sesiones todavía.'}</div>`;
    return;
  }

  searchResults.innerHTML = matches.map(({ id, chat, snippet }) => `
    <button type="button" class="search-result-item" data-result="${id}">
      <span class="search-result-title">${escapeHtml(chat.title)}</span>
      ${snippet ? `<span class="search-result-snippet">${snippet}</span>` : ''}
    </button>
  `).join('');

  searchResults.querySelectorAll('[data-result]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveChat(btn.dataset.result);
      renderChatList();
      renderMessages();
      updateComposerState();
      renderActiveSkillChip();
      closeSearchOverlay();
      closeSidebarMobile();
    });
  });
}
