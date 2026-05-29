import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Activity, Server, Database, HardDrive, Cpu, AlertCircle, Plus, X, Shield, ShieldOff, Loader2, Play, Square, Power, RefreshCw, Pencil, MemoryStick, Package, ArrowLeft, Download, Save, Settings, Network, Trash2, Check, Flame, GripVertical, FileText, ChevronRight, ChevronDown, Eye, EyeOff, LayoutGrid, Timer, ArrowUpDown, ArrowUp, ArrowDown, Monitor, Disc3, ListOrdered } from 'lucide-react';

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;
const WS_PROTO = window.location.protocol === 'https:' ? 'wss' : 'ws';
const WS_BASE = `${WS_PROTO}://${window.location.hostname}:8000/api/v1`;

const openConsole = async (clusterId, node, vmid = 0, vtype = 'node', title = 'Console') => {
  try {
    let endpoint;
    if (vtype === 'node') {
      endpoint = `${API_BASE}/clusters/${clusterId}/nodes/${node}/console`;
    } else {
      endpoint = `${API_BASE}/clusters/${clusterId}/vms/${node}/${vmid}/console`;
    }
    const res = await axios.post(endpoint);
    const { ticket, port, type: rtype } = res.data;
    const actualType = rtype || vtype;
    const isVnc = actualType === 'qemu';
    const wsUrl = `${WS_BASE}/ws/${clusterId}/console/${node}?port=${port}&ticket=${encodeURIComponent(ticket)}&vmid=${vmid}&vtype=${actualType}`;

    if (isVnc) {
      // --- noVNC per VM QEMU (grafica) ---
      const vncHtml = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${title}</title>
<style>
body{margin:0;background:#1e1e2e;overflow:hidden;height:100vh;display:flex;flex-direction:column}
#top-bar{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:#0f172a;border-bottom:1px solid #334155;font:13px sans-serif;color:#94a3b8}
#top-bar .title{font-weight:600;color:#e2e8f0}
#top-bar .status{font-size:12px}
#screen{flex:1;display:flex;align-items:center;justify-content:center}
#login-overlay{position:fixed;inset:0;background:rgba(15,15,30,0.95);display:flex;align-items:center;justify-content:center;z-index:100}
.login-box{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:28px 32px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.5)}
.login-box h3{margin:0 0 16px;color:#e2e8f0;font-size:16px;font-weight:600}
.login-box .subtitle{color:#64748b;font-size:12px;margin-top:-12px;margin-bottom:18px}
.login-btns{display:flex;gap:8px;margin-top:6px}
.login-btns button{flex:1;padding:8px;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer}
.btn-login{background:#3b82f6;color:#fff}.btn-login:hover{background:#2563eb}
.btn-skip{background:#334155;color:#94a3b8}.btn-skip:hover{background:#475569;color:#e2e8f0}
.btn-bar{padding:2px 8px;border:none;border-radius:4px;font-size:11px;cursor:pointer;background:#334155;color:#94a3b8}
.btn-bar:hover{background:#475569;color:#e2e8f0}
</style>
</head><body>
<div id="login-overlay">
  <div class="login-box">
    <h3>Console grafica (VNC)</h3>
    <div class="subtitle">${title}</div>
    <p style="color:#94a3b8;font-size:13px;margin:0 0 16px">La VM deve essere accesa per visualizzare il desktop.<br>Le credenziali vanno inserite nella schermata di login del sistema operativo.</p>
    <div class="login-btns">
      <button class="btn-login" id="btn-connect">Connetti</button>
    </div>
  </div>
</div>
<div id="top-bar">
  <span class="title">${title} (VNC)</span>
  <span>
    <button class="btn-bar" id="btn-fullscreen">Fullscreen</button>
    <button class="btn-bar" id="btn-cad">Ctrl+Alt+Del</button>
    <button class="btn-bar" id="btn-paste">Incolla</button>
    <button class="btn-bar" id="btn-clipboard">Clipboard</button>
    <span class="status" id="status">Pronto</span>
  </span>
</div>
<div id="clipboard-panel" style="display:none;position:fixed;top:36px;right:12px;z-index:50;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;box-shadow:0 4px 16px rgba(0,0,0,0.4);width:320px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <span style="color:#e2e8f0;font-size:13px;font-weight:600">Clipboard</span>
    <button id="btn-clip-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px">x</button>
  </div>
  <textarea id="clip-text" rows="5" style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:13px;padding:8px;resize:vertical;font-family:monospace" placeholder="Incolla qui il testo da inviare alla VM..."></textarea>
  <div style="display:flex;gap:6px;margin-top:8px">
    <button id="btn-clip-send" class="btn-bar" style="flex:1;padding:6px;background:#3b82f6;color:#fff">Invia alla VM</button>
    <button id="btn-clip-read" class="btn-bar" style="flex:1;padding:6px">Leggi da VM</button>
  </div>
</div>
<div id="screen"></div>
<script type="module">
import RFB from 'https://esm.sh/@novnc/novnc@1.5.0/lib/rfb.js';

const overlay = document.getElementById('login-overlay');
const statusEl = document.getElementById('status');
let rfb = null;

document.getElementById('btn-connect').onclick = () => {
  overlay.style.display = 'none';
  statusEl.textContent = 'Connessione...';
  statusEl.style.color = '#fbbf24';

  try {
    rfb = new RFB(document.getElementById('screen'), '${wsUrl.replace(/'/g, "\\'")}', {
      wsProtocols: ['binary']
    });
    rfb.scaleViewport = true;
    rfb.resizeSession = true;
    rfb.focusOnClick = true;

    rfb.addEventListener('connect', () => {
      statusEl.textContent = 'Connesso';
      statusEl.style.color = '#a6e3a1';
    });
    rfb.addEventListener('disconnect', (e) => {
      statusEl.textContent = e.detail.clean ? 'Disconnesso' : 'Connessione persa';
      statusEl.style.color = '#f38ba8';
    });
    rfb.addEventListener('credentialsrequired', () => {
      rfb.sendCredentials({password: '${ticket.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'});
    });
  } catch (err) {
    statusEl.textContent = 'Errore: ' + err.message;
    statusEl.style.color = '#f38ba8';
  }
};

document.getElementById('btn-cad').onclick = () => rfb && rfb.sendCtrlAltDel();
document.getElementById('btn-fullscreen').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
};

// Incolla rapido: legge clipboard del PC e la invia alla VM
document.getElementById('btn-paste').onclick = async () => {
  if (!rfb) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text) rfb.clipboardPasteFrom(text);
  } catch (e) {
    // Fallback: apri pannello clipboard
    document.getElementById('clipboard-panel').style.display = 'block';
  }
};

// Pannello clipboard
const clipPanel = document.getElementById('clipboard-panel');
const clipText = document.getElementById('clip-text');
document.getElementById('btn-clipboard').onclick = () => {
  clipPanel.style.display = clipPanel.style.display === 'none' ? 'block' : 'none';
};
document.getElementById('btn-clip-close').onclick = () => { clipPanel.style.display = 'none'; };
document.getElementById('btn-clip-send').onclick = () => {
  if (rfb && clipText.value) {
    rfb.clipboardPasteFrom(clipText.value);
    clipPanel.style.display = 'none';
  }
};
document.getElementById('btn-clip-read').onclick = () => {
  // Il testo dalla VM viene aggiornato tramite evento clipboard
};
if (typeof rfb !== 'undefined' && rfb) {
  rfb.addEventListener('clipboard', (e) => { clipText.value = e.detail.text; });
}
// Imposta listener clipboard dopo connessione
const origConnect = document.getElementById('btn-connect').onclick;
const patchClipboard = setInterval(() => {
  if (rfb) {
    rfb.addEventListener('clipboard', (e) => { clipText.value = e.detail.text; });
    clearInterval(patchClipboard);
  }
}, 500);
<\/script></body></html>`;

      const win = window.open('', '_blank', 'width=1024,height=768');
      if (win) { win.document.write(vncHtml); win.document.close(); }
      else alert('Popup bloccato dal browser. Consenti i popup per questo sito.');
      return;
    }

    const consoleHtml = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${title}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"><\/script>
<style>
body{margin:0;background:#1e1e2e;overflow:hidden;height:100vh}
#terminal{width:100%;height:100%}.xterm{height:100%;padding:4px}
.status{position:fixed;top:8px;right:12px;font:12px monospace;color:#888;z-index:10}
#login-overlay{position:fixed;inset:0;background:rgba(15,15,30,0.95);display:flex;align-items:center;justify-content:center;z-index:100}
.login-box{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:28px 32px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.5)}
.login-box h3{margin:0 0 6px;color:#e2e8f0;font-size:16px;font-weight:600}
.login-box .subtitle{color:#64748b;font-size:12px;margin-bottom:18px}
.login-box label{display:block;color:#94a3b8;font-size:12px;margin-bottom:4px;font-weight:500}
.login-box input{width:100%;box-sizing:border-box;padding:8px 10px;margin-bottom:12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:14px;font-family:inherit;outline:none}
.login-box input:focus{border-color:#3b82f6}
.login-btns{display:flex;gap:8px;margin-top:6px}
.login-btns button{flex:1;padding:8px;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer}
.btn-login{background:#3b82f6;color:#fff}.btn-login:hover{background:#2563eb}
.btn-skip{background:#334155;color:#94a3b8}.btn-skip:hover{background:#475569;color:#e2e8f0}
</style>
</head><body>
<div class="status" id="status">Connessione...</div>
${actualType !== 'node' ? `<div id="login-overlay">
  <div class="login-box">
    <h3>Credenziali di accesso</h3>
    <div class="subtitle">${title}</div>
    <label for="realm">Realm</label>
    <select id="realm" style="width:100%;box-sizing:border-box;padding:8px 10px;margin-bottom:12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:14px;outline:none">
      <option value="linux">Linux (login di sistema)</option>
      <option value="pam">Linux PAM standard authentication</option>
      <option value="pve">Proxmox VE authentication</option>
    </select>
    <label for="user">Username</label>
    <input type="text" id="user" value="root" autocomplete="username" spellcheck="false">
    <label for="pass">Password</label>
    <input type="password" id="pass" autocomplete="current-password">
    <div class="login-btns">
      <button class="btn-skip" id="btn-skip">Salta</button>
      <button class="btn-login" id="btn-login">Accedi</button>
    </div>
  </div>
</div>` : ''}
<div id="terminal"></div>
<script>
const term = new Terminal({cursorBlink:true,fontSize:14,fontFamily:'JetBrains Mono,Fira Code,monospace',theme:{background:'#1e1e2e',foreground:'#cdd6f4'}});
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();
window.addEventListener('resize',()=>fitAddon.fit());

const isNode = '${actualType}' === 'node';
let pendingLogin = null;
let wsReady = false;
let outputBuffer = '';
const overlay = document.getElementById('login-overlay');
const userInput = document.getElementById('user');
const passInput = document.getElementById('pass');

function sendStr(s) { if (ws.readyState === 1) ws.send('0:' + s.length + ':' + s); }

if (!isNode && overlay) {
  function doLogin() {
    const realm = document.getElementById('realm').value;
    let u = userInput.value.trim();
    const p = passInput.value;
    if (realm !== 'linux' && u && !u.includes('@')) {
      u = u + '@' + realm;
    }
    overlay.style.display = 'none';
    term.focus();
    if (u || p) {
      pendingLogin = { user: u, pass: p, sentUser: false, sentPass: false };
      if (wsReady) sendStr(u + '\\r');
    }
  }

  document.getElementById('btn-login').onclick = doLogin;
  document.getElementById('btn-skip').onclick = () => {
    overlay.style.display = 'none';
    term.focus();
  };
  passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') passInput.focus(); });
  setTimeout(() => passInput.focus(), 100);
}

const ws = new WebSocket('${wsUrl.replace(/'/g, "\\'")}');
const statusEl = document.getElementById('status');

ws.onopen = () => {
  statusEl.textContent = 'Connesso';
  statusEl.style.color = '#a6e3a1';
  setTimeout(() => statusEl.style.display = 'none', 2000);
  const dims = fitAddon.proposeDimensions();
  if (dims) ws.send('1:' + dims.cols + ':' + dims.rows + ':');
  wsReady = true;
  if (isNode) term.focus();
  // Se l'utente ha già cliccato Login prima che il WS fosse pronto
  if (pendingLogin && pendingLogin.user) setTimeout(() => sendStr(pendingLogin.user + '\\r'), 800);
};

ws.onmessage = (ev) => {
  const data = ev.data;
  if (data && data.length > 0) {
    term.write(data);
    // Auto-login: attendi prompt password e invia
    if (pendingLogin && !pendingLogin.sentPass) {
      outputBuffer += data;
      if (/password/i.test(outputBuffer)) {
        sendStr(pendingLogin.pass + '\\r');
        pendingLogin.sentPass = true;
        pendingLogin = null;
        outputBuffer = '';
      }
      // Limita buffer
      if (outputBuffer.length > 500) outputBuffer = outputBuffer.slice(-200);
    }
  }
};

ws.onerror = () => { statusEl.textContent = 'Errore connessione'; statusEl.style.color = '#f38ba8'; };
ws.onclose = () => { statusEl.textContent = 'Disconnesso'; statusEl.style.color = '#f38ba8'; statusEl.style.display = 'block'; term.write('\\r\\n\\x1b[31mConnessione chiusa.\\x1b[0m\\r\\n'); };

term.onData((data) => {
  if (ws.readyState === 1) ws.send('0:' + data.length + ':' + data);
});

term.onResize(({cols, rows}) => {
  if (ws.readyState === 1) ws.send('1:' + cols + ':' + rows + ':');
});
<\/script></body></html>`;

    const win = window.open('', '_blank', 'width=900,height=600');
    if (win) {
      win.document.write(consoleHtml);
      win.document.close();
    } else {
      alert('Popup bloccato dal browser. Consenti i popup per questo sito.');
    }
  } catch (err) {
    alert(typeof traduciErrore === 'function' ? traduciErrore(err) : (err.message || 'Errore apertura console'));
  }
};

const traduciErrore = (err) => {
  const msg = err.response?.data?.detail || err.message || String(err);
  const map = {
    'Network Error': 'Errore di rete: impossibile raggiungere il server.',
    'timeout': 'Timeout: il server non ha risposto in tempo.',
    'Request failed with status code 401': 'Sessione scaduta. Effettua nuovamente il login.',
    'Request failed with status code 403': 'Permesso negato. Non hai i privilegi necessari.',
    'Request failed with status code 404': 'Risorsa non trovata.',
    'Request failed with status code 500': 'Errore interno del server. Riprova tra poco.',
    'Request failed with status code 502': 'Il server non risponde (502). Verifica che Proxmox sia raggiungibile.',
    'Request failed with status code 503': 'Servizio temporaneamente non disponibile.',
    'Connection refused': 'Connessione rifiutata. Verifica che il server sia attivo.',
    'EHOSTUNREACH': 'Host non raggiungibile. Verifica la connessione di rete.',
    'ECONNREFUSED': 'Connessione rifiutata dal server.',
    'ETIMEDOUT': 'Connessione scaduta per timeout.',
  };
  for (const [en, it] of Object.entries(map)) {
    if (msg.includes(en)) return it;
  }
  if (msg.includes('authentication failure')) return 'Autenticazione fallita. Verifica le credenziali del cluster.';
  if (msg.includes('permission denied')) return 'Permesso negato per questa operazione.';
  if (msg.includes('already exists')) return 'Esiste già un elemento con questo nome/ID.';
  if (msg.includes('not found')) return 'Elemento non trovato. Potrebbe essere stato rimosso.';
  if (msg.includes('is running')) return 'Operazione non possibile: la VM/container è in esecuzione.';
  if (msg.includes('is locked')) return 'Risorsa bloccata da un\'altra operazione in corso.';
  if (msg.includes('too many requests')) return 'Troppe richieste. Attendi qualche secondo e riprova.';
  return msg;
};

// ---- Sortable table utilities ----
const useSortable = (defaultKey = null, defaultDir = 'asc') => {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);
  const requestSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const sortFn = (data) => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  };
  return { sortKey, sortDir, requestSort, sortFn };
};

const SortTh = ({ label, sortKey, current, dir, onSort, className = '' }) => (
  <th className={`px-3 py-2 text-left cursor-pointer select-none hover:text-slate-200 transition-colors ${className}`}
    onClick={() => onSort(sortKey)}>
    <span className="inline-flex items-center gap-1">
      {label}
      {current === sortKey ? (dir === 'asc' ? <ArrowUp className="w-3 h-3"/> : <ArrowDown className="w-3 h-3"/>) : <ArrowUpDown className="w-3 h-3 opacity-30"/>}
    </span>
  </th>
);

// Setup axios auth interceptor
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('glu2k_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
axios.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('glu2k_token');
    localStorage.removeItem('glu2k_user');
    window.dispatchEvent(new Event('glu2k_logout'));
  }
  return Promise.reject(err);
});

const LoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API_BASE}/auth/login`, { username, password });
      localStorage.setItem('glu2k_token', res.data.access_token);
      localStorage.setItem('glu2k_user', JSON.stringify(res.data.user));
      onLogin(res.data.user);
    } catch (err) {
      setError(err.response?.data?.detail || 'Errore login');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-xl border border-slate-700 p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-400 flex items-center justify-center gap-2">
            <Server className="w-8 h-8"/> GLU2K
          </h1>
          <p className="text-slate-400 text-sm mt-2">Proxmox Manager</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Username</label>
            <input type="text" required autoFocus value={username} onChange={e => setUsername(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"/>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"/>
          </div>
          {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Accedi'}
          </button>
        </form>
        <p className="text-xs text-slate-500 text-center mt-6">Default: admin / admin · Cambiala subito!</p>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color, onClick }) => (
  <div onClick={onClick}
    className={`bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700 ${onClick ? 'cursor-pointer hover:border-blue-500 hover:bg-slate-700/50 transition-all' : ''}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-slate-400 text-sm font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-white mt-2">{value}</h3>
      </div>
      <div className={`p-3 rounded-full ${color} bg-opacity-20`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
    </div>
  </div>
);

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatUptime = (seconds) => {
  if (!seconds) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const LineChart = ({ data, series, height = 180, formatY }) => {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(500);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width || 500);
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length === 0) return <div ref={containerRef} className="text-slate-500 text-sm p-4">Nessun dato</div>;
  const padL = 60, padR = 10, padT = 10, padB = 30;
  const w = width - padL - padR, h = height - padT - padB;
  const times = data.map(d => d.time);
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const allVals = data.flatMap(d => series.map(s => d[s.key] || 0));
  const vMax = Math.max(1, ...allVals);
  const x = t => padL + ((t - tMin) / (tMax - tMin || 1)) * w;
  const y = v => padT + h - (v / vMax) * h;
  const fmt = formatY || (v => v.toFixed(0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => vMax * f);
  const xticks = 5;
  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg width={width} height={height} className="block">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={padL+w} y2={y(t)} stroke="#334155" strokeDasharray="2 2"/>
            <text x={padL-6} y={y(t)+3} textAnchor="end" fontSize="10" fill="#64748b">{fmt(t)}</text>
          </g>
        ))}
        {Array.from({length: xticks}, (_, i) => {
          const t = tMin + (tMax-tMin)*(i/(xticks-1));
          const d = new Date(t*1000);
          const label = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
          return <text key={i} x={x(t)} y={height-10} textAnchor="middle" fontSize="10" fill="#64748b">{label}</text>;
        })}
        {series.map(s => {
          const path = data.map((d, i) => `${i===0?'M':'L'} ${x(d.time)} ${y(d[s.key]||0)}`).join(' ');
          return <path key={s.key} d={path} fill="none" stroke={s.color} strokeWidth="2"/>;
        })}
        <g transform={`translate(${padL}, 2)`}>
          {series.map((s, i) => (
            <g key={s.key} transform={`translate(${i*110}, 0)`}>
              <rect width="10" height="3" fill={s.color} y="4"/>
              <text x="14" y="9" fontSize="10" fill="#94a3b8">{s.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};

// Helper soglie: >90% rosso, >75% arancione, altrimenti colore base
const thresholdColor = (pct, baseColor = 'bg-green-500') => {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 75) return 'bg-orange-500';
  return baseColor;
};
const thresholdTextColor = (pct, baseClass = 'text-slate-100') => {
  if (pct >= 90) return 'text-red-400';
  if (pct >= 75) return 'text-orange-400';
  return baseClass;
};
const thresholdBadge = (pct) => {
  if (pct >= 90) return { bg: 'bg-red-900/40', text: 'text-red-400', label: 'CRITICO' };
  if (pct >= 75) return { bg: 'bg-orange-900/40', text: 'text-orange-400', label: 'WARN' };
  return null;
};

const ProgressBar = ({ value, max, color = 'bg-blue-500' }) => {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-slate-700 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{width: `${pct}%`}}></div>
    </div>
  );
};

