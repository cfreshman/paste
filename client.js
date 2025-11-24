const textarea = document.getElementById('paste');
const status = document.getElementById('status');

let ws = null;
let authToken = localStorage.getItem('paste_auth') || null;
let isConnected = false;
let updateTimeout = null;
let lastSentContent = '';

function updateStatus(text, className) {
  status.innerHTML = text;
  status.className = 'status ' + className;
}

async function checkAuth() {
  try {
    const headers = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const res = await fetch('/api/auth', { headers });
    const data = await res.json();
    
    if (data.needsSetup) {
      const password = prompt('create password (min 4 characters):');
      if (!password || password.length < 4) {
        alert('password must be at least 4 characters');
        await checkAuth();
        return;
      }
      
      const setupRes = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      if (setupRes.ok) {
        authToken = password;
        localStorage.setItem('paste_auth', password);
      } else {
        alert('setup failed');
        await checkAuth();
      }
      return;
    }
    
    if (data.requiresAuth && !data.authenticated) {
      localStorage.removeItem('paste_auth');
      authToken = null;
      
      const password = prompt('enter password:');
      if (password) {
        authToken = password;
        localStorage.setItem('paste_auth', password);
        await checkAuth();
      } else {
        document.body.innerHTML = `
          <div style="font-family: 'Google Sans Code', monospace; padding: 2rem; text-align: center; max-width: 400px; margin: 0 auto;">
            <div style="font-size: 0.875rem; margin-bottom: 1rem;">incorrect or missing password</div>
            <div style="font-size: 0.75rem; color: #999;">
              <a href="https://github.com/cfreshman/paste" style="color: #000; text-decoration: underline;">github.com/cfreshman/paste</a>
            </div>
          </div>
        `;
      }
    }
  } catch (err) {
    console.error('Auth check failed:', err);
  }
}

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);
  
  ws.onopen = () => {
    console.log('Connected');
    isConnected = true;
    updateStatus('●', 'connected');
    
    // Send auth token
    if (authToken) {
      ws.send(JSON.stringify({ type: 'auth', token: authToken }));
    }
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'content') {
        // Ignore if this is an echo of what we just sent
        if (data.content === lastSentContent) {
          return;
        }
        
        // Only update if content is different from current
        if (textarea.value !== data.content) {
          textarea.value = data.content;
          lastSentContent = data.content;
        }
      }
      
      if (data.type === 'auth' && !data.authenticated) {
        localStorage.removeItem('paste_auth');
        location.reload();
      }
      
      if (data.type === 'error') {
        console.error('Server error:', data.error);
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  };
  
  ws.onclose = () => {
    console.log('Disconnected');
    isConnected = false;
    updateStatus('○', 'disconnected');
    
    // Attempt reconnect after 2 seconds
    setTimeout(connect, 2000);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

textarea.addEventListener('input', () => {
  if (!isConnected) return;
  
  // Debounce updates to avoid flooding
  clearTimeout(updateTimeout);
  updateTimeout = setTimeout(() => {
    lastSentContent = textarea.value;
    ws.send(JSON.stringify({
      type: 'update',
      content: textarea.value
    }));
  }, 100);
});

// Initialize
checkAuth().then(() => connect());

