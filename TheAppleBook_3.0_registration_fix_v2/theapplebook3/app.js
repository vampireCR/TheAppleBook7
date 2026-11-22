import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/*
  ВСТАВЬ СЮДА Project URL и Publishable key из Supabase → Project Settings → API.
  Никогда не вставляй сюда secret/service_role key.
*/
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BrNnF8XCshRm1NmEYvQphg_hcNIJhQV";
const configured = !SUPABASE_URL.startsWith("PASTE_") && !SUPABASE_PUBLISHABLE_KEY.startsWith("PASTE_");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

const $ = (id) => document.getElementById(id);
let currentUser = null;
let currentProfile = null;
let bootPromise = null;

function say(message, target="globalMessage") {
  const el = $(target);
  if (el) el.textContent = message || "";
}
function esc(value="") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function roleLabel(role) {
  return ({owner:"OWNER",ceo:"CEO",deputy_ceo:"DEPUTY CEO",admin:"ADMIN",moderator:"MODERATOR",member:"MEMBER"})[role] || "MEMBER";
}
function isStaff(role) { return ["owner","ceo","deputy_ceo","admin","moderator"].includes(role); }

function switchAuth(tab) {
  $("loginForm").classList.toggle("hidden", tab !== "login");
  $("signupForm").classList.toggle("hidden", tab !== "signup");
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  say("", "authMessage");
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => switchAuth(b.dataset.tab)));

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!supabase) return say("Сначала добавь Supabase URL и Publishable key в app.js.", "authMessage");
  const button = e.submitter || $("loginForm").querySelector('button[type="submit"], button');
  const originalText = button?.textContent || "Войти";
  if (button) { button.disabled = true; button.textContent = "Входим..."; }
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: $("loginEmail").value.trim(),
      password: $("loginPassword").value
    });
    if (error) throw error;
    await boot();
  } catch (error) {
    say(error.message || "Не удалось войти. Проверь email и пароль.", "authMessage");
  } finally {
    if (button) { button.disabled = false; button.textContent = originalText; }
  }
});

$("signupForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!supabase) return say("Сначала добавь Supabase URL и Publishable key в app.js.", "authMessage");

  const button = e.submitter || $("signupForm").querySelector('button[type="submit"], button');
  const originalText = button?.textContent || "Создать аккаунт";
  if (button) { button.disabled = true; button.textContent = "Создаём аккаунт..."; }

  try {
    const username = $("signupName").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;
    if (username.length < 2) throw new Error("Имя должно содержать минимум 2 символа.");
    if (password.length < 8) throw new Error("Пароль должен содержать минимум 8 символов.");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        // После подтверждения email Supabase вернёт пользователя на опубликованный сайт.
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });
    if (error) throw error;

    // Supabase intentionally hides whether an email exists; an empty identities
    // array is the reliable signal returned for an already-registered address.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      $("loginEmail").value = email;
      switchAuth("login");
      say("Этот email уже зарегистрирован. Войди в существующий аккаунт или используй другой email.", "authMessage");
      return;
    }

    if (data.session) {
      say("Аккаунт создан. Открываем TheAppleBook...", "authMessage");
      await boot();
    } else {
      // При включённом Confirm email Supabase не создаёт сессию до клика по письму.
      $("loginEmail").value = email;
      switchAuth("login");
      say("Аккаунт создан, но Supabase пока не выдал сессию. Открой письмо от Supabase, подтверди адрес, затем войди здесь с тем же email и паролем. Проверь папку «Спам». Если письмо не пришло, проверь настройки Email в Supabase.", "authMessage");
    }
  } catch (error) {
    say(error.message || "Не удалось зарегистрироваться. Проверь настройки Supabase.", "authMessage");
  } finally {
    if (button) { button.disabled = false; button.textContent = originalText; }
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  currentUser = currentProfile = null;
  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");
});

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  $("page-" + name)?.classList.remove("hidden");
  document.querySelectorAll(".nav-btn[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === name));
  if (name === "feed") loadFeed();
  if (name === "people") searchPeople();
  if (name === "friends") loadFriends();
  if (name === "profile") renderProfile();
  if (name === "admin") loadAdmin();
  if (name === "settings") fillSettings();
}
document.querySelectorAll(".nav-btn[data-page]").forEach(b => b.addEventListener("click", () => showPage(b.dataset.page)));
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => showPage(b.dataset.go)));