const NodeDetail = ({ cluster, nodeName, onBack, onSelectVM, refreshInterval = 3 }) => {
  const [status, setStatus] = useState(null);
  const [storage, setStorage] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [network, setNetwork] = useState([]);
  const [vms, setVms] = useState([]);
  const [rrd, setRrd] = useState([]);
  const [timeframe, setTimeframe] = useState('hour');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewIface, setShowNewIface] = useState(false);
  const [editingIface, setEditingIface] = useState(null);
  const [ifaceType, setIfaceType] = useState('bridge');
  const [ifaceForm, setIfaceForm] = useState({ iface: '', address: '', netmask: '', gateway: '', bridge_ports: '', slaves: '', bond_mode: 'balance-rr', 'vlan-raw-device': '', autostart: 1, mtu: '', comments: '' });
  const [netBusy, setNetBusy] = useState(false);
  const storageSort = useSortable('storage', 'asc');
  const netSort = useSortable('iface', 'asc');
  const nodeVmSort = useSortable('vmid', 'asc');
  const updSort = useSortable('Package', 'asc');

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/summary?timeframe=${timeframe}`);
      const d = res.data;
      setStatus(d.status);
      setStorage(d.storage || []);
      setVms(d.vms || []);
      setUpdates(d.updates || []);
      setNetwork(d.network || []);
      setRrd(d.rrddata || []);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetIfaceForm = () => {
    setIfaceForm({ iface: '', address: '', netmask: '', gateway: '', bridge_ports: '', slaves: '', bond_mode: 'balance-rr', 'vlan-raw-device': '', autostart: 1, mtu: '', comments: '' });
    setShowNewIface(false);
    setEditingIface(null);
    setIfaceType('bridge');
  };

  const saveIface = async () => {
    // Validazione nomi
    if (!editingIface) {
      if (ifaceType === 'bridge' && !ifaceForm.iface.startsWith('vmbr')) { alert("Nome bridge deve iniziare con 'vmbr'"); return; }
      if (ifaceType === 'bond' && !ifaceForm.iface.startsWith('bond')) { alert("Nome bond deve iniziare con 'bond'"); return; }
      if (ifaceType === 'vlan' && !ifaceForm.iface.includes('.') && !ifaceForm.iface.startsWith('vlan')) { alert("Nome VLAN deve essere tipo 'vmbr0.10' o 'vlan10'"); return; }
    }
    setNetBusy(true);
    try {
      const payload = { type: ifaceType, ...ifaceForm };
      Object.keys(payload).forEach(k => { if (payload[k] === '' || payload[k] === null) delete payload[k]; });
      if (editingIface) {
        delete payload.iface;
        delete payload.type;
        await axios.put(`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/network/${editingIface}`, payload);
      } else {
        await axios.post(`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/network`, payload);
      }
      resetIfaceForm();
      fetchData();
    } catch (err) {
      alert(traduciErrore(err));
    } finally {
      setNetBusy(false);
    }
  };

  const startEditIface = async (iface) => {
    try {
      const res = await axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/network/${iface.iface}`);
      const cfg = res.data;
      setIfaceType(iface.type);
      setEditingIface(iface.iface);
      setIfaceForm({
        iface: iface.iface,
        address: cfg.address || '',
        netmask: cfg.netmask || '',
        gateway: cfg.gateway || '',
        bridge_ports: cfg.bridge_ports || '',
        slaves: cfg.slaves || '',
        bond_mode: cfg.bond_mode || 'balance-rr',
        'vlan-raw-device': cfg['vlan-raw-device'] || '',
        autostart: cfg.autostart ?? 1,
        mtu: cfg.mtu || '',
        comments: cfg.comments || '',
      });
      setShowNewIface(true);
    } catch (err) {
      alert('Errore lettura: ' + traduciErrore(err));
    }
  };

  const applyNetwork = async () => {
    if (!confirm("Applicare le modifiche di rete? Potrebbe causare una breve disconnessione.")) return;
    setNetBusy(true);
    try {
      await axios.post(`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/network/apply`);
      setTimeout(fetchData, 2000);
    } catch (err) {
      alert(traduciErrore(err));
    } finally {
      setNetBusy(false);
    }
  };

  const revertNetwork = async () => {
    if (!confirm("Annullare le modifiche di rete non ancora applicate?")) return;
    setNetBusy(true);
    try {
      await axios.post(`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/network/revert`);
      fetchData();
    } catch (err) {
      alert(traduciErrore(err));
    } finally {
      setNetBusy(false);
    }
  };

  const deleteIface = async (iface) => {
    if (!confirm(`Eliminare l'interfaccia ${iface}? Modifica pending, richiede Apply.`)) return;
    try {
      await axios.delete(`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/network/${iface}`);
      fetchData();
    } catch (err) {
      alert(traduciErrore(err));
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(() => fetchData(true), refreshInterval * 1000);
    return () => clearInterval(iv);
  }, [nodeName, timeframe, refreshInterval]);

  const sectionMeta = [
    { id: 'resources', title: 'Risorse (CPU/RAM/Disco/Swap)' },
    { id: 'charts', title: 'Metriche Storiche' },
    { id: 'storage', title: 'Storage Volumi' },
    { id: 'network', title: 'Networking' },
    { id: 'vms', title: 'VM/CT di questo nodo' },
    { id: 'tasks', title: 'Log Tasks Nodo' },
    { id: 'fwlog', title: 'Log Firewall Nodo' },
    { id: 'updates', title: 'Aggiornamenti' },
  ];
  const { sections, toggle, move, reset } = useSectionManager(`glu2k_node_sections`, sectionMeta);
  const isVisible = (id) => sections.find(s => s.id === id)?.visible;

  const refreshAptList = async () => {
    setRefreshing(true);
    try {
      await axios.post(`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/updates/refresh`);
      setTimeout(fetchData, 2000);
    } catch (err) {
      alert(traduciErrore(err));
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-12 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin mr-3" /> Caricamento dati nodo...
    </div>
  );

  if (error) return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-slate-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4"/> Torna al cluster
      </button>
      <div className="p-6 bg-red-900/30 border border-red-700 rounded-lg text-red-300">
        <div className="flex items-center gap-2 font-bold mb-2"><AlertCircle className="w-5 h-5"/> Errore</div>
        <code className="text-sm">{error}</code>
      </div>
    </div>
  );

  const mem = status?.memory || {};
  const rootfs = status?.rootfs || {};
  const swap = status?.swap || {};
  const cpuUsage = (status?.cpu || 0) * 100;
  const loadavg = status?.loadavg || [];

  const renderers = {};
  renderers.resources = (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-800 p-5 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-slate-400 text-sm font-medium"><Cpu className="w-4 h-4"/> CPU</div>
            <span className={`text-2xl font-bold ${thresholdTextColor(cpuUsage)}`}>{cpuUsage.toFixed(1)}%</span>
          </div>
          <ProgressBar value={cpuUsage} max={100} color="bg-green-500"/>
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>{status?.cpuinfo?.cpus} core · {status?.cpuinfo?.model?.split('@')[0]}</span>
            <span>load: {loadavg.join(' / ')}</span>
          </div>
        </div>

        <div className="bg-slate-800 p-5 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-slate-400 text-sm font-medium"><MemoryStick className="w-4 h-4"/> RAM</div>
            <span className={`text-2xl font-bold ${thresholdTextColor(mem.total ? (mem.used/mem.total)*100 : 0)}`}>{mem.total ? ((mem.used/mem.total)*100).toFixed(1) : 0}%</span>
          </div>
          <ProgressBar value={mem.used} max={mem.total} color="bg-blue-500"/>
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>{formatBytes(mem.used)} / {formatBytes(mem.total)}</span>
            <span>libera: {formatBytes(mem.free)}</span>
          </div>
        </div>

        <div className="bg-slate-800 p-5 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-slate-400 text-sm font-medium"><HardDrive className="w-4 h-4"/> Disco root (/)</div>
            <span className={`text-2xl font-bold ${thresholdTextColor(rootfs.total ? (rootfs.used/rootfs.total)*100 : 0)}`}>{rootfs.total ? ((rootfs.used/rootfs.total)*100).toFixed(1) : 0}%</span>
          </div>
          <ProgressBar value={rootfs.used} max={rootfs.total} color="bg-purple-500"/>
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>{formatBytes(rootfs.used)} / {formatBytes(rootfs.total)}</span>
            <span>libero: {formatBytes(rootfs.avail)}</span>
          </div>
        </div>

        <div className="bg-slate-800 p-5 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-slate-400 text-sm font-medium"><Database className="w-4 h-4"/> Swap</div>
            <span className={`text-2xl font-bold ${thresholdTextColor(swap.total ? (swap.used/swap.total)*100 : 0)}`}>{swap.total ? ((swap.used/swap.total)*100).toFixed(1) : 0}%</span>
          </div>
          <ProgressBar value={swap.used} max={swap.total || 1} color="bg-orange-500"/>
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>{formatBytes(swap.used)} / {formatBytes(swap.total)}</span>
          </div>
        </div>
      </div>
  );
  renderers.storage = (
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-700 font-bold flex items-center gap-2">
          <HardDrive className="w-4 h-4"/> Storage Volumi
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <SortTh label="Nome" sortKey="storage" current={storageSort.sortKey} dir={storageSort.sortDir} onSort={storageSort.requestSort} className="px-4"/>
              <SortTh label="Tipo" sortKey="type" current={storageSort.sortKey} dir={storageSort.sortDir} onSort={storageSort.requestSort} className="px-4"/>
              <SortTh label="Contenuto" sortKey="content" current={storageSort.sortKey} dir={storageSort.sortDir} onSort={storageSort.requestSort} className="px-4"/>
              <th className="px-4 py-2 text-left">Uso</th>
              <SortTh label="Utilizzato" sortKey="used" current={storageSort.sortKey} dir={storageSort.sortDir} onSort={storageSort.requestSort} className="px-4"/>
              <SortTh label="Totale" sortKey="total" current={storageSort.sortKey} dir={storageSort.sortDir} onSort={storageSort.requestSort} className="px-4"/>
              <SortTh label="Stato" sortKey="active" current={storageSort.sortKey} dir={storageSort.sortDir} onSort={storageSort.requestSort} className="px-4"/>
            </tr>
          </thead>
          <tbody>
            {storageSort.sortFn(storage).map(s => (
              <tr key={s.storage} className="border-t border-slate-700">
                <td className="px-4 py-3 font-medium">{s.storage}</td>
                <td className="px-4 py-3 text-slate-400 uppercase text-xs">{s.type}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{s.content}</td>
                <td className="px-4 py-3 w-48">
                  {s.total > 0 && <>
                    <ProgressBar value={s.used} max={s.total} color="bg-blue-500"/>
                    <div className={`text-xs mt-1 font-bold ${thresholdTextColor(s.total ? (s.used/s.total)*100 : 0, 'text-slate-500')}`}>{((s.used/s.total)*100).toFixed(1)}%</div>
                  </>}
                </td>
                <td className="px-4 py-3 text-slate-400">{formatBytes(s.used)}</td>
                <td className="px-4 py-3 text-slate-400">{formatBytes(s.total)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${s.active ? 'bg-green-900/40 text-green-400' : 'bg-slate-700 text-slate-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.active ? 'bg-green-400' : 'bg-slate-500'}`}></span>
                    {s.active ? 'attivo' : 'offline'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
  renderers.charts = (
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="font-bold flex items-center gap-2"><Activity className="w-4 h-4"/> Metriche Storiche</div>
          <select value={timeframe} onChange={e => setTimeframe(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
            <option value="hour">Ultima ora</option>
            <option value="day">Ultimo giorno</option>
            <option value="week">Ultima settimana</option>
            <option value="month">Ultimo mese</option>
            <option value="year">Ultimo anno</option>
          </select>
        </div>
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">Traffico di Rete (B/s)</div>
            <LineChart data={rrd} series={[
              {key:'netin', label:'IN', color:'#3b82f6'},
              {key:'netout', label:'OUT', color:'#8b5cf6'}
            ]} formatY={v => formatBytes(v)+'/s'}/>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">CPU (%)</div>
            <LineChart data={rrd.map(d => ({...d, cpupct: (d.cpu||0)*100}))} series={[
              {key:'cpupct', label:'CPU', color:'#10b981'}
            ]} formatY={v => v.toFixed(0)+'%'}/>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">Memoria (B)</div>
            <LineChart data={rrd} series={[
              {key:'memused', label:'Used', color:'#f59e0b'},
              {key:'memtotal', label:'Total', color:'#64748b'}
            ]} formatY={v => formatBytes(v)}/>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">Load Average</div>
            <LineChart data={rrd} series={[
              {key:'loadavg', label:'Load', color:'#ec4899'}
            ]} formatY={v => v.toFixed(2)}/>
          </div>
        </div>
      </div>
  );
  renderers.network = (
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="font-bold flex items-center gap-2"><Network className="w-4 h-4"/> Networking</div>
          <div className="flex gap-2">
            {network.some(n => n.pending) && (
              <>
                <button onClick={revertNetwork} disabled={netBusy} className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs">
                  Annulla Pending
                </button>
                <button onClick={applyNetwork} disabled={netBusy} className="flex items-center gap-1 px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-xs">
                  <Check className="w-3.5 h-3.5"/> Applica
                </button>
              </>
            )}
            <select value={ifaceType} onChange={e => setIfaceType(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
              <option value="bridge">Bridge</option>
              <option value="bond">Bond</option>
              <option value="vlan">VLAN</option>
            </select>
            <button onClick={() => { resetIfaceForm(); setShowNewIface(true); }} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs">
              <Plus className="w-3.5 h-3.5"/> Nuova
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <SortTh label="Interfaccia" sortKey="iface" current={netSort.sortKey} dir={netSort.sortDir} onSort={netSort.requestSort} className="px-4"/>
              <SortTh label="Tipo" sortKey="type" current={netSort.sortKey} dir={netSort.sortDir} onSort={netSort.requestSort} className="px-4"/>
              <SortTh label="Indirizzo/CIDR" sortKey="cidr" current={netSort.sortKey} dir={netSort.sortDir} onSort={netSort.requestSort} className="px-4"/>
              <SortTh label="Gateway" sortKey="gateway" current={netSort.sortKey} dir={netSort.sortDir} onSort={netSort.requestSort} className="px-4"/>
              <th className="px-4 py-2 text-left">Ports/Slaves</th>
              <SortTh label="Autostart" sortKey="autostart" current={netSort.sortKey} dir={netSort.sortDir} onSort={netSort.requestSort} className="px-4"/>
              <SortTh label="Stato" sortKey="active" current={netSort.sortKey} dir={netSort.sortDir} onSort={netSort.requestSort} className="px-4"/>
              <th className="px-4 py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {netSort.sortFn(network).map(n => (
              <tr key={n.iface} className={`border-t border-slate-700 ${n.pending ? 'bg-yellow-900/10' : ''}`}>
                <td className="px-4 py-2 font-mono font-medium">{n.iface}{n.pending && <span className="ml-2 text-xs text-yellow-400">(pending)</span>}</td>
                <td className="px-4 py-2 text-slate-400 text-xs uppercase">{n.type}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-300">{n.cidr || n.address || '-'}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-400">{n.gateway || '-'}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-400">{n.bridge_ports || n.slaves || '-'}</td>
                <td className="px-4 py-2">{n.autostart ? <Check className="w-4 h-4 text-green-400"/> : <X className="w-4 h-4 text-slate-600"/>}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${n.active ? 'bg-green-900/40 text-green-400' : 'bg-slate-700 text-slate-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${n.active ? 'bg-green-400' : 'bg-slate-500'}`}></span>
                    {n.active ? 'up' : 'down'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex gap-1 justify-end">
                    {(n.type === 'bridge' || n.type === 'bond' || n.type === 'vlan' || n.type === 'eth') && (
                      <button onClick={() => startEditIface(n)} className="p-1 text-slate-500 hover:text-blue-400" title="Modifica">
                        <Pencil className="w-4 h-4"/>
                      </button>
                    )}
                    {(n.type === 'bridge' || n.type === 'bond' || n.type === 'vlan') && (
                      <button onClick={() => deleteIface(n.iface)} className="p-1 text-slate-500 hover:text-red-400" title="Elimina">
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {showNewIface && (
          <div className="p-4 border-t border-slate-700 bg-slate-900/30">
            <div className="font-medium mb-3 text-sm">
              {editingIface ? `Modifica ${editingIface}` : `Nuova ${ifaceType}`}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome *</label>
                <input type="text" disabled={!!editingIface}
                  placeholder={ifaceType === 'bridge' ? 'vmbr1' : ifaceType === 'bond' ? 'bond0' : 'vmbr0.10'}
                  value={ifaceForm.iface}
                  onChange={e => setIfaceForm({...ifaceForm, iface: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono disabled:opacity-50"/>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">IP (CIDR o indirizzo)</label>
                <input type="text" placeholder="10.0.0.1/24" value={ifaceForm.address}
                  onChange={e => setIfaceForm({...ifaceForm, address: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Netmask (opz.)</label>
                <input type="text" placeholder="255.255.255.0" value={ifaceForm.netmask}
                  onChange={e => setIfaceForm({...ifaceForm, netmask: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Gateway</label>
                <input type="text" value={ifaceForm.gateway}
                  onChange={e => setIfaceForm({...ifaceForm, gateway: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">MTU</label>
                <input type="text" placeholder="1500" value={ifaceForm.mtu}
                  onChange={e => setIfaceForm({...ifaceForm, mtu: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Commento</label>
                <input type="text" value={ifaceForm.comments}
                  onChange={e => setIfaceForm({...ifaceForm, comments: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm"/>
              </div>
              {ifaceType === 'bridge' && (
                <div className="md:col-span-3">
                  <label className="text-xs text-slate-400 block mb-1">Bridge Ports (es. nic0, bond0)</label>
                  <input type="text" placeholder="nic0 o vuoto per internal" value={ifaceForm.bridge_ports}
                    onChange={e => setIfaceForm({...ifaceForm, bridge_ports: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
              )}
              {ifaceType === 'bond' && (
                <>
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-400 block mb-1">Slaves (interfacce fisiche, separate da spazio)</label>
                    <input type="text" placeholder="nic0 nic1" value={ifaceForm.slaves}
                      onChange={e => setIfaceForm({...ifaceForm, slaves: e.target.value})}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Modalità Bond</label>
                    <select value={ifaceForm.bond_mode} onChange={e => setIfaceForm({...ifaceForm, bond_mode: e.target.value})}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm">
                      <option value="balance-rr">balance-rr (round-robin)</option>
                      <option value="active-backup">active-backup</option>
                      <option value="balance-xor">balance-xor</option>
                      <option value="broadcast">broadcast</option>
                      <option value="802.3ad">802.3ad (LACP)</option>
                      <option value="balance-tlb">balance-tlb</option>
                      <option value="balance-alb">balance-alb</option>
                    </select>
                  </div>
                </>
              )}
              {ifaceType === 'vlan' && (
                <div className="md:col-span-3">
                  <label className="text-xs text-slate-400 block mb-1">VLAN Raw Device (interfaccia padre)</label>
                  <input type="text" placeholder="vmbr0 (per vmbr0.10 lasciare vuoto)" value={ifaceForm['vlan-raw-device']}
                    onChange={e => setIfaceForm({...ifaceForm, 'vlan-raw-device': e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!Number(ifaceForm.autostart)}
                  onChange={e => setIfaceForm({...ifaceForm, autostart: e.target.checked ? 1 : 0})}/>
                Autostart
              </label>
              <div className="ml-auto flex gap-2">
                <button onClick={resetIfaceForm} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm">Annulla</button>
                <button onClick={saveIface} disabled={netBusy} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm">
                  {netBusy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                  {editingIface ? 'Salva' : 'Crea'}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Le modifiche restano <strong>pending</strong> fino al click su <strong>Applica</strong>.
            </p>
          </div>
        )}
      </div>
  );
  renderers.vms = (
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-700 font-bold flex items-center gap-2">
          <Cpu className="w-4 h-4"/> VM/CT su {nodeName}
          <span className="ml-2 text-xs text-slate-400 font-normal">({vms.length} totali, {vms.filter(v => v.status==='running').length} running)</span>
        </div>
        {vms.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">Nessuna VM/CT su questo nodo</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
              <tr>
                <SortTh label="Stato" sortKey="status" current={nodeVmSort.sortKey} dir={nodeVmSort.sortDir} onSort={nodeVmSort.requestSort} className="px-4"/>
                <SortTh label="VMID" sortKey="vmid" current={nodeVmSort.sortKey} dir={nodeVmSort.sortDir} onSort={nodeVmSort.requestSort} className="px-4"/>
                <SortTh label="Nome" sortKey="name" current={nodeVmSort.sortKey} dir={nodeVmSort.sortDir} onSort={nodeVmSort.requestSort} className="px-4"/>
                <SortTh label="Tipo" sortKey="type" current={nodeVmSort.sortKey} dir={nodeVmSort.sortDir} onSort={nodeVmSort.requestSort} className="px-4"/>
                <SortTh label="CPU" sortKey="cpu" current={nodeVmSort.sortKey} dir={nodeVmSort.sortDir} onSort={nodeVmSort.requestSort} className="px-4"/>
                <SortTh label="RAM" sortKey="mem" current={nodeVmSort.sortKey} dir={nodeVmSort.sortDir} onSort={nodeVmSort.requestSort} className="px-4"/>
                <SortTh label="Uptime" sortKey="uptime" current={nodeVmSort.sortKey} dir={nodeVmSort.sortDir} onSort={nodeVmSort.requestSort} className="px-4"/>
              </tr>
            </thead>
            <tbody>
              {nodeVmSort.sortFn(vms).map(vm => {
                const isRunning = vm.status === 'running';
                const memPct = vm.maxmem ? Math.round((vm.mem / vm.maxmem) * 100) : 0;
                return (
                  <tr key={vm.id} className="border-t border-slate-700 hover:bg-slate-700/30">
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${isRunning ? 'bg-green-900/40 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-400' : 'bg-slate-500'}`}></span>{vm.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-400">{vm.vmid}</td>
                    <td className="px-4 py-2 font-medium">
                      {onSelectVM ? (
                        <button onClick={() => onSelectVM(vm)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-500 rounded text-xs font-medium transition-all">
                          <Settings className="w-3 h-3"/>{vm.name}
                        </button>
                      ) : vm.name}
                    </td>
                    <td className="px-4 py-2 uppercase text-xs text-slate-400">{vm.type}</td>
                    <td className="px-4 py-2 text-slate-400 text-xs">{isRunning ? `${(vm.cpu*100).toFixed(1)}%` : '-'}</td>
                    <td className="px-4 py-2 text-slate-400 text-xs">{isRunning ? `${memPct}%` : '-'}</td>
                    <td className="px-4 py-2 text-slate-400 text-xs">{formatUptime(vm.uptime)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
  );
  renderers.tasks = (
        <TasksSection tasksUrl={`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/tasks?limit=50`} cluster={cluster} title={`Log Tasks · ${nodeName}`}/>
  );
  renderers.fwlog = (
        <FirewallLogSection logUrl={`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/firewall/log`} title={`Log Firewall · ${nodeName}`}/>
  );
  renderers.updates = (
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="font-bold flex items-center gap-2">
            <Package className="w-4 h-4"/> Aggiornamenti disponibili
            <span className={`px-2 py-0.5 rounded-full text-xs ${updates.length > 0 ? 'bg-yellow-900/40 text-yellow-400' : 'bg-green-900/40 text-green-400'}`}>
              {updates.length}
            </span>
          </div>
          <button onClick={refreshAptList} disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm disabled:opacity-50">
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Download className="w-3.5 h-3.5"/>}
            Refresh apt lists
          </button>
        </div>
        {updates.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">Sistema aggiornato</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase sticky top-0">
                <tr>
                  <SortTh label="Pacchetto" sortKey="Package" current={updSort.sortKey} dir={updSort.sortDir} onSort={updSort.requestSort} className="px-4"/>
                  <SortTh label="Attuale" sortKey="OldVersion" current={updSort.sortKey} dir={updSort.sortDir} onSort={updSort.requestSort} className="px-4"/>
                  <SortTh label="Nuova" sortKey="Version" current={updSort.sortKey} dir={updSort.sortDir} onSort={updSort.requestSort} className="px-4"/>
                  <SortTh label="Priority" sortKey="Priority" current={updSort.sortKey} dir={updSort.sortDir} onSort={updSort.requestSort} className="px-4"/>
                </tr>
              </thead>
              <tbody>
                {updSort.sortFn(updates).map((u, i) => (
                  <tr key={`${u.Package}-${u.Version}-${i}`} className="border-t border-slate-700">
                    <td className="px-4 py-2 font-mono text-xs">{u.Package}</td>
                    <td className="px-4 py-2 text-slate-400 font-mono text-xs">{u.OldVersion}</td>
                    <td className="px-4 py-2 text-green-400 font-mono text-xs">{u.Version}</td>
                    <td className="px-4 py-2 text-xs text-slate-400">{u.Priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
  );

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-slate-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4"/> Torna al cluster
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-2"><Server className="w-6 h-6 text-blue-400"/> {nodeName}</h3>
          <p className="text-slate-400 text-sm mt-1">
            {status?.pveversion} · kernel {status?.['current-kernel']?.release} · uptime {formatUptime(status?.uptime)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={async () => {
            const vmCount = vms.filter(v => v.status==='running').length;
            const msg = `⚠️ REBOOT del nodo "${nodeName}"?\n\n` +
              `Questo riavvierà il nodo Proxmox fisico!\n` +
              `- ${vmCount} VM/CT in esecuzione verranno fermate\n` +
              `- Il nodo sarà offline per alcuni minuti\n` +
              `- Tutti i servizi ospitati saranno irraggiungibili\n\n` +
              `Digita "riavvia" per confermare:`;
            const input = prompt(msg);
            if (input?.toLowerCase() !== 'riavvia') return;
            try {
              await axios.post(`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/action?action=reboot`);
              alert(`Reboot di ${nodeName} avviato.`);
            } catch (err) { alert(traduciErrore(err)); }
          }} title="Reboot nodo" className="flex items-center gap-1 px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-xs font-medium text-white">
            <RefreshCw className="w-3.5 h-3.5"/> Reboot
          </button>
          <button onClick={async () => {
            const vmCount = vms.filter(v => v.status==='running').length;
            const msg = `🛑 SHUTDOWN del nodo "${nodeName}"?\n\n` +
              `ATTENZIONE: questa azione spegne il nodo Proxmox fisico!\n` +
              `- ${vmCount} VM/CT in esecuzione verranno fermate\n` +
              `- Il nodo RIMARRÀ SPENTO fino a power-on manuale\n` +
              `- Dovrai accendere il server fisicamente o via IPMI\n\n` +
              `Digita "spegni" per confermare:`;
            const input = prompt(msg);
            if (input?.toLowerCase() !== 'spegni') return;
            try {
              await axios.post(`${API_BASE}/clusters/${cluster.id}/nodes/${nodeName}/action?action=shutdown`);
              alert(`Shutdown di ${nodeName} avviato.`);
            } catch (err) { alert(traduciErrore(err)); }
          }} title="Shutdown nodo" className="flex items-center gap-1 px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded-lg text-xs font-medium text-white">
            <Power className="w-3.5 h-3.5"/> Shutdown
          </button>
          <button onClick={() => openConsole(cluster.id, nodeName, 0, 'node', `Shell — ${nodeName}`)}
            title="Console nodo" className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-xs font-medium text-white">
            <Monitor className="w-3.5 h-3.5"/> Console
          </button>
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
            <RefreshCw className="w-4 h-4"/>
          </button>
        </div>
      </div>

      <SectionManager sections={sections} meta={sectionMeta} onToggle={toggle} onMove={move} onReset={reset}/>
      {sections.filter(s => s.visible).map(s => <React.Fragment key={s.id}>{renderers[s.id]}</React.Fragment>)}
    </div>
  );
};

// Hook per gestire ordine/visibilità sezioni con persistenza localStorage
const useSectionManager = (storageKey, defaultSections) => {
  const [sections, setSections] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge: mantieni ordine/visibilità salvati, aggiungi nuove sezioni
        const savedIds = new Set(parsed.map(s => s.id));
        const merged = [...parsed];
        defaultSections.forEach(s => {
          if (!savedIds.has(s.id)) merged.push({ id: s.id, visible: true });
        });
        // Rimuovi sezioni non più esistenti
        const currentIds = new Set(defaultSections.map(s => s.id));
        return merged.filter(s => currentIds.has(s.id));
      }
    } catch {}
    return defaultSections.map(s => ({ id: s.id, visible: true }));
  });

  const save = (next) => {
    setSections(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };

  const toggle = (id) => save(sections.map(s => s.id === id ? {...s, visible: !s.visible} : s));
  const move = (fromId, toId) => {
    if (fromId === toId) return;
    const fromIdx = sections.findIndex(s => s.id === fromId);
    const toIdx = sections.findIndex(s => s.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...sections];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    save(next);
  };
  const reset = () => {
    try { localStorage.removeItem(storageKey); } catch {}
    setSections(defaultSections.map(s => ({ id: s.id, visible: true })));
  };

  return { sections, toggle, move, reset };
};

const SectionManager = ({ sections, meta, onToggle, onMove, onReset }) => {
  const [open, setOpen] = useState(false);
  const [dragId, setDragId] = useState(null);
  const titleFor = (id) => meta.find(m => m.id === id)?.title || id;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-end">
        <button onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-slate-300">
          <LayoutGrid className="w-3.5 h-3.5"/> Personalizza vista
        </button>
      </div>
      {open && (
        <div className="mt-2 p-4 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <Check className="w-3 h-3 text-green-400"/>
              Salvataggio automatico · Trascina per riordinare · Click occhio per mostrare/nascondere
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{sections.filter(s => s.visible).length}/{sections.length} visibili</span>
              <button onClick={onReset} className="text-xs text-slate-500 hover:text-white">Ripristina default</button>
              <button onClick={() => setOpen(false)} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200">Chiudi</button>
            </div>
          </div>
          <div className="space-y-1">
            {sections.map(s => (
              <div key={s.id}
                draggable
                onDragStart={() => setDragId(s.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { onMove(dragId, s.id); setDragId(null); }}
                onDragEnd={() => setDragId(null)}
                className={`flex items-center gap-2 p-2 rounded cursor-move text-sm transition-colors ${s.visible ? 'bg-slate-900' : 'bg-slate-900/50'} ${dragId === s.id ? 'opacity-40' : 'hover:bg-slate-700/50'}`}>
                <GripVertical className="w-4 h-4 text-slate-500"/>
                <span className={`flex-1 ${s.visible ? 'text-slate-200' : 'text-slate-500 line-through'}`}>{titleFor(s.id)}</span>
                <button onClick={() => onToggle(s.id)}
                  className={`p-1 rounded ${s.visible ? 'text-green-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-700'}`}>
                  {s.visible ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const TasksSection = ({ tasksUrl, cluster, title = "Log Tasks" }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [taskLog, setTaskLog] = useState(null);
  const [taskLogLoading, setTaskLogLoading] = useState(false);
  const taskSort = useSortable('starttime', 'desc');

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await axios.get(tasksUrl);
      setTasks(res.data || []);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchTasks(); }, [tasksUrl]);

  const toggleExpand = async (t) => {
    if (expanded === t.upid) {
      setExpanded(null);
      setTaskLog(null);
      return;
    }
    setExpanded(t.upid);
    setTaskLogLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${t.node}/tasks/${encodeURIComponent(t.upid)}/log?limit=200`);
      setTaskLog(res.data);
    } catch (err) {
      setTaskLog([{n:0, t:`Errore caricamento log: ${err.response?.data?.detail || err.message}`}]);
    } finally { setTaskLogLoading(false); }
  };

  const fmtTime = (ts) => ts ? new Date(ts*1000).toLocaleString() : '-';
  const fmtDuration = (t) => {
    if (!t.endtime) return 'in corso';
    const d = t.endtime - t.starttime;
    if (d < 60) return `${d}s`;
    if (d < 3600) return `${Math.floor(d/60)}m ${d%60}s`;
    return `${Math.floor(d/3600)}h ${Math.floor((d%3600)/60)}m`;
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="font-bold flex items-center gap-2"><FileText className="w-4 h-4"/> {title}</div>
        <button onClick={fetchTasks} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white">
          <RefreshCw className="w-4 h-4"/>
        </button>
      </div>
      {loading ? (
        <div className="p-4 text-slate-400 text-sm">Caricamento...</div>
      ) : tasks.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm">Nessun task recente</div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase sticky top-0">
              <tr>
                <th className="px-3 py-2 w-6"></th>
                <SortTh label="Inizio" sortKey="starttime" current={taskSort.sortKey} dir={taskSort.sortDir} onSort={taskSort.requestSort}/>
                <SortTh label="Tipo" sortKey="type" current={taskSort.sortKey} dir={taskSort.sortDir} onSort={taskSort.requestSort}/>
                <SortTh label="ID" sortKey="id" current={taskSort.sortKey} dir={taskSort.sortDir} onSort={taskSort.requestSort}/>
                <SortTh label="Nodo" sortKey="node" current={taskSort.sortKey} dir={taskSort.sortDir} onSort={taskSort.requestSort}/>
                <SortTh label="Utente" sortKey="user" current={taskSort.sortKey} dir={taskSort.sortDir} onSort={taskSort.requestSort}/>
                <th className="px-3 py-2 text-left">Durata</th>
                <SortTh label="Stato" sortKey="status" current={taskSort.sortKey} dir={taskSort.sortDir} onSort={taskSort.requestSort}/>
              </tr>
            </thead>
            <tbody>
              {taskSort.sortFn(tasks).map(t => {
                const isOk = t.status === 'OK';
                const isRunning = !t.endtime;
                return (
                  <React.Fragment key={t.upid}>
                    <tr className="border-t border-slate-700 hover:bg-slate-700/30 cursor-pointer" onClick={() => toggleExpand(t)}>
                      <td className="px-3 py-2 text-slate-500">{expanded === t.upid ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{fmtTime(t.starttime)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{t.type}</td>
                      <td className="px-3 py-2 font-mono text-xs">{t.id || '-'}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{t.node}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{t.user}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{fmtDuration(t)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${isRunning ? 'bg-blue-900/40 text-blue-400' : isOk ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                          {isRunning ? 'running' : isOk ? 'OK' : 'ERR'}
                        </span>
                      </td>
                    </tr>
                    {expanded === t.upid && (
                      <tr>
                        <td colSpan="8" className="p-0 bg-slate-900/50 border-t border-slate-700">
                          {taskLogLoading ? (
                            <div className="p-4 text-slate-400 text-xs flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> Caricamento log...</div>
                          ) : (
                            <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-64 overflow-y-auto">
{(taskLog || []).map(l => l.t).join('\n')}
                            </pre>
                          )}
                          <div className="px-4 pb-3 text-[10px] text-slate-500 font-mono break-all">UPID: {t.upid}{!isOk && t.status && ` · status: ${t.status}`}</div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Parse riga log firewall Proxmox
const parseFwLogLine = (line) => {
  const out = { raw: line };
  // Timestamp formato "3 7 policy DROP: IN=..."
  const policyMatch = line.match(/policy (ACCEPT|DROP|REJECT):/i);
  if (policyMatch) { out.policy = policyMatch[1].toUpperCase(); out.type = 'policy'; }
  const actionMatch = line.match(/:(?:IN|OUT)=/);
  // Estrai direzione
  const dirMatch = line.match(/\b(IN|OUT)=/);
  if (dirMatch) out.direction = dirMatch[1];
  // SRC, DST, PROTO, SPT, DPT, MAC
  const src = line.match(/SRC=(\S+)/); if (src) out.src = src[1];
  const dst = line.match(/DST=(\S+)/); if (dst) out.dst = dst[1];
  const proto = line.match(/PROTO=(\S+)/); if (proto) out.proto = proto[1];
  const spt = line.match(/SPT=(\S+)/); if (spt) out.spt = spt[1];
  const dpt = line.match(/DPT=(\S+)/); if (dpt) out.dpt = dpt[1];
  // Timestamp-ish: "MMM DD HH:MM:SS" or numeric prefix
  const tsMatch = line.match(/([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})/);
  if (tsMatch) out.ts = tsMatch[1];
  return out;
};

const FirewallLogSection = ({ logUrl, title = "Log Firewall" }) => {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | DROP | ACCEPT | REJECT
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLog = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${logUrl}?limit=500`);
      setLines((res.data || []).filter(l => l.t && l.t !== 'no content'));
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchLog(); }, [logUrl]);
  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(fetchLog, 5000);
    return () => clearInterval(iv);
  }, [autoRefresh, logUrl]);

  const parsed = lines.map(l => ({ ...parseFwLogLine(l.t), n: l.n, raw: l.t })).reverse();
  const filtered = parsed.filter(p => {
    if (filter !== 'all' && p.policy !== filter) return false;
    if (search && !p.raw.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const actionColor = (a) => a === 'ACCEPT' ? 'bg-green-900/40 text-green-400' : a === 'DROP' ? 'bg-red-900/40 text-red-400' : a === 'REJECT' ? 'bg-orange-900/40 text-orange-400' : 'bg-slate-700 text-slate-400';

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between gap-3 flex-wrap">
        <div className="font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-orange-400"/> {title}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
            <option value="all">Tutti</option>
            <option value="DROP">Solo DROP</option>
            <option value="REJECT">Solo REJECT</option>
            <option value="ACCEPT">Solo ACCEPT</option>
          </select>
          <input type="text" placeholder="Cerca IP/proto..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs w-40"/>
          <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}/>
            Auto 5s
          </label>
          <button onClick={fetchLog} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white">
            <RefreshCw className="w-4 h-4"/>
          </button>
        </div>
      </div>
      {loading ? (
        <div className="p-4 text-slate-400 text-sm">Caricamento log...</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm">
          {lines.length === 0 ? (
            <>
              Nessun log disponibile.<br/>
              <span className="text-xs">Imposta <code>log=info</code> sulle singole regole firewall per abilitare il logging.</span>
            </>
          ) : 'Nessun match con i filtri correnti'}
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/50 text-slate-400 uppercase sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Timestamp</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Dir</th>
                <th className="px-3 py-2 text-left">Proto</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Dest</th>
                <th className="px-3 py-2 text-left">SPT→DPT</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={i} title={p.raw} className="border-t border-slate-700 hover:bg-slate-700/30 font-mono">
                  <td className="px-3 py-1.5 text-slate-500">{p.ts || '-'}</td>
                  <td className="px-3 py-1.5">
                    {p.policy && <span className={`px-2 py-0.5 rounded font-bold ${actionColor(p.policy)}`}>{p.policy}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-slate-400">{p.direction || '-'}</td>
                  <td className="px-3 py-1.5 text-slate-400">{p.proto || '-'}</td>
                  <td className="px-3 py-1.5 text-slate-300">{p.src || '-'}</td>
                  <td className="px-3 py-1.5 text-slate-300">{p.dst || '-'}</td>
                  <td className="px-3 py-1.5 text-slate-400">{p.spt || '-'}{p.dpt ? `→${p.dpt}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 py-2 bg-slate-900/30 text-[10px] text-slate-500 border-t border-slate-700">
        {filtered.length} / {lines.length} eventi · click sulla riga per vedere il raw log
      </div>
    </div>
  );
};

const ClusterFirewallLogSection = ({ logUrl, nodes = [] }) => {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [nodeFilter, setNodeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showBulkLog, setShowBulkLog] = useState(false);
  const [bulkLevel, setBulkLevel] = useState('info');
  const [bulkDir, setBulkDir] = useState('both');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const fetchLog = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${logUrl}?limit=500`);
      setLines(res.data || []);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchLog(); }, [logUrl]);
  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(fetchLog, 5000);
    return () => clearInterval(iv);
  }, [autoRefresh, logUrl]);

  const nodeNames = [...new Set(lines.map(l => l.node))].sort();
  const parsed = lines.map(l => ({ ...parseFwLogLine(l.t), node: l.node, n: l.n, raw: l.t }));
  const filtered = parsed.filter(p => {
    if (filter !== 'all' && p.policy !== filter) return false;
    if (nodeFilter !== 'all' && p.node !== nodeFilter) return false;
    if (search && !p.raw.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const actionColor = (a) => a === 'ACCEPT' ? 'bg-green-900/40 text-green-400' : a === 'DROP' ? 'bg-red-900/40 text-red-400' : a === 'REJECT' ? 'bg-orange-900/40 text-orange-400' : 'bg-slate-700 text-slate-400';
  const nodeColor = (n) => {
    const colors = ['text-cyan-400', 'text-purple-400', 'text-amber-400', 'text-emerald-400', 'text-pink-400', 'text-blue-400'];
    const idx = nodeNames.indexOf(n);
    return colors[idx % colors.length];
  };

  const logLevelUrl = logUrl.replace('/firewall/log', '/firewall/log-level');
  const applyBulkLogLevel = async () => {
    if (!confirm(`Imposta log_level=${bulkLevel} (${bulkDir === 'both' ? 'IN+OUT' : bulkDir.toUpperCase()}) su tutte le VM/CT?`)) return;
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const res = await axios.put(logLevelUrl, { level: bulkLevel, direction: bulkDir });
      setBulkResult(res.data);
    } catch (err) {
      alert(traduciErrore(err));
    } finally { setBulkBusy(false); }
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between gap-3 flex-wrap">
        <div className="font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-orange-400"/> Log Firewall Aggregato Cluster</div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={nodeFilter} onChange={e => setNodeFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
            <option value="all">Tutti i nodi</option>
            {nodeNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
            <option value="all">Tutte le azioni</option>
            <option value="DROP">Solo DROP</option>
            <option value="REJECT">Solo REJECT</option>
            <option value="ACCEPT">Solo ACCEPT</option>
          </select>
          <input type="text" placeholder="Cerca IP/proto..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs w-40"/>
          <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}/>
            Auto 5s
          </label>
          <button onClick={fetchLog} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white">
            <RefreshCw className="w-4 h-4"/>
          </button>
          <button onClick={() => setShowBulkLog(!showBulkLog)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${showBulkLog ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            <Settings className="w-3.5 h-3.5"/> Log VM
          </button>
        </div>
      </div>
      {showBulkLog && (
        <div className="p-4 border-b border-slate-700 bg-slate-900/40">
          <div className="text-xs text-slate-400 mb-3">
            Imposta il livello di log firewall su <strong>tutte le VM/CT</strong> del cluster in un colpo solo.
            Con <code>info</code> vedrai nel log aggregato tutti i pacchetti che matchano le regole firewall delle VM.
            Con <code>nolog</code> disabiliti il logging (consigliato in produzione per ridurre I/O disco).
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">Livello</label>
              <select value={bulkLevel} onChange={e => setBulkLevel(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
                <option value="nolog">nolog (disabilita)</option>
                <option value="info">info (consigliato per debug)</option>
                <option value="warning">warning</option>
                <option value="err">err</option>
                <option value="debug">debug (verboso)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">Direzione</label>
              <select value={bulkDir} onChange={e => setBulkDir(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
                <option value="both">IN + OUT</option>
                <option value="in">Solo IN</option>
                <option value="out">Solo OUT</option>
              </select>
            </div>
            <div className="pt-3.5">
              <button onClick={applyBulkLogLevel} disabled={bulkBusy}
                className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded text-xs font-medium">
                {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Settings className="w-3.5 h-3.5"/>}
                {bulkLevel === 'nolog' ? 'Disabilita log su tutte le VM' : `Abilita log (${bulkLevel}) su tutte le VM`}
              </button>
            </div>
          </div>
          {bulkResult && (
            <div className={`mt-3 text-xs p-2 rounded ${bulkResult.errors > 0 ? 'bg-yellow-900/30 text-yellow-400' : 'bg-green-900/30 text-green-400'}`}>
              Completato: {bulkResult.ok}/{bulkResult.total} VM aggiornate
              {bulkResult.errors > 0 && ` · ${bulkResult.errors} errori`}
            </div>
          )}
        </div>
      )}
      {loading ? (
        <div className="p-4 text-slate-400 text-sm">Caricamento log da tutti i nodi...</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm">
          {lines.length === 0 ? (
            <>
              Nessun log disponibile su nessun nodo.<br/>
              <span className="text-xs">Imposta <code>log=info</code> sulle singole regole firewall per abilitare il logging.</span>
            </>
          ) : 'Nessun match con i filtri correnti'}
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/50 text-slate-400 uppercase sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Nodo</th>
                <th className="px-3 py-2 text-left">Timestamp</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Dir</th>
                <th className="px-3 py-2 text-left">Proto</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Dest</th>
                <th className="px-3 py-2 text-left">SPT→DPT</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={i} title={p.raw} className="border-t border-slate-700 hover:bg-slate-700/30 font-mono">
                  <td className={`px-3 py-1.5 font-bold ${nodeColor(p.node)}`}>{p.node}</td>
                  <td className="px-3 py-1.5 text-slate-500">{p.ts || '-'}</td>
                  <td className="px-3 py-1.5">
                    {p.policy && <span className={`px-2 py-0.5 rounded font-bold ${actionColor(p.policy)}`}>{p.policy}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-slate-400">{p.direction || '-'}</td>
                  <td className="px-3 py-1.5 text-slate-400">{p.proto || '-'}</td>
                  <td className="px-3 py-1.5 text-slate-300">{p.src || '-'}</td>
                  <td className="px-3 py-1.5 text-slate-300">{p.dst || '-'}</td>
                  <td className="px-3 py-1.5 text-slate-400">{p.spt || '-'}{p.dpt ? `→${p.dpt}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 py-2 bg-slate-900/30 text-[10px] text-slate-500 border-t border-slate-700">
        {filtered.length} / {lines.length} eventi da {nodeNames.length} nod{nodeNames.length === 1 ? 'o' : 'i'}
        {nodeFilter !== 'all' && ` · filtro: ${nodeFilter}`}
      </div>
    </div>
  );
};

const FirewallSection = ({ basePath, title, onToggleEnable, isVM }) => {
  const [rules, setRules] = useState([]);
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingPos, setEditingPos] = useState(null);
  const emptyRuleForm = { enable: 0, type: 'in', action: 'ACCEPT', proto: 'tcp', dport: '', source: '', dest: '', comment: '', log: '' };
  const [form, setForm] = useState(emptyRuleForm);
  const [busy, setBusy] = useState(false);
  const [dragPos, setDragPos] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [optForm, setOptForm] = useState({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r, o] = await Promise.all([
        axios.get(`${basePath}/rules`),
        axios.get(`${basePath}/options`),
      ]);
      setRules(r.data);
      setOptions(o.data);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [basePath]);

  const openOptions = () => {
    const base = {
      policy_in: options.policy_in || 'DROP',
      policy_out: options.policy_out || 'ACCEPT',
    };
    if (isVM) {
      base.log_level_in = options.log_level_in || 'nolog';
      base.log_level_out = options.log_level_out || 'nolog';
      base.macfilter = options.macfilter ?? 1;
      base.ipfilter = options.ipfilter ?? 0;
      base.ndp = options.ndp ?? 0;
      base.dhcp = options.dhcp ?? 0;
      base.radv = options.radv ?? 0;
    }
    setOptForm(base);
    setShowOptions(true);
  };

  const saveOptions = async () => {
    setBusy(true);
    try {
      const payload = { ...optForm };
      Object.keys(payload).forEach(k => { if (payload[k] === '' || payload[k] === null) delete payload[k]; });
      await axios.put(`${basePath}/options`, payload);
      setShowOptions(false);
      fetchData();
    } catch (err) {
      alert(traduciErrore(err));
    } finally { setBusy(false); }
  };

  const toggleFW = async () => {
    setBusy(true);
    try {
      const newEnable = options.enable ? 0 : 1;
      if (onToggleEnable) {
        // Custom handler (es. VM: modifica anche flag firewall sulle NIC)
        await onToggleEnable(newEnable);
      } else {
        await axios.put(`${basePath}/options`, { enable: newEnable });
      }
      fetchData();
    } catch (err) {
      alert(traduciErrore(err));
    } finally { setBusy(false); }
  };

  const saveRule = async () => {
    setBusy(true);
    const isNew = editingPos === null;
    try {
      const payload = { ...form };
      if (!isNew) {
        Object.keys(payload).forEach(k => { if (payload[k] === null || payload[k] === undefined) delete payload[k]; });
        await axios.put(`${basePath}/rules/${editingPos}`, payload);
      } else {
        payload.enable = 0;
        Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });
        await axios.post(`${basePath}/rules`, payload);
        // Sposta la regola appena creata (pos 0) in ultima posizione
        const rulesAfter = await axios.get(`${basePath}/rules`);
        if (rulesAfter.data.length > 1) {
          await axios.put(`${basePath}/rules/0`, { moveto: rulesAfter.data.length });
        }
      }
      closeRuleForm();
      fetchData();
    } catch (err) {
      alert(traduciErrore(err));
      setBusy(false);
      return;
    }
    setBusy(false);
    if (isNew) {
      setTimeout(async () => {
        if (confirm('Regola aggiunta disattivata. Vuoi attivarla subito?')) {
          try {
            var res = await axios.get(basePath + '/rules');
            var last = res.data[res.data.length - 1];
            if (last) {
              await axios.put(basePath + '/rules/' + last.pos, { enable: 1, type: last.type, action: last.action });
              fetchData();
            }
          } catch (e) {
            alert('Errore attivazione: ' + traduciErrore(e));
          }
        }
      }, 500);
    }
  };

  const startEditRule = (r) => {
    setEditingPos(r.pos);
    setForm({
      enable: r.enable ?? 1,
      type: r.type || 'in',
      action: r.action || 'ACCEPT',
      proto: r.proto || '',
      dport: r.dport || '',
      source: r.source || '',
      dest: r.dest || '',
      comment: r.comment || '',
      log: r.log || '',
    });
    setShowAdd(true);
  };

  const closeRuleForm = () => {
    setShowAdd(false);
    setEditingPos(null);
    setForm(emptyRuleForm);
  };

  const toggleRule = async (r) => {
    try {
      await axios.put(`${basePath}/rules/${r.pos}`, {
        enable: r.enable ? 0 : 1,
        type: r.type, action: r.action,
      });
      fetchData();
    } catch (err) {
      alert(traduciErrore(err));
    }
  };

  const moveRule = async (fromPos, toPos) => {
    if (fromPos === toPos) return;
    try {
      await axios.put(`${basePath}/rules/${fromPos}`, { moveto: toPos });
      fetchData();
    } catch (err) {
      alert('Errore spostamento: ' + traduciErrore(err));
    }
  };

  const delRule = async (pos) => {
    if (!confirm(`Eliminare regola #${pos}?`)) return;
    try {
      await axios.delete(`${basePath}/rules/${pos}`);
      fetchData();
    } catch (err) {
      alert(traduciErrore(err));
    }
  };

  if (loading) return <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 text-slate-400 text-sm">Caricamento firewall...</div>;

  const enabled = !!options.enable;

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="font-bold flex items-center gap-2">
          <Flame className={`w-4 h-4 ${enabled ? 'text-orange-400' : 'text-slate-500'}`}/>
          {title || 'Firewall'}
          <span className={`px-2 py-0.5 rounded-full text-xs ${enabled ? 'bg-green-900/40 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
            {enabled ? 'ATTIVO' : 'DISATTIVATO'}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleFW} disabled={busy} className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs ${enabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-green-700 hover:bg-green-600'}`}>
            {enabled ? <ShieldOff className="w-3.5 h-3.5"/> : <Shield className="w-3.5 h-3.5"/>}
            {enabled ? 'Disattiva FW' : 'Attiva FW'}
          </button>
          <button onClick={openOptions} className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs">
            <Settings className="w-3.5 h-3.5"/> Opzioni
          </button>
          <button onClick={() => { setEditingPos(null); setForm(emptyRuleForm); setShowAdd(true); }} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs">
            <Plus className="w-3.5 h-3.5"/> Aggiungi Regola
          </button>
        </div>
      </div>

      {showOptions && (
        <div className="p-4 border-b border-slate-700 bg-slate-900/30">
          <div className="font-medium mb-3 text-sm flex items-center gap-2"><Settings className="w-4 h-4"/> Opzioni Firewall</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Policy IN (default)</label>
              <select value={optForm.policy_in || 'DROP'} onChange={e => setOptForm({...optForm, policy_in: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm">
                <option value="ACCEPT">ACCEPT (permetti tutto)</option>
                <option value="DROP">DROP (blocca tutto)</option>
                <option value="REJECT">REJECT (blocca con risposta)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">Cosa fare col traffico <strong>in ingresso</strong> se <em>nessuna regola</em> matcha. DROP è la scelta sicura.</p>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Policy OUT (default)</label>
              <select value={optForm.policy_out || 'ACCEPT'} onChange={e => setOptForm({...optForm, policy_out: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm">
                <option value="ACCEPT">ACCEPT</option>
                <option value="DROP">DROP</option>
                <option value="REJECT">REJECT</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">Cosa fare col traffico <strong>in uscita</strong> se nessuna regola matcha. ACCEPT è quasi sempre il default.</p>
            </div>
            {isVM && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Log level IN</label>
              <select value={optForm.log_level_in || 'nolog'} onChange={e => setOptForm({...optForm, log_level_in: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm">
                <option value="nolog">nolog (nessun log)</option>
                <option value="emerg">emerg</option>
                <option value="alert">alert</option>
                <option value="crit">crit</option>
                <option value="err">err</option>
                <option value="warning">warning</option>
                <option value="notice">notice</option>
                <option value="info">info</option>
                <option value="debug">debug</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">Livello log pacchetti bloccati <strong>in ingresso</strong>. Usa <em>info</em> per debug, <em>nolog</em> in produzione.</p>
            </div>
            )}
            {isVM && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Log level OUT</label>
              <select value={optForm.log_level_out || 'nolog'} onChange={e => setOptForm({...optForm, log_level_out: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm">
                <option value="nolog">nolog</option>
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="err">err</option>
                <option value="debug">debug</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">Livello log pacchetti bloccati <strong>in uscita</strong>.</p>
            </div>
            )}
            {optForm.macfilter !== undefined && (
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!Number(optForm.macfilter)}
                    onChange={e => setOptForm({...optForm, macfilter: e.target.checked ? 1 : 0})}/>
                  MAC filter
                </label>
                <p className="text-[11px] text-slate-500 mt-1">Blocca pacchetti con MAC <strong>diverso</strong> da quello della NIC. Previene MAC spoofing dalla VM. <em>Consigliato ON</em>.</p>
              </div>
            )}
            {optForm.ipfilter !== undefined && (
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!Number(optForm.ipfilter)}
                    onChange={e => setOptForm({...optForm, ipfilter: e.target.checked ? 1 : 0})}/>
                  IP filter
                </label>
                <p className="text-[11px] text-slate-500 mt-1">Obbliga la VM a usare solo gli IP configurati. Previene IP spoofing. Utile in multi-tenancy.</p>
              </div>
            )}
            {optForm.ndp !== undefined && (
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!Number(optForm.ndp)}
                    onChange={e => setOptForm({...optForm, ndp: e.target.checked ? 1 : 0})}/>
                  NDP (IPv6)
                </label>
                <p className="text-[11px] text-slate-500 mt-1">Permetti Neighbor Discovery IPv6 (equivalente di ARP per IPv6). Necessario se usi IPv6.</p>
              </div>
            )}
            {optForm.dhcp !== undefined && (
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!Number(optForm.dhcp)}
                    onChange={e => setOptForm({...optForm, dhcp: e.target.checked ? 1 : 0})}/>
                  DHCP
                </label>
                <p className="text-[11px] text-slate-500 mt-1">Permetti traffico DHCP (porte 67/68). Abilitalo se la VM ottiene IP da DHCP.</p>
              </div>
            )}
            {optForm.radv !== undefined && (
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!Number(optForm.radv)}
                    onChange={e => setOptForm({...optForm, radv: e.target.checked ? 1 : 0})}/>
                  Router Advertisement (IPv6)
                </label>
                <p className="text-[11px] text-slate-500 mt-1">Permetti alla VM di <strong>inviare</strong> RA IPv6. Abilitalo solo se la VM è un router.</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowOptions(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm">Annulla</button>
            <button onClick={saveOptions} disabled={busy} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
              Salva Opzioni
            </button>
          </div>
        </div>
      )}

      {rules.length > 0 && (
        <div className="px-4 py-2 bg-slate-900/30 text-xs text-slate-500 border-b border-slate-700">
          <GripVertical className="w-3 h-3 inline mr-1"/> Trascina le righe per riordinare. Le regole vengono valutate dall'alto verso il basso: la <strong>prima</strong> che matcha viene applicata.
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">On</th>
            <th className="px-3 py-2 text-left">Dir</th>
            <th className="px-3 py-2 text-left">Azione</th>
            <th className="px-3 py-2 text-left">Proto</th>
            <th className="px-3 py-2 text-left">Porta Dst</th>
            <th className="px-3 py-2 text-left">Source</th>
            <th className="px-3 py-2 text-left">Dest</th>
            <th className="px-3 py-2 text-left">Commento</th>
            <th className="px-3 py-2 text-right"></th>
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 && !showAdd && (
            <tr><td colSpan="10" className="px-4 py-6 text-center text-slate-500 text-sm">Nessuna regola</td></tr>
          )}
          {rules.map(r => (
            <tr key={r.pos}
              draggable
              onDragStart={() => setDragPos(r.pos)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(r.pos); }}
              onDragLeave={() => setDragOver(null)}
              onDragEnd={() => { setDragPos(null); setDragOver(null); }}
              onDrop={(e) => { e.preventDefault(); moveRule(dragPos, r.pos); setDragPos(null); setDragOver(null); }}
              className={`border-t border-slate-700 cursor-move transition-colors ${dragOver === r.pos && dragPos !== r.pos ? 'bg-blue-900/20 border-t-2 border-t-blue-500' : ''} ${dragPos === r.pos ? 'opacity-40' : ''}`}>
              <td className="px-3 py-2 font-mono text-xs text-slate-400">
                <div className="flex items-center gap-1">
                  <GripVertical className="w-3.5 h-3.5 text-slate-600"/>
                  {r.pos}
                </div>
              </td>
              <td className="px-3 py-2">
                <button onClick={() => toggleRule(r)} title={r.enable ? 'Disabilita' : 'Abilita'}
                  className={`relative w-9 h-5 rounded-full transition-colors ${r.enable ? 'bg-green-600' : 'bg-red-600'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${r.enable ? 'left-4' : 'left-0.5'}`}></span>
                </button>
              </td>
              <td className="px-3 py-2 uppercase text-xs font-medium">{r.type}</td>
              <td className="px-3 py-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.action==='ACCEPT'?'bg-green-900/40 text-green-400':r.action==='DROP'?'bg-red-900/40 text-red-400':'bg-yellow-900/40 text-yellow-400'}`}>
                  {r.action}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.proto || '-'}</td>
              <td className="px-3 py-2 font-mono text-xs">{r.dport || '-'}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-400">{r.source || 'any'}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-400">{r.dest || 'any'}</td>
              <td className="px-3 py-2 text-xs text-slate-400 truncate max-w-[200px]">{r.comment || ''}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex gap-2 justify-end">
                  <button onClick={() => startEditRule(r)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-500 rounded text-xs font-medium transition-all">
                    <Pencil className="w-3 h-3"/> Modifica
                  </button>
                  <button onClick={() => delRule(r.pos)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 hover:border-red-500 rounded text-xs font-medium transition-all">
                    <Trash2 className="w-3 h-3"/> Elimina
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showAdd && (
        <div className="p-4 border-t border-slate-700 bg-slate-900/30">
          <div className="font-medium mb-3 text-sm">{editingPos !== null ? `Modifica Regola #${editingPos}` : 'Nuova Regola'}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Direzione</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm">
                <option value="in">IN (entrata)</option>
                <option value="out">OUT (uscita)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Azione</label>
              <select value={form.action} onChange={e => setForm({...form, action: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm">
                <option value="ACCEPT">ACCEPT (permetti)</option>
                <option value="DROP">DROP (blocca silenziosamente)</option>
                <option value="REJECT">REJECT (blocca con risposta)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Protocollo</label>
              <select value={form.proto} onChange={e => setForm({...form, proto: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm">
                <option value="">any</option>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="icmp">ICMP</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Porta Dest</label>
              <input type="text" placeholder="80 o 80,443 o 8000:9000" value={form.dport}
                onChange={e => setForm({...form, dport: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Source IP/CIDR</label>
              <input type="text" placeholder="vuoto = any" value={form.source}
                onChange={e => setForm({...form, source: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Dest IP/CIDR</label>
              <input type="text" placeholder="vuoto = any" value={form.dest}
                onChange={e => setForm({...form, dest: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Log</label>
              <select value={form.log || ''} onChange={e => setForm({...form, log: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm">
                <option value="">nolog</option>
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="err">err</option>
                <option value="alert">alert</option>
                <option value="crit">crit</option>
                <option value="debug">debug</option>
                <option value="nolog">nolog (esplicito)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Commento</label>
              <input type="text" value={form.comment}
                onChange={e => setForm({...form, comment: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm"/>
            </div>
          </div>
          <div className="flex items-center justify-between">
            {editingPos !== null ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!Number(form.enable)}
                  onChange={e => setForm({...form, enable: e.target.checked ? 1 : 0})}/>
                Regola attiva
              </label>
            ) : (
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5"/> Regola aggiunta disattivata in ultima posizione
              </span>
            )}
            <div className="flex gap-2">
              <button onClick={closeRuleForm} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm">Annulla</button>
              <button onClick={saveRule} disabled={busy} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm">
                {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : (editingPos !== null ? <Save className="w-4 h-4"/> : <Plus className="w-4 h-4"/>)}
                {editingPos !== null ? 'Salva' : 'Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Parse disco: "local-lvm:vm-100-disk-0,iothread=1,size=32G" → {storage, volume, size, ...}
const parseDiskString = (str) => {
  if (!str) return {};
  const parts = str.split(',');
  const out = {};
  const first = parts[0];
  if (first.includes(':')) {
    const [storage, volume] = first.split(':');
    out.storage = storage;
    out.volume = volume;
  } else {
    out.storage = first;
  }
  parts.slice(1).forEach(p => {
    const [k, v] = p.split('=');
    if (k) out[k] = v ?? '';
  });
  return out;
};

// Parse/serializza stringhe Proxmox tipo "virtio,bridge=vmbr0,firewall=1"
const parseNetString = (str) => {
  if (!str) return {};
  const parts = str.split(',');
  const out = { model: '' };
  // Il primo segmento può essere "virtio=HWADDR" o solo "virtio"
  const first = parts[0];
  if (first.includes('=')) {
    const [k, v] = first.split('=');
    if (['virtio','e1000','rtl8139','vmxnet3','veth'].includes(k)) { out.model = k; out.hwaddr = v; }
    else out[k] = v;
  } else {
    out.model = first;
  }
  parts.slice(1).forEach(p => {
    const [k, v] = p.split('=');
    if (k) out[k] = v ?? '';
  });
  return out;
};

const buildNetString = (obj, isLxc) => {
  if (isLxc) {
    // LXC: name=eth0,bridge=vmbr0,hwaddr=...,ip=...,type=veth
    const keys = ['name','bridge','hwaddr','ip','ip6','gw','gw6','type','tag','firewall','mtu','rate'];
    return keys.filter(k => obj[k]).map(k => `${k}=${obj[k]}`).join(',');
  }
  // QEMU: virtio=HW,bridge=vmbr0,firewall=1,tag=10
  const model = obj.model || 'virtio';
  const first = obj.hwaddr ? `${model}=${obj.hwaddr}` : model;
  const keys = ['bridge','firewall','tag','queues','rate','mtu','link_down'];
  const rest = keys.filter(k => obj[k] !== undefined && obj[k] !== '').map(k => `${k}=${obj[k]}`);
  return [first, ...rest].join(',');
};

const bootDeviceIcon = (dev) => {
  if (dev.startsWith('net')) return <Network className="w-4 h-4 text-cyan-400"/>;
  if (dev.startsWith('ide') || dev.startsWith('cd')) return <Disc3 className="w-4 h-4 text-blue-400"/>;
  if (dev.startsWith('scsi') || dev.startsWith('virtio') || dev.startsWith('sata')) return <HardDrive className="w-4 h-4 text-purple-400"/>;
  if (dev.startsWith('rootfs')) return <Database className="w-4 h-4 text-green-400"/>;
  if (dev === 'efidisk0') return <Settings className="w-4 h-4 text-orange-400"/>;
  return <HardDrive className="w-4 h-4 text-slate-400"/>;
};

const bootDeviceLabel = (dev, config) => {
  if (dev.startsWith('net')) {
    const p = config[dev] ? parseNetString(config[dev]) : {};
    return `Rete — ${p.bridge || dev}`;
  }
  if (config[dev]) {
    const d = parseDiskString(config[dev]);
    if (d.media === 'cdrom') {
      const iso = d.storage === 'none' ? 'vuoto' : (d.volume || '');
      return `CD-ROM — ${iso}`;
    }
    return `${d.storage || ''}:${d.volume || ''} ${d.size ? `(${d.size})` : ''}`.trim();
  }
  return dev;
};

const VMBootOrderSection = ({ cluster, vm, config, onChange }) => {
  // Proxmox boot format: "order=scsi0;ide2;net0" oppure legacy "cdn"
  const bootStr = config.boot || '';
  const orderMatch = bootStr.match(/order=(.+)/);
  const bootDevices = orderMatch ? orderMatch[1].split(';').filter(Boolean) : [];

  // Tutti i dispositivi avviabili (dischi + reti)
  const allBootable = Object.keys(config).filter(k =>
    /^(scsi|virtio|ide|sata|efidisk)\d+$/.test(k) || /^net\d+$/.test(k)
  ).sort();

  // Dispositivi non ancora nel boot order
  const available = allBootable.filter(d => !bootDevices.includes(d));

  const [order, setOrder] = useState(bootDevices);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const newOrder = orderMatch ? orderMatch[1].split(';').filter(Boolean) : [];
    setOrder(newOrder);
    setDirty(false);
  }, [bootStr]);

  const moveUp = (i) => {
    if (i <= 0) return;
    const newOrder = [...order];
    [newOrder[i - 1], newOrder[i]] = [newOrder[i], newOrder[i - 1]];
    setOrder(newOrder);
    setDirty(true);
  };

  const moveDown = (i) => {
    if (i >= order.length - 1) return;
    const newOrder = [...order];
    [newOrder[i], newOrder[i + 1]] = [newOrder[i + 1], newOrder[i]];
    setOrder(newOrder);
    setDirty(true);
  };

  const removeDevice = (i) => {
    const newOrder = order.filter((_, idx) => idx !== i);
    setOrder(newOrder);
    setDirty(true);
  };

  const addDevice = (dev) => {
    setOrder([...order, dev]);
    setDirty(true);
  };

  const saveOrder = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/config`, {
        boot: `order=${order.join(';')}`
      });
      setDirty(false);
      onChange();
    } catch (err) { alert(traduciErrore(err)); }
    finally { setSaving(false); }
  };

  const currentAvailable = allBootable.filter(d => !order.includes(d));

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-700 font-bold flex items-center gap-2">
        <ListOrdered className="w-4 h-4"/> Ordine di Boot
      </div>
      {order.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">Nessun dispositivo di boot configurato</div>
      ) : (
        <div className="divide-y divide-slate-700">
          {order.map((dev, i) => (
            <div key={dev} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700/30">
              <span className="text-xs font-bold text-slate-500 w-5 text-center">{i + 1}</span>
              {bootDeviceIcon(dev)}
              <span className="font-mono text-sm text-blue-400 w-20">{dev}</span>
              <span className="text-sm text-slate-300 flex-1">{bootDeviceLabel(dev, config)}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => moveUp(i)} disabled={i === 0}
                  className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-white disabled:opacity-30" title="Sposta su">
                  <ArrowUp className="w-3.5 h-3.5"/>
                </button>
                <button onClick={() => moveDown(i)} disabled={i === order.length - 1}
                  className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-white disabled:opacity-30" title="Sposta giù">
                  <ArrowDown className="w-3.5 h-3.5"/>
                </button>
                <button onClick={() => removeDevice(i)}
                  className="p-1 rounded hover:bg-red-900/40 text-slate-400 hover:text-red-400" title="Rimuovi dal boot">
                  <X className="w-3.5 h-3.5"/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {currentAvailable.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-900/30">
          <p className="text-xs text-slate-500 mb-2">Dispositivi disponibili:</p>
          <div className="flex flex-wrap gap-2">
            {currentAvailable.map(dev => (
              <button key={dev} onClick={() => addDevice(dev)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300">
                <Plus className="w-3 h-3"/> {bootDeviceIcon(dev)} {dev}
              </button>
            ))}
          </div>
        </div>
      )}
      {dirty && (
        <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between bg-blue-900/10">
          <span className="text-xs text-blue-300">Ordine modificato — salva per applicare</span>
          <button onClick={saveOrder} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-xs text-white font-medium">
            {saving ? <Loader2 className="w-3 h-3 animate-spin"/> : <Save className="w-3 h-3"/>} Salva
          </button>
        </div>
      )}
    </div>
  );
};

const VMDisksSection = ({ cluster, vm, vtype, config, diskKeys, onChange }) => {
  const [cdromEditing, setCdromEditing] = useState(null);
  const [isoList, setIsoList] = useState([]);
  const [selectedIso, setSelectedIso] = useState('');
  const [cdromBusy, setCdromBusy] = useState(false);
  const [addMode, setAddMode] = useState(null); // 'cdrom' | 'disk' | null
  const [addBusy, setAddBusy] = useState(false);
  const [addForm, setAddForm] = useState({ bus: 'ide', storage: '', size: '32', iso: '' });
  const [storageList, setStorageList] = useState([]);
  const [addIsoList, setAddIsoList] = useState([]);
  const isLxc = vtype === 'lxc';

  const loadIsos = async (slot) => {
    setCdromEditing(slot);
    setSelectedIso('');
    try {
      const stRes = await axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${vm.node}/storage`);
      const isoStores = (stRes.data || []).filter(s => s.active && (s.content || '').includes('iso'));
      let allIsos = [];
      for (const s of isoStores) {
        try {
          const cRes = await axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${vm.node}/storage/${s.storage}/content?content_type=iso`);
          (cRes.data || []).forEach(f => allIsos.push({ volid: f.volid, label: `${f.volid}` }));
        } catch {}
      }
      setIsoList(allIsos);
    } catch { setIsoList([]); }
  };

  const mountIso = async () => {
    if (!selectedIso || !cdromEditing) return;
    setCdromBusy(true);
    try {
      await axios.put(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/config`, {
        [cdromEditing]: `${selectedIso},media=cdrom`
      });
      setCdromEditing(null);
      onChange();
    } catch (err) { alert(traduciErrore(err)); }
    finally { setCdromBusy(false); }
  };

  const ejectCdrom = async (slot) => {
    if (!confirm('Smontare il CD-ROM?')) return;
    setCdromBusy(true);
    try {
      await axios.put(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/config`, {
        [slot]: 'none,media=cdrom'
      });
      onChange();
    } catch (err) { alert(traduciErrore(err)); }
    finally { setCdromBusy(false); }
  };

  const openAddForm = async (mode) => {
    setAddMode(mode);
    setAddForm({ bus: mode === 'cdrom' ? 'ide' : (isLxc ? 'mp' : 'scsi'), storage: '', size: '32', iso: '', mountpoint: '/mnt/data' });
    setStorageList([]);
    setAddIsoList([]);
    try {
      const stRes = await axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${vm.node}/storage`);
      const stores = (stRes.data || []).filter(s => s.active);
      if (mode === 'cdrom') {
        const isoStores = stores.filter(s => (s.content || '').includes('iso'));
        setStorageList(isoStores);
        let allIsos = [];
        for (const s of isoStores) {
          try {
            const cRes = await axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${vm.node}/storage/${s.storage}/content?content_type=iso`);
            (cRes.data || []).forEach(f => allIsos.push({ volid: f.volid, label: `${f.volid}` }));
          } catch {}
        }
        setAddIsoList(allIsos);
      } else {
        setStorageList(stores.filter(s => (s.content || '').includes('images') || (s.content || '').includes('rootdir')));
      }
    } catch {}
  };

  const nextFreeSlot = (bus) => {
    const used = new Set(diskKeys.filter(k => k.startsWith(bus)).map(k => parseInt(k.replace(bus, '')) || 0));
    let idx = 0;
    while (used.has(idx)) idx++;
    return `${bus}${idx}`;
  };

  const addDevice = async () => {
    setAddBusy(true);
    try {
      let slot, value;
      if (addMode === 'cdrom') {
        slot = nextFreeSlot(addForm.bus);
        value = addForm.iso ? `${addForm.iso},media=cdrom` : 'none,media=cdrom';
      } else if (isLxc) {
        slot = nextFreeSlot('mp');
        if (!addForm.storage) { alert('Seleziona uno storage'); setAddBusy(false); return; }
        value = `${addForm.storage}:${addForm.size},mp=${addForm.mountpoint}`;
      } else {
        slot = nextFreeSlot(addForm.bus);
        if (!addForm.storage) { alert('Seleziona uno storage'); setAddBusy(false); return; }
        value = `${addForm.storage}:${addForm.size}`;
      }
      await axios.put(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/config`, {
        [slot]: value
      });
      setAddMode(null);
      onChange();
    } catch (err) { alert(traduciErrore(err)); }
    finally { setAddBusy(false); }
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6" style={{order: 0}}>
      <div className="p-4 border-b border-slate-700 font-bold flex items-center justify-between">
        <span className="flex items-center gap-2"><HardDrive className="w-4 h-4"/> Dischi / Volumi</span>
        <div className="flex gap-1">
          {!isLxc && (
            <button onClick={() => addMode === 'cdrom' ? setAddMode(null) : openAddForm('cdrom')}
              className="flex items-center gap-1 px-2 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs text-white">
              <Plus className="w-3 h-3"/> CD-ROM
            </button>
          )}
          <button onClick={() => addMode === 'disk' ? setAddMode(null) : openAddForm('disk')}
            className="flex items-center gap-1 px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded text-xs text-white">
            <Plus className="w-3 h-3"/> {isLxc ? 'Mount Point' : 'Disco'}
          </button>
        </div>
      </div>
      {addMode && (
        <div className="p-4 bg-slate-900/50 border-b border-slate-700">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            {addMode === 'cdrom' ? <><Disc3 className="w-4 h-4 text-blue-400"/> Aggiungi CD-ROM</> : <><HardDrive className="w-4 h-4 text-purple-400"/> Aggiungi Disco</>}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {!isLxc && (
              <div>
                <label className="text-xs text-slate-400 block mb-1">Bus</label>
                <select value={addForm.bus} onChange={e => setAddForm({...addForm, bus: e.target.value})}
                  className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200">
                  {addMode === 'cdrom'
                    ? <><option value="ide">IDE</option><option value="sata">SATA</option><option value="scsi">SCSI</option></>
                    : <><option value="scsi">SCSI</option><option value="virtio">VirtIO</option><option value="ide">IDE</option><option value="sata">SATA</option></>
                  }
                </select>
              </div>
            )}
            {addMode === 'disk' && (
              <>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Storage</label>
                  <select value={addForm.storage} onChange={e => setAddForm({...addForm, storage: e.target.value})}
                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 min-w-[150px]">
                    <option value="">— Seleziona —</option>
                    {storageList.map(s => <option key={s.storage} value={s.storage}>{s.storage}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Dimensione (GB)</label>
                  <input type="number" min="1" value={addForm.size} onChange={e => setAddForm({...addForm, size: e.target.value})}
                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 w-24"/>
                </div>
              </>
            )}
            {addMode === 'disk' && isLxc && (
              <div>
                <label className="text-xs text-slate-400 block mb-1">Mount Point</label>
                <input type="text" value={addForm.mountpoint} onChange={e => setAddForm({...addForm, mountpoint: e.target.value})}
                  placeholder="/mnt/data"
                  className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 w-40"/>
              </div>
            )}
            {addMode === 'cdrom' && (
              <div>
                <label className="text-xs text-slate-400 block mb-1">ISO (opzionale)</label>
                <select value={addForm.iso} onChange={e => setAddForm({...addForm, iso: e.target.value})}
                  className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm font-mono text-slate-200 min-w-[300px]">
                  <option value="">— Vuoto (nessuna ISO) —</option>
                  {addIsoList.map(iso => <option key={iso.volid} value={iso.volid}>{iso.label}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={addDevice} disabled={addBusy || (addMode === 'disk' && !addForm.storage)}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-xs text-white disabled:opacity-50">
                {addBusy ? <Loader2 className="w-3 h-3 animate-spin"/> : <Check className="w-3 h-3"/>} Aggiungi
              </button>
              <button onClick={() => setAddMode(null)}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-xs text-white">
                <X className="w-3 h-3"/> Annulla
              </button>
            </div>
          </div>
          {addMode === 'cdrom' && addIsoList.length === 0 && <p className="text-xs text-slate-500 mt-2">Nessuna ISO trovata. Il CD-ROM verrà creato vuoto.</p>}
          {addMode === 'disk' && storageList.length === 0 && <p className="text-xs text-slate-500 mt-2">Caricamento storage...</p>}
        </div>
      )}
      {diskKeys.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">Nessun disco</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Slot</th>
              <th className="px-4 py-2 text-left">Storage</th>
              <th className="px-4 py-2 text-left">Volume</th>
              <th className="px-4 py-2 text-left">Size</th>
              <th className="px-4 py-2 text-left">Opzioni</th>
              <th className="px-4 py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {[...diskKeys].sort((a, b) => {
              const aCd = parseDiskString(config[a]).media === 'cdrom' ? 1 : 0;
              const bCd = parseDiskString(config[b]).media === 'cdrom' ? 1 : 0;
              if (aCd !== bCd) return aCd - bCd;
              return a.localeCompare(b);
            }).map(k => {
              const d = parseDiskString(config[k]);
              const isCdrom = d.media === 'cdrom';
              const isEmpty = d.storage === 'none';
              const extraKeys = Object.keys(d).filter(x => !['storage','volume','size','media'].includes(x));
              return (
                <React.Fragment key={k}>
                  <tr className="border-t border-slate-700">
                    <td className="px-4 py-2 font-mono text-purple-400 text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        {isCdrom
                          ? <Disc3 className="w-3.5 h-3.5 text-blue-400"/>
                          : k.startsWith('rootfs')
                            ? <Database className="w-3.5 h-3.5 text-green-400"/>
                            : k.startsWith('mp')
                              ? <Package className="w-3.5 h-3.5 text-yellow-400"/>
                              : <HardDrive className="w-3.5 h-3.5 text-purple-400"/>
                        }
                        {k}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium text-sm">{isEmpty && isCdrom ? <span className="text-slate-500 italic">vuoto</span> : (d.storage || '-')}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-300">{isEmpty && isCdrom ? '-' : (d.volume || '-')}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-400">{d.size || '-'}</td>
                    <td className="px-4 py-2 text-xs text-slate-400">
                      {extraKeys.length === 0 ? (isCdrom ? 'media=cdrom' : '-') : extraKeys.map(x => `${x}=${d[x]}`).join(', ')}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {isCdrom && (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => cdromEditing === k ? setCdromEditing(null) : loadIsos(k)}
                            disabled={cdromBusy}
                            className="flex items-center gap-1 px-2 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs text-white disabled:opacity-50">
                            <Download className="w-3 h-3"/> {cdromEditing === k ? 'Chiudi' : 'Monta ISO'}
                          </button>
                          {!isEmpty && (
                            <button onClick={() => ejectCdrom(k)}
                              disabled={cdromBusy}
                              className="flex items-center gap-1 px-2 py-1 bg-yellow-700 hover:bg-yellow-600 rounded text-xs text-white disabled:opacity-50">
                              <X className="w-3 h-3"/> Smonta
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  {isCdrom && cdromEditing === k && (
                    <tr className="border-t border-slate-700/50 bg-slate-900/30">
                      <td colSpan="6" className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <select value={selectedIso} onChange={e => setSelectedIso(e.target.value)}
                            className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm font-mono text-slate-200">
                            <option value="">— Seleziona ISO —</option>
                            {isoList.map(iso => (
                              <option key={iso.volid} value={iso.volid}>{iso.label}</option>
                            ))}
                          </select>
                          <button onClick={mountIso} disabled={!selectedIso || cdromBusy}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-xs text-white disabled:opacity-50">
                            {cdromBusy ? <Loader2 className="w-3 h-3 animate-spin"/> : <Check className="w-3 h-3"/>} Monta
                          </button>
                        </div>
                        {isoList.length === 0 && <p className="text-xs text-slate-500 mt-2">Nessuna ISO trovata negli storage del nodo.</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

const VMNetworkSection = ({ cluster, vm, vtype, config, netKeys, onChange }) => {
  const [editing, setEditing] = useState(null); // key of editing iface or 'new'
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [agentIPs, setAgentIPs] = useState({});
  const isLxc = vtype === 'lxc';

  useEffect(() => {
    if (isLxc) return;
    axios.get(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/interfaces`)
      .then(res => {
        const map = {};
        (res.data.interfaces || []).forEach(iface => {
          const ips = (iface['ip-addresses'] || [])
            .filter(a => a['ip-address-type'] === 'ipv4' && !a['ip-address'].startsWith('127.'))
            .map(a => a['ip-address']);
          if (ips.length > 0) {
            const mac = (iface['hardware-address'] || '').toLowerCase();
            map[mac] = ips.join(', ');
          }
        });
        setAgentIPs(map);
      })
      .catch(() => {});
  }, [cluster.id, vm.node, vm.vmid, isLxc]);

  const startEdit = (key) => {
    setForm(parseNetString(config[key]));
    setEditing(key);
  };
  const startNew = () => {
    // Trova primo indice libero
    const used = new Set(netKeys.map(k => parseInt(k.replace('net',''))));
    let idx = 0;
    while (used.has(idx)) idx++;
    setForm(isLxc ? { name: `eth${idx}`, bridge: 'vmbr0', type: 'veth' } : { model: 'virtio', bridge: 'vmbr0' });
    setEditing(`net${idx}`);
  };

  const save = async () => {
    setBusy(true);
    try {
      const s = buildNetString(form, isLxc);
      await axios.put(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/config`, { [editing]: s });
      setEditing(null);
      onChange();
    } catch (err) {
      alert(traduciErrore(err));
    } finally { setBusy(false); }
  };

  const remove = async (key) => {
    if (!confirm(`Rimuovere ${key}?`)) return;
    try {
      await axios.put(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/config`, { delete: key });
      onChange();
    } catch (err) {
      alert(traduciErrore(err));
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="font-bold flex items-center gap-2"><Network className="w-4 h-4"/> Interfacce di Rete VM</div>
        <button onClick={startNew} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs">
          <Plus className="w-3.5 h-3.5"/> Aggiungi
        </button>
      </div>
      {netKeys.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">Nessuna interfaccia</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Slot</th>
              {isLxc && <th className="px-3 py-2 text-left">Name</th>}
              {!isLxc && <th className="px-3 py-2 text-left">Modello</th>}
              <th className="px-3 py-2 text-left">Bridge</th>
              <th className="px-3 py-2 text-left">MAC</th>
              <th className="px-3 py-2 text-left">IP</th>
              {isLxc && <th className="px-3 py-2 text-left">Gateway</th>}
              <th className="px-3 py-2 text-left">VLAN</th>
              <th className="px-3 py-2 text-left">Firewall</th>
              <th className="px-3 py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {netKeys.map(k => {
              const p = parseNetString(config[k]);
              return (
                <tr key={k} className="border-t border-slate-700 hover:bg-slate-700/30">
                  <td className="px-3 py-2 font-mono text-blue-400 text-xs">{k}</td>
                  {isLxc && <td className="px-3 py-2 font-mono text-xs">{p.name || '-'}</td>}
                  {!isLxc && <td className="px-3 py-2 uppercase text-xs">{p.model || '-'}</td>}
                  <td className="px-3 py-2 font-mono text-xs">{p.bridge || '-'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{p.hwaddr || '-'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-green-400">{isLxc ? (p.ip || '-') : (agentIPs[(p.hwaddr || '').toLowerCase()] || <span className="text-slate-500">—</span>)}</td>
                  {isLxc && <td className="px-3 py-2 font-mono text-xs text-slate-400">{p.gw || '-'}</td>}
                  <td className="px-3 py-2 font-mono text-xs">{p.tag || '-'}</td>
                  <td className="px-3 py-2">
                    {(p.firewall === '1' || p.firewall === 1)
                      ? <Check className="w-4 h-4 text-green-400"/>
                      : <X className="w-4 h-4 text-slate-600"/>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => startEdit(k)} className="p-1 text-slate-400 hover:text-blue-400" title="Modifica"><Pencil className="w-4 h-4"/></button>
                      <button onClick={() => remove(k)} className="p-1 text-slate-400 hover:text-red-400" title="Rimuovi"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="p-4 border-t border-slate-700 bg-slate-900/30">
          <div className="font-medium mb-3 text-sm font-mono text-blue-400">{editing}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            {isLxc ? (
              <>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Name (es. eth0)</label>
                  <input type="text" value={form.name||''} onChange={e => setForm({...form, name: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Bridge</label>
                  <input type="text" value={form.bridge||''} onChange={e => setForm({...form, bridge: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">IP (CIDR o dhcp)</label>
                  <input type="text" placeholder="192.168.1.10/24 o dhcp" value={form.ip||''} onChange={e => setForm({...form, ip: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Gateway</label>
                  <input type="text" value={form.gw||''} onChange={e => setForm({...form, gw: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">VLAN Tag</label>
                  <input type="text" value={form.tag||''} onChange={e => setForm({...form, tag: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">MAC (opz.)</label>
                  <input type="text" value={form.hwaddr||''} onChange={e => setForm({...form, hwaddr: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Modello</label>
                  <select value={form.model||'virtio'} onChange={e => setForm({...form, model: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm">
                    <option value="virtio">VirtIO (paravirt)</option>
                    <option value="e1000">Intel E1000</option>
                    <option value="rtl8139">Realtek RTL8139</option>
                    <option value="vmxnet3">VMware vmxnet3</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Bridge</label>
                  <input type="text" value={form.bridge||''} onChange={e => setForm({...form, bridge: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">VLAN Tag</label>
                  <input type="text" value={form.tag||''} onChange={e => setForm({...form, tag: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">MAC (opz., auto se vuoto)</label>
                  <input type="text" value={form.hwaddr||''} onChange={e => setForm({...form, hwaddr: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Rate limit (MB/s)</label>
                  <input type="text" value={form.rate||''} onChange={e => setForm({...form, rate: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input type="checkbox" id="fw" checked={form.firewall === '1' || form.firewall === 1}
                    onChange={e => setForm({...form, firewall: e.target.checked ? '1' : ''})}/>
                  <label htmlFor="fw" className="text-sm">Firewall</label>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm">Annulla</button>
            <button onClick={save} disabled={busy} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
              Salva
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const VmStatsCards = ({ status }) => {
  const cpuPct = (status.cpu || 0) * 100;
  const memPct = status.maxmem ? (status.mem / status.maxmem) * 100 : 0;
  const diskPct = status.maxdisk ? (status.disk / status.maxdisk) * 100 : 0;
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
        <div className="text-xs text-slate-400 mb-1">CPU</div>
        <div className={`text-xl font-bold ${thresholdTextColor(cpuPct)}`}>{cpuPct.toFixed(1)}%</div>
        <ProgressBar value={cpuPct} max={100} color="bg-green-500"/>
      </div>
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
        <div className="text-xs text-slate-400 mb-1">RAM <span className={`ml-1 ${thresholdTextColor(memPct)}`}>({memPct.toFixed(0)}%)</span></div>
        <div className="text-xl font-bold">{formatBytes(status.mem)} / {formatBytes(status.maxmem)}</div>
        <ProgressBar value={status.mem} max={status.maxmem} color="bg-blue-500"/>
      </div>
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
        <div className="text-xs text-slate-400 mb-1">Disco <span className={`ml-1 ${thresholdTextColor(diskPct)}`}>({diskPct.toFixed(0)}%)</span></div>
        <div className="text-xl font-bold">{formatBytes(status.disk)} / {formatBytes(status.maxdisk)}</div>
        <ProgressBar value={status.disk} max={status.maxdisk} color="bg-purple-500"/>
      </div>
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
        <div className="text-xs text-slate-400 mb-1">Rete (in/out)</div>
        <div className="text-sm font-bold">↓ {formatBytes(status.netin)}</div>
        <div className="text-sm font-bold">↑ {formatBytes(status.netout)}</div>
      </div>
    </div>
  );
};

const VMDetail = ({ cluster, vm, onBack, refreshInterval = 3 }) => {
  const [config, setConfig] = useState(null);
  const [vtype, setVtype] = useState(null);
  const [status, setStatus] = useState(null);
  const [rrd, setRrd] = useState([]);
  const [timeframe, setTimeframe] = useState('hour');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState(null);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [cfg, st, rd] = await Promise.all([
        axios.get(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/config`),
        axios.get(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/status`),
        axios.get(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/rrddata?timeframe=${timeframe}`).catch(() => ({data:[]})),
      ]);
      setConfig(cfg.data.config);
      setVtype(cfg.data.type);
      setStatus(st.data);
      setRrd(rd.data || []);
      // Inizializza form con i campi editabili SOLO al primo caricamento (non durante refresh)
      if (!silent) {
        const c = cfg.data.config;
        if (cfg.data.type === 'lxc') {
          setForm({ hostname: c.hostname || '', cores: c.cores || 1, memory: c.memory || 512, swap: c.swap || 0, onboot: c.onboot ? 1 : 0, description: c.description || '' });
        } else {
          setForm({ name: c.name || '', cores: c.cores || 1, sockets: c.sockets || 1, memory: c.memory || 512, balloon: c.balloon ?? c.memory ?? 512, onboot: c.onboot ? 1 : 0, description: c.description || '', boot: c.boot || '', ostype: c.ostype || '' });
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(() => fetchData(true), refreshInterval * 1000);
    return () => clearInterval(iv);
  }, [vm.vmid, vm.node, timeframe, refreshInterval]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = { ...form };
      // Normalizza tipi numerici
      ['cores','sockets','memory','swap','balloon','onboot'].forEach(k => {
        if (payload[k] !== undefined && payload[k] !== '') payload[k] = Number(payload[k]);
      });
      await axios.put(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/config`, payload);
      setMsg({type:'ok', text:'Configurazione salvata'});
      fetchData();
    } catch (err) {
      setMsg({type:'err', text: err.response?.data?.detail || err.message});
    } finally {
      setSaving(false);
    }
  };

  const doAction = async (action) => {
    if ((action === 'stop' || action === 'reset') && !confirm(`Confermi ${action} di ${vm.name}?`)) return;
    try {
      await axios.post(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/action?action=${action}`);
      setTimeout(fetchData, 1500);
    } catch (err) {
      alert(traduciErrore(err));
    }
  };

  const vmSectionMeta = [
    { id: 'stats', title: 'Risorse (CPU/RAM/Disco/Rete)' },
    { id: 'charts', title: 'Metriche Storiche VM' },
    { id: 'config', title: 'Configurazione Hardware & Opzioni' },
    { id: 'firewall', title: 'Firewall VM' },
    { id: 'fwlog', title: 'Log Firewall VM' },
    { id: 'network', title: 'Interfacce di Rete VM' },
    { id: 'disks', title: 'Dischi / Volumi' },
    { id: 'boot', title: 'Ordine di Boot' },
    { id: 'snapshots', title: 'Snapshot' },
    { id: 'backups', title: 'Backup' },
    { id: 'tasks', title: 'Log Tasks VM' },
    { id: 'raw', title: 'Config raw' },
  ];
  const { sections: vmSections, toggle: vmToggle, move: vmMove, reset: vmReset } = useSectionManager('glu2k_vm_sections', vmSectionMeta);

  if (loading) return (
    <div className="flex items-center justify-center p-12 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin mr-3" /> Caricamento configurazione VM...
    </div>
  );

  if (error) return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-slate-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4"/> Indietro
      </button>
      <div className="p-6 bg-red-900/30 border border-red-700 rounded-lg text-red-300">
        <div className="flex items-center gap-2 font-bold mb-2"><AlertCircle className="w-5 h-5"/> Errore</div>
        <code className="text-sm">{error}</code>
      </div>
    </div>
  );

  const isRunning = status?.status === 'running';
  const isLxc = vtype === 'lxc';
  // Disk entries (scsi0, virtio0, rootfs, mp0..)
  const diskKeys = Object.keys(config).filter(k => /^(scsi|virtio|ide|sata|rootfs|mp)\d*$/.test(k));
  const netKeys = Object.keys(config).filter(k => /^net\d+$/.test(k));

  const vmIsVisible = (id) => vmSections.find(s => s.id === id)?.visible;
  const vmOrder = (id) => vmSections.findIndex(s => s.id === id);

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-slate-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4"/> Torna al cluster
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-2 flex-wrap">
            <Cpu className="w-6 h-6 text-purple-400"/> {vm.name}
            <span className="text-slate-500 text-lg font-mono">#{vm.vmid}</span>
            <span className="text-xs uppercase px-2 py-0.5 bg-slate-700 rounded">{vtype}</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-900/40 border border-blue-600/50 rounded-lg text-sm font-medium text-blue-300">
              <Server className="w-4 h-4"/> Nodo: <span className="font-mono font-bold text-blue-200">{vm.node}</span>
            </span>
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            Stato: <span className={isRunning ? 'text-green-400' : 'text-slate-400'}>{status?.status}</span>
            {isRunning && ` · uptime ${formatUptime(status?.uptime)}`}
          </p>
        </div>
        <div className="flex gap-2">
          {!isRunning && (
            <button onClick={() => doAction('start')} className="flex items-center gap-2 px-3 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm">
              <Play className="w-4 h-4"/> Start
            </button>
          )}
          {isRunning && (
            <>
              <button onClick={() => doAction('shutdown')} className="flex items-center gap-2 px-3 py-2 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm">
                <Power className="w-4 h-4"/> Shutdown
              </button>
              <button onClick={() => doAction('stop')} className="flex items-center gap-2 px-3 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm">
                <Square className="w-4 h-4"/> Stop
              </button>
              <button onClick={() => doAction('reboot')} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">
                <RefreshCw className="w-4 h-4"/> Reboot
              </button>
            </>
          )}
          <button onClick={() => openConsole(cluster.id, vm.node, vm.vmid, vtype, `Console — ${vm.name} #${vm.vmid}`)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm">
            <Monitor className="w-4 h-4"/> Console
          </button>
        </div>
      </div>

      <SectionManager sections={vmSections} meta={vmSectionMeta} onToggle={vmToggle} onMove={vmMove} onReset={vmReset}/>

      {isRunning && (
        <div className="p-3 mb-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-yellow-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4"/> La VM è in esecuzione: alcune modifiche hardware richiedono un riavvio per diventare effettive.
        </div>
      )}

      <div className="flex flex-col">
      {vmIsVisible('stats') && isRunning && status && (
        <div style={{order: vmOrder('stats')}}><VmStatsCards status={status}/></div>
      )}

      {vmIsVisible('charts') && (
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6" style={{order: vmOrder('charts')}}>
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="font-bold flex items-center gap-2"><Activity className="w-4 h-4"/> Metriche Storiche</div>
          <select value={timeframe} onChange={e => setTimeframe(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
            <option value="hour">Ultima ora</option>
            <option value="day">Ultimo giorno</option>
            <option value="week">Ultima settimana</option>
            <option value="month">Ultimo mese</option>
            <option value="year">Ultimo anno</option>
          </select>
        </div>
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">CPU (%)</div>
            <LineChart data={rrd.map(d => ({...d, cpupct:(d.cpu||0)*100}))} series={[
              {key:'cpupct', label:'CPU', color:'#10b981'}
            ]} formatY={v => v.toFixed(0)+'%'}/>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">Memoria (B)</div>
            <LineChart data={rrd} series={[
              {key:'mem', label:'Used', color:'#f59e0b'},
              {key:'maxmem', label:'Max', color:'#64748b'}
            ]} formatY={v => formatBytes(v)}/>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">Traffico di Rete (B/s)</div>
            <LineChart data={rrd} series={[
              {key:'netin', label:'IN', color:'#3b82f6'},
              {key:'netout', label:'OUT', color:'#8b5cf6'}
            ]} formatY={v => formatBytes(v)+'/s'}/>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">Disco I/O (B/s)</div>
            <LineChart data={rrd} series={[
              {key:'diskread', label:'Read', color:'#06b6d4'},
              {key:'diskwrite', label:'Write', color:'#ec4899'}
            ]} formatY={v => formatBytes(v)+'/s'}/>
          </div>
        </div>
      </div>
      )}

      {vmIsVisible('config') && (
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6" style={{order: vmOrder('config')}}>
        <div className="p-4 border-b border-slate-700 font-bold flex items-center gap-2">
          <Settings className="w-4 h-4"/> Configurazione Hardware & Opzioni
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">{isLxc ? 'Hostname' : 'Nome'}</label>
            <input type="text" value={isLxc ? form.hostname : form.name}
              onChange={e => setForm({...form, [isLxc ? 'hostname' : 'name']: e.target.value})}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Cores</label>
            <input type="number" min="1" value={form.cores}
              onChange={e => setForm({...form, cores: e.target.value})}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
          </div>
          {!isLxc && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Sockets</label>
              <input type="number" min="1" value={form.sockets}
                onChange={e => setForm({...form, sockets: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-400 block mb-1">RAM (MB)</label>
            <input type="number" min="128" step="128" value={form.memory}
              onChange={e => setForm({...form, memory: e.target.value})}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
          </div>
          {isLxc ? (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Swap (MB)</label>
              <input type="number" min="0" value={form.swap}
                onChange={e => setForm({...form, swap: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
            </div>
          ) : (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Balloon min (MB)</label>
              <input type="number" min="0" value={form.balloon}
                onChange={e => setForm({...form, balloon: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
            </div>
          )}
          {!isLxc && (
            <>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Boot order</label>
                <input type="text" placeholder="order=scsi0;ide2;net0" value={form.boot}
                  onChange={e => setForm({...form, boot: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"/>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">OS Type</label>
                <select value={form.ostype}
                  onChange={e => setForm({...form, ostype: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                  <option value="">-</option>
                  <option value="l26">Linux 2.6+ / 3.x / 4.x / 5.x / 6.x</option>
                  <option value="l24">Linux 2.4</option>
                  <option value="win11">Windows 11/2022</option>
                  <option value="win10">Windows 10/2016/2019</option>
                  <option value="win8">Windows 8/2012</option>
                  <option value="win7">Windows 7</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="onboot" checked={!!Number(form.onboot)}
              onChange={e => setForm({...form, onboot: e.target.checked ? 1 : 0})}
              className="w-4 h-4"/>
            <label htmlFor="onboot" className="text-sm text-slate-300">Start at boot</label>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-400 block mb-1">Descrizione / Note</label>
            <textarea rows="2" value={form.description}
              onChange={e => setForm({...form, description: e.target.value})}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"/>
          </div>
        </div>
        <div className="p-4 border-t border-slate-700 flex items-center justify-between gap-4">
          <div className="text-sm">
            {msg && (
              <span className={msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}>
                {msg.text}
              </span>
            )}
          </div>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium">
            {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            Salva Configurazione
          </button>
        </div>
      </div>
      )}

      {vmIsVisible('disks') && (
      <div style={{order: vmOrder('disks')}}><VMDisksSection cluster={cluster} vm={vm} vtype={vtype} config={config} diskKeys={diskKeys} onChange={fetchData}/></div>
      )}

      {vmIsVisible('boot') && !isLxc && (
      <div style={{order: vmOrder('boot')}}><VMBootOrderSection cluster={cluster} vm={vm} config={config} onChange={fetchData}/></div>
      )}

      {vmIsVisible('firewall') && (
      <div style={{order: vmOrder('firewall')}}><FirewallSection
        basePath={`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/firewall`}
        title="Firewall VM"
        isVM={true}
        onToggleEnable={async (newEnable) => {
          await axios.put(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/firewall/options`, { enable: newEnable });
          const updates = {};
          netKeys.forEach(k => {
            const parsed = parseNetString(config[k]);
            if (newEnable) parsed.firewall = '1'; else delete parsed.firewall;
            updates[k] = buildNetString(parsed, isLxc);
          });
          if (Object.keys(updates).length > 0) {
            await axios.put(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/config`, updates);
          }
          fetchData();
        }}
      /></div>
      )}

      {vmIsVisible('fwlog') && (
        <div style={{order: vmOrder('fwlog')}}><FirewallLogSection logUrl={`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/firewall/log`} title="Log Firewall VM"/></div>
      )}

      {vmIsVisible('network') && (
        <div style={{order: vmOrder('network')}}><VMNetworkSection cluster={cluster} vm={vm} vtype={vtype} config={config} netKeys={netKeys} onChange={fetchData}/></div>
      )}

      {vmIsVisible('snapshots') && (
        <div style={{order: vmOrder('snapshots')}}><SnapshotsSection cluster={cluster} vm={vm} isRunning={isRunning}/></div>
      )}

      {vmIsVisible('backups') && (
        <div style={{order: vmOrder('backups')}}><BackupsSection cluster={cluster} vm={vm}/></div>
      )}

      {vmIsVisible('tasks') && (
        <div style={{order: vmOrder('tasks')}}><TasksSection tasksUrl={`${API_BASE}/clusters/${cluster.id}/nodes/${vm.node}/tasks?limit=30&vmid=${vm.vmid}`} cluster={cluster} title={`Log Tasks VM #${vm.vmid}`}/></div>
      )}

      {vmIsVisible('raw') && (
      <details className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden" style={{order: vmOrder('raw')}}>
        <summary className="p-4 font-bold cursor-pointer hover:bg-slate-700/30">Config raw (tutte le chiavi)</summary>
        <pre className="p-4 text-xs font-mono text-slate-400 overflow-x-auto max-h-80 overflow-y-auto bg-slate-900/50 border-t border-slate-700">
{JSON.stringify(config, null, 2)}
        </pre>
      </details>
      )}
      </div>
    </div>
  );
};

const DownloadAssetModal = ({ cluster, node, kind, onClose, onDownloaded }) => {
  // kind: 'vztmpl' | 'iso'
  const [tab, setTab] = useState(kind === 'vztmpl' ? 'catalog' : 'url');
  const [stores, setStores] = useState([]);
  const [targetStore, setTargetStore] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState('');
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const st = await axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${node}/storage`);
        const stores = st.data.filter(s => s.active && (s.content||'').includes(kind));
        setStores(stores);
        if (stores[0]) setTargetStore(stores[0].storage);
      } catch (e) { setErr(e.response?.data?.detail || e.message); }
    })();
  }, [node, kind, cluster.id]);

  useEffect(() => {
    if (tab !== 'catalog' || kind !== 'vztmpl') return;
    setCatalogLoading(true);
    axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${node}/aplinfo`)
      .then(r => setCatalog(r.data || []))
      .catch(e => setErr(e.response?.data?.detail || e.message))
      .finally(() => setCatalogLoading(false));
  }, [tab, node, kind, cluster.id]);

  const downloadCatalog = async () => {
    setDownloading(true); setErr(null); setMsg(null);
    try {
      await axios.post(`${API_BASE}/clusters/${cluster.id}/nodes/${node}/aplinfo/download`, {
        storage: targetStore, template: selectedTpl,
      });
      setMsg('Download avviato! Può richiedere minuti. Ricarica la lista template quando finisce.');
      setTimeout(() => { onDownloaded(); }, 3000);
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
    finally { setDownloading(false); }
  };

  const downloadUrl = async () => {
    setDownloading(true); setErr(null); setMsg(null);
    try {
      await axios.post(`${API_BASE}/clusters/${cluster.id}/nodes/${node}/storage/${targetStore}/download-url`, {
        url, filename, content: kind,
      });
      setMsg('Download avviato! Ricarica la lista quando finisce.');
      setTimeout(() => { onDownloaded(); }, 3000);
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
    finally { setDownloading(false); }
  };

  // Auto-fill filename from URL
  useEffect(() => {
    if (!filename && url) {
      const name = url.split('/').pop().split('?')[0];
      if (name) setFilename(name);
    }
  }, [url]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-800 w-full max-w-3xl rounded-xl border border-slate-700 overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-400"/>
            Scarica {kind === 'vztmpl' ? 'Template LXC' : 'ISO'} su {node}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
        </div>

        {kind === 'vztmpl' && (
          <div className="flex gap-1 px-4 pt-3">
            <button onClick={() => setTab('catalog')} className={`px-3 py-1.5 rounded text-xs font-medium ${tab==='catalog'?'bg-blue-600 text-white':'bg-slate-700 text-slate-300'}`}>Catalogo Proxmox/TurnKey</button>
            <button onClick={() => setTab('url')} className={`px-3 py-1.5 rounded text-xs font-medium ${tab==='url'?'bg-blue-600 text-white':'bg-slate-700 text-slate-300'}`}>Da URL</button>
          </div>
        )}

        <div className="p-4 overflow-y-auto space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Storage di destinazione *</label>
            <select value={targetStore} onChange={e => setTargetStore(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm">
              {stores.map(s => <option key={s.storage} value={s.storage}>{s.storage} ({s.type})</option>)}
            </select>
            {stores.length === 0 && <p className="text-xs text-yellow-400 mt-1">Nessuno storage supporta contenuto "{kind}"</p>}
          </div>

          {tab === 'catalog' && kind === 'vztmpl' && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Template</label>
              {catalogLoading ? (
                <div className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Caricamento catalogo...</div>
              ) : (
                <div className="max-h-80 overflow-y-auto border border-slate-700 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Sezione</th>
                        <th className="px-3 py-2 text-left">Template</th>
                        <th className="px-3 py-2 text-left">OS</th>
                        <th className="px-3 py-2 text-left">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalog.map(t => (
                        <tr key={t.template} onClick={() => setSelectedTpl(t.template)}
                          className={`border-t border-slate-700 cursor-pointer hover:bg-slate-700/30 ${selectedTpl === t.template ? 'bg-blue-900/30' : ''}`}>
                          <td className="px-3 py-1.5"><span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${t.section==='turnkeylinux'?'bg-purple-900/40 text-purple-300':'bg-slate-700 text-slate-300'}`}>{t.section}</span></td>
                          <td className="px-3 py-1.5 font-mono">{t.template}</td>
                          <td className="px-3 py-1.5 text-slate-400">{t.os || '-'}</td>
                          <td className="px-3 py-1.5 text-slate-400">{t.infopage ? '' : (t.headline||'').slice(0,30)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button onClick={downloadCatalog} disabled={!selectedTpl || !targetStore || downloading}
                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium">
                {downloading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>}
                Scarica template
              </button>
            </div>
          )}

          {tab === 'url' && (
            <>
              <div>
                <label className="text-xs text-slate-400 block mb-1">URL *</label>
                <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="https://releases.ubuntu.com/24.04/ubuntu-24.04-desktop-amd64.iso"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"/>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome file *</label>
                <input type="text" value={filename} onChange={e => setFilename(e.target.value)}
                  placeholder={kind==='iso'?'ubuntu-24.04.iso':'debian-12.tar.zst'}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"/>
              </div>
              <button onClick={downloadUrl} disabled={!url || !filename || !targetStore || downloading}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium">
                {downloading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>}
                Avvia download
              </button>
            </>
          )}

          {err && <div className="p-2 bg-red-900/30 border border-red-700 rounded text-red-300 text-xs">{err}</div>}
          {msg && <div className="p-2 bg-green-900/30 border border-green-700 rounded text-green-300 text-xs">{msg}</div>}
        </div>

        <div className="p-3 border-t border-slate-700 flex justify-between items-center">
          <span className="text-xs text-slate-500">Il download gira in background sul nodo Proxmox</span>
          <button onClick={onClose} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm">Chiudi</button>
        </div>
      </div>
    </div>
  );
};

const SnapshotsSection = ({ cluster, vm, isRunning }) => {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ snapname: '', description: '', vmstate: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const snapSort = useSortable('snaptime', 'desc');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/snapshots`);
      setSnapshots(res.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [vm.vmid, vm.node]);

  const createSnap = async () => {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{1,39}$/.test(form.snapname)) {
      alert("Nome snapshot: lettera iniziale + max 40 caratteri alfanumerici/underscore");
      return;
    }
    setBusy(true); setMsg(null);
    try {
      await axios.post(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/snapshots`, form);
      setMsg({type:'ok', text:'Snapshot creato'});
      setShowCreate(false);
      setForm({ snapname: '', description: '', vmstate: 0 });
      fetchData();
    } catch (err) { setMsg({type:'err', text: err.response?.data?.detail || err.message}); }
    finally { setBusy(false); }
  };

  const rollbackSnap = async (s) => {
    if (!confirm(`Rollback a snapshot "${s.name}"?\nLo stato attuale verrà PERSO.`)) return;
    try {
      await axios.post(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/snapshots/${s.name}/rollback`);
      setMsg({type:'ok', text:`Rollback a "${s.name}" avviato`});
      setTimeout(fetchData, 2000);
    } catch (err) { alert(traduciErrore(err)); }
  };

  const delSnap = async (s) => {
    if (!confirm(`Eliminare snapshot "${s.name}"?`)) return;
    try {
      await axios.delete(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/snapshots/${s.name}`);
      fetchData();
    } catch (err) { alert(traduciErrore(err)); }
  };

  const fmtTime = (ts) => ts ? new Date(ts*1000).toLocaleString() : '-';
  // Esclude snapshot "current" (stato attuale, non è un vero snapshot)
  const realSnaps = snapshots.filter(s => s.name !== 'current');
  const isLxc = vm.type === 'lxc';

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="font-bold flex items-center gap-2">
          <HardDrive className="w-4 h-4"/> Snapshot ({realSnaps.length})
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="p-1.5 rounded hover:bg-slate-700 text-slate-400"><RefreshCw className="w-4 h-4"/></button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs">
            <Plus className="w-3.5 h-3.5"/> Nuovo Snapshot
          </button>
        </div>
      </div>

      {msg && <div className={`px-4 py-2 text-xs border-b border-slate-700 ${msg.type==='ok'?'bg-green-900/20 text-green-300':'bg-red-900/20 text-red-300'}`}>{msg.text}</div>}

      {showCreate && (
        <div className="p-4 border-b border-slate-700 bg-slate-900/30 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Nome * (lettera + alfanumerici/underscore)</label>
              <input type="text" value={form.snapname} onChange={e => setForm({...form, snapname: e.target.value.replace(/[^a-zA-Z0-9_]/g,'')})}
                placeholder="pre_update_2026"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono"/>
            </div>
            {!isLxc && isRunning && (
              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.vmstate}
                    onChange={e => setForm({...form, vmstate: e.target.checked ? 1 : 0})}/>
                  Includi stato RAM (snapshot live)
                </label>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Descrizione</label>
            <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              placeholder="Note opzionali..." className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm"/>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm">Annulla</button>
            <button onClick={createSnap} disabled={busy || !form.snapname}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
              Crea Snapshot
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-4 text-slate-400 text-sm">Caricamento...</div>
      ) : realSnaps.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm">Nessuno snapshot</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-slate-900/50 text-slate-400 uppercase">
            <tr>
              <SortTh label="Nome" sortKey="name" current={snapSort.sortKey} dir={snapSort.sortDir} onSort={snapSort.requestSort}/>
              <SortTh label="Data" sortKey="snaptime" current={snapSort.sortKey} dir={snapSort.sortDir} onSort={snapSort.requestSort}/>
              <SortTh label="Parent" sortKey="parent" current={snapSort.sortKey} dir={snapSort.sortDir} onSort={snapSort.requestSort}/>
              <th className="px-3 py-2 text-left">Descrizione</th>
              <th className="px-3 py-2 text-left">RAM</th>
              <th className="px-3 py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {snapSort.sortFn(realSnaps).map(s => (
              <tr key={s.name} className="border-t border-slate-700 hover:bg-slate-700/30">
                <td className="px-3 py-2 font-mono font-medium text-blue-400">{s.name}</td>
                <td className="px-3 py-2 text-slate-300">{fmtTime(s.snaptime)}</td>
                <td className="px-3 py-2 font-mono text-slate-500">{s.parent || '-'}</td>
                <td className="px-3 py-2 text-slate-400 truncate max-w-[240px]" title={s.description}>{s.description || '-'}</td>
                <td className="px-3 py-2">{s.vmstate ? <Check className="w-4 h-4 text-green-400"/> : <X className="w-4 h-4 text-slate-600"/>}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => rollbackSnap(s)} title="Rollback"
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-600/20 hover:bg-orange-600 text-orange-300 hover:text-white border border-orange-500/30 rounded text-xs">
                      <RefreshCw className="w-3 h-3"/> Rollback
                    </button>
                    <button onClick={() => delSnap(s)} title="Elimina"
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 rounded text-xs">
                      <Trash2 className="w-3 h-3"/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const BackupsSection = ({ cluster, vm }) => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storages, setStorages] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ storage: '', mode: 'snapshot', compress: 'zstd', notes: '', remove: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const bkSort = useSortable('ctime', 'desc');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${vm.node}/backups?vmid=${vm.vmid}`).catch(() => ({data: []})),
        axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${vm.node}/storage`).catch(() => ({data: []})),
      ]);
      setBackups(b.data || []);
      const backupStores = (s.data || []).filter(x => x.active && (x.content||'').includes('backup'));
      setStorages(backupStores);
      if (backupStores[0] && !form.storage) setForm(f => ({...f, storage: backupStores[0].storage}));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [vm.vmid, vm.node]);

  const createBackup = async () => {
    setBusy(true); setMsg(null);
    try {
      await axios.post(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/backup`, form);
      setMsg({type:'ok', text:'Backup avviato in background. Controlla il Log Tasks.'});
      setShowCreate(false);
      setTimeout(fetchData, 5000);
    } catch (err) { setMsg({type:'err', text: err.response?.data?.detail || err.message}); }
    finally { setBusy(false); }
  };

  const delBackup = async (b) => {
    if (!confirm(`Eliminare backup ${b.volid}?`)) return;
    try {
      await axios.delete(`${API_BASE}/clusters/${cluster.id}/nodes/${vm.node}/backups?volid=${encodeURIComponent(b.volid)}`);
      fetchData();
    } catch (err) { alert(traduciErrore(err)); }
  };

  const restoreBackup = async (b) => {
    const newVmid = prompt(`Ripristina in un nuovo ${vm.type === 'lxc' ? 'container' : 'VM'}. Inserisci VMID (vuoto = sovrascrivi #${vm.vmid}):`, '');
    const force = newVmid === '' || newVmid === null;
    const targetVmid = force ? vm.vmid : parseInt(newVmid);
    if (!targetVmid) return;
    if (force && !confirm(`ATTENZIONE: sovrascrivere la VM/CT ${vm.vmid} con questo backup? Operazione irreversibile!`)) return;
    try {
      await axios.post(`${API_BASE}/clusters/${cluster.id}/nodes/${vm.node}/restore`, {
        vmid: targetVmid, volid: b.volid, type: vm.type, force: force ? 1 : 0,
      });
      setMsg({type:'ok', text:'Restore avviato. Controlla il Log Tasks.'});
    } catch (err) { alert(traduciErrore(err)); }
  };

  const fmtTime = (ts) => ts ? new Date(ts*1000).toLocaleString() : '-';
  const fmtBytes = (b) => b ? formatBytes(b) : '-';

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="font-bold flex items-center gap-2"><Database className="w-4 h-4"/> Backup ({backups.length})</div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="p-1.5 rounded hover:bg-slate-700 text-slate-400"><RefreshCw className="w-4 h-4"/></button>
          <button onClick={() => setShowCreate(true)} disabled={storages.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-xs">
            <Plus className="w-3.5 h-3.5"/> Nuovo Backup
          </button>
        </div>
      </div>

      {msg && <div className={`px-4 py-2 text-xs border-b border-slate-700 ${msg.type==='ok'?'bg-green-900/20 text-green-300':'bg-red-900/20 text-red-300'}`}>{msg.text}</div>}

      {showCreate && (
        <div className="p-4 border-b border-slate-700 bg-slate-900/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Storage</label>
              <select value={form.storage} onChange={e => setForm({...form, storage: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs">
                {storages.map(s => <option key={s.storage} value={s.storage}>{s.storage}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Modalità</label>
              <select value={form.mode} onChange={e => setForm({...form, mode: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs">
                <option value="snapshot">Snapshot (no downtime)</option>
                <option value="suspend">Suspend</option>
                <option value="stop">Stop</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Compressione</label>
              <select value={form.compress} onChange={e => setForm({...form, compress: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs">
                <option value="zstd">zstd (veloce)</option>
                <option value="lzo">lzo</option>
                <option value="gzip">gzip (piccolo)</option>
                <option value="0">nessuna</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Prune vecchi</label>
              <select value={form.remove} onChange={e => setForm({...form, remove: parseInt(e.target.value)})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs">
                <option value="0">no</option>
                <option value="1">sì (policy storage)</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs text-slate-400 block mb-1">Note</label>
            <input type="text" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
              placeholder="Descrizione backup..." className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs"/>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs">Annulla</button>
            <button onClick={createBackup} disabled={busy || !form.storage}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-xs">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Database className="w-3.5 h-3.5"/>}
              Crea Backup
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-4 text-slate-400 text-sm">Caricamento...</div>
      ) : backups.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm">Nessun backup disponibile</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-slate-900/50 text-slate-400 uppercase">
            <tr>
              <SortTh label="Data" sortKey="ctime" current={bkSort.sortKey} dir={bkSort.sortDir} onSort={bkSort.requestSort}/>
              <SortTh label="Storage" sortKey="_storage" current={bkSort.sortKey} dir={bkSort.sortDir} onSort={bkSort.requestSort}/>
              <SortTh label="File" sortKey="volid" current={bkSort.sortKey} dir={bkSort.sortDir} onSort={bkSort.requestSort}/>
              <SortTh label="Size" sortKey="size" current={bkSort.sortKey} dir={bkSort.sortDir} onSort={bkSort.requestSort}/>
              <th className="px-3 py-2 text-left">Note</th>
              <th className="px-3 py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {bkSort.sortFn(backups).map(b => (
              <tr key={b.volid} className="border-t border-slate-700 hover:bg-slate-700/30">
                <td className="px-3 py-2 text-slate-300">{fmtTime(b.ctime)}</td>
                <td className="px-3 py-2 font-mono text-slate-400">{b._storage}</td>
                <td className="px-3 py-2 font-mono text-slate-400 truncate max-w-[200px]" title={b.volid}>{b.volid.split('/').pop()}</td>
                <td className="px-3 py-2 text-slate-400">{fmtBytes(b.size)}</td>
                <td className="px-3 py-2 text-slate-500 truncate max-w-[160px]" title={b.notes}>{b.notes || '-'}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => restoreBackup(b)} title="Ripristina"
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-600/20 hover:bg-green-600 text-green-300 hover:text-white border border-green-500/30 rounded text-xs">
                      <RefreshCw className="w-3 h-3"/> Restore
                    </button>
                    <button onClick={() => delBackup(b)} title="Elimina"
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 rounded text-xs">
                      <Trash2 className="w-3 h-3"/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const CreateVmModal = ({ cluster, nodes, onClose, onCreated }) => {
  const [kind, setKind] = useState('lxc');
  const [node, setNode] = useState(nodes.find(n => n.status==='online')?.node || '');
  const [vmid, setVmid] = useState('');
  const [storages, setStorages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [isos, setIsos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showDownload, setShowDownload] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [bridges, setBridges] = useState([]);
  const [form, setForm] = useState({
    hostname: '', name: '', password: '', ostemplate: '', iso: '',
    cores: 1, memory: 512, swap: 512,
    storage: '', diskSize: 8,
    bridge: 'vmbr0', ip: 'dhcp', gateway: '',
    ostype: 'l26', cpu: 'host', start: 0,
  });

  const [tplStores, setTplStores] = useState([]);
  const [tplStoreFilter, setTplStoreFilter] = useState('all');

  useEffect(() => {
    if (!node) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${API_BASE}/clusters/${cluster.id}/nodes/${node}/create-wizard-data?kind=${kind}`);
        const { vmid: newVmid, storage: stData, network: netData, contents } = res.data;

        setVmid(newVmid);

        // Storage per disco VM/CT
        setStorages(stData.filter(s => s.active && ((s.content||'').includes('images') || (s.content||'').includes('rootdir'))));
        const desired = kind === 'lxc' ? 'rootdir' : 'images';
        const def = stData.find(s => s.active && (s.content||'').includes(desired));
        if (def) setForm(f => ({...f, storage: def.storage}));

        // Bridge
        const br = (netData || []).filter(i => i.type === 'bridge' && i.active).sort((a,b) => a.iface.localeCompare(b.iface));
        setBridges(br);
        if (br.length > 0) setForm(f => ({...f, bridge: f.bridge || br[0].iface}));

        // Template/ISO (già con _storage dal backend)
        const wanted = kind === 'lxc' ? 'vztmpl' : 'iso';
        const contentStores = stData.filter(s => s.active && (s.content||'').includes(wanted));
        setTplStores(contentStores);
        setTplStoreFilter('all');
        if (kind === 'lxc') setTemplates(contents); else setIsos(contents);
      } catch (err) { setError(err.response?.data?.detail || err.message); }
      finally { setLoading(false); }
    })();
  }, [node, kind, cluster.id, reloadTick]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (kind === 'lxc') {
        const payload = {
          vmid: Number(vmid),
          hostname: form.hostname,
          ostemplate: form.ostemplate,
          rootfs: `${form.storage}:${form.diskSize}`,
          cores: Number(form.cores),
          memory: Number(form.memory),
          swap: Number(form.swap),
          net0: `name=eth0,bridge=${form.bridge},ip=${form.ip || 'dhcp'}${form.gateway && form.ip !== 'dhcp' ? ',gw='+form.gateway : ''}`,
          unprivileged: 1,
          features: 'nesting=1',
          start: form.start,
        };
        if (form.password) payload.password = form.password;
        await axios.post(`${API_BASE}/clusters/${cluster.id}/nodes/${node}/lxc/create`, payload);
      } else {
        const payload = {
          vmid: Number(vmid),
          name: form.name,
          cores: Number(form.cores),
          memory: Number(form.memory),
          scsihw: 'virtio-scsi-pci',
          scsi0: `${form.storage}:${form.diskSize}`,
          net0: `virtio,bridge=${form.bridge}`,
          ostype: form.ostype,
          cpu: form.cpu,
          boot: 'order=ide2;scsi0;net0',
          start: form.start,
        };
        if (form.iso) payload.ide2 = `${form.iso},media=cdrom`;
        await axios.post(`${API_BASE}/clusters/${cluster.id}/nodes/${node}/qemu/create`, payload);
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally { setSubmitting(false); }
  };

  const onlineNodes = nodes.filter(n => n.status === 'online');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 w-full max-w-2xl rounded-xl border border-slate-700 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-slate-700">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-400"/> Crea nuova {kind === 'lxc' ? 'LXC Container' : 'VM QEMU'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-6 h-6"/></button>
        </div>

        <div className="flex gap-2 px-5 pt-4">
          <button onClick={() => setKind('lxc')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${kind==='lxc' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            LXC Container
          </button>
          <button onClick={() => setKind('qemu')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${kind==='qemu' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            VM QEMU
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Nodo *</label>
              <select required value={node} onChange={e => setNode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                {onlineNodes.map(n => <option key={n.node} value={n.node}>{n.node}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">VMID *</label>
              <input required type="number" value={vmid} onChange={e => setVmid(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"/>
            </div>
          </div>

          {kind === 'lxc' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Hostname *</label>
                  <input required type="text" value={form.hostname} onChange={e => setForm({...form, hostname: e.target.value})}
                    placeholder="nome-container"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Password root *</label>
                  <input required type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                    minLength="5"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-400">Template OS *</label>
                  <button type="button" onClick={() => setShowDownload(true)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                    <Download className="w-3 h-3"/> Scarica nuovo template
                  </button>
                </div>
                {tplStores.length > 1 && (
                  <select value={tplStoreFilter} onChange={e => { setTplStoreFilter(e.target.value); setForm(f => ({...f, ostemplate: ''})); }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2">
                    <option value="all">Tutti gli storage ({templates.length} template)</option>
                    {tplStores.map(s => {
                      const count = templates.filter(t => t._storage === s.storage).length;
                      const freeGB = s.total ? ((s.total - (s.used||0)) / 1073741824).toFixed(1) : '?';
                      return <option key={s.storage} value={s.storage}>{s.storage} ({count} template) — {freeGB} GB liberi</option>;
                    })}
                  </select>
                )}
                <select required value={form.ostemplate} onChange={e => setForm({...form, ostemplate: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                  <option value="">-- seleziona --</option>
                  {templates.filter(t => tplStoreFilter === 'all' || t._storage === tplStoreFilter).map(t => (
                    <option key={t.volid} value={t.volid}>[{t._storage}] {t.volid.split('/').pop()}</option>
                  ))}
                </select>
                {templates.length === 0 && !loading && <p className="text-xs text-yellow-400 mt-1">Nessun template. Clicca "Scarica nuovo template" per aggiungerne uno dal catalogo Proxmox/TurnKey.</p>}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome VM *</label>
                <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="nome-vm"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">ISO boot (opz.)</label>
                    <button type="button" onClick={() => setShowDownload(true)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                      <Download className="w-3 h-3"/> Scarica ISO
                    </button>
                  </div>
                  {tplStores.length > 1 && (
                    <select value={tplStoreFilter} onChange={e => { setTplStoreFilter(e.target.value); setForm(f => ({...f, iso: ''})); }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2">
                      <option value="all">Tutti gli storage ({isos.length} ISO)</option>
                      {tplStores.map(s => {
                        const count = isos.filter(i => i._storage === s.storage).length;
                        const freeGB = s.total ? ((s.total - (s.used||0)) / 1073741824).toFixed(1) : '?';
                        return <option key={s.storage} value={s.storage}>{s.storage} ({count} ISO) — {freeGB} GB liberi</option>;
                      })}
                    </select>
                  )}
                  <select value={form.iso} onChange={e => setForm({...form, iso: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                    <option value="">-- nessuno --</option>
                    {isos.filter(i => tplStoreFilter === 'all' || i._storage === tplStoreFilter).map(i => (
                      <option key={i.volid} value={i.volid}>[{i._storage}] {i.volid.split('/').pop()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">OS Type</label>
                  <select value={form.ostype} onChange={e => setForm({...form, ostype: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                    <option value="l26">Linux 2.6+</option>
                    <option value="win11">Windows 11/2022</option>
                    <option value="win10">Windows 10/2016/2019</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">CPU cores</label>
              <input type="number" min="1" value={form.cores} onChange={e => setForm({...form, cores: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">RAM (MB)</label>
              <input type="number" min="128" step="128" value={form.memory} onChange={e => setForm({...form, memory: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
            </div>
            {kind === 'lxc' && (
              <div>
                <label className="text-xs text-slate-400 block mb-1">Swap (MB)</label>
                <input type="number" min="0" value={form.swap} onChange={e => setForm({...form, swap: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Storage {kind==='lxc'?'rootfs':'disco'} *</label>
              <select required value={form.storage} onChange={e => setForm({...form, storage: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                <option value="">-- seleziona --</option>
                {storages.map(s => {
                  const used = s.used || 0;
                  const total = s.total || 0;
                  const freeGB = total > 0 ? ((total - used) / 1073741824).toFixed(1) : '?';
                  const totalGB = total > 0 ? (total / 1073741824).toFixed(1) : '?';
                  return <option key={s.storage} value={s.storage}>{s.storage} ({s.type}) — {freeGB} GB liberi / {totalGB} GB</option>;
                })}
              </select>
              {(() => {
                const sel = storages.find(s => s.storage === form.storage);
                if (!sel || !sel.total) return null;
                const used = sel.used || 0;
                const total = sel.total;
                const pct = Math.round((used / total) * 100);
                const usedGB = (used / 1073741824).toFixed(1);
                const freeGB = ((total - used) / 1073741824).toFixed(1);
                const totalGB = (total / 1073741824).toFixed(1);
                const barColor = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-orange-500' : 'bg-blue-500';
                return (
                  <div className="mt-1.5">
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>Usato: {usedGB} GB ({pct}%)</span>
                      <span>Libero: {freeGB} GB / {totalGB} GB</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full transition-all`} style={{width: `${pct}%`}}/>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Dimensione disco (GB) *</label>
              <input required type="number" min="1" value={form.diskSize} onChange={e => setForm({...form, diskSize: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"/>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Bridge</label>
              <select value={form.bridge} onChange={e => setForm({...form, bridge: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono">
                {bridges.map(b => (
                  <option key={b.iface} value={b.iface}>
                    {b.iface}{b.comments ? ` — ${b.comments.trim()}` : ''}{b.cidr ? ` (${b.cidr})` : ''}
                  </option>
                ))}
                {bridges.length === 0 && <option value={form.bridge}>{form.bridge}</option>}
              </select>
            </div>
            {kind === 'lxc' && (
              <>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">IP</label>
                  <input type="text" value={form.ip} onChange={e => setForm({...form, ip: e.target.value})}
                    placeholder="dhcp o 10.0.0.10/24"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Gateway</label>
                  <input type="text" value={form.gateway} onChange={e => setForm({...form, gateway: e.target.value})}
                    placeholder="10.0.0.1"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"/>
                </div>
              </>
            )}
          </div>
          {(() => {
            const sel = bridges.find(b => b.iface === form.bridge);
            if (!sel) return null;
            return (
              <div className="p-3 bg-slate-900/50 border border-slate-700 rounded-lg text-xs">
                <div className="flex items-center gap-2 mb-2">
                  <Network className="w-4 h-4 text-blue-400"/>
                  <span className="font-bold text-slate-200">{sel.iface}</span>
                  {sel.comments && <span className="text-slate-400">— {sel.comments.trim()}</span>}
                  <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold ${sel.active ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                    {sel.active ? 'ATTIVO' : 'INATTIVO'}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-slate-400">
                  <div>IP: <span className="text-slate-300 font-mono">{sel.address || sel.cidr || 'nessuno'}</span></div>
                  <div>Gateway: <span className="text-slate-300 font-mono">{sel.gateway || '-'}</span></div>
                  <div>Porte: <span className="text-slate-300 font-mono">{sel.bridge_ports || 'nessuna (interna)'}</span></div>
                  <div>VLAN aware: <span className="text-slate-300">{sel['bridge_vlan_aware'] ? 'Sì' : 'No'}</span></div>
                </div>
              </div>
            );
          })()}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.start} onChange={e => setForm({...form, start: e.target.checked ? 1 : 0})}/>
            Avvia dopo la creazione
          </label>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Annulla</button>
            <button type="submit" disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
              Crea {kind === 'lxc' ? 'Container' : 'VM'}
            </button>
          </div>
        </form>
      </div>
      {showDownload && (
        <DownloadAssetModal
          cluster={cluster}
          node={node}
          kind={kind === 'lxc' ? 'vztmpl' : 'iso'}
          onClose={() => setShowDownload(false)}
          onDownloaded={() => setReloadTick(t => t+1)}
        />
      )}
    </div>
  );
};

const ClusterDetail = ({ cluster, onSelectNode, onSelectVM, refreshInterval = 3 }) => {
  const [vms, setVms] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [rrdAgg, setRrdAgg] = useState([]);
  const [clusterStorage, setClusterStorage] = useState([]);
  const [showCreateVm, setShowCreateVm] = useState(false);
  const [timeframe, setTimeframe] = useState('hour');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const vmSort = useSortable('vmid', 'asc');

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/clusters/${cluster.id}/overview?timeframe=${timeframe}`);
      const { vms: vmsData, nodes: nodesData, storage: storageData, rrddata } = res.data;
      setVms(vmsData || []);
      setNodes(nodesData || []);
      setClusterStorage(storageData || []);
      // Aggrega rrddata da tutti i nodi
      const byTime = {};
      Object.values(rrddata || {}).forEach(arr => (arr || []).forEach(d => {
        const t = d.time;
        if (!byTime[t]) byTime[t] = { time: t, cpu: 0, memused: 0, memtotal: 0, netin: 0, netout: 0, loadavg: 0, _count: 0 };
        byTime[t].cpu += d.cpu || 0;
        byTime[t].memused += d.memused || 0;
        byTime[t].memtotal += d.memtotal || 0;
        byTime[t].netin += d.netin || 0;
        byTime[t].netout += d.netout || 0;
        byTime[t].loadavg += d.loadavg || 0;
        byTime[t]._count++;
      }));
      const agg = Object.values(byTime).sort((a,b) => a.time - b.time).map(d => ({
        ...d,
        cpupct: d._count > 0 ? (d.cpu / d._count) * 100 : 0,
      }));
      setRrdAgg(agg);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(() => fetchData(true), refreshInterval * 1000);
    return () => clearInterval(iv);
  }, [cluster.id, timeframe, refreshInterval]);

  const sectionMeta = [
    { id: 'stats', title: 'Statistiche' },
    { id: 'charts', title: 'Metriche Aggregate Cluster' },
    { id: 'nodes', title: 'Nodi' },
    { id: 'vms', title: 'VM e Container' },
    { id: 'firewall', title: 'Firewall Cluster' },
    { id: 'fwlog', title: 'Log Firewall Aggregato' },
    { id: 'tasks', title: 'Log Tasks Cluster' },
  ];
  const { sections, toggle, move, reset } = useSectionManager('glu2k_cluster_sections', sectionMeta);
  const isVisible = (id) => sections.find(s => s.id === id)?.visible;

  const doAction = async (vm, action) => {
    const key = `${vm.vmid}-${action}`;
    setActionLoading(key);
    try {
      await axios.post(`${API_BASE}/clusters/${cluster.id}/vms/${vm.node}/${vm.vmid}/action?action=${action}`);
      setTimeout(fetchData, 1500);
    } catch (err) {
      alert(traduciErrore(err));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-12 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin mr-3" /> Caricamento dati cluster...
    </div>
  );

  if (error) return (
    <div className="p-6 bg-red-900/30 border border-red-700 rounded-lg text-red-300">
      <div className="flex items-center gap-2 font-bold mb-2"><AlertCircle className="w-5 h-5"/> Errore connessione cluster</div>
      <code className="text-sm">{error}</code>
      <button onClick={fetchData} className="mt-3 px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg text-sm flex items-center gap-2">
        <RefreshCw className="w-4 h-4"/> Riprova
      </button>
    </div>
  );

  const running = vms.filter(v => v.status === 'running').length;

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderers = {};
  renderers.stats = (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <StatCard title="Nodi" value={nodes.length} icon={Server} color="bg-blue-500" onClick={() => scrollTo('section-nodes')}/>
        <StatCard title="VM/CT Totali" value={vms.length} icon={Cpu} color="bg-purple-500" onClick={() => scrollTo('section-vms')}/>
        <StatCard title="In Esecuzione" value={running} icon={Activity} color="bg-green-500" onClick={() => scrollTo('section-vms')}/>
        <StatCard title="Fermate" value={vms.length - running} icon={Square} color="bg-slate-500" onClick={() => scrollTo('section-vms')}/>
      </div>
  );
  renderers.charts = (
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="font-bold flex items-center gap-2"><Activity className="w-4 h-4"/> Metriche Aggregate Cluster</div>
          <select value={timeframe} onChange={e => setTimeframe(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
            <option value="hour">Ultima ora</option>
            <option value="day">Ultimo giorno</option>
            <option value="week">Ultima settimana</option>
            <option value="month">Ultimo mese</option>
            <option value="year">Ultimo anno</option>
          </select>
        </div>
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">CPU medio (%)</div>
            <LineChart data={rrdAgg} series={[
              {key:'cpupct', label:'CPU avg', color:'#10b981'}
            ]} formatY={v => v.toFixed(0)+'%'}/>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">Memoria totale cluster (B)</div>
            <LineChart data={rrdAgg} series={[
              {key:'memused', label:'Used', color:'#f59e0b'},
              {key:'memtotal', label:'Total', color:'#64748b'}
            ]} formatY={v => formatBytes(v)}/>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">Traffico di Rete aggregato (B/s)</div>
            <LineChart data={rrdAgg} series={[
              {key:'netin', label:'IN', color:'#3b82f6'},
              {key:'netout', label:'OUT', color:'#8b5cf6'}
            ]} formatY={v => formatBytes(v)+'/s'}/>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-2 font-medium">Load Average sommato</div>
            <LineChart data={rrdAgg} series={[
              {key:'loadavg', label:'Load', color:'#ec4899'}
            ]} formatY={v => v.toFixed(2)}/>
          </div>
        </div>
      </div>
  );
  renderers.nodes = (
      <div className="mb-6" id="section-nodes">
        <h3 className="font-bold text-lg mb-3">Nodi</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...nodes].sort((a,b) => a.node.localeCompare(b.node)).map(n => {
            const memPct = n.maxmem ? (n.mem/n.maxmem)*100 : 0;
            const diskPct = n.maxdisk ? (n.disk/n.maxdisk)*100 : 0;
            const cpuPct = (n.cpu || 0) * 100;
            const online = n.status === 'online';
            return (
              <div key={n.node} onClick={() => online && onSelectNode(n.node)}
                className={`bg-slate-800 p-4 rounded-lg border border-slate-700 ${online ? 'hover:border-blue-500 cursor-pointer' : 'opacity-60'} transition-colors`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="font-bold flex items-center gap-2">
                    <Server className="w-4 h-4 text-blue-400"/> {n.node}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${online ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                    {n.status}
                  </span>
                </div>
                {online && (
                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="flex justify-between mb-1"><span className="text-slate-400">CPU</span><span className={`font-bold ${thresholdTextColor(cpuPct, 'text-slate-400')}`}>{cpuPct.toFixed(1)}%</span></div>
                      <ProgressBar value={cpuPct} max={100} color="bg-green-500"/>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1"><span className="text-slate-400">RAM <span className={`font-bold ${thresholdTextColor(memPct, 'text-slate-400')}`}>({memPct.toFixed(0)}%)</span></span><span className="text-slate-400">{formatBytes(n.mem)} / {formatBytes(n.maxmem)}</span></div>
                      <ProgressBar value={memPct} max={100} color="bg-blue-500"/>
                    </div>
                    <div className="text-slate-500 pt-1">uptime: {formatUptime(n.uptime)}</div>
                    {/* Volumi storage del nodo */}
                    {clusterStorage.filter(s => s.node === n.node && s.maxdisk > 0).sort((a,b) => a.storage.localeCompare(b.storage)).map((s, i) => {
                      const pct = (s.disk / s.maxdisk) * 100;
                      return (
                        <div key={`${s.storage}-${i}`} className="mt-1 pt-1 border-t border-slate-700/50">
                          <div className="flex justify-between"><span className="text-slate-400 truncate">{s.storage} <span className={`font-bold ${thresholdTextColor(pct, 'text-slate-400')}`}>({pct.toFixed(0)}%)</span></span><span className="text-slate-500 text-[10px]">{formatBytes(s.disk)}/{formatBytes(s.maxdisk)}</span></div>
                          <ProgressBar value={pct} max={100} color="bg-teal-500"/>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
  );
  renderers.vms = (
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden" id="section-vms">
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h3 className="font-bold text-lg">VM e Container</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowCreateVm(true)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4"/> Crea VM/CT
            </button>
            <button onClick={fetchData} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700">
              <RefreshCw className="w-4 h-4"/>
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
            <tr>
              <SortTh label="Stato" sortKey="status" current={vmSort.sortKey} dir={vmSort.sortDir} onSort={vmSort.requestSort} className="px-4"/>
              <SortTh label="VMID" sortKey="vmid" current={vmSort.sortKey} dir={vmSort.sortDir} onSort={vmSort.requestSort} className="px-4"/>
              <SortTh label="Nome" sortKey="name" current={vmSort.sortKey} dir={vmSort.sortDir} onSort={vmSort.requestSort} className="px-4"/>
              <SortTh label="Tipo" sortKey="type" current={vmSort.sortKey} dir={vmSort.sortDir} onSort={vmSort.requestSort} className="px-4"/>
              <SortTh label="Nodo" sortKey="node" current={vmSort.sortKey} dir={vmSort.sortDir} onSort={vmSort.requestSort} className="px-4"/>
              <SortTh label="CPU" sortKey="cpu" current={vmSort.sortKey} dir={vmSort.sortDir} onSort={vmSort.requestSort} className="px-4"/>
              <SortTh label="RAM" sortKey="mem" current={vmSort.sortKey} dir={vmSort.sortDir} onSort={vmSort.requestSort} className="px-4"/>
              <SortTh label="Disco" sortKey="maxdisk" current={vmSort.sortKey} dir={vmSort.sortDir} onSort={vmSort.requestSort} className="px-4"/>
              <SortTh label="Uptime" sortKey="uptime" current={vmSort.sortKey} dir={vmSort.sortDir} onSort={vmSort.requestSort} className="px-4"/>
              <th className="px-4 py-3 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {vmSort.sortFn(vms).map(vm => {
              const isRunning = vm.status === 'running';
              const memPct = vm.maxmem ? Math.round((vm.mem / vm.maxmem) * 100) : 0;
              const diskPct = vm.maxdisk ? Math.round((vm.disk / vm.maxdisk) * 100) : 0;
              return (
                <tr key={vm.id} className="border-t border-slate-700 hover:bg-slate-700/30">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${isRunning ? 'bg-green-900/40 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-400' : 'bg-slate-500'}`}></span>
                      {vm.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400">{vm.vmid}</td>
                  <td className="px-4 py-3 font-medium">
                    <button onClick={() => onSelectVM(vm)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-500 rounded-md text-sm font-medium transition-all">
                      <Settings className="w-3.5 h-3.5"/>
                      {vm.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 uppercase text-xs text-slate-400">{vm.type}</td>
                  <td className="px-4 py-3 text-slate-400">{vm.node}</td>
                  <td className="px-4 py-3 text-slate-400">{isRunning ? `${(vm.cpu * 100).toFixed(1)}%` : '-'}</td>
                  <td className="px-4 py-3 text-slate-400">{isRunning ? `${memPct}% (${formatBytes(vm.mem)})` : '-'}</td>
                  <td className="px-4 py-3 text-slate-400">{vm.maxdisk ? `${formatBytes(vm.maxdisk)}${vm.disk ? ` (${diskPct}% usato)` : ''}` : '-'}</td>
                  <td className="px-4 py-3 text-slate-400">{formatUptime(vm.uptime)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {!isRunning && (
                        <button onClick={() => doAction(vm, 'start')} disabled={actionLoading === `${vm.vmid}-start`}
                          title="Start" className="p-1.5 rounded hover:bg-green-900/40 text-green-400 disabled:opacity-50">
                          {actionLoading === `${vm.vmid}-start` ? <Loader2 className="w-4 h-4 animate-spin"/> : <Play className="w-4 h-4"/>}
                        </button>
                      )}
                      {isRunning && (
                        <>
                          <button onClick={() => doAction(vm, 'shutdown')} disabled={actionLoading === `${vm.vmid}-shutdown`}
                            title="Shutdown" className="p-1.5 rounded hover:bg-yellow-900/40 text-yellow-400 disabled:opacity-50">
                            {actionLoading === `${vm.vmid}-shutdown` ? <Loader2 className="w-4 h-4 animate-spin"/> : <Power className="w-4 h-4"/>}
                          </button>
                          <button onClick={() => { if(confirm(`Stop forzato ${vm.name}?`)) doAction(vm, 'stop'); }} disabled={actionLoading === `${vm.vmid}-stop`}
                            title="Stop" className="p-1.5 rounded hover:bg-red-900/40 text-red-400 disabled:opacity-50">
                            {actionLoading === `${vm.vmid}-stop` ? <Loader2 className="w-4 h-4 animate-spin"/> : <Square className="w-4 h-4"/>}
                          </button>
                        </>
                      )}
                      <button onClick={() => openConsole(cluster.id, vm.node, vm.vmid, vm.type === 'lxc' ? 'lxc' : 'qemu', `Console — ${vm.name} #${vm.vmid}`)}
                        title="Console" className="p-1.5 rounded hover:bg-blue-900/40 text-blue-400">
                        <Monitor className="w-4 h-4"/>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {vms.length === 0 && (
              <tr><td colSpan="10" className="px-4 py-8 text-center text-slate-500">Nessuna VM trovata</td></tr>
            )}
          </tbody>
        </table>
      </div>
  );
  renderers.firewall = (
      <div className="mt-6">
        <FirewallSection basePath={`${API_BASE}/clusters/${cluster.id}/firewall`} title="Firewall Cluster (Datacenter)"/>
      </div>
  );
  renderers.fwlog = (
      <div className="mt-6">
        <ClusterFirewallLogSection logUrl={`${API_BASE}/clusters/${cluster.id}/firewall/log`} nodes={nodes}/>
      </div>
  );
  renderers.tasks = (
        <TasksSection tasksUrl={`${API_BASE}/clusters/${cluster.id}/tasks?limit=50`} cluster={cluster} title="Log Tasks Cluster"/>
  );

  return (
    <div>
      <SectionManager sections={sections} meta={sectionMeta} onToggle={toggle} onMove={move} onReset={reset}/>
      {sections.filter(s => s.visible).map(s => <React.Fragment key={s.id}>{renderers[s.id]}</React.Fragment>)}
      {showCreateVm && (
        <CreateVmModal cluster={cluster} nodes={nodes} onClose={() => setShowCreateVm(false)} onCreated={fetchData}/>
      )}
    </div>
  );
};

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('glu2k_user') || 'null'); } catch { return null; }
  });
  const [showUsers, setShowUsers] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    const onLogout = () => setCurrentUser(null);
    window.addEventListener('glu2k_logout', onLogout);
    return () => window.removeEventListener('glu2k_logout', onLogout);
  }, []);

  const logout = () => {
    localStorage.removeItem('glu2k_token');
    localStorage.removeItem('glu2k_user');
    setCurrentUser(null);
  };

  if (!currentUser) return <LoginPage onLogin={setCurrentUser}/>;

  return <MainApp currentUser={currentUser} onLogout={logout} showUsers={showUsers} setShowUsers={setShowUsers} showAudit={showAudit} setShowAudit={setShowAudit}/>;
}

function MainApp({ currentUser, onLogout, showUsers, setShowUsers, showAudit, setShowAudit }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('glu2k_theme') || 'dark');
  const [refreshInterval, setRefreshInterval] = useState(() => parseInt(localStorage.getItem('glu2k_refresh') || '3', 10));
  useEffect(() => { localStorage.setItem('glu2k_refresh', String(refreshInterval)); }, [refreshInterval]);

  useEffect(() => {
    const classes = ['theme-dark', 'theme-light', 'theme-gray'];
    document.documentElement.classList.remove(...classes);
    document.documentElement.classList.add(`theme-${theme}`);
    localStorage.setItem('glu2k_theme', theme);
  }, [theme]);

  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedVM, setSelectedVM] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCluster, setEditingCluster] = useState(null);
  const [loading, setLoading] = useState(false);
  const emptyForm = { name: '', host: '', fallback_hosts: '', port: 8006, auth_user: '', auth_token: '', auth_type: 'token', verify_ssl: false };
  const [formData, setFormData] = useState(emptyForm);

  const fetchClusters = async () => {
    try {
      const res = await axios.get(`${API_BASE}/clusters/`);
      setClusters(res.data);
    } catch (err) {
      console.error("Error fetching clusters", err);
    }
  };

  useEffect(() => {
    fetchClusters();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingCluster) {
        // PUT — se auth_token vuoto, il backend lo ignora
        const payload = { ...formData };
        if (!payload.auth_token) delete payload.auth_token;
        const res = await axios.put(`${API_BASE}/clusters/${editingCluster.id}`, payload);
        if (selectedCluster?.id === editingCluster.id) setSelectedCluster(res.data);
      } else {
        await axios.post(`${API_BASE}/clusters/`, formData);
      }
      setIsModalOpen(false);
      setEditingCluster(null);
      setFormData(emptyForm);
      fetchClusters();
    } catch (err) {
      alert(editingCluster ? "Errore durante la modifica." : "Errore durante l'aggiunta del server. Verifica i dati.");
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (cluster, e) => {
    if (e) e.stopPropagation();
    setEditingCluster(cluster);
    setFormData({
      name: cluster.name,
      host: cluster.host,
      fallback_hosts: cluster.fallback_hosts || '',
      port: cluster.port,
      auth_user: cluster.auth_user,
      auth_token: '',
      auth_type: cluster.auth_type,
      verify_ssl: cluster.verify_ssl,
    });
    setIsModalOpen(true);
  };

  const openAdd = () => {
    setEditingCluster(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCluster(null);
    setFormData(emptyForm);
  };

  const handleDelete = async (cluster, e) => {
    e.stopPropagation();
    if (!confirm(`Rimuovere il cluster "${cluster.name}"?`)) return;
    try {
      await axios.delete(`${API_BASE}/clusters/${cluster.id}`);
      if (selectedCluster?.id === cluster.id) setSelectedCluster(null);
      fetchClusters();
    } catch (err) {
      alert("Errore durante la rimozione");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-blue-400 flex items-center gap-2">
            <Server className="w-6 h-6" /> GLU2K
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto">
        <nav className="mt-6 px-4">
          <button
            onClick={() => { setSelectedCluster(null); setSelectedNode(null); setSelectedVM(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 ${!selectedCluster ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700/50'}`}>
            <Activity className="w-5 h-5" /> Dashboard
          </button>
          <div className="mt-8 mb-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Clusters
          </div>
          {clusters.map(c => (
            <ClusterTreeItem key={c.id}
              cluster={c}
              isSelected={selectedCluster?.id === c.id && !selectedNode && !selectedVM}
              selectedNodeName={selectedCluster?.id === c.id ? selectedNode : null}
              selectedVmId={selectedCluster?.id === c.id && selectedVM ? `${selectedVM.node}-${selectedVM.vmid}` : null}
              onSelectCluster={() => { setSelectedCluster(c); setSelectedNode(null); setSelectedVM(null); }}
              onSelectNode={(n) => { setSelectedCluster(c); setSelectedNode(n); setSelectedVM(null); }}
              onSelectVm={(vm) => { setSelectedCluster(c); setSelectedNode(null); setSelectedVM(vm); }}
              onEdit={(e) => openEdit(c, e)}
              onDelete={(e) => handleDelete(c, e)}
            />
          ))}
          <button
            onClick={openAdd}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:text-white hover:border-slate-400 transition-all text-sm"
          >
            <Plus className="w-4 h-4" /> Add Server
          </button>
        </nav>
        </div>
        {/* User panel */}
        <div className="border-t border-slate-700 p-3">
          <div className="flex gap-1 mb-2 px-1">
            <button onClick={() => setTheme('dark')} title="Dark"
              className={`flex-1 py-1 rounded text-[10px] font-bold ${theme==='dark' ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}>DARK</button>
            <button onClick={() => setTheme('gray')} title="Gray"
              className={`flex-1 py-1 rounded text-[10px] font-bold ${theme==='gray' ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}>GRAY</button>
            <button onClick={() => setTheme('light')} title="Light"
              className={`flex-1 py-1 rounded text-[10px] font-bold ${theme==='light' ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}>LIGHT</button>
          </div>
          <div className="flex items-center gap-2 px-1 mb-2">
            <Timer className="w-3.5 h-3.5 text-slate-400"/>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Refresh</span>
            <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))}
              className="flex-1 bg-slate-900 text-slate-300 text-[11px] font-bold rounded px-2 py-1 border-none outline-none cursor-pointer">
              <option value={1}>1s</option>
              <option value={3}>3s</option>
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-slate-700/50">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white truncate">{currentUser.username}</div>
              <div className="text-[10px] uppercase font-bold tracking-wider"
                style={{color: currentUser.role === 'admin' ? '#f59e0b' : currentUser.role === 'operator' ? '#10b981' : '#64748b'}}>
                {currentUser.role}
              </div>
            </div>
            <div className="flex gap-1">
              {currentUser.role === 'admin' && (
                <>
                  <button onClick={() => setShowAudit(true)} title="Audit Log"
                    className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-600">
                    <FileText className="w-4 h-4"/>
                  </button>
                  <button onClick={() => setShowUsers(true)} title="Gestione utenti"
                    className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-600">
                    <Settings className="w-4 h-4"/>
                  </button>
                </>
              )}
              <button onClick={onLogout} title="Logout"
                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-red-900/50">
                <ArrowLeft className="w-4 h-4"/>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <header className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold">
            {selectedVM ? `${selectedCluster.name} / ${selectedVM.name}` : selectedNode ? `${selectedCluster.name} / ${selectedNode}` : selectedCluster ? selectedCluster.name : 'Infrastruttura Globale'}
          </h2>
          <div className="flex items-center gap-4">
            {selectedCluster && (
              <>
                <span className="text-slate-400 text-sm font-mono">{selectedCluster.host}:{selectedCluster.port}</span>
                <button onClick={() => openEdit(selectedCluster)} title="Modifica cluster"
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                  <Pencil className="w-4 h-4"/>
                </button>
              </>
            )}
            <span className="flex items-center gap-2 text-green-400 bg-green-900/30 px-3 py-1 rounded-full text-sm">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              {clusters.length} Cluster{clusters.length !== 1 && 's'}
            </span>
          </div>
        </header>

        {selectedCluster && selectedVM ? (
          <VMDetail cluster={selectedCluster} vm={selectedVM} onBack={() => setSelectedVM(null)} refreshInterval={refreshInterval} key={`${selectedVM.node}-${selectedVM.vmid}`} />
        ) : selectedCluster && selectedNode ? (
          <NodeDetail cluster={selectedCluster} nodeName={selectedNode} onBack={() => setSelectedNode(null)} onSelectVM={setSelectedVM} refreshInterval={refreshInterval} key={selectedNode} />
        ) : selectedCluster ? (
          <ClusterDetail cluster={selectedCluster} onSelectNode={setSelectedNode} onSelectVM={setSelectedVM} refreshInterval={refreshInterval} key={selectedCluster.id} />
        ) : clusters.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-slate-800 rounded-xl border border-dashed border-slate-600 text-slate-400">
            <Server className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-xl">Nessun server registrato</p>
            <button
              onClick={openAdd}
              className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              Aggiungi il tuo primo Proxmox
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clusters.map(c => (
              <ClusterSummaryCard key={c.id} cluster={c} onClick={() => setSelectedCluster(c)}/>
            ))}
          </div>
        )}
      </main>

      {/* ADD SERVER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 w-full max-w-lg rounded-xl shadow-2xl border border-slate-700 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-700 bg-slate-800/50">
              <h3 className="text-xl font-bold">{editingCluster ? 'Modifica Cluster' : 'Registra Server Proxmox'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Nome Cluster</label>
                  <input required type="text" placeholder="Es. PVE-Prod"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">IP / Hostname principale</label>
                  <input required type="text" placeholder="192.168.1.100"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.host} onChange={e => setFormData({...formData, host: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">
                  Fallback hosts <span className="text-xs text-slate-500">(opz. · virgola separati · failover se il principale è down)</span>
                </label>
                <input type="text" placeholder="192.168.1.101, 192.168.1.102"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                  value={formData.fallback_hosts || ''} onChange={e => setFormData({...formData, fallback_hosts: e.target.value})} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Auth User (Token ID)</label>
                <input required type="text" placeholder="root@pam!MYTOKEN"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.auth_user} onChange={e => setFormData({...formData, auth_user: e.target.value})} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">
                  Auth Token (Secret) {editingCluster && <span className="text-slate-500 text-xs">— lascia vuoto per non modificare</span>}
                </label>
                <input required={!editingCluster} type="password"
                  placeholder={editingCluster ? "•••• (invariato)" : "••••••••••••••••"}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.auth_token} onChange={e => setFormData({...formData, auth_token: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Porta</label>
                  <input required type="number" placeholder="8006"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.port} onChange={e => setFormData({...formData, port: parseInt(e.target.value) || 8006})} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Auth Type</label>
                  <select
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.auth_type} onChange={e => setFormData({...formData, auth_type: e.target.value})}>
                    <option value="token">API Token</option>
                    <option value="password">Password</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="hidden"
                    checked={formData.verify_ssl} onChange={e => setFormData({...formData, verify_ssl: e.target.checked})} />
                  <div className={`w-10 h-6 rounded-full transition-colors relative ${formData.verify_ssl ? 'bg-green-600' : 'bg-slate-700'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.verify_ssl ? 'left-5' : 'left-1'}`}></div>
                  </div>
                  <span className="text-sm text-slate-400 group-hover:text-slate-200 flex items-center gap-1">
                    {formData.verify_ssl ? <Shield className="w-4 h-4 text-green-400" /> : <ShieldOff className="w-4 h-4" />}
                    Verify SSL
                  </span>
                </label>
              </div>

              <div className="pt-4">
                <button
                  disabled={loading}
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-slate-400 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingCluster ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />)}
                  {editingCluster ? 'Salva Modifiche' : 'Registra Server'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUsers && <UsersModal onClose={() => setShowUsers(false)}/>}
      {showAudit && <AuditLogModal onClose={() => setShowAudit(false)}/>}
    </div>
  );
}

const ClusterTreeItem = ({ cluster, isSelected, selectedNodeName, selectedVmId, onSelectCluster, onSelectNode, onSelectVm, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [vms, setVms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Auto-expand se il cluster contiene la selezione attuale
  const hasSelection = selectedNodeName || selectedVmId;
  useEffect(() => { if (hasSelection) setExpanded(true); }, [hasSelection]);

  // Fetch on expand
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [n, v] = await Promise.all([
          axios.get(`${API_BASE}/clusters/${cluster.id}/nodes`),
          axios.get(`${API_BASE}/clusters/${cluster.id}/vms`),
        ]);
        if (!cancelled) { setNodes(n.data || []); setVms(v.data || []); }
      } catch {} finally { if (!cancelled) setLoading(false); }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [expanded, cluster.id]);

  const toggleNode = (nodeName) => {
    setExpandedNodes(prev => {
      const n = new Set(prev);
      if (n.has(nodeName)) n.delete(nodeName); else n.add(nodeName);
      return n;
    });
  };

  return (
    <div className="mb-0.5">
      {/* Cluster row */}
      <div className={`group flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer rounded-lg ${isSelected ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700/50'}`}>
        <button onClick={() => setExpanded(!expanded)} className="flex-shrink-0 text-slate-500 hover:text-white">
          {expanded ? <ChevronDown className="w-3.5 h-3.5"/> : <ChevronRight className="w-3.5 h-3.5"/>}
        </button>
        <div onClick={onSelectCluster} className="flex items-center gap-2 min-w-0 flex-1">
          <Server className="w-3.5 h-3.5 flex-shrink-0 text-blue-400"/>
          <span className="truncate font-medium">{cluster.name}</span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} title="Modifica" className="text-slate-500 hover:text-blue-400 p-0.5">
            <Pencil className="w-3 h-3"/>
          </button>
          <button onClick={onDelete} title="Rimuovi" className="text-slate-500 hover:text-red-400 p-0.5">
            <X className="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>

      {/* Children: Nodes */}
      {expanded && (
        <div className="ml-3 border-l border-slate-700/50 pl-1">
          {loading && <div className="text-[10px] text-slate-500 px-2 py-1">Caricamento...</div>}
          {[...nodes].sort((a,b) => a.node.localeCompare(b.node)).map(n => {
            const online = n.status === 'online';
            const nodeVms = vms.filter(v => v.node === n.node).sort((a,b) => a.vmid - b.vmid);
            const isNodeExpanded = expandedNodes.has(n.node);
            const isNodeSelected = selectedNodeName === n.node;
            return (
              <div key={n.node}>
                <div className={`group flex items-center gap-1 px-2 py-1 text-xs cursor-pointer rounded ${isNodeSelected ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}>
                  <button onClick={() => toggleNode(n.node)} className="flex-shrink-0 text-slate-500 hover:text-white">
                    {nodeVms.length > 0 ? (isNodeExpanded ? <ChevronDown className="w-3 h-3"/> : <ChevronRight className="w-3 h-3"/>) : <span className="w-3"/>}
                  </button>
                  <div onClick={() => onSelectNode(n.node)} className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${online ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <Server className="w-3 h-3 flex-shrink-0 text-slate-500"/>
                    <span className="truncate font-mono">{n.node}</span>
                  </div>
                </div>

                {/* VM sotto il nodo */}
                {isNodeExpanded && (
                  <div className="ml-4 border-l border-slate-700/50 pl-1">
                    {nodeVms.length === 0 ? (
                      <div className="text-[10px] text-slate-600 px-2 py-0.5">no VM</div>
                    ) : nodeVms.map(vm => {
                      const isVmSelected = selectedVmId === `${vm.node}-${vm.vmid}`;
                      const isRunning = vm.status === 'running';
                      return (
                        <div key={vm.id} onClick={() => onSelectVm(vm)}
                          className={`flex items-center gap-1.5 px-2 py-0.5 text-[11px] cursor-pointer rounded ${isVmSelected ? 'bg-blue-900/40 text-blue-300' : 'text-slate-400 hover:bg-slate-700/50'}`}>
                          <span className={`w-1 h-1 rounded-full flex-shrink-0 ${isRunning ? 'bg-green-500' : 'bg-slate-600'}`}></span>
                          <span className="text-[9px] uppercase text-slate-600 font-mono">{vm.type==='lxc'?'CT':'VM'}</span>
                          <span className="text-slate-600 text-[9px] font-mono">{vm.vmid}</span>
                          <span className="truncate flex-1">{vm.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ClusterSummaryCard = ({ cluster, onClick }) => {
  const [nodes, setNodes] = useState(null);
  const [vms, setVms] = useState(null);
  const [storage, setStorage] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const [n, v, s] = await Promise.all([
          axios.get(`${API_BASE}/clusters/${cluster.id}/nodes`),
          axios.get(`${API_BASE}/clusters/${cluster.id}/vms`),
          axios.get(`${API_BASE}/clusters/${cluster.id}/storage`).catch(() => ({data: []})),
        ]);
        if (!cancelled) { setNodes(n.data); setVms(v.data); setStorage(s.data || []); setError(false); }
      } catch (err) {
        if (!cancelled) setError(true);
      }
    };
    fetchAll();
    const iv = setInterval(fetchAll, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [cluster.id]);

  const onlineNodes = nodes?.filter(n => n.status === 'online').length || 0;
  const offlineNodes = nodes?.filter(n => n.status !== 'online').length || 0;
  const runningVMs = vms?.filter(v => v.status === 'running').length || 0;
  const stoppedVMs = vms ? vms.length - runningVMs : 0;
  const allOk = nodes && offlineNodes === 0 && !error;
  const statusColor = error ? 'bg-red-500' : allOk ? 'bg-green-500' : offlineNodes > 0 ? 'bg-orange-500' : 'bg-slate-500';

  return (
    <div onClick={onClick}
      className="bg-slate-800 p-5 rounded-lg border border-slate-700 hover:border-blue-500 cursor-pointer transition-colors">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Server className="w-5 h-5 text-blue-400"/> {cluster.name}
        </h3>
        <span className={`w-2.5 h-2.5 rounded-full ${statusColor} ${allOk ? 'animate-pulse' : ''}`} title={error ? 'Errore connessione' : allOk ? 'Tutti i nodi online' : `${offlineNodes} nodi offline`}></span>
      </div>
      <p className="text-xs text-slate-500 font-mono mb-3">{cluster.host}:{cluster.port}</p>

      {error ? (
        <div className="p-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="w-3 h-3"/> Cluster non raggiungibile
        </div>
      ) : !nodes ? (
        <div className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> Caricamento...</div>
      ) : (
        <>
          {/* Counters */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-slate-900/50 rounded p-2">
              <div className="text-[10px] text-slate-500 uppercase">Nodi</div>
              <div className="text-sm font-bold">
                <span className="text-green-400">{onlineNodes}</span>
                {offlineNodes > 0 && <span className="text-red-400"> / -{offlineNodes}</span>}
              </div>
            </div>
            <div className="bg-slate-900/50 rounded p-2">
              <div className="text-[10px] text-slate-500 uppercase">VM/CT</div>
              <div className="text-sm font-bold">
                <span className="text-green-400">{runningVMs}</span>
                <span className="text-slate-500"> / {vms.length}</span>
              </div>
            </div>
          </div>

          {/* Elenco nodi con spia stato */}
          <div className="space-y-1">
            {[...nodes].sort((a,b) => a.node.localeCompare(b.node)).map(n => {
              const online = n.status === 'online';
              const cpuPct = (n.cpu || 0) * 100;
              const memPct = n.maxmem ? (n.mem/n.maxmem)*100 : 0;
              return (
                <div key={n.node} className="py-1.5 px-2 rounded bg-slate-900/30">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${online ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></span>
                      <span className={`truncate font-mono text-xs ${online ? 'text-slate-300' : 'text-red-400 font-bold'}`}>{n.node}</span>
                    </div>
                    {!online && <span className="text-red-400 text-[10px] font-bold uppercase">OFFLINE</span>}
                  </div>
                  {online && (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-500 w-7">CPU</span>
                        <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full transition-all ${cpuPct >= 90 ? 'bg-red-500' : cpuPct >= 75 ? 'bg-orange-500' : 'bg-green-500'}`} style={{width: `${Math.min(100, cpuPct)}%`}}></div>
                        </div>
                        <span className={`text-[9px] font-bold w-8 text-right ${thresholdTextColor(cpuPct, 'text-slate-400')}`}>{cpuPct.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-500 w-7">RAM</span>
                        <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full transition-all ${memPct >= 90 ? 'bg-red-500' : memPct >= 75 ? 'bg-orange-500' : 'bg-blue-500'}`} style={{width: `${Math.min(100, memPct)}%`}}></div>
                        </div>
                        <span className={`text-[9px] font-bold w-8 text-right ${thresholdTextColor(memPct, 'text-slate-400')}`}>{memPct.toFixed(0)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Volumi storage: uno per nodo */}
          {storage.length > 0 && (
            <div className="space-y-1 mt-3">
              <div className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><HardDrive className="w-3 h-3"/> Volumi per nodo</div>
              {storage.filter(s => s.maxdisk > 0).sort((a,b) => (a.storage+a.node).localeCompare(b.storage+b.node)).map((s, i) => {
                const pct = (s.disk / s.maxdisk) * 100;
                return (
                  <div key={`${s.storage}-${s.node}-${i}`} className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded bg-slate-900/30">
                    <span className="truncate font-mono text-slate-300 flex-1">
                      {s.storage} <span className="text-slate-500">({s.node})</span>
                    </span>
                    <span className="text-slate-500 text-[10px]">{formatBytes(s.disk)}/{formatBytes(s.maxdisk)}</span>
                    <span className={`font-bold text-[10px] min-w-[32px] text-right ${thresholdTextColor(pct, 'text-slate-300')}`}>{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const AuditLogModal = ({ onClose }) => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState([]);
  const [usernames, setUsernames] = useState([]);
  const [filters, setFilters] = useState({ username:'', action:'', status:'', since_hours:'' });
  const [expanded, setExpanded] = useState(null);
  const auditSort = useSortable('timestamp', 'desc');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      Object.entries(filters).forEach(([k,v]) => { if (v) params.append(k, v); });
      const res = await axios.get(`${API_BASE}/audit?${params}`);
      setLogs(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, [filters]);
  useEffect(() => {
    (async () => {
      try {
        const [a, u] = await Promise.all([
          axios.get(`${API_BASE}/audit/actions`),
          axios.get(`${API_BASE}/audit/usernames`),
        ]);
        setActions(a.data || []); setUsernames(u.data || []);
      } catch {}
    })();
  }, []);

  const fmtTime = (iso) => iso ? new Date(iso).toLocaleString() : '-';
  const actColor = (a, s) => {
    if (s === 'failed') return 'bg-red-900/40 text-red-400';
    if (a.startsWith('login')) return 'bg-blue-900/40 text-blue-400';
    if (a.includes('delete')) return 'bg-red-900/40 text-red-400';
    if (a.includes('create')) return 'bg-green-900/40 text-green-400';
    if (a.includes('update') || a.includes('modify')) return 'bg-yellow-900/40 text-yellow-400';
    if (a.startsWith('vm_')) return 'bg-purple-900/40 text-purple-400';
    return 'bg-slate-700 text-slate-300';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 w-full max-w-6xl rounded-xl border border-slate-700 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-slate-700">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400"/> Audit Log <span className="text-slate-500 text-sm font-normal">({total} eventi)</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-6 h-6"/></button>
        </div>

        <div className="p-4 border-b border-slate-700 grid grid-cols-2 md:grid-cols-5 gap-2">
          <select value={filters.username} onChange={e => setFilters({...filters, username: e.target.value})}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs">
            <option value="">Tutti gli utenti</option>
            {usernames.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={filters.action} onChange={e => setFilters({...filters, action: e.target.value})}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs">
            <option value="">Tutte le azioni</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs">
            <option value="">Tutti gli stati</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
          <select value={filters.since_hours} onChange={e => setFilters({...filters, since_hours: e.target.value})}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs">
            <option value="">Tutto</option>
            <option value="1">Ultima ora</option>
            <option value="24">Ultimo giorno</option>
            <option value="168">Ultima settimana</option>
            <option value="720">Ultimo mese</option>
          </select>
          <button onClick={fetchLogs} className="flex items-center justify-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs">
            <RefreshCw className="w-3.5 h-3.5"/> Aggiorna
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-slate-400 text-sm">Caricamento...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">Nessun evento</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-900/50 text-slate-400 uppercase sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-6"></th>
                  <SortTh label="Timestamp" sortKey="timestamp" current={auditSort.sortKey} dir={auditSort.sortDir} onSort={auditSort.requestSort}/>
                  <SortTh label="Utente" sortKey="username" current={auditSort.sortKey} dir={auditSort.sortDir} onSort={auditSort.requestSort}/>
                  <SortTh label="Azione" sortKey="action" current={auditSort.sortKey} dir={auditSort.sortDir} onSort={auditSort.requestSort}/>
                  <SortTh label="Risorsa" sortKey="resource_id" current={auditSort.sortKey} dir={auditSort.sortDir} onSort={auditSort.requestSort}/>
                  <SortTh label="IP" sortKey="ip_address" current={auditSort.sortKey} dir={auditSort.sortDir} onSort={auditSort.requestSort}/>
                  <SortTh label="Stato" sortKey="status" current={auditSort.sortKey} dir={auditSort.sortDir} onSort={auditSort.requestSort}/>
                </tr>
              </thead>
              <tbody>
                {auditSort.sortFn(logs).map(l => (
                  <React.Fragment key={l.id}>
                    <tr className="border-t border-slate-700 hover:bg-slate-700/30 cursor-pointer" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                      <td className="px-3 py-2 text-slate-500">{expanded === l.id ? <ChevronDown className="w-3.5 h-3.5"/> : <ChevronRight className="w-3.5 h-3.5"/>}</td>
                      <td className="px-3 py-2 text-slate-400">{fmtTime(l.timestamp)}</td>
                      <td className="px-3 py-2 font-medium">{l.username || '-'}</td>
                      <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${actColor(l.action, l.status)}`}>{l.action}</span></td>
                      <td className="px-3 py-2 font-mono text-slate-400">{l.resource_type ? `${l.resource_type}${l.resource_id ? '/'+l.resource_id : ''}` : '-'}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{l.ip || '-'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${l.status==='failed'?'bg-red-900/40 text-red-400':'bg-green-900/40 text-green-400'}`}>{l.status}</span>
                      </td>
                    </tr>
                    {expanded === l.id && l.details && (
                      <tr>
                        <td colSpan="7" className="p-0 bg-slate-900/50">
                          <pre className="p-3 text-[10px] font-mono text-slate-300 overflow-x-auto">{JSON.stringify(l.details, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

const UsersModal = ({ onClose }) => {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'viewer', is_active: true });
  const [loading, setLoading] = useState(false);
  const userSort = useSortable('username', 'asc');

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/users`);
      setUsers(res.data);
    } catch (err) { alert(traduciErrore(err)); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editing) {
        const payload = { role: form.role, is_active: form.is_active };
        if (form.password) payload.password = form.password;
        await axios.put(`${API_BASE}/auth/users/${editing.id}`, payload);
      } else {
        await axios.post(`${API_BASE}/auth/users`, form);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ username: '', password: '', role: 'viewer', is_active: true });
      fetchUsers();
    } catch (err) { alert(traduciErrore(err)); }
    finally { setLoading(false); }
  };

  const remove = async (u) => {
    if (!confirm(`Eliminare utente "${u.username}"?`)) return;
    try {
      await axios.delete(`${API_BASE}/auth/users/${u.id}`);
      fetchUsers();
    } catch (err) { alert(traduciErrore(err)); }
  };

  const startEdit = (u) => {
    setEditing(u);
    setForm({ username: u.username, password: '', role: u.role, is_active: u.is_active });
    setShowForm(true);
  };

  const roleColor = (r) => r === 'admin' ? 'text-amber-400' : r === 'operator' ? 'text-green-400' : 'text-slate-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 w-full max-w-3xl rounded-xl border border-slate-700 overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h3 className="text-xl font-bold">Gestione Utenti</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-6 h-6"/></button>
        </div>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-400">
              <strong>admin</strong>: tutto · <strong>operator</strong>: gestisce VM/Container · <strong>viewer</strong>: solo lettura
            </p>
            <button onClick={() => { setEditing(null); setForm({ username:'', password:'', role:'viewer', is_active:true }); setShowForm(true); }}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm">
              <Plus className="w-4 h-4"/> Nuovo
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
              <tr>
                <SortTh label="Username" sortKey="username" current={userSort.sortKey} dir={userSort.sortDir} onSort={userSort.requestSort}/>
                <SortTh label="Ruolo" sortKey="role" current={userSort.sortKey} dir={userSort.sortDir} onSort={userSort.requestSort}/>
                <SortTh label="Stato" sortKey="is_active" current={userSort.sortKey} dir={userSort.sortDir} onSort={userSort.requestSort}/>
                <th className="px-3 py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {userSort.sortFn(users).map(u => (
                <tr key={u.id} className="border-t border-slate-700">
                  <td className="px-3 py-2 font-medium">{u.username}</td>
                  <td className={`px-3 py-2 font-bold uppercase text-xs ${roleColor(u.role)}`}>{u.role}</td>
                  <td className="px-3 py-2">
                    {u.is_active ? <span className="text-green-400 text-xs">attivo</span> : <span className="text-slate-500 text-xs">disattivato</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => startEdit(u)} className="p-1 text-slate-400 hover:text-blue-400"><Pencil className="w-4 h-4"/></button>
                      <button onClick={() => remove(u)} className="p-1 text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {showForm && (
            <form onSubmit={save} className="mt-4 p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-3">
              <div className="font-medium text-sm">{editing ? `Modifica ${editing.username}` : 'Nuovo utente'}</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Username</label>
                  <input required disabled={!!editing} type="text" value={form.username} onChange={e => setForm({...form, username: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm disabled:opacity-50"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Password {editing && '(vuoto = non cambiare)'}</label>
                  <input required={!editing} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm"/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Ruolo</label>
                  <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm">
                    <option value="viewer">viewer (solo lettura)</option>
                    <option value="operator">operator (gestisce VM)</option>
                    <option value="admin">admin (tutto)</option>
                  </select>
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})}/>
                    Attivo
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm">Annulla</button>
                <button type="submit" disabled={loading} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                  {editing ? 'Salva' : 'Crea'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
