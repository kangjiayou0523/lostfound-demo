/* 畫面與互動。資料讀寫一律透過 CampusAPI；可直接由 file:// 開啟。 */
(function () {
  'use strict';
  const api = window.CampusAPI;
  const main = document.getElementById('main');
  const nav = document.getElementById('top-nav');
  const drawer = document.getElementById('side-panel');
  let drawerOpener = null;
  const state = {
    drawer: null, reviewId: null, user: null, view: 'search', authMode: 'login', step: 1,
    query: '', category: '', area: '', results: [], selected: null,
    remaining: 10, claims: [], items: [], logs: [], filter: 'pending',
    searchHint: '', error: '', success: '', loading: false, confirmReset: false
  };
  let toastTimer;
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = (name) => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  const colors = ['黑色', '白色', '灰色', '紅色', '橘色', '黃色', '綠色', '藍色', '紫色', '粉紅色', '棕色', '米色', '透明', '銀色', '金色', '其他'];
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = (value, time) => {
    if (!value) return '尚無紀錄';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('zh-TW', time ? { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false } : { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });
  };
  const optionList = (options, selected, empty) => (empty ? '<option value="">' + esc(empty) + '</option>' : '') + options.map((v) => '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
  const status = (value) => '<span class="status-badge" data-status="' + esc(value) + '">' + esc(value) + '</span>';
  const photo = (item, extra) => {
    const value = String(item.photo || '');
    const safe = /^(?:data:image\/(?:png|jpeg|webp);base64,|(?:\.\/)?(?:assets|uploads)\/)/i.test(value) && !/[<>]/.test(value);
    return '<div class="item-photo ' + (extra || '') + '">' + (safe ? '<img src="' + esc(value) + '" alt="' + esc(item.color + item.category) + '，' + (value.includes('assets/') ? '示意圖' : '失物照片') + '" loading="lazy">' : icon('box')) + (value.includes('assets/') ? '<span class="photo-caption">示意圖</span>' : '') + '</div>';
  };
  const messages = () => (state.error ? '<div class="notice warning error-summary" role="alert">' + esc(state.error) + '</div>' : '') + (state.success ? '<div class="notice success" role="status">' + esc(state.success) + '</div>' : '');
  const heading = (eyebrow, title, subtitle) => '<div class="eyebrow">' + esc(eyebrow) + '</div><h1 class="page-title">' + esc(title) + '</h1>' + (subtitle ? '<p class="lede">' + esc(subtitle) + '</p>' : '');
  const button = (action, text, style, attrs) => '<button type="button" class="button ' + (style || 'secondary') + '" data-action="' + action + '" ' + (attrs || '') + '>' + text + '</button>';
  function toast(text) {
    const el = document.getElementById('toast');
    el.textContent = text; el.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 4200);
  }
  function storageNotice(response) {
    const warning = (response && response.warning) || api.config.storageWarning;
    const el = document.getElementById('storage-warning');
    if (warning) { el.textContent = warning; el.classList.remove('hidden'); }
    else { el.textContent = ''; el.classList.add('hidden'); }
  }
  function clearMessages() { state.error = ''; state.success = ''; }
  function searchPage() {
    return heading('CAMPUS / LOST & FOUND', '把遺失的日常，重新連起來。', '描述你的物品，查看相近結果；每一次交接，都有跡可循。') + messages() +
      '<div class="search-workspace"><section class="search-panel panel"><div class="list-heading"><h2>描述遺失物品</h2><span class="pill">今日剩 ' + state.remaining + ' 次</span></div>' + '<form id="search-form" class="form-stack"><div class="field"><label for="query">描述你的物品</label><textarea id="query" name="query" rows="3" maxlength="500" placeholder="例如：黑色折疊雨傘，彎曲握把">' + esc(state.query) + '</textarea><p class="field-help">需要「種類＋特徵」。描述不足也會使用 1 次搜尋。</p></div><div class="chips" aria-label="試試範例">' + button('example', '試試：黑色折疊雨傘', 'chip') + '</div><div class="field-row"><div class="field"><label for="category">物品種類 <span class="optional">選填</span></label><select id="category" name="category">' + optionList(api.config.categories, state.category, '從描述判斷') + '</select></div><div class="field"><label for="area">可能遺失地點 <span class="optional">選填</span></label><select id="area" name="area">' + optionList(api.config.areas, state.area, '所有地點') + '</select></div></div><button class="button primary" type="submit">找找相近物品 ' + icon('arrow') + '</button></form><p class="field-help centered">每人每天最多 10 次，送出搜尋後即在結果欄更新。</p></section><section class="matches-panel" aria-label="相近物品" aria-live="polite">' + resultsPage() + '</section></div>' + claimsPage();
  }

  function itemCard(item, claimButton) {
    const applied = state.claims.some((claim) => claim.item_id === item.id);
    return '<article class="result-card">' + photo(item) + '<div class="item-body"><div class="item-meta"><span>' + esc(item.category) + '</span><span>' + esc(item.color) + '</span></div><h3 class="item-title">' + esc(item.description) + '</h3><p class="item-meta">' + icon('location') + esc(item.area) + '<span>·</span>' + esc(date(item.found_date)) + '</p>' + (claimButton ? '<div class="card-actions">' + button('select-item', (applied ? '已申請，查看進度' : '這是我的') + icon('arrow'), 'secondary', 'data-id="' + esc(item.id) + '"') + '</div>' : '') + '</div></article>';
  }
  function resultsPage() {
    return '<div class="list-heading"><h2>相近物品</h2><span class="pill">' + state.results.length + ' 筆結果</span></div><div class="notice info"><strong>規則比對，非 AI 信心分數</strong><p>最多顯示 3 筆；種類相同，提及的顏色必須一致。</p></div>' + (state.searchHint ? '<p class="search-hint">' + esc(state.searchHint) + '</p>' : '') + '<div class="results-grid">' + (state.results.length ? state.results.map((item) => itemCard(item, true)).join('') : empty('等一件物品，回到你身邊', '在左欄描述種類與特徵，按下搜尋後即可查看相近物品。')) + '</div>';
  }
  function claimPage() {
    return heading('CLAIM / YOUR DETAILS', '只有你知道的小細節。', '這些內容只供管理員核對，不會公開展示。') + messages() + itemCard(state.selected, false) + '<form id="claim-form" class="form-stack panel"><div class="field"><label for="claim-note">用什麼細節證明物品是你的？</label><textarea name="note" id="claim-note" rows="4" required maxlength="1000" placeholder="例如：內側的記號、獨特刮痕，或裡面的物品"></textarea><p class="field-help">請描述物品特徵，勿填寫真實姓名、證件號碼或聯絡資訊。</p></div><div class="notice info">送出後，到失物招領櫃檯由管理員核對，通過後即可領回。</div><button class="button primary" type="submit">送出認領申請 ' + icon('arrow') + '</button>' + button('back-results', '返回相近結果', 'ghost') + '</form>';
  }
  function empty(title, text) {
    return '<div class="empty-state"><div class="empty-icon">' + icon('box') + '</div><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p></div>';
  }
  function claimsPage() {
    return '<section id="my-claims" class="claims-section"><div class="list-heading"><div><div class="eyebrow">YOUR RECLAIM JOURNEY</div><h2>我的認領進度</h2></div><span class="pill">' + state.claims.length + ' 筆申請</span></div>' + (!state.user ? '<div class="notice info">登入後可查看你的認領進度。' + button('student-login', '學生登入', 'secondary') + '</div>' : state.claims.length ? '<div class="claims-timeline">' + state.claims.map(studentClaim).join('') + '</div>' : empty('還沒有認領申請', '找到相近物品後，按「這是我的」填寫物品細節。')) + '</section>';
  }
  function studentClaim(claim) {
    const item = claim.item || {};
    const descriptions = {
      '待領取': '請攜帶學生證，到失物招領櫃檯核對本人與物品細節。',
      '已領回': '物品已交還，謝謝你讓這段拾光有了好結果。',
      '核對未通過': '此次核對未通過，同一物品無法再次申請。',
      '已由他人領回': '這件物品已完成交還，此申請無法再領取。'
    };
    return '<article class="claim-card"><div class="claim-top"><span class="item-meta">申請 ' + esc(claim.id) + '</span>' + status(claim.status) + '</div><h3>' + esc((item.color || '') + (item.category || '失物')) + '</h3><p class="item-description">' + esc(item.description || '') + '</p><p class="item-meta">' + esc(item.area || '') + ' · ' + esc(date(item.found_date)) + '</p><p class="field-help">申請送出 · ' + esc(date(claim.created_at, true)) + '</p><div class="claim-note"><span class="label">你提供的細節</span><p>' + esc(claim.note) + '</p></div><div class="claim-timeline"><span class="timeline-dot"></span><div class="timeline-copy"><strong>' + esc(claim.status) + '</strong><p>' + esc(descriptions[claim.status] || '') + '</p>' + (claim.review && claim.review.note ? '<p>處理備註：' + esc(claim.review.note) + '</p>' : '') + '<span class="field-help">' + esc(date(claim.review ? claim.review.at : claim.created_at, true)) + '</span></div></div></article>';
  }
  function loginGate(title, text) {
    return heading('YOUR CAMPUS ACCOUNT', title, text) + empty('使用模擬學生帳號', '請使用展示帳號或建立一組模擬學號。') + button('student-login', '前往學生登入 ' + icon('arrow'), 'primary');
  }
  function accountPage() {
    if (state.user) return signedInAccount();
    if (state.authMode === 'admin') return adminLoginPage();
    const register = state.authMode === 'register';
    return heading('YOUR CAMPUS ACCOUNT', register ? '留一個找回的機會。' : '歡迎回到失物小站。', '使用模擬學號，接著完成你的認領旅程。') + '<div class="auth-tabs" aria-label="學生帳號"><button type="button" data-action="student-login" class="' + (!register ? 'active' : '') + '" aria-pressed="' + !register + '">學生登入</button><button type="button" data-action="register" class="' + (register ? 'active' : '') + '" aria-pressed="' + register + '">註冊帳號</button></div>' + messages() + '<form id="' + (register ? 'register' : 'login') + '-form" class="form-stack"><div class="field"><label for="student-id">9 碼學號</label><input id="student-id" name="student_id" type="text" inputmode="numeric" pattern="[0-9]{9}" maxlength="9" autocomplete="username" required placeholder="例如 113000001"><p class="field-help">僅接受 9 碼數字，請勿使用真實個資。</p></div><div class="field"><label for="password">密碼</label><input id="password" name="password" type="password" ' + (register ? 'minlength="8" ' : '') + 'maxlength="128" required autocomplete="' + (register ? 'new-password' : 'current-password') + '" placeholder="至少 8 碼"></div>' + (register ? '<div class="field"><label for="confirm-password">確認密碼</label><input id="confirm-password" name="confirm_password" type="password" minlength="8" maxlength="128" required autocomplete="new-password" placeholder="再次輸入密碼"></div><div class="field"><label for="code">模擬驗證碼</label><div class="field-row"><input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required placeholder="246810">' + button('send-code', '取得驗證碼', 'secondary') + '</div><p class="field-help">展示用固定為 246810，不會真的寄送訊息。</p></div>' : '') + '<button class="button primary" type="submit">' + (register ? '建立模擬帳號' : '登入，繼續尋找') + icon('arrow') + '</button></form><p class="field-help centered">連續輸錯密碼 5 次，該帳號暫停登入 15 分鐘。</p><div class="credentials"><strong>學生展示帳號</strong><p>113000001 或 113000002<br>密碼：Demo246810</p><p class="field-help">已有水壺申請，可直接體驗查看進度。<br>新認領可搜尋「黑色折疊雨傘」。</p></div><div class="divider"></div>' + button('admin-login', icon('shield') + ' 管理員展示入口', 'ghost') + resetSection();
  }
  function adminLoginPage() {
    return heading('STAFF DEMO / 展示專用', '管理員登入', '管理員與學生使用分開的登入入口。') + '<div class="notice info">以下兩組帳號皆為固定的模擬管理員，僅供展示。</div>' + messages() + '<form id="admin-login-form" class="form-stack"><div class="field"><label for="admin-username">展示管理員帳號</label><input id="admin-username" name="username" required autocomplete="username" placeholder="admin01 或 admin02"></div><div class="field"><label for="admin-password">密碼</label><input id="admin-password" name="password" type="password" required autocomplete="current-password" placeholder="管理員展示密碼"></div><button class="button primary" type="submit">登入管理端 ' + icon('arrow') + '</button></form><div class="credentials"><strong>兩組固定展示帳號</strong><p>admin01 ／ admin02<br>共同密碼：Admin246810</p><p class="field-help">連續輸錯密碼 5 次，該帳號暫停登入 15 分鐘。</p></div>' + button('student-login', icon('back') + ' 返回學生登入', 'ghost') + resetSection();
  }
  function resetSection() {
    return '<div class="divider"></div><div class="reset-section"><p class="field-help">示範資料只保存在這個瀏覽器。</p>' + (api.config.useMock ? (state.confirmReset ? '<div class="notice warning"><strong>重設會清除這個小站的帳號與操作紀錄。</strong><p>其他網站的資料不受影響，會回復初始示範資料。</p><div class="button-row">' + button('confirm-reset', '確認重設', 'danger') + button('cancel-reset', '取消', 'secondary') + '</div></div>' : button('reset', '重設示範資料', 'ghost')) : '<p class="field-help">目前使用 Flask API，無法從此處重設伺服器資料。</p>') + '</div>';
  }
  function signedInAccount() {
    return heading('YOUR CAMPUS ACCOUNT', '每件物品，都有歸處。', '你的模擬帳號與資料設定。') + messages() + '<div class="panel account-summary"><div class="avatar">' + icon(state.user.role === 'admin' ? 'shield' : 'user') + '</div><div><strong>' + esc(state.user.name || (state.user.role === 'admin' ? '展示管理員' : '學生帳號')) + '</strong><p>' + esc(state.user.student_id || state.user.username) + '</p><span class="pill">' + (state.user.role === 'admin' ? '管理員' : '學生') + '</span></div></div>' + button('logout', '登出帳號', 'secondary') + resetSection();
  }
  function adminTop(title, subtitle) {
    return '<div class="admin-identity"><span class="pill">' + icon('shield') + ' 管理端</span><span>' + esc(state.user.name || state.user.username) + '</span>' + button('logout', '登出', 'inline-link') + '</div>' + heading('STAFF WORKSPACE', title, subtitle);
  }
  function adminItemsPage() {
    return adminTop('讓物品，等到它的主人。', '登記公開資訊，並把核對特徵留給管理員。') + messages() + '<form id="item-form" class="form-stack"><div class="field-row"><div class="field"><label for="item-category">物品類別</label><select id="item-category" name="category" required>' + optionList(api.config.categories, '', '選擇類別') + '</select></div><div class="field"><label for="item-color">主要顏色</label><select id="item-color" name="color" required>' + optionList(colors, '', '選擇顏色') + '</select></div></div><div class="field"><label for="item-area">拾獲地點</label><select id="item-area" name="area" required>' + optionList(api.config.areas, '', '選擇地點') + '</select></div><div class="field"><label for="item-date">拾獲日期</label><input id="item-date" name="found_date" type="date" max="' + today() + '" value="' + today() + '" required></div><div class="field"><label for="item-description">公開描述</label><textarea id="item-description" name="description" rows="3" maxlength="500" required placeholder="外觀、材質等可公開的資訊"></textarea><p class="field-help">學生會看到這段描述，請勿填入私密核對特徵。</p></div><div class="field"><label for="item-detail">私密核對特徵</label><textarea id="item-detail" name="detail" rows="3" maxlength="1000" required placeholder="例如隱藏標記或內部物品，僅管理員可見"></textarea></div><div class="field"><label for="item-photo">失物照片</label><div class="upload-field"><input id="item-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required><p class="field-help">JPG／PNG／WebP，300KB 以內。</p></div><div id="photo-preview" class="photo-preview"><div class="photo-placeholder">' + icon('plus') + '<span>選取照片後會顯示預覽</span></div></div><p id="photo-error" class="field-help" role="alert"></p></div><button class="button primary" type="submit">' + icon('plus') + ' 完成失物登記</button></form><div class="divider"></div><div class="list-heading"><h2>已登記失物</h2><span class="count-badge">' + state.items.length + '</span></div>' + state.items.map((item) => '<details class="panel item-record"><summary>' + esc(item.color + item.category) + ' · ' + esc(item.area) + '</summary><div class="review-content">' + itemCard(item, false) + '<div class="private-detail"><span class="label">管理員專用・私密核對特徵</span><p>' + esc(item.detail) + '</p></div></div></details>').join('');
  }
  const checkLabels = ['學生證照片與本人相符', '學號與認領帳號相符', '物品細節相符'];
  function adminReviewPage() {
    return adminTop('每一件失物，都有下一站。', '依認領狀態整理交接，點開卡片進行臨櫃核對。') + '<div class="board-toolbar"><div class="notice info">系統只記錄結果，無法驗證實體證件。</div>' + button('open-item', icon('plus') + ' 登記失物', 'primary') + '</div>' + messages() + '<div class="claim-board">' + api.config.statuses.map((value) => {
      const claims = state.claims.filter((c) => c.status === value);
      return '<section class="board-column" data-status="' + esc(value) + '"><div class="list-heading"><h2>' + esc(value) + '</h2><span class="count-badge">' + claims.length + '</span></div>' + (claims.length ? claims.map((claim) => '<button type="button" class="board-card" data-action="open-review" data-id="' + esc(claim.id) + '"><span class="item-meta">' + esc(claim.id) + '</span><strong>' + esc((claim.item || {}).color || '') + esc((claim.item || {}).category || '失物') + '</strong><p>' + esc((claim.item || {}).description || '') + '</p><span class="log-meta">學號 ' + esc(claim.student_id) + '<br>' + esc(date(claim.created_at, true)) + '</span><span class="board-card-link">查看申請 ' + icon('arrow') + '</span></button>').join('') : '<p class="column-empty">目前沒有申請</p>') + '</section>';
    }).join('') + '</div>' + resetSection();
  }
  function adminClaim(claim) {
    const item = claim.item || state.items.find((i) => i.id === claim.item_id) || {};
    const pending = claim.status === '待領取';
    return '<details class="review-card" data-claim="' + esc(claim.id) + '"><summary><span><strong>' + esc(item.color + item.category) + '</strong><span class="log-meta">學號 ' + esc(claim.student_id) + ' · ' + esc(date(claim.created_at, true)) + '</span></span>' + status(claim.status) + '</summary><div class="review-content">' + itemCard(item, false) + '<div class="claim-note"><span class="label">學生提供的細節</span><p>' + esc(claim.note) + '</p></div><div class="private-detail"><span class="label">管理員專用・私密核對特徵</span><p>' + esc(item.detail || '未提供') + '</p></div>' + (pending ? '<form id="review-' + esc(claim.id) + '" class="review-form form-stack" data-id="' + esc(claim.id) + '"><fieldset class="check-list"><legend>臨櫃核對三項</legend>' + checkLabels.map((label, i) => '<label><input name="check' + i + '" type="checkbox"><span>' + label + '</span></label>').join('') + '</fieldset><div class="field"><label for="note-' + esc(claim.id) + '">處理備註／未通過原因</label><textarea id="note-' + esc(claim.id) + '" name="note" rows="2" maxlength="1000" placeholder="未通過時必填原因"></textarea></div><p class="field-help">三項全勾才能交還；未通過必須填寫原因。</p><button type="submit" name="result" value="已領回" class="button primary" disabled>' + icon('check') + ' 確認交還物品</button><button type="submit" name="result" value="核對未通過" class="button danger">核對未通過</button><p class="review-message field-help" role="alert"></p></form>' : reviewHistory(claim.review)) + '</div></details>';
  }
  function reviewHistory(review) {
    if (!review) return '<p class="field-help">物品已由他人領回，系統同步更新此申請。</p>';
    return '<div class="panel"><strong>核對紀錄</strong><p class="log-meta">' + esc(review.actor) + ' · ' + esc(date(review.at, true)) + '</p><ul class="review-checks">' + checkLabels.map((label, i) => '<li>' + (review.checks && review.checks[i] ? '✓ ' : '— ') + label + '</li>').join('') + '</ul><p>' + esc(review.note || '無備註') + '</p></div>';
  }
  function logsPage() {
    return adminTop('每一次交接，都有紀錄。', '保留處理者、時間、三項核對結果與備註。') + messages() + '<div class="list-heading"><h2>操作紀錄</h2><span class="count-badge">' + state.logs.length + '</span></div>' + (state.logs.length ? state.logs.map((log) => '<article class="log-card"><div class="log-top"><strong>' + esc(log.action) + '</strong><span class="field-help">' + esc(date(log.at, true)) + '</span></div><p class="log-meta">處理者 ' + esc(log.actor) + (log.claim_id ? ' · 申請 ' + esc(log.claim_id) : '') + '</p>' + (Array.isArray(log.checks) ? '<ul class="review-checks">' + checkLabels.map((label, i) => '<li>' + (log.checks[i] ? '✓ ' : '— ') + label + '</li>').join('') + '</ul>' : '') + '<p>' + esc(log.note || '無備註') + '</p></article>').join('') : empty('還沒有操作紀錄', '登記與核對後，這裡會保留每一次處理結果。'));
  }
  function render(focus) {
    if (!api) { main.innerHTML = '<div class="page"><h1>無法載入資料服務</h1><p>請確認 js/api.js 與 index.html 位於同一個專案中。</p></div>'; return; }
    const admin = state.user && state.user.role === 'admin';
    const content = state.view === 'account' ? '<section class="account-page">' + accountPage() + '</section>' : admin ? (state.view === 'admin-logs' ? logsPage() : adminReviewPage()) : searchPage();
    main.innerHTML = '<div class="page">' + content + '</div>';
    const links = admin ? [['admin-review', 'claim', '認領看板'], ['admin-logs', 'log', '操作紀錄']] : [['search', 'search', '尋找物品'], ['claims', 'claim', '我的認領'], ['account', 'user', '我的帳號']];
    nav.innerHTML = links.map(([view, image, label]) => '<button type="button" class="nav-item ' + (view === state.view ? 'active' : '') + '" data-view="' + view + '"' + (view === state.view ? ' aria-current="page"' : '') + '>' + icon(image) + '<span>' + label + '</span></button>').join('');
    storageNotice();
    if (focus) { main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
    renderDrawer();
  }
  function renderDrawer() {
    if (!state.drawer) { if (drawer.open) drawer.close(); document.getElementById('panel-content').replaceChildren(); return; }
    let content = '';
    if (state.drawer === 'claim' && state.selected) content = claimPage();
    if (state.drawer === 'item') content = adminItemsPage();
    if (state.drawer === 'review') {
      const claim = state.claims.find((c) => c.id === state.reviewId);
      if (claim) content = heading('CLAIM / REVIEW', '臨櫃核對', '系統只記錄結果，無法驗證實體證件。') + adminClaim(claim).replace('<details ', '<details open ');
    }
    document.getElementById('panel-content').innerHTML = content;
    if (!drawer.open) drawer.showModal();
    document.getElementById('close-panel').focus();
  }
  function closeDrawer() {
    state.drawer = null; drawer.close(); document.getElementById('panel-content').replaceChildren();
    if (drawerOpener && drawerOpener.isConnected) drawerOpener.focus();
  }
  drawer.addEventListener('cancel', (event) => { event.preventDefault(); if (!state.loading) closeDrawer(); });
  drawer.addEventListener('click', (event) => { if (event.target === drawer && !state.loading) closeDrawer(); });
  async function call(operation) {
    if (state.loading) return { ok: false, message: '正在處理，請稍候。' };
    state.loading = true;
    main.setAttribute('aria-busy', 'true');
    const submits = Array.from(document.querySelectorAll('button[type="submit"]'));
    submits.forEach((el) => { el.dataset.wasDisabled = String(el.disabled); el.disabled = true; });
    try {
      const result = await operation();
      storageNotice(result);
      return result || { ok: false, message: '未收到服務回應。' };
    } catch (error) { return { ok: false, message: '服務暫時無法使用，請稍後再試。' }; }
    finally {
      state.loading = false; main.removeAttribute('aria-busy');
      submits.forEach((el) => { el.disabled = el.dataset.wasDisabled === 'true'; delete el.dataset.wasDisabled; });
    }
  }
  async function refresh(view, focus) {
    clearMessages();
    if (state.user && state.user.role === 'admin') {
      const method = view === 'admin-items' ? () => api.getItems() : view === 'admin-logs' ? () => api.getLogs() : () => api.getClaims();
      const response = await call(method);
      if (response.ok) {
        if (view === 'admin-items') state.items = response.items || [];
        else if (view === 'admin-logs') state.logs = response.logs || [];
        else state.claims = response.claims || [];
      } else state.error = response.message;
    } else if (state.user && (view === 'claims' || view === 'search')) {
      const response = await call(() => api.getClaims());
      if (response.ok) state.claims = response.claims || []; else state.error = response.message;
    }
    state.view = view; render(focus);
  }
  function rememberSearch() {
    const form = document.getElementById('search-form');
    if (form) { state.query = form.elements.query.value; state.category = form.elements.category.value; state.area = form.elements.area.value; }
  }
  document.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action], [data-view]');
    if (!target) return;
    event.preventDefault();
    if (state.loading) return;
    rememberSearch(); clearMessages();
    if (target.dataset.view) { state.drawer = null; if (target.dataset.view === 'claims') { await refresh('search'); document.getElementById('my-claims').scrollIntoView({behavior:'smooth'}); } else await refresh(target.dataset.view, true); return; }
    const action = target.dataset.action;
    if (action === 'close-panel') { closeDrawer(); return; }
    else if (action === 'open-review') { drawerOpener = target; state.reviewId = target.dataset.id; state.drawer = 'review'; renderDrawer(); }
    else if (action === 'open-item') { drawerOpener = target; const response = await call(() => api.getItems()); if (!response.ok) { toast(response.message); return; } state.items = response.items || []; state.drawer = 'item'; renderDrawer(); }
    else if (action === 'home') { state.step = 1; await refresh(state.user && state.user.role === 'admin' ? 'admin-review' : 'search', true); }
    else if (action === 'example') { state.query = '黑色折疊雨傘，彎曲握把'; state.category = '雨傘'; state.area = ''; render(); document.getElementById('query').focus(); }
    else if (['student-login', 'register', 'admin-login'].includes(action)) { state.authMode = action === 'register' ? 'register' : action === 'admin-login' ? 'admin' : 'login'; state.view = 'account'; state.confirmReset = false; render(true); }
    else if (action === 'new-search') { state.step = 1; state.view = 'search'; state.selected = null; render(true); }
    else if (action === 'back-results') { closeDrawer(); }
    else if (action === 'select-item') {
      const item = state.results.find((i) => i.id === target.dataset.id);
      if (!item) return;
      if (state.claims.some((c) => c.item_id === item.id)) { await refresh('search'); document.getElementById('my-claims').scrollIntoView({behavior:'smooth'}); toast('這件物品已申請過，請查看認領進度。'); return; }
      state.selected = item; drawerOpener = target; state.drawer = 'claim'; renderDrawer();
    } else if (action === 'send-code') {
      const form = document.getElementById('register-form');
      const response = await call(() => api.sendCode({ student_id: form.elements.student_id.value }));
      if (response.ok) toast(response.message || '模擬驗證碼為 246810，不會真的寄送訊息。');
      else showFormError(form, response.message);
    } else if (action === 'logout') {
      const response = await call(() => api.logout());
      if (!response.ok) { toast(response.message); return; }
      resetClient(); render(true); toast('已登出。');
    } else if (action === 'filter-pending' || action === 'filter-all') { state.filter = action === 'filter-all' ? 'all' : 'pending'; await refresh('admin-review'); }
    else if (action === 'reset' || action === 'cancel-reset') { state.confirmReset = action === 'reset'; render(); }
    else if (action === 'confirm-reset') {
      const response = await call(() => api.resetDemo());
      if (!response.ok) { toast(response.message); return; }
      resetClient(); render(true); toast('已回復初始示範資料。');
    }
  });
  function resetClient() {
    Object.assign(state, { drawer: null, reviewId: null, user: null, view: 'account', authMode: 'login', step: 1, results: [], selected: null, query: '', category: '', area: '', remaining: 10, claims: [], items: [], logs: [], error: '', success: '', filter: 'pending', confirmReset: false });
  }
  function showFormError(form, message) {
    let el = form.querySelector('.form-error');
    if (!el) { el = document.createElement('div'); el.className = 'notice warning form-error'; el.setAttribute('role', 'alert'); form.prepend(el); }
    el.textContent = message; el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (state.loading) return;
    const values = Object.fromEntries(new FormData(form));
    clearMessages();
    if (form.id === 'search-form') {
      rememberSearch();
      if (!state.user) { state.view = 'account'; state.authMode = 'login'; state.success = '先登入模擬帳號，就能開始搜尋。你的描述已保留。'; render(true); return; }
      const response = await call(() => api.search({ query: state.query, area: state.area, category: state.category }));
      state.results = []; state.selected = null;
      if (typeof response.remaining === 'number') state.remaining = response.remaining;
      if (!response.ok) { state.error = response.message; state.step = 1; }
      else { state.results = response.items || []; state.searchHint = response.hint || ''; state.step = 2; }
      render(true);
    } else if (form.id === 'login-form' || form.id === 'admin-login-form') {
      const admin = form.id === 'admin-login-form';
      const response = await call(() => admin ? api.adminLogin({ username: values.username, password: values.password }) : api.login({ student_id: values.student_id, password: values.password }));
      if (!response.ok) { showFormError(form, response.message); return; }
      const me = await call(() => api.me());
      if (!me.ok || !me.user) { showFormError(form, me.message || '無法取得帳號資訊，請重新登入。'); return; }
      state.user = me.user; state.remaining = typeof me.remaining === 'number' ? me.remaining : 10;
      state.results = []; state.selected = null; state.step = 1;
      await refresh(state.user.role === 'admin' ? 'admin-review' : 'search', true); toast('登入成功。');
    } else if (form.id === 'register-form') {
      if (values.password !== values.confirm_password) { showFormError(form, '兩次密碼不一致，請再確認。'); return; }
      const response = await call(() => api.register({ student_id: values.student_id, password: values.password, code: values.code }));
      if (!response.ok) { showFormError(form, response.message); return; }
      state.authMode = 'login'; state.success = '註冊完成，請使用剛建立的模擬帳號登入。'; render(true);
      document.getElementById('student-id').value = values.student_id;
    } else if (form.id === 'claim-form') {
      if (!state.selected) return;
      const response = await call(() => api.createClaim({ item_id: state.selected.id, note: values.note }));
      if (!response.ok) { showFormError(form, response.message); return; }
      state.selected = null; state.drawer = null; await refresh('search'); document.getElementById('my-claims').scrollIntoView({behavior:'smooth'}); toast('認領已送出，請攜帶學生證到櫃檯核對。');
    } else if (form.id === 'item-form') {
      const response = await call(() => api.createItem(new FormData(form)));
      if (!response.ok) { showFormError(form, response.message); return; }
      state.drawer = null; await refresh('admin-review', true); toast('失物登記完成。');
    } else if (form.classList.contains('review-form')) {
      const result = event.submitter && event.submitter.value;
      if (!['已領回', '核對未通過'].includes(result)) return;
      const checks = checkLabels.map((_, i) => form.elements['check' + i].checked);
      if (result === '核對未通過' && !String(values.note || '').trim()) { showFormError(form, '請填寫核對未通過的原因。'); form.elements.note.focus(); return; }
      const response = await call(() => api.reviewClaim(form.dataset.id, { result, checks, note: values.note }));
      if (!response.ok) { showFormError(form, response.message); return; }
      state.drawer = null; await refresh('admin-review', true); toast(result === '已領回' ? '已記錄交還；同物品其他申請已同步更新。' : '已記錄核對未通過與原因。');
    }
  });
  document.addEventListener('change', async (event) => {
    const input = event.target;
    if (input.matches('.review-form input[type="checkbox"]')) {
      const form = input.closest('form');
      form.querySelector('button[value="已領回"]').disabled = !checkLabels.every((_, i) => form.elements['check' + i].checked);
    }
    if (input.id !== 'item-photo') return;
    const preview = document.getElementById('photo-preview');
    const error = document.getElementById('photo-error');
    preview.replaceChildren(); error.textContent = '';
    const file = input.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 300 * 1024) { input.value = ''; error.textContent = '請選擇 JPG／PNG／WebP，且檔案不得超過 300KB。'; return; }
    const reader = new FileReader();
    reader.onload = () => { if (input.files[0] !== file) return; const image = new Image(); image.alt = '待登記的失物照片預覽'; image.src = reader.result; preview.replaceChildren(image); };
    reader.onerror = () => { error.textContent = '無法讀取照片，請重新選取。'; input.value = ''; };
    reader.readAsDataURL(file);
  });
  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement && event.target.closest('.item-photo')) { event.target.parentElement.innerHTML = icon('box') + '<span class="photo-caption">照片無法載入</span>'; }
  }, true);
  async function init() {
    if (!api) { render(); return; }
    const response = await call(() => api.me());
    if (response.ok && response.user) {
      state.user = response.user; state.remaining = typeof response.remaining === 'number' ? response.remaining : 10;
      await refresh(state.user.role === 'admin' ? 'admin-review' : 'search');
    } else { if (!response.ok) state.error = response.message; render(); }
  }
  init();
}());
