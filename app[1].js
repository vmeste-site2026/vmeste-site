const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY";

const hasBackend = !SUPABASE_URL.startsWith("PASTE_") && !SUPABASE_ANON_KEY.startsWith("PASTE_");
const db = hasBackend ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const demoPeople = [
  {id: 1, name: "Алина", city: "Бишкек", interests: "музыка, книги", avatar: "А"},
  {id: 2, name: "Данияр", city: "Бишкек", interests: "спорт, игры", avatar: "Д"},
  {id: 3, name: "Мира", city: "Ош", interests: "рисование, кино", avatar: "М"},
  {id: 4, name: "Тимур", city: "Бишкек", interests: "технологии, музыка", avatar: "Т"}
];

let currentUser = null;
let selectedPerson = null;

const $ = id => document.getElementById(id);
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2500);
}

function openAuth(mode = "register") {
  $("authModal").classList.remove("hidden");
  $("authContent").innerHTML = mode === "login" ? loginForm() : registerForm();
  $("authForm").addEventListener("submit", submitAuth);
  $("switchAuth").addEventListener("click", () => openAuth(mode === "login" ? "register" : "login"));
}

function closeAuth() { $("authModal").classList.add("hidden"); }

function loginForm() {
  return `<h2>Вход</h2><p class="muted">Войди в свой аккаунт.</p>
    <form id="authForm">
      <input required type="email" id="email" placeholder="Email">
      <input required type="password" id="password" placeholder="Пароль" minlength="6">
      <button class="btn full">Войти</button>
    </form>
    <button class="text-btn" id="switchAuth">Создать аккаунт</button>`;
}

function registerForm() {
  return `<h2>Создать аккаунт</h2><p class="muted">Заполни данные профиля.</p>
    <form id="authForm">
      <input required id="name" placeholder="Имя" maxlength="40">
      <input required type="email" id="email" placeholder="Email">
      <input required type="password" id="password" placeholder="Пароль (минимум 6 символов)" minlength="6">
      <input id="city" placeholder="Город" maxlength="60">
      <input id="interests" placeholder="Интересы: музыка, игры..." maxlength="120">
      <button class="btn full">Зарегистрироваться</button>
    </form>
    <button class="text-btn" id="switchAuth">У меня уже есть аккаунт</button>`;
}

async function submitAuth(e) {
  e.preventDefault();
  if (!db) {
    toast("Сначала подключи Supabase в app.js.");
    return;
  }

  const email = $("email").value.trim();
  const password = $("password").value;
  const isRegister = Boolean($("name"));

  try {
    if (isRegister) {
      const name = $("name").value.trim();
      const city = $("city").value.trim();
      const interests = $("interests").value.trim();
      const {data, error} = await db.auth.signUp({email, password, options: {data: {name, city, interests}}});
      if (error) throw error;
      if (data.user) {
        await db.from("profiles").upsert({id: data.user.id, name, city, interests});
      }
      toast("Аккаунт создан. Проверь email, если включено подтверждение.");
    } else {
      const {error} = await db.auth.signInWithPassword({email, password});
      if (error) throw error;
      toast("Вы вошли!");
    }
    closeAuth();
    await refresh();
  } catch (err) {
    toast(err.message || "Не удалось выполнить действие.");
  }
}

async function logout() {
  if (db) await db.auth.signOut();
  currentUser = null;
  renderMessages();
  toast("Вы вышли из аккаунта.");
}

async function loadPeople() {
  if (!db) return demoPeople;
  const {data, error} = await db.from("profiles").select("id,name,city,interests").limit(50);
  if (error) { console.error(error); return []; }
  return data || [];
}

function renderPeople(people) {
  const q = $("searchInput").value.trim().toLowerCase();
  const filtered = people.filter(p => `${p.name} ${p.city} ${p.interests}`.toLowerCase().includes(q));
  $("peopleGrid").innerHTML = filtered.length ? filtered.map(p => `
    <article class="person">
      <div class="avatar">${escapeHtml((p.name || "?")[0].toUpperCase())}</div>
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.city || "Город не указан")}</p>
      <small>${escapeHtml(p.interests || "Интересы не указаны")}</small>
      ${currentUser && p.id !== currentUser.id ? `<button class="btn small full message-btn" data-id="${escapeHtml(p.id)}">Написать</button>` : ""}
    </article>`).join("") : `<div class="empty">Пока нет подходящих профилей.</div>`;

  document.querySelectorAll(".message-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedPerson = filtered.find(p => String(p.id) === String(btn.dataset.id));
      document.querySelector("#messages").scrollIntoView({behavior:"smooth"});
      renderMessages();
    });
  });
}

async function renderMessages() {
  if (!currentUser) {
    $("messagesBox").innerHTML = `<div class="empty">Войди в аккаунт, чтобы отправлять и получать сообщения.</div>`;
    return;
  }
  if (!db) {
    $("messagesBox").innerHTML = `<div class="empty">Backend ещё не подключён. После подключения здесь появится чат.</div>`;
    return;
  }

  let query = db.from("messages").select("*").or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order("created_at", {ascending:true});
  const {data, error} = await query;
  if (error) { $("messagesBox").innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; return; }

  const rows = data || [];
  $("messagesBox").innerHTML = `
    <div class="chat-head">${selectedPerson ? `Чат с ${escapeHtml(selectedPerson.name)}` : "Выбери человека в разделе «Люди»"}</div>
    <div class="chat-list">${rows.map(m => `<div class="msg ${m.sender_id === currentUser.id ? "mine" : ""}">${escapeHtml(m.body)}</div>`).join("") || `<div class="empty">Сообщений пока нет.</div>`}</div>
    ${selectedPerson ? `<form id="messageForm" class="message-form"><input id="messageText" required maxlength="1000" placeholder="Напиши сообщение..."><button class="btn">Отправить</button></form>` : ""}`;
  if ($("messageForm")) $("messageForm").addEventListener("submit", sendMessage);
}

async function sendMessage(e) {
  e.preventDefault();
  const body = $("messageText").value.trim();
  if (!body || !selectedPerson) return;
  const {error} = await db.from("messages").insert({sender_id: currentUser.id, receiver_id: selectedPerson.id, body});
  if (error) { toast(error.message); return; }
  $("messageText").value = "";
  await renderMessages();
}

async function refresh() {
  if (db) {
    const {data} = await db.auth.getUser();
    currentUser = data?.user || null;
    $("loginBtn").textContent = currentUser ? "Выйти" : "Войти";
    $("loginBtn").onclick = currentUser ? logout : () => openAuth("login");
  } else {
    $("loginBtn").onclick = () => openAuth("login");
  }

  const people = await loadPeople();
  renderPeople(people);
  renderMessages();
  $("profileCount").textContent = db ? people.length : demoPeople.length;
  $("onlineCount").textContent = "—";
}

$("registerBtn").onclick = () => openAuth("register");
$("loginBtn").onclick = () => openAuth("login");
$("closeModal").onclick = closeAuth;
$("authModal").addEventListener("click", e => { if (e.target === $("authModal")) closeAuth(); });
$("searchInput").addEventListener("input", () => loadPeople().then(renderPeople));

refresh();
