import {
  authScrim, authUsername, authBaseUrl, authToken, authStatus,
  authTestBtn, authSaveBtn, authDeleteBtn, authCloseBtn, profileListEl,
  profileBtn, profileDot, profileName, profileSub,
} from './dom.js';
import { state, currentProfile, setActiveProfile, saveProfiles } from './state.js';
import { escapeHtml } from './markdown.js';
import { loadModels } from './api.js';
import { updateComposerState } from './composer.js';

// ============================================================
// AUTH MODAL
// ============================================================
export function openAuthModal(){
  authScrim.classList.add('open');
  const profile = currentProfile();
  authUsername.value = state.activeProfile || '';
  authBaseUrl.value = profile ? profile.baseUrl : '';
  authToken.value = profile ? profile.token : '';
  authStatus.textContent = '';
  authStatus.className = 'auth-status';
  renderProfileList();
}
export function closeAuthModal(){ authScrim.classList.remove('open'); }

profileBtn.addEventListener('click', openAuthModal);
authCloseBtn.addEventListener('click', closeAuthModal);
authScrim.addEventListener('click', (e) => { if(e.target === authScrim) closeAuthModal(); });

authTestBtn.addEventListener('click', async () => {
  const baseUrl = authBaseUrl.value.trim().replace(/\/+$/, '');
  const token = authToken.value.trim();
  if(!baseUrl || !token){
    authStatus.textContent = 'completa URL y token';
    authStatus.className = 'auth-status err';
    return;
  }
  authStatus.textContent = 'probando…';
  authStatus.className = 'auth-status';
  try{
    const res = await fetch(baseUrl + '/api/health', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    authStatus.textContent = data.status === 'ok' ? 'conexión correcta' : 'respuesta inesperada';
    authStatus.className = 'auth-status ok';
  }catch(e){
    authStatus.textContent = 'no se pudo conectar';
    authStatus.className = 'auth-status err';
  }
});

authSaveBtn.addEventListener('click', () => {
  const username = authUsername.value.trim();
  const baseUrl = authBaseUrl.value.trim().replace(/\/+$/, '');
  const token = authToken.value.trim();
  if(!username || !baseUrl || !token){
    authStatus.textContent = 'completa todos los campos';
    authStatus.className = 'auth-status err';
    return;
  }
  state.profiles[username] = { baseUrl, token };
  saveProfiles();
  setActiveProfile(username);
  closeAuthModal();
  updateProfileBadge();
  loadModels();
  updateComposerState();
});

authDeleteBtn.addEventListener('click', () => {
  const username = authUsername.value.trim();
  if(!username || !state.profiles[username]) return;
  delete state.profiles[username];
  saveProfiles();
  if(state.activeProfile === username) setActiveProfile(null);
  renderProfileList();
  updateProfileBadge();
  authUsername.value = '';
  authBaseUrl.value = '';
  authToken.value = '';
});

export function renderProfileList(){
  const names = Object.keys(state.profiles);
  if(!names.length){
    profileListEl.innerHTML = `<div class="profile-list-empty">Aún no hay perfiles guardados.</div>`;
    return;
  }
  profileListEl.innerHTML = names.map(name => {
    const active = name === state.activeProfile ? 'active' : '';
    return `<button type="button" class="profile-list-item ${active}" data-name="${escapeHtml(name)}">
      <span>${escapeHtml(name)}</span>
    </button>`;
  }).join('');
  profileListEl.querySelectorAll('.profile-list-item').forEach(el => {
    el.addEventListener('click', () => {
      const name = el.dataset.name;
      const p = state.profiles[name];
      setActiveProfile(name);
      authUsername.value = name;
      authBaseUrl.value = p.baseUrl;
      authToken.value = p.token;
      renderProfileList();
      updateProfileBadge();
      loadModels();
      updateComposerState();
    });
  });
}

export function updateProfileBadge(){
  const profile = currentProfile();
  if(profile){
    profileDot.className = 'profile-dot online';
    profileName.textContent = state.activeProfile;
    profileSub.textContent = profile.baseUrl.replace(/^https?:\/\//, '');
  }else{
    profileDot.className = 'profile-dot';
    profileName.textContent = 'sin conexión';
    profileSub.textContent = 'configurar API';
  }
}
