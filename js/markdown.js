// ============================================================
// MARKDOWN + CODE RENDERING
// ============================================================
export function escapeHtml(str){
  return str.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

marked.setOptions({
  breaks: true,
  gfm: true,
});

let codeBlockSeq = 0;
let previewSeq = 0;

const renderer = new marked.Renderer();
renderer.code = function(code, infoString){
  const lang = (infoString || '').trim().split(/\s+/)[0] || 'texto';
  let highlighted;
  let validLang = lang;
  try{
    if(lang && hljs.getLanguage(lang)){
      highlighted = hljs.highlight(code, { language: lang }).value;
    }else{
      const auto = hljs.highlightAuto(code);
      highlighted = auto.value;
      validLang = auto.language || 'texto';
    }
  }catch(e){
    highlighted = escapeHtml(code);
  }
  const id = 'cb' + (++codeBlockSeq);
  const encoded = encodeURIComponent(code);

  // Solo bloques HTML consiguen el botón de vista previa: se guarda el
  // código fuente en un <template> (nunca ejecutado por el DOM) y se
  // vuelca en un iframe sandboxeado recién al tocar "play" — así no se
  // corre HTML/JS de terceros hasta que el usuario lo pide explícitamente.
  const isHtml = /^html?$/i.test(validLang);
  let previewHtml = '';
  let playBtnHtml = '';
  if(isHtml){
    const pid = 'pv' + (++previewSeq);
    playBtnHtml = `<button class="code-preview-btn" type="button" data-preview="${pid}" title="Vista previa" aria-label="Vista previa">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        <span>vista previa</span>
      </button>`;
    previewHtml = `<div class="code-preview" id="${pid}" hidden>
      <template class="code-preview-src">${escapeHtml(code)}</template>
      <div class="code-preview-toolbar">
        <span class="code-preview-label">Vista previa</span>
        <button class="code-preview-refresh" type="button" title="Recargar" aria-label="Recargar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
        <button class="code-preview-close" type="button" title="Volver al código" aria-label="Volver al código">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="code-preview-frame-wrap">
        <iframe class="code-preview-frame" sandbox="allow-scripts allow-forms allow-modals allow-popups" referrerpolicy="no-referrer"></iframe>
        <div class="code-preview-loading">
          <span class="dot-flash"><span></span><span></span><span></span></span>
          <span>generando HTML…</span>
        </div>
      </div>
    </div>`;
  }

  return `<div class="code-block">
    <div class="code-head">
      <span>${escapeHtml(validLang)}</span>
      <div class="code-head-actions">
        ${playBtnHtml}
        <button class="code-copy-btn" type="button" data-code="${encoded}" onclick="copyCodeBlock(this)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>copiar</span>
        </button>
      </div>
    </div>
    <div class="code-scroll"><pre><code class="hljs language-${escapeHtml(validLang)}" id="${id}">${highlighted}</code></pre></div>
    ${previewHtml}
  </div>`;
};
marked.setOptions({ renderer });

renderer.table = function(header, body){
  return '<div class="table-wrapper"><table><thead>' + header + '</thead><tbody>' + body + '</tbody></table></div>';
};
renderer.tablerow = function(content){
  return '<tr>' + content + '</tr>';
};
renderer.tablecell = function(content, flags){
  const tag = flags.header ? 'th' : 'td';
  const align = flags.align ? ' style="text-align:' + flags.align + '"' : '';
  return '<' + tag + align + '>' + content + '</' + tag + '>';
};

window.copyCodeBlock = function(btn){
  const code = decodeURIComponent(btn.getAttribute('data-code'));
  navigator.clipboard.writeText(code).then(() => {
    btn.classList.add('copied');
    const span = btn.querySelector('span');
    const prev = span.textContent;
    span.textContent = 'copiado';
    setTimeout(() => { btn.classList.remove('copied'); span.textContent = prev; }, 1500);
  }).catch(() => {});
};

// ============================================================
// PREVIEW DE BLOQUES HTML — delegado en document porque los bloques se
// recrean en cada frame de streaming; hidratar uno por uno sería frágil.
// ============================================================
function isStillGenerating(previewEl){
  return !!previewEl.closest('.msg-streaming');
}
function loadPreviewFrame(previewEl){
  const frame = previewEl.querySelector('.code-preview-frame');
  if(!frame) return;
  // Mientras el mensaje sigue generando, el HTML del bloque puede estar
  // a medias (etiquetas sin cerrar, script cortado a mitad). Se muestra
  // el overlay de "generando" y NO se toca el iframe todavía — recién
  // se carga cuando el mensaje termina, ver loadPendingPreviews() más abajo.
  if(isStillGenerating(previewEl)){
    previewEl.classList.add('loading');
    return;
  }
  previewEl.classList.remove('loading');
  const src = previewEl.querySelector('.code-preview-src');
  if(!src) return;
  const html = src.content.textContent;
  // Evita recargar el iframe (y el parpadeo que eso produce) si el
  // código no cambió desde la última carga — puede pasar si la preview
  // ya estaba abierta y llega streaming de OTRO bloque en el mismo mensaje.
  if(frame.dataset.loadedHtml === html) return;
  frame.dataset.loadedHtml = html;
  // srcdoc en vez de document.write: aísla el HTML en su propio
  // documento dentro del sandbox sin depender de blobs ni de escribir
  // sobre el documento del iframe ya cargado.
  frame.setAttribute('srcdoc', html);
}
// Se llama cada vez que un mensaje termina de generar (ver
// streaming.js:finalizeAssistantMessage): si tenía alguna vista previa
// abierta esperando el HTML completo, la carga recién ahora.
export function loadPendingPreviews(container){
  container.querySelectorAll('.code-preview:not([hidden])').forEach(loadPreviewFrame);
}
document.addEventListener('click', (e) => {
  const playBtn = e.target.closest('.code-preview-btn');
  if(playBtn){
    const codeBlock = playBtn.closest('.code-block');
    const scroll = codeBlock.querySelector('.code-scroll');
    const preview = codeBlock.querySelector('.code-preview');
    if(scroll && preview){
      scroll.hidden = true;
      preview.hidden = false;
      loadPreviewFrame(preview);
    }
    return;
  }
  const closeBtn = e.target.closest('.code-preview-close');
  if(closeBtn){
    const codeBlock = closeBtn.closest('.code-block');
    const scroll = codeBlock.querySelector('.code-scroll');
    const preview = codeBlock.querySelector('.code-preview');
    if(scroll && preview){
      preview.hidden = true;
      scroll.hidden = false;
    }
    return;
  }
  const refreshBtn = e.target.closest('.code-preview-refresh');
  if(refreshBtn){
    const preview = refreshBtn.closest('.code-preview');
    if(preview) loadPreviewFrame(preview);
    return;
  }
});

export function renderMarkdown(text){
  try{
    return marked.parse(text || '');
  }catch(e){
    return escapeHtml(text || '');
  }
}

// ============================================================
// Reemplaza el innerHTML de un contenedor con markdown re-renderizado,
// preservando el estado de cada .code-block hijo entre actualizaciones
// de streaming: posición de scroll (o "pegado al fondo" para que un
// bloque largo siga el ritmo de la generación) y si el usuario tenía
// abierta la vista previa HTML — sin esto, cada frame recreaba los
// bloques desde cero y perdía tanto el scroll manual como la preview.
// Usado por streaming.js tanto para el cuerpo del mensaje como para el
// bloque de razonamiento.
// ============================================================
export function updateMarkdownContent(container, text){
  const blocksBefore = Array.from(container.querySelectorAll('.code-block'));
  const state = blocksBefore.map(block => {
    const scroll = block.querySelector('.code-scroll');
    const preview = block.querySelector('.code-preview');
    return {
      top: scroll ? scroll.scrollTop : 0,
      left: scroll ? scroll.scrollLeft : 0,
      pinnedBottom: scroll ? (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight) < 24 : true,
      previewOpen: preview ? !preview.hidden : false,
    };
  });

  container.innerHTML = renderMarkdown(text);

  const blocksAfter = container.querySelectorAll('.code-block');
  state.forEach((s, i) => {
    const block = blocksAfter[i];
    if(!block) return;
    const scroll = block.querySelector('.code-scroll');
    const preview = block.querySelector('.code-preview');
    if(scroll){
      scroll.scrollLeft = s.left;
      scroll.scrollTop = s.pinnedBottom ? scroll.scrollHeight : s.top;
    }
    if(s.previewOpen && preview){
      preview.hidden = false;
      if(scroll) scroll.hidden = true;
      loadPreviewFrame(preview);
    }
  });
  // Bloques de código nuevos aparecidos en este frame (sin estado
  // previo): arrancan con su scroll pegado al fondo.
  for(let i = state.length; i < blocksAfter.length; i++){
    const scroll = blocksAfter[i].querySelector('.code-scroll');
    if(scroll) scroll.scrollTop = scroll.scrollHeight;
  }
}