async function boot() {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    if (!supabase) {
      $("authView").classList.remove("hidden");
      $("appView").classList.add("hidden");
      say("Добавь Supabase URL и Publishable key в app.js, чтобы включить регистрацию.", "authMessage");
      return;
    }

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        currentUser = currentProfile = null;
        $("authView").classList.remove("hidden");
        $("appView").classList.add("hidden");
        return;
      }

      currentUser = session.user;
      let profile = null;
      let profileError = null;
      // The database trigger normally creates this immediately. Retry briefly
      // to avoid a false failure if the profile row is not visible yet.
      for (let attempt = 0; attempt < 4; attempt++) {
        const result = await supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
        profile = result.data;
        profileError = result.error;
        if (profile || profileError) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (profileError) throw profileError;
      if (!profile) throw new Error("Аккаунт найден, но профиль не создан. Проверь, что SQL-файл supabase/schema.sql выполнен в Supabase → SQL Editor.");

      currentProfile = profile;
      $("authView").classList.add("hidden");
      $("appView").classList.remove("hidden");
      $("topUser").textContent = profile.username + " · " + roleLabel(profile.role);
      $("myName").textContent = profile.username;
      $("myAvatar").textContent = profile.username.slice(0,1).toUpperCase();
      $("myRole").innerHTML = `<span class="pill">${esc(roleLabel(profile.role))}</span>`;
      $("myStatus").textContent = profile.status || "Статус не указан";
      $("adminNav").classList.toggle("hidden", !["owner","ceo","deputy_ceo","admin"].includes(profile.role));
      showPage("feed");
      say("");
    } catch (error) {
      $("authView").classList.remove("hidden");
      $("appView").classList.add("hidden");
      say(error.message || "Не удалось открыть TheAppleBook. Проверь настройки Supabase.", "authMessage");
    }
  })();
  try { await bootPromise; } finally { bootPromise = null; }
}

supabase?.auth.onAuthStateChange((event) => {
  if (["SIGNED_IN", "TOKEN_REFRESHED", "SIGNED_OUT", "USER_UPDATED"].includes(event)) {
    // Defer Supabase queries until the auth callback has returned.
    setTimeout(() => { void boot(); }, 0);
  }
});

$("postForm").addEventListener("submit", async e => {
  e.preventDefault();
  const content = $("postText").value.trim();
  if (!content) return;
  const { error } = await supabase.from("posts").insert({ user_id: currentUser.id, content });
  if (error) return say(error.message);
  $("postText").value = "";
  await loadFeed();
});

async function loadFeed() {
  const { data, error } = await supabase.from("posts")
    .select("id,content,created_at,profiles(username,role)")
    .order("created_at", { ascending: false }).limit(60);
  if (error) return say(error.message);
  $("feedList").innerHTML = data.map(p => `
    <article class="post">
      <div class="post-head">${esc(p.profiles?.username || "User")}
        <span class="pill">${esc(roleLabel(p.profiles?.role))}</span>
        <span class="post-date">${new Date(p.created_at).toLocaleString()}</span>
      </div>
      <div class="post-body">${esc(p.content)}</div>
    </article>`).join("") || `<div class="panel pad muted">Публикаций пока нет. Будь первым!</div>`;
}

let searchTimer;
$("peopleSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchPeople, 250);
});
async function searchPeople() {
  if (!currentUser) return;
  const term = $("peopleSearch").value.trim();
  let query = supabase.from("profiles").select("id,username,status,role").neq("id", currentUser.id).order("username").limit(30);
  if (term) query = query.ilike("username", `%${term}%`);
  const { data, error } = await query;
  if (error) return say(error.message);
  const { data: mine } = await supabase.from("friendships").select("recipient_id,status").eq("requester_id", currentUser.id);
  const sent = new Map((mine || []).map(x => [x.recipient_id,x.status]));
  $("peopleResults").innerHTML = (data || []).map(p => {
    const state = sent.get(p.id);
    const action = state === "pending" ? "Заявка отправлена" : state === "accepted" ? "Уже друзья" : `<button class="primary" data-add="${p.id}">Добавить в друзья</button>`;
    return `<div class="result-row"><div><strong>${esc(p.username)}</strong> <span class="pill">${esc(roleLabel(p.role))}</span><br><small class="muted">${esc(p.status || "Статус не указан")}</small></div><div>${action}</div></div>`;
  }).join("") || `<p class="muted">Пользователи не найдены.</p>`;
  document.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => sendFriendRequest(b.dataset.add)));
}
async function sendFriendRequest(id) {
  const { error } = await supabase.from("friendships").insert({ requester_id: currentUser.id, recipient_id: id });
  if (error) return say(error.message);
  say("Заявка в друзья отправлена.");
  searchPeople();
}

