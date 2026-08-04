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
  return `<div class="code-block">
    <div class="code-head">
      <span>${escapeHtml(validLang)}</span>
      <button class="code-copy-btn" type="button" data-code="${encoded}" onclick="copyCodeBlock(this)">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>copiar</span>
      </button>
    </div>
    <div class="code-scroll"><pre><code class="hljs language-${escapeHtml(validLang)}" id="${id}">${highlighted}</code></pre></div>
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

export function renderMarkdown(text){
  try{
    return marked.parse(text || '');
  }catch(e){
    return escapeHtml(text || '');
  }
}
