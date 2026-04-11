const chatEl    = document.getElementById('chat');
const messageEl = document.getElementById('message');
const sendBtn   = document.getElementById('send-btn');
const emptyEl   = document.getElementById('empty-state');
const statusDot = document.getElementById('status-dot');
const statusLbl = document.getElementById('status-label');
const charCount = document.getElementById('char-count');

let history    = [];
let streaming  = false;
const MAX_CHARS = 4000;

/* ── Utilities ── */
function setStatus(state) {
  statusDot.className = 'status-dot' + (state !== 'online' ? ' ' + state : '');
  statusLbl.textContent = state;
}

function timeStr() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function fillPrompt(text) {
  messageEl.value = text;
  messageEl.dispatchEvent(new Event('input'));
  messageEl.focus();
}

/* ── Markdown renderer ── */
function renderMarkdown(raw) {
  let s = raw
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Fenced code blocks
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const label = lang || '';
    return `<pre data-lang="${label}"><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Bold / italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headings
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Horizontal rule
  s = s.replace(/^---+$/gm, '<hr>');

  // Unordered lists
  s = s.replace(/((?:^- .+\n?)+)/gm, m => {
    const items = m.trim().split('\n').map(l => `<li>${l.slice(2)}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  s = s.replace(/((?:^\d+\. .+\n?)+)/gm, m => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Paragraphs
  const blocks = s.split(/\n\n+/);
  s = blocks.map(b => {
    if (/^<(pre|ul|ol|h[1-3]|hr)/.test(b.trim())) return b;
    return `<p>${b.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return s;
}

/* ── DOM helpers ── */
function removeEmpty() {
  if (emptyEl && emptyEl.parentNode) emptyEl.remove();
}

function appendUserMsg(text) {
  removeEmpty();
  const safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  const row = document.createElement('div');
  row.className = 'message-row user';
  row.innerHTML = `
    <div class="bubble-col">
      <div class="bubble user">${safe}</div>
      <span class="timestamp">${timeStr()}</span>
    </div>
    <div class="avatar user">you</div>`;
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function createAssistantRow() {
  const row = document.createElement('div');
  row.className = 'message-row';
  row.innerHTML = `
    <div class="avatar assistant">ai</div>
    <div class="bubble-col">
      <div class="bubble assistant" id="active-bubble">
        <div class="thinking"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
  return row;
}

function finalizeRow(row, text) {
  const bubble = row.querySelector('.bubble');
  bubble.removeAttribute('id');
  bubble.innerHTML = renderMarkdown(text || 'No response.');
  const col = row.querySelector('.bubble-col');
  const ts = document.createElement('span');
  ts.className = 'timestamp';
  ts.textContent = timeStr();
  col.appendChild(ts);
  chatEl.scrollTop = chatEl.scrollHeight;
}

/* ── Input handling ── */
messageEl.addEventListener('input', () => {
  const len = messageEl.value.length;
  sendBtn.disabled = !messageEl.value.trim() || streaming;
  messageEl.style.height = 'auto';
  messageEl.style.height = Math.min(messageEl.scrollHeight, 130) + 'px';
  charCount.textContent = len;
  charCount.className = 'char-count' + (len > MAX_CHARS * 0.85 ? ' warn' : '');
});

messageEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) submit();
  }
});

sendBtn.addEventListener('click', submit);

/* ── Submit ── */
async function submit() {
  const text = messageEl.value.trim();
  if (!text || streaming) return;

  streaming = true;
  sendBtn.disabled = true;
  setStatus('thinking');

  history.push({ role: 'user', content: text });
  appendUserMsg(text);
  messageEl.value = '';
  messageEl.style.height = 'auto';
  charCount.textContent = '0';

  const row = createAssistantRow();
  let accumulated = '';
  let firstChunk  = true;

  console.log(text)

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    const bubble  = row.querySelector('.bubble');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            if (firstChunk) { bubble.innerHTML = ''; firstChunk = false; }
            accumulated += parsed.delta.text;
            bubble.innerHTML = renderMarkdown(accumulated);
            chatEl.scrollTop = chatEl.scrollHeight;
          }
        } catch { /* skip malformed SSE lines */ }
      }
    }

    history.push({ role: 'assistant', content: accumulated || 'No response.' });
    finalizeRow(row, accumulated);
    setStatus('online');

  } catch (err) {
    const msg = err.message || 'Request failed';
    history.push({ role: 'assistant', content: msg });
    finalizeRow(row, msg);
    setStatus('error');
    showToast('Error: ' + msg);
    setTimeout(() => setStatus('online'), 3000);
  } finally {
    streaming = false;
    sendBtn.disabled = !messageEl.value.trim();
    messageEl.focus();
  }
}