async function loadFriends() {
  const { data: incoming, error: e1 } = await supabase.from("friendships")
    .select("id,requester_id,profiles!friendships_requester_id_fkey(username)")
    .eq("recipient_id", currentUser.id).eq("status","pending");
  if (e1) say(e1.message);
  $("incomingRequests").innerHTML = (incoming || []).map(r => `
    <div class="result-row"><strong>${esc(r.profiles?.username || "Пользователь")}</strong>
    <span><button class="primary" data-accept="${r.id}">Принять</button>
    <button class="secondary" data-reject="${r.id}">Отклонить</button></span></div>`).join("") || `<p class="muted">Новых заявок нет.</p>`;
  document.querySelectorAll("[data-accept]").forEach(b => b.addEventListener("click", () => answerRequest(b.dataset.accept,"accepted")));
  document.querySelectorAll("[data-reject]").forEach(b => b.addEventListener("click", () => answerRequest(b.dataset.reject,"rejected")));

  const { data: sent } = await supabase.from("friendships")
    .select("recipient_id,profiles!friendships_recipient_id_fkey(id,username,status)")
    .eq("requester_id", currentUser.id).eq("status","accepted");
  const { data: received } = await supabase.from("friendships")
    .select("requester_id,profiles!friendships_requester_id_fkey(id,username,status)")
    .eq("recipient_id", currentUser.id).eq("status","accepted");
  const all = [...(sent || []).map(x=>x.profiles), ...(received || []).map(x=>x.profiles)].filter(Boolean);
  $("friendsList").innerHTML = all.map(p=>`<div class="result-row"><strong>${esc(p.username)}</strong><span class="muted">${esc(p.status || "Статус не указан")}</span></div>`).join("") || `<p class="muted">Пока нет друзей.</p>`;
}
async function answerRequest(id,status) {
  const { error } = await supabase.from("friendships").update({status}).eq("id",id);
  if (error) return say(error.message);
  loadFriends();
}

function renderProfile() {
  const p = currentProfile;
  $("profileDetails").innerHTML = `<h3>${esc(p.username)} <span class="pill">${esc(roleLabel(p.role))}</span></h3>
    <p><strong>Статус:</strong> ${esc(p.status || "Не указано")}</p>
    <p><strong>О себе:</strong> ${esc(p.bio || "Пока ничего не написано.")}</p>
    <p class="muted">В TheAppleBook с ${new Date(p.created_at).toLocaleDateString()}</p>`;
}
function fillSettings() {
  $("editName").value = currentProfile.username || "";
  $("editStatus").value = currentProfile.status || "";
  $("editBio").value = currentProfile.bio || "";
  $("themeSelect").value = localStorage.getItem("apple-theme") || "burgundy";
}
$("profileForm").addEventListener("submit", async e => {
  e.preventDefault();
  const username = $("editName").value.trim();
  if (username.length < 2) return say("Имя должно содержать минимум 2 символа.");
  const { error } = await supabase.from("profiles").update({
    username, status: $("editStatus").value || null, bio: $("editBio").value.trim()
  }).eq("id", currentUser.id);
  if (error) return say(error.message);
  await boot();
  say("Профиль сохранён.");
});
$("saveTheme").addEventListener("click", () => {
  const theme = $("themeSelect").value;
  localStorage.setItem("apple-theme",theme);
  document.body.classList.toggle("dark",theme === "dark");
  say("Тема сохранена в этом браузере.");
});

async function loadAdmin() {
  if (!["owner","ceo","deputy_ceo","admin"].includes(currentProfile.role)) {
    $("adminContent").textContent = "Недостаточно прав.";
    return;
  }
  const { data, error } = await supabase.from("profiles").select("id,username,role").order("username").limit(100);
  if (error) return say(error.message);
  const canManageTop = currentProfile.role === "owner";
  $("adminContent").innerHTML = (data || []).map(p => {
    const options = canManageTop
      ? ["member","moderator","admin","deputy_ceo","ceo"]
      : ["member","moderator","admin"];
    const select = p.role === "owner" ? `<span class="pill">OWNER — защищён</span>` :
      `<select data-role-select="${p.id}">${options.map(r=>`<option value="${r}" ${r===p.role?"selected":""}>${roleLabel(r)}</option>`).join("")}</select>
       <button class="secondary" data-role-save="${p.id}">Сохранить</button>`;
    return `<div class="result-row"><div><strong>${esc(p.username)}</strong><br><small class="muted">${esc(roleLabel(p.role))}</small></div><div>${select}</div></div>`;
  }).join("");
  document.querySelectorAll("[data-role-save]").forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.roleSave;
    const role = document.querySelector(`[data-role-select="${id}"]`).value;
    const { error } = await supabase.rpc("admin_set_role", { target_user_id: id, new_role: role });
    if (error) return say(error.message);
    say("Роль обновлена.");
    await boot();
    loadAdmin();
  }));
}

boot();
