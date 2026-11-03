/* Campus Reclaim V2 — all persistence and /api requests live in this file.
 * MOCK IS A DEMONSTRATION, NOT A SECURITY BOUNDARY. Do not enter real data.
 * Switch to false only after serving this folder from the Flask origin.
 */
const USE_MOCK = true;

(function () {
  'use strict';

  const STORAGE_KEY = 'campus-reclaim-v2.demo.v1';
  const CATEGORIES = ['水壺', '電子用品', '雨傘', '包袋', '鑰匙', '其他'];
  const AREAS = ['圖書館', '教學大樓', '體育館', '學生餐廳', '學生活動中心'];
  const STATUSES = ['待領取', '已領回', '核對未通過', '已由他人領回'];
  const ADMINS = { admin01: { password: 'Admin246810', name: '展示管理員 01' }, admin02: { password: 'Admin246810', name: '展示管理員 02' } };
  const CATEGORY_WORDS = {
    '水壺': ['水壺', '水瓶', '保溫杯', '保溫瓶', '杯子', '隨行杯'],
    '電子用品': ['電子用品', '耳機', '充電器', '充電線', '行動電源', '手機', '平板', '電腦', '滑鼠', '鍵盤', '手錶'],
    '雨傘': ['雨傘', '折傘', '長傘', '陽傘', '傘'],
    '包袋': ['包袋', '背包', '書包', '提袋', '帆布袋', '手提包', '錢包', '包包'],
    '鑰匙': ['鑰匙', '鎖匙'], '其他': ['其他']
  };
  const COLORS = [
    ['粉紅色', ['粉紅色', '粉紅', '粉色', 'pink']], ['棕色', ['咖啡色', '棕色', '褐色', '咖啡', '棕', '褐', 'brown']],
    ['黑色', ['黑色', '黑', 'black']], ['白色', ['白色', '白', 'white']], ['灰色', ['灰色', '灰', 'gray', 'grey']],
    ['紅色', ['紅色', '紅', 'red']], ['橘色', ['橘色', '橙色', '橘', '橙', 'orange']], ['黃色', ['黃色', '黃', 'yellow']],
    ['綠色', ['綠色', '綠', 'green']], ['藍色', ['藍色', '藍', 'blue']], ['紫色', ['紫色', '紫', 'purple']],
    ['米色', ['米白色', '米白', '米色', 'beige']], ['透明', ['透明', 'transparent']], ['銀色', ['銀色', 'silver']], ['金色', ['金色', 'gold']]
  ];
  let memory = null;
  let storageWarning = '';
  let searchContext = { student_id: null, sessionId: null, itemIds: [] };
  let remoteRole = null;
  const now = () => new Date().toISOString();
  const copy = value => JSON.parse(JSON.stringify(value));
  const text = value => typeof value === 'string' ? value.trim() : '';
  const fail = (message, extra) => Object.assign({ ok: false, message }, extra || {});
  const success = data => Object.assign({ ok: true }, data || {}, storageWarning ? { warning: storageWarning } : {});
  const uid = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

  // Calendar-day limits always use Asia/Taipei, independent of device timezone.
  function dayKey(value) {
    const date = value ? new Date(value) : new Date();
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
  function dateAgo(days) { return dayKey(Date.now() - days * 86400000); }
  function seed() {
    const at = now();
    return {
      version: 1,
      students: [
        { student_id: '113000001', password: 'Demo246810' },
        { student_id: '113000002', password: 'Demo246810' }
      ],
      session: null, attempts: {}, searches: {},
      items: [
        { id: 'item-bottle', category: '水壺', area: '圖書館', found_date: dateAgo(2), color: '藍色', description: '藍色不鏽鋼水壺，瓶身有白色山形貼紙，附提環。', detail: '瓶底以黑筆寫了小寫 k；杯蓋內有一道短刮痕。', photo: 'assets/bottle.png', returned_at: null },
        { id: 'item-umbrella', category: '雨傘', area: '教學大樓', found_date: dateAgo(1), color: '黑色', description: '黑色折疊雨傘，木紋握把，附黑色傘套。', detail: '傘套內標籤縫有兩針黃色線，束帶背面寫了 17。', photo: 'assets/umbrella.png', returned_at: null },
        { id: 'item-earbuds', category: '電子用品', area: '學生餐廳', found_date: dateAgo(3), color: '白色', description: '白色無線耳機與充電盒，盒外有淺淺擦痕。', detail: '充電盒內側貼有一個微小的綠色三角貼紙。', photo: 'assets/earbuds.png', returned_at: null },
        { id: 'item-bag', category: '包袋', area: '學生活動中心', found_date: dateAgo(4), color: '米色', description: '米色帆布提袋，正面有綠色植物圖案，長提把。', detail: '內袋裡有一張背面畫了星星的空白書籤。', photo: 'assets/bag.png', returned_at: null }
      ],
      claims: [
        { id: 'claim-demo-01', item_id: 'item-bottle', student_id: '113000001', note: '瓶底有用黑筆寫的英文字母，杯蓋內也有一道刮痕。', status: '待領取', created_at: at, review: null },
        { id: 'claim-demo-02', item_id: 'item-bottle', student_id: '113000002', note: '我遺失的水壺有白色山形貼紙，想臨櫃確認瓶底記號。', status: '待領取', created_at: at, review: null }
      ],
      logs: [{ id: 'log-demo', actor: 'admin01', at, action: '建立示範資料', note: '四件失物與同一水壺的兩筆待領取申請，供展示核對流程。' }]
    };
  }
  // Every localStorage access is guarded. Quota/disabled storage uses this tab's memory.
  function load() {
    if (memory && storageWarning) return memory;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.version === 1 && Array.isArray(parsed.items) && Array.isArray(parsed.students) && Array.isArray(parsed.claims) && parsed.attempts && parsed.searches && Array.isArray(parsed.logs)) {
          memory = parsed;
          return memory;
        }
        throw new Error('invalid demo data');
      }
    } catch (_) {
      storageWarning = '瀏覽器儲存空間無法使用或示範資料損壞；目前改用此分頁的暫存，重新整理後可能不保留。';
    }
    memory = memory || seed();
    save(memory);
    return memory;
  }
  function save(db) {
    memory = db;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
    catch (_) { storageWarning = '瀏覽器儲存空間無法使用或已滿；目前改用此分頁的暫存，重新整理後可能不保留。'; }
  }
  function currentUser(db) {
    const s = db.session;
    if (s && s.role === 'student' && db.students.some(student => student.student_id === s.student_id)) return { role: 'student', student_id: s.student_id, name: s.student_id };
    if (s && s.role === 'admin' && Object.prototype.hasOwnProperty.call(ADMINS, s.username)) return { role: 'admin', username: s.username, name: ADMINS[s.username].name };
    return null;
  }
  function roleError(db, role) {
    const user = currentUser(db);
    if (!user) return fail('請先登入。');
    if (user.role !== role) return fail(role === 'admin' ? '此功能僅限管理員。' : '請使用學生帳號登入。');
    return null;
  }
  function validStudentId(id) { return /^\d{9}$/.test(id); }
  function publicItem(item) {
    if (!item) return null;
    // Whitelist, rather than deleting one field, prevents future private-field leaks.
    return { id: item.id, category: item.category, area: item.area, found_date: item.found_date, color: item.color, description: item.description, photo: item.photo };
  }
  function claimView(db, claim, admin) {
    const item = db.items.find(entry => entry.id === claim.item_id);
    const result = { id: claim.id, item_id: claim.item_id, student_id: claim.student_id, note: claim.note, status: claim.status, created_at: claim.created_at, item: admin ? copy(item || null) : publicItem(item) };
    // Review notes can contain private features. Students see only result/time.
    if (claim.review) result.review = admin ? copy(claim.review) : { result: claim.review.result, at: claim.review.at };
    return result;
  }
  function remaining(db, studentId) {
    const entry = db.searches[studentId];
    return Math.max(0, 10 - (entry && entry.day === dayKey() ? entry.count : 0));
  }
  function clearSearch() { searchContext = { student_id: null, sessionId: null, itemIds: [] }; }
  function loginMock(role, id, password) {
    const db = load();
    const attemptKey = role + ':' + id;
    const current = Date.now();
    let attempt = db.attempts[attemptKey] || { count: 0, until: 0 };
    if (attempt.until > current) return fail('連續錯誤密碼已達 5 次，請於 15 分鐘暫停結束後再試。', { locked_until: new Date(attempt.until).toISOString() });
    if (attempt.until && attempt.until <= current) attempt = { count: 0, until: 0 };
    const account = role === 'student' ? db.students.find(student => student.student_id === id) : (Object.prototype.hasOwnProperty.call(ADMINS, id) ? ADMINS[id] : null);
    if (!account || account.password !== password) {
      attempt.count += 1;
      if (attempt.count >= 5) attempt.until = current + 15 * 60000;
      db.attempts[attemptKey] = attempt;
      save(db);
      return fail(attempt.until ? '連續錯誤密碼已達 5 次，此帳號暫停登入 15 分鐘。' : '帳號或密碼錯誤（連續錯誤 ' + attempt.count + '/5 次）。', attempt.until ? { locked_until: new Date(attempt.until).toISOString() } : null);
    }
    delete db.attempts[attemptKey];
    db.session = role === 'student' ? { role, student_id: id, id: uid('session') } : { role, username: id, id: uid('session') };
    clearSearch();
    save(db);
    return success({ user: currentUser(db), remaining: role === 'student' ? remaining(db, id) : undefined });
  }
  function mentionedColors(input) {
    let rest = input.toLowerCase();
    const found = [];
    // Longer phrases before short color characters, e.g. 米白 must not count 白色.
    const allAliases = COLORS.flatMap(([color, aliases]) => aliases.map(alias => ({ color, alias }))).sort((a, b) => b.alias.length - a.alias.length);
    for (const entry of allAliases) {
      if (rest.includes(entry.alias)) {
        if (!found.includes(entry.color)) found.push(entry.color);
        rest = rest.split(entry.alias).join(' ');
      }
    }
    return found;
  }
  function inferCategories(query) {
    return CATEGORIES.filter(category => CATEGORY_WORDS[category].some(word => query.includes(word)));
  }
  function hasFeature(query) {
    if (mentionedColors(query).length) return true;
    let rest = query;
    const removals = Object.values(CATEGORY_WORDS).flat().concat(AREAS, ['請幫我找', '我想找', '我遺失', '我的', '一個', '一把', '一支', '一副', '一件', '一只', '遺失', '失物', '不見', '掉了', '丟了', '尋找', '東西', '請問', '有沒有', '找到', '物品', '今天', '昨天', '前天', '可能', '應該', '附近', '裡面', '那個', '這個', '我', '在', '的', '了', '找', '有', '是', '掉']);
    removals.sort((a, b) => b.length - a.length).forEach(word => { rest = rest.split(word).join(''); });
    return rest.replace(/[\s\p{P}\p{S}]/gu, '').length >= 2;
  }
  function relevance(item, query) {
    let score = 0;
    for (let i = 0; i < query.length - 1; i += 1) if (item.description.includes(query.slice(i, i + 2))) score += 1;
    return score;
  }
  function addLog(db, actor, action, note, extra) {
    db.logs.unshift(Object.assign({ id: uid('log'), actor, at: now(), action, note }, extra || {}));
  }
  async function validatePhoto(file) {
    if (!file || !file.size || typeof file.arrayBuffer !== 'function') return fail('請選擇一張 JPG、PNG 或 WebP 照片。');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return fail('照片只接受 JPG、PNG 或 WebP。');
    if (file.size > 300 * 1024) return fail('照片大小不得超過 300KB（307,200 bytes）。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
    const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
    const isWebp = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    if (!(file.type === 'image/jpeg' && isJpeg || file.type === 'image/png' && isPng || file.type === 'image/webp' && isWebp)) return fail('照片內容與檔案格式不符，請重新選擇有效圖片。');
    return { ok: true, bytes };
  }
  function dataUrl(bytes, type) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return 'data:' + type + ';base64,' + window.btoa(binary);
  }
  async function request(path, method, body) {
    const options = { method: method || 'GET', credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      if (body instanceof FormData) options.body = body;
      else { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    }
    try {
      const response = await fetch('./api' + path, options);
      let data;
      try { data = await response.json(); } catch (_) { return fail('伺服器回應格式錯誤，請稍後再試。'); }
      if (!response.ok || !data || data.ok === false) return fail(data && data.message || '伺服器無法完成此操作。');
      return Object.assign({}, data, { ok: true });
    } catch (_) { return fail('無法連線至 API。請透過 Flask 同源網址開啟頁面，再檢查網路連線。'); }
  }
  // A single guard keeps every public method's errors in the agreed JSON shape.
  const guarded = handler => async function (...args) {
    try { return await handler(...args); }
    catch (_) { return fail('此操作未完成，請檢查輸入內容或重設示範資料後重試。'); }
  };
  const api = {
    config: Object.freeze({ useMock: USE_MOCK, categories: Object.freeze(CATEGORIES.slice()), areas: Object.freeze(AREAS.slice()), statuses: Object.freeze(STATUSES.slice()), get storageWarning() { return storageWarning; } }),
    sendCode: guarded(async ({ student_id } = {}) => {
      const id = text(student_id);
      if (!validStudentId(id)) return fail('學號必須是純數字 9 碼。');
      if (!USE_MOCK) return request('/auth/send-code', 'POST', { student_id: id });
      load();
      return success({ message: '模擬驗證碼固定為 246810，不會寄送郵件或簡訊。' });
    }),
    register: guarded(async ({ student_id, password, code } = {}) => {
      const id = text(student_id);
      if (!validStudentId(id)) return fail('學號必須是純數字 9 碼。');
      if (typeof password !== 'string' || password.length < 8) return fail('密碼至少需要 8 碼。');
      if (text(code) !== '246810') return fail('模擬驗證碼固定為 246810。');
      if (!USE_MOCK) return request('/auth/register', 'POST', { student_id: id, password, code: text(code) });
      const db = load();
      if (db.students.some(student => student.student_id === id)) return fail('此學號已註冊，請直接登入。');
      db.students.push({ student_id: id, password });
      save(db);
      return success({ message: '註冊完成，請使用新帳號登入。' });
    }),
    login: guarded(async ({ student_id, password } = {}) => {
      const id = text(student_id);
      if (!validStudentId(id)) return fail('學生登入的學號必須是純數字 9 碼。');
      if (USE_MOCK) return loginMock('student', id, password);
      const result = await request('/auth/login', 'POST', { student_id: id, password });
      if (result.ok) {
        remoteRole = result.user && result.user.role;
        if (remoteRole !== 'student') { remoteRole = null; return fail('伺服器未確認學生身分，請檢查 Flask 登入回應的 user.role。'); }
      }
      return result;
    }),
    adminLogin: guarded(async ({ username, password } = {}) => {
      const id = text(username);
      if (!id) return fail('請輸入展示管理員帳號。');
      if (USE_MOCK) return loginMock('admin', id, password);
      // The agreed backend exposes one login endpoint. Fixed admin IDs are sent
      // in student_id; Flask must identify the role and enforce every permission.
      const result = await request('/auth/login', 'POST', { student_id: id, password });
      if (result.ok) {
        remoteRole = result.user && result.user.role;
        if (remoteRole !== 'admin') { remoteRole = null; return fail('伺服器未確認管理員身分，請檢查 Flask 登入回應的 user.role。'); }
      }
      return result;
    }),
    logout: guarded(async () => {
      clearSearch();
      remoteRole = null;
      if (!USE_MOCK) return request('/auth/logout', 'POST');
      const db = load();
      db.session = null;
      save(db);
      return success();
    }),
    me: guarded(async () => {
      if (!USE_MOCK) {
        const result = await request('/me');
        if (result.ok) remoteRole = result.user && result.user.role;
        return result;
      }
      const db = load(), user = currentUser(db);
      return success({ user, remaining: user && user.role === 'student' ? remaining(db, user.student_id) : undefined });
    }),
    search: guarded(async ({ query, area, category } = {}) => {
      const q = text(query), a = text(area), selected = text(category);
      clearSearch();
      if (!USE_MOCK) {
        const result = await request('/search', 'POST', { query: q, area: a, category: selected });
        if (result.ok && Array.isArray(result.items)) result.items = result.items.map(publicItem);
        return result;
      }
      const db = load(), permission = roleError(db, 'student');
      if (permission) return permission;
      const id = currentUser(db).student_id;
      if (!remaining(db, id)) return fail('今天的 10 次搜尋已用完，請明天再試。', { remaining: 0, items: [] });
      const today = dayKey();
      const entry = db.searches[id];
      db.searches[id] = { day: today, count: (entry && entry.day === today ? entry.count : 0) + 1 };
      save(db);
      const left = remaining(db, id);
      const inferred = inferCategories(q);
      const kind = selected || (inferred.length === 1 ? inferred[0] : '');
      if (!kind || !CATEGORIES.includes(kind) || !hasFeature(q)) return success({ items: [], remaining: left, hint: '請補充物品種類與至少一個特徵，例如「黑色折疊雨傘」。本次已計入搜尋次數。' });
      if (q.length > 500 || a && !AREAS.includes(a)) return fail('請使用有效地點，並將描述控制在 500 字以內。本次已計入搜尋次數。', { items: [], remaining: left });
      if (inferred.length && !inferred.includes(kind)) return success({ items: [], remaining: left, hint: '選擇的種類與描述不一致，請確認後再搜尋。本次已計入搜尋次數。' });
      const colors = mentionedColors(q);
      const items = db.items.filter(item => !item.returned_at && item.category === kind && (!a || item.area === a) && colors.every(color => mentionedColors(item.color).includes(color)))
        .map(item => ({ item, score: relevance(item, q) })).sort((x, y) => y.score - x.score || y.item.found_date.localeCompare(x.item.found_date)).slice(0, 3).map(entry => publicItem(entry.item));
      searchContext = { student_id: id, sessionId: db.session.id, itemIds: items.map(item => item.id) };
      return success({ items, remaining: left, hint: items.length ? '依種類、顏色、地點與公開描述進行規則比對，非 AI 信心分數。' : '目前沒有符合種類、顏色與地點的物品。可調整描述，或稍後再試。規則比對，非 AI 信心分數。' });
    }),
    createClaim: guarded(async ({ item_id, note } = {}) => {
      const id = text(item_id), detailNote = text(note);
      if (!detailNote) return fail('請填寫只有你知道的物品細節。');
      if (detailNote.length > 1000) return fail('認領細節請勿超過 1000 字。');
      if (!USE_MOCK) {
        const result = await request('/claims', 'POST', { item_id: id, note: detailNote });
        if (result.ok && result.claim) result.claim = remotePublicClaim(result.claim);
        return result;
      }
      const db = load(), permission = roleError(db, 'student');
      if (permission) return permission;
      const studentId = currentUser(db).student_id;
      if (searchContext.student_id !== studentId || searchContext.sessionId !== db.session.id || !searchContext.itemIds.includes(id)) return fail('只能申請本次搜尋結果中的物品，請重新搜尋。');
      const item = db.items.find(entry => entry.id === id);
      if (!item || item.returned_at) return fail('這件物品已由他人領回或已無法認領。');
      if (db.claims.some(claim => claim.student_id === studentId && claim.item_id === id)) return fail('你已申請過這件物品；同一人不可重複申請，被拒絕或已領回後也不可再申請。');
      const claim = { id: uid('claim'), item_id: id, student_id: studentId, note: detailNote, status: '待領取', created_at: now(), review: null };
      db.claims.unshift(claim);
      save(db);
      return success({ claim: claimView(db, claim, false) });
    }),
    getClaims: guarded(async () => {
      if (!USE_MOCK) {
        const result = await request('/claims');
        if (result.ok && remoteRole !== 'admin' && Array.isArray(result.claims)) result.claims = result.claims.map(remotePublicClaim);
        return result;
      }
      const db = load(), user = currentUser(db);
      if (!user) return fail('請先登入。');
      return success({ claims: db.claims.filter(claim => user.role === 'admin' || claim.student_id === user.student_id).map(claim => claimView(db, claim, user.role === 'admin')) });
    }),
    createItem: guarded(async form => {
      if (!form || typeof form.get !== 'function') return fail('登記失物需要完整表單與照片。');
      if (USE_MOCK) { const permission = roleError(load(), 'admin'); if (permission) return permission; }
      const category = text(form.get('category')), area = text(form.get('area')), foundDate = text(form.get('found_date')), color = text(form.get('color')), description = text(form.get('description')), detail = text(form.get('detail')), photo = form.get('photo');
      if (!CATEGORIES.includes(category) || !AREAS.includes(area)) return fail('請選擇有效的類別與拾獲地點。');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(foundDate) || isNaN(Date.parse(foundDate)) || new Date(foundDate + 'T00:00:00Z').toISOString().slice(0, 10) !== foundDate || foundDate > dayKey()) return fail('請填寫有效且不晚於今天的拾獲日期。');
      if (!color || !description || !detail) return fail('顏色、公開描述與私密核對特徵皆為必填。');
      if (color.length > 30 || description.length > 1000 || detail.length > 1000) return fail('顏色最多 30 字，公開描述與私密核對特徵各最多 1000 字。');
      const validated = await validatePhoto(photo);
      if (!validated.ok) return validated;
      if (!USE_MOCK) return request('/items', 'POST', form);
      const db = load(), permission = roleError(db, 'admin');
      if (permission) return permission;
      const item = { id: uid('item'), category, area, found_date: foundDate, color, description, detail, photo: dataUrl(validated.bytes, photo.type), returned_at: null };
      db.items.unshift(item);
      addLog(db, currentUser(db).username, '登記失物', category + '｜' + area + '｜' + description, { item_id: item.id });
      save(db);
      return success({ item: copy(item) });
    }),
    getItems: guarded(async () => {
      if (!USE_MOCK) return request('/items');
      const db = load(), permission = roleError(db, 'admin');
      return permission || success({ items: copy(db.items) });
    }),
    reviewClaim: guarded(async (id, { result, checks, note } = {}) => {
      const outcome = text(result), reviewNote = text(note);
      if (!['已領回', '核對未通過'].includes(outcome)) return fail('核對結果只能為「已領回」或「核對未通過」。');
      if (!Array.isArray(checks) || checks.length !== 3 || checks.some(check => typeof check !== 'boolean')) return fail('請提供三項核對勾選結果。');
      if (outcome === '已領回' && !checks.every(Boolean)) return fail('三項核對全部勾選後，才能交還物品。');
      if (outcome === '核對未通過' && !reviewNote) return fail('核對未通過必須填寫原因。');
      if (reviewNote.length > 1000) return fail('備註最多 1000 字。');
      if (!USE_MOCK) return request('/claims/' + encodeURIComponent(id) + '/review', 'POST', { result: outcome, checks, note: reviewNote });
      const db = load(), permission = roleError(db, 'admin');
      if (permission) return permission;
      const claim = db.claims.find(entry => entry.id === id);
      if (!claim || claim.status !== '待領取') return fail('此申請已處理或不存在，請更新清單。');
      const item = db.items.find(entry => entry.id === claim.item_id);
      if (!item || item.returned_at) return fail('這件失物已領回，不能再次交還。');
      const actor = currentUser(db).username, at = now();
      claim.status = outcome;
      claim.review = { actor, at, checks: checks.slice(), note: reviewNote, result: outcome };
      if (outcome === '已領回') {
        item.returned_at = at;
        db.claims.forEach(other => {
          if (other.item_id === item.id && other.id !== claim.id && other.status === '待領取') {
            other.status = '已由他人領回';
            // No physical checks were performed for this competing applicant.
            other.review = { actor, at, checks: [false, false, false], note: '同一物品已完成交還，系統自動結束此申請；此申請未執行臨櫃核對。', result: '已由他人領回', automatic: true };
            addLog(db, actor, '自動結束申請', other.review.note, { claim_id: other.id, item_id: other.item_id, student_id: other.student_id, result: '已由他人領回', checks: [false, false, false], automatic: true });
          }
        });
      }
      addLog(db, actor, outcome === '已領回' ? '交還物品' : '核對未通過', reviewNote, { claim_id: claim.id, item_id: claim.item_id, student_id: claim.student_id, result: outcome, checks: checks.slice() });
      save(db);
      return success({ claim: claimView(db, claim, true) });
    }),
    getLogs: guarded(async () => {
      if (!USE_MOCK) return request('/logs');
      const db = load(), permission = roleError(db, 'admin');
      return permission || success({ logs: copy(db.logs) });
    }),
    resetDemo: guarded(async () => {
      if (!USE_MOCK) return fail('重設示範資料僅適用於 USE_MOCK = true。');
      memory = seed();
      clearSearch();
      storageWarning = '';
      // Only this app's namespaced key is affected; never clear unrelated storage.
      try { window.localStorage.removeItem(STORAGE_KEY); }
      catch (_) { storageWarning = '無法重設瀏覽器儲存空間；目前已重設此分頁的暫存資料。'; }
      save(memory);
      return success({ user: null, message: '示範資料已重設，請重新登入。' });
    })
  };
  function remotePublicClaim(claim) {
    const view = { id: claim.id, item_id: claim.item_id, student_id: claim.student_id, note: claim.note, status: claim.status, created_at: claim.created_at, item: publicItem(claim.item) };
    if (claim.review) view.review = { result: claim.review.result, at: claim.review.at };
    return view;
  }
  window.CampusAPI = Object.freeze(api);
})();
