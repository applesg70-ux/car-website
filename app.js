let token = localStorage.getItem('token');
let currentUser = null;
let currentOffset = 0;
let currentCar = null;

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showAuth(type) {
  document.getElementById('auth-modal').style.display = 'flex';
  document.getElementById('login-form').style.display = type === 'login' ? 'block' : 'none';
  document.getElementById('signup-form').style.display = type === 'signup' ? 'block' : 'none';
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function signup() {
  const phone = document.getElementById('signup-country').value + document.getElementById('signup-phone').value;
  try {
    await api('/api/register', { method: 'POST', body: JSON.stringify({
      username: document.getElementById('signup-username').value,
      name: document.getElementById('signup-name').value,
      email: document.getElementById('signup-email').value,
      phone,
      password: document.getElementById('signup-password').value
    })});
    alert('Registration submitted! Check your email to verify. Admin must also approve.');
    closeModal('auth-modal');
  } catch (e) { alert(e.message); }
}

async function login() {
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value
    })});
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    closeModal('auth-modal');
    updateUI();
    loadCars(true);
  } catch (e) { alert(e.message); }
}

function logout() {
  if (token) api('/api/logout', { method: 'POST' }).catch(() => {});
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  updateUI();
  loadCars(true);
}

async function loadMe() {
  if (!token) return;
  try {
    const data = await api('/api/me');
    currentUser = data.user;
    updateUI();
  } catch { logout(); }
}

function updateUI() {
  const authNav = document.getElementById('auth-nav');
  const status = document.getElementById('user-status');
  const overlay = document.getElementById('restricted-overlay');
  if (currentUser && currentUser.restricted) {
    overlay.style.display = 'flex';
    document.getElementById('restriction-detail').textContent = currentUser.restrictionMessage || '';
    document.querySelectorAll('nav, header, section, footer').forEach(el => el.style.display = 'none');
    return;
  }
  overlay.style.display = 'none';
  document.querySelectorAll('nav, header, section, footer').forEach(el => el.style.display = '');
  if (currentUser) {
    authNav.innerHTML = `<a href="#" onclick="logout()">Logout (${currentUser.name})</a>`;
    status.style.display = 'block';
    const stage = currentUser.stage || 1;
    document.getElementById('current-stage').textContent = stage;
    const prog = currentUser.stageProgress?.[stage] || 0;
    const required = [0,30,20,15,1,1,1][stage] || 30;
    document.getElementById('progress').style.width = Math.min(100, (prog / required) * 100) + '%';
    document.getElementById('progress-text').textContent = `Stage ${stage}: ${prog} / ${required}`;
    document.getElementById('earnings-text').textContent = `Earnings: $${currentUser.earnings || 0}`;
    document.getElementById('next-stage-btn').style.display = (prog >= required && stage < 6) ? 'inline-block' : 'none';
  } else {
    authNav.innerHTML = `<a href="#" onclick="showAuth('login')">Login</a>`;
    status.style.display = 'none';
  }
}

async function loadCars(reset = false) {
  if (reset) currentOffset = 0;
  try {
    const data = await api(`/api/cars?offset=${currentOffset}&limit=8`);
    const grid = document.getElementById('car-grid');
    if (reset) grid.innerHTML = '';
    data.cars.forEach(car => {
      const card = document.createElement('div');
      card.className = 'car-card';
      card.innerHTML = `
        <img src="${car.image}" alt="${car.name}">
        <div class="car-info">
          <span class="badge ${car.type}">${car.type}</span>
          <h3>${car.name}</h3>
          <p class="price">${car.price}</p>
          <p>${car.details}</p>
          <button class="review-btn" onclick="openAction(${car.id}, '${car.name.replace(/'/g,"\\'")}', '${car.image}', '${(car.details||'').replace(/'/g,"\\'")}')">
            ${currentUser && currentUser.stage === 1 ? 'Leave Review' : currentUser && currentUser.stage === 2 ? 'Rate' : 'View'}
          </button>
        </div>`;
      grid.appendChild(card);
    });
    currentOffset += data.cars.length;
    document.getElementById('load-more-btn').style.display = data.hasMore ? 'inline-block' : 'none';
  } catch (e) { console.error(e); }
}

function loadMoreCars() { loadCars(false); }

function openAction(id, name, image, details) {
  if (!currentUser) { alert('Please login first'); showAuth('login'); return; }
  if (currentUser.restricted) return;
  currentCar = { id, name, image, details };
  document.getElementById('action-car-img').src = image;
  document.getElementById('action-car-name').textContent = name;
  document.getElementById('action-car-details').textContent = details;
  document.getElementById('stage1-ui').style.display = currentUser.stage === 1 ? 'block' : 'none';
  document.getElementById('stage2-ui').style.display = currentUser.stage === 2 ? 'block' : 'none';
  document.getElementById('action-modal').style.display = 'flex';
}

async function submitReview() {
  try {
    await api('/api/stage/1/review', { method: 'POST', body: JSON.stringify({ carId: currentCar.id, text: document.getElementById('review-text').value }) });
    alert('Review submitted!');
    closeModal('action-modal');
    await loadMe();
  } catch (e) { alert(e.message); }
}

async function submitRating() {
  try {
    await api('/api/stage/2/rate', { method: 'POST', body: JSON.stringify({ carId: currentCar.id, stars: document.getElementById('selected-stars').value }) });
    alert('Rating submitted!');
    closeModal('action-modal');
    await loadMe();
  } catch (e) { alert(e.message); }
}

async function advanceStage() {
  try {
    await api('/api/stage/advance', { method: 'POST' });
    alert('Stage completed! Next stage unlocked.');
    await loadMe();
  } catch (e) { alert(e.message); }
}

// Chat
document.getElementById('chat-btn').onclick = () => {
  if (!token) { alert('Please login to chat'); showAuth('login'); return; }
  document.getElementById('chat-modal').style.display = 'flex';
  loadChat();
};

async function loadChat() {
  try {
    const data = await api('/api/chat/messages');
    const box = document.getElementById('chat-messages');
    box.innerHTML = (data.messages || []).map(m => {
      const isUser = m.from === 'user';
      const bg = isUser ? '#3b82f6' : m.from === 'system' ? '#f59e0b' : '#334155';
      return `<div style="text-align:${isUser?'right':'left'};margin:6px 0;"><span style="background:${bg};padding:6px 10px;border-radius:8px;display:inline-block;">${m.message}${m.file ? `<br><a href="${m.file}" target="_blank" style="color:#93c5fd;">📎 File</a>` : ''}</span></div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  } catch {}
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  try {
    await api('/api/chat/send', { method: 'POST', body: JSON.stringify({ message: msg }) });
    input.value = '';
    loadChat();
  } catch (e) { alert(e.message); }
}

async function uploadChatFile() {
  const file = document.getElementById('chat-file').files[0];
  if (!file) return alert('Select a file');
  if (file.size > 5 * 1024 * 1024) return alert('Max 5MB');
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await api('/api/chat/upload', { method: 'POST', body: JSON.stringify({
        filename: file.name,
        data: reader.result.split(',')[1],
        message: 'Shared file: ' + file.name
      })});
      document.getElementById('chat-file').value = '';
      loadChat();
    } catch (e) { alert(e.message); }
  };
  reader.readAsDataURL(file);
}

setInterval(() => { if (document.getElementById('chat-modal').style.display === 'flex') loadChat(); }, 4000);

// Init
loadCars(true);
if (token) loadMe();
