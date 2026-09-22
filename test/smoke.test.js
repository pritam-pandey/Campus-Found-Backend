/**
 * End-to-end smoke test for the Campus Found API + MongoDB integration.
 *
 * Boots the real Express app + Socket.IO against an in-memory MongoDB
 * (mongodb-memory-server) and exercises the full user journey:
 *
 *   register -> login -> post lost/found items (with image upload)
 *   -> possible-match scoring -> notifications -> private chat (REST + Socket.IO)
 *   -> mark returned -> my-posts -> search -> profile update -> admin panel
 *
 * Run:  npm run smoke --workspace server
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // ephemeral port
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-test-secret';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const io = require('socket.io-client');

const { app, start } = require('../server');
const User = require('../models/User');

let server, baseUrl, mongo;

/* ------------------------------------------------------------------ */
/*  Tiny HTTP helpers (no extra deps)                                  */
/* ------------------------------------------------------------------ */
const request = async (method, path, { token, body, formData } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: payload });

  let json = {};
  try {
    json = (res.headers.get('content-type') || '').startsWith('application/json') ? await res.json() : {};
  } catch (_) {
    /* empty body */
  }
  return { status: res.status, data: json, headers: res.headers };
};

const check = (name, cond, extra = '') => {
  if (!cond) throw new Error(`FAIL: ${name} ${extra}`);
  console.log(`  ok - ${name}`);
};

/* ------------------------------------------------------------------ */
/*  Test data — walletLost/walletFound are near-identical so the       */
/*  match engine must flag them; the phone item must NOT match.        */
/* ------------------------------------------------------------------ */
const A = { fullName: 'Ava Student', email: 'ava.student@gmail.com', mobile: '+8801700000001', studentId: 'S-001', department: 'CSE', semester: '3rd', password: 'secret123', confirmPassword: 'secret123' };
const B = { fullName: 'Ben Student', email: 'ben.student@gmail.com', mobile: '+8801700000002', studentId: 'S-002', department: 'EEE', semester: '5th', password: 'secret123', confirmPassword: 'secret123' };
const EVE = { fullName: 'Eve Snoop', email: 'eve.snoop@gmail.com', mobile: '+8801700000009', studentId: 'S-009', department: 'LAW', semester: '1st', password: 'secret123', confirmPassword: 'secret123' };

const walletLost = { itemName: 'Black Leather Wallet', category: 'Wallet', description: 'Black leather wallet with three card slots', color: 'black', brand: 'Levis', location: 'Library 2nd floor', date: '2026-09-10', time: '14:30' };
const walletFound = { itemName: 'Black Leather Wallet', category: 'Wallet', description: 'Black leather wallet with card slots', color: 'black', brand: 'Levis', location: 'Library 2nd floor', date: '2026-09-10', time: '15:00' };
const phoneLost = { itemName: 'Samsung Galaxy S24', category: 'Electronics', description: 'Phone left in lecture hall', color: 'white', brand: 'Samsung', location: 'Building C', date: '2026-09-11', time: '10:00' };

let tokenA, tokenB, idA, idB;

const run = async () => {
  console.log('\n== Campus Found smoke test ==');
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri('campus_found_test');
  server = await start();
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  /* ---------- Auth ---------- */
  let r = await request('POST', '/api/auth/register', { body: A });
  check('register A returns 201', r.status === 201, JSON.stringify(r.data));
  tokenA = r.data.token;
  idA = r.data.user._id;
  check('passwordHash never in response', !JSON.stringify(r.data).includes('passwordHash'));
  check('token cookie set (httpOnly)', (r.headers.get('set-cookie') || '').includes('HttpOnly'));

  r = await request('POST', '/api/auth/register', { body: { ...B, mobile: A.mobile } });
  check('duplicate mobile rejected 409', r.status === 409);
  r = await request('POST', '/api/auth/register', { body: { ...B, email: A.email } });
  check('duplicate email rejected 409', r.status === 409);
  r = await request('POST', '/api/auth/register', { body: { ...B, email: 'ben@campus.edu' } });
  check('non-Gmail email rejected 400', r.status === 400);
  r = await request('POST', '/api/auth/register', { body: { ...B, email: 'ben..student@gmail.com' } });
  check('malformed Gmail (consecutive dots) rejected 400', r.status === 400);
  r = await request('POST', '/api/auth/register', { body: B });
  check('register B ok', r.status === 201);
  tokenB = r.data.token;
  idB = r.data.user._id;

  r = await request('POST', '/api/auth/login', { body: { mobile: A.mobile, password: 'wrong' } });
  check('wrong password rejected 401', r.status === 401);
  r = await request('POST', '/api/auth/login', { body: { mobile: A.mobile, password: A.password } });
  check('login with mobile + password', r.status === 200 && r.data.user.fullName === A.fullName);
  tokenA = r.data.token;
  idA = r.data.user._id;

  /* ---------- Items + matching ---------- */
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = (fields) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    fd.append('images', new Blob([png], { type: 'image/png' }), 'w.png');
    return fd;
  };

  r = await request('POST', '/api/items/lost', { token: tokenA, formData: form(walletLost) });
  check('lost item created with uploaded image', r.status === 201 && r.data.item.images.length === 1 && r.data.item.images[0].startsWith('/uploads/'), JSON.stringify(r.data));
  const lostWalletId = r.data.item._id;

  check('anonymous item create rejected 401', (await request('POST', '/api/items/lost', { formData: form(walletLost) })).status === 401);

  r = await request('POST', '/api/items/found', { token: tokenB, formData: form(walletFound) });
  check('found item created', r.status === 201, JSON.stringify(r.data));
  const foundWalletId = r.data.item._id;
  check('possible match flagged on found item', r.data.item.status === 'possible_match', `status=${r.data.item?.status}`);

  r = await request('GET', `/api/items/${lostWalletId}`);
  check('counterpart lost item flagged possible_match too', r.data.item.status === 'possible_match', `status=${r.data.item?.status}`);

  r = await request('POST', '/api/items/lost', { token: tokenA, formData: form(phoneLost) });
  check('unrelated phone item stays active', r.data.item.status === 'active', `status=${r.data.item?.status}`);
  const phoneId = r.data.item._id;

  /* ---------- Search + my posts ---------- */
  r = await request('GET', '/api/items/search?q=wallet');
  check('search "wallet" finds items', r.data.items.some((i) => i._id === foundWalletId));
  r = await request('GET', '/api/items/search?type=lost&category=Electronics');
  check('search with type+category filters', r.data.items.length === 1 && r.data.items[0]._id === phoneId);
  r = await request('GET', '/api/items/my-posts', { token: tokenA });
  check('my-posts returns only own items', r.data.items.length === 2 && r.data.items.every((i) => String(i.userId) === idA));

  /* ---------- Notifications (the match created them) ---------- */
  r = await request('GET', '/api/notifications/unread-count', { token: tokenA });
  const unreadBefore = r.data.count;
  check('A has unread notifications from match', unreadBefore > 0, `count=${unreadBefore}`);
  r = await request('GET', '/api/notifications', { token: tokenA });
  const matchNotif = r.data.notifications.find((n) => n.type === 'possible_match');
  check('possible_match notification listed', !!matchNotif, JSON.stringify(r.data.notifications.map((n) => n.type)));
  r = await request('PUT', `/api/notifications/${matchNotif._id}/read`, { token: tokenA });
  check('mark single notification read', r.status === 200);
  r = await request('GET', '/api/notifications/unread-count', { token: tokenA });
  check('unread count drops by one', r.data.count === unreadBefore - 1, `before=${unreadBefore} after=${r.data.count}`);
  r = await request('PUT', '/api/notifications/read-all', { token: tokenA });
  check('read-all works', r.status === 200);
  r = await request('GET', '/api/notifications/unread-count', { token: tokenA });
  check('all notifications read -> 0', r.data.count === 0);

  /* ---------- Private chat (REST) ---------- */
  r = await request('POST', '/api/messages/conversations', { token: tokenB, body: { itemId: lostWalletId } });
  check('B starts conversation about A\'s lost wallet', r.status === 201, JSON.stringify(r.data));
  const convId = r.data.conversation._id;
  check('conversation linked to item + 2 participants', r.data.conversation.itemId?._id === lostWalletId && r.data.conversation.participants.length === 2);

  r = await request('POST', '/api/messages', { token: tokenB, body: { conversationId: convId, message: 'Hi! I think this is my wallet' } });
  check('B sends message', r.status === 201, JSON.stringify(r.data));
  const msgId = r.data.message._id;

  r = await request('GET', `/api/messages/conversations/${convId}/messages?markRead=true`, { token: tokenA });
  check('A loads messages with markRead', r.status === 200 && r.data.messages.length === 1);
  r = await request('GET', `/api/messages/conversations/${convId}/messages`, { token: tokenA });
  check('message now marked read', r.data.messages[0]._id === msgId && r.data.messages[0].readStatus === true);

  r = await request('GET', '/api/messages/unread-count', { token: tokenB });
  check('unread count endpoint responds', r.status === 200 && typeof r.data.count === 'number');

  /* Third user must NOT read the private conversation */
  r = await request('POST', '/api/auth/register', { body: EVE });
  const eveToken = r.data.token;
  r = await request('GET', `/api/messages/conversations/${convId}/messages`, { token: eveToken });
  check('outsider blocked from private chat 403', r.status === 403, `status=${r.status}`);

  /* ---------- Real-time chat over Socket.IO ---------- */
  const sockA = io(baseUrl, { auth: { token: tokenA }, transports: ['websocket'] });
  const sockB = io(baseUrl, { auth: { token: tokenB }, transports: ['websocket'] });
  const waitFor = (sock, event, ms = 5000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    sock.once(event, (p) => { clearTimeout(t); resolve(p); });
  });
  const pB = waitFor(sockB, 'message:new');
  const pNotifB = waitFor(sockB, 'notification:new');
  await new Promise((res) => setTimeout(res, 200)); // let both sockets connect + join rooms
  sockA.emit('chat:join', convId);
  sockB.emit('chat:join', convId);
  await request('POST', '/api/messages', { token: tokenA, body: { conversationId: convId, message: 'Real-time hello!' } });
  check('socket receives message:new live', (await pB).message === 'Real-time hello!');
  check('socket receives notification:new live', !!(await pNotifB));
  sockA.close();
  sockB.close();

  /* ---------- Mark returned ---------- */
  r = await request('PUT', `/api/items/${foundWalletId}/returned`, { token: tokenB });
  check('found wallet marked returned', r.status === 200 && r.data.item.status === 'returned', JSON.stringify(r.data));
  r = await request('GET', `/api/items/${lostWalletId}`);
  check('counterpart lost wallet also returned', r.data.item.status === 'returned', `status=${r.data.item?.status}`);
  r = await request('GET', '/api/notifications', { token: tokenA });
  check('A notified of item_returned', r.data.notifications.some((n) => n.type === 'item_returned'));

  /* ---------- Profile ---------- */
  r = await request('PUT', '/api/auth/profile', { token: tokenA, body: { department: 'BBA', semester: '4th', role: 'admin' } });
  check('profile updated, role change ignored', r.data.user.department === 'BBA' && r.data.user.role === 'student');
  r = await request('PUT', '/api/auth/profile', { token: tokenA, body: { mobile: '+8801799999999' } });
  check('protected field mobile NOT changed', r.data.user.mobile === A.mobile);

  /* ---------- Admin ---------- */
  await User.findByIdAndUpdate(idB, { role: 'admin' }); // seed-style promotion
  r = await request('POST', '/api/auth/login', { body: { mobile: B.mobile, password: B.password } });
  tokenB = r.data.token; // fresh token (same payload; role read from DB anyway)
  r = await request('GET', '/api/admin/users', { token: tokenB });
  check('admin can list users', r.status === 200 && r.data.users.length >= 3);
  r = await request('GET', '/api/admin/statistics', { token: tokenB });
  const st = r.data.statistics;
  check('statistics aggregated from MongoDB', st.totalStudents === 2 && st.totalLostItems === 2 && st.totalFoundItems === 1 && st.totalReturnedItems === 2 && st.totalMessages === 2, JSON.stringify(st)); // 2 students: B was promoted to admin
  r = await request('GET', '/api/admin/users', { token: tokenA });
  check('student blocked from admin API 403', r.status === 403);

  r = await request('PUT', `/api/admin/users/${idA}/suspend`, { token: tokenB, body: { suspended: true } });
  check('admin suspends user', r.status === 200);
  r = await request('GET', '/api/items/my-posts', { token: tokenA });
  check('suspended user blocked 403', r.status === 403);
  await request('PUT', `/api/admin/users/${idA}/suspend`, { token: tokenB, body: { suspended: false } });
  check('unsuspend restores access', (await request('GET', '/api/items/my-posts', { token: tokenA })).status === 200);

  r = await request('DELETE', `/api/admin/items/${phoneId}`, { token: tokenB });
  check('admin deletes item', r.status === 200);
  r = await request('GET', `/api/items/${phoneId}`);
  check('deleted item gone 404', r.status === 404);

  /* ---------- Reports ---------- */
  r = await request('PUT', `/api/items/${lostWalletId}`, { token: tokenA, body: { description: 'Updated: has a blue stitch' } });
  check('owner can update item', r.status === 200 && r.data.item.description.includes('blue stitch'));
  r = await request('PUT', `/api/items/${lostWalletId}`, { token: eveToken, body: { description: 'hacked' } });
  check('non-owner update rejected 403', r.status === 403);

  /* ---------- Reports ---------- */
  r = await request('POST', '/api/reports', { token: tokenA, body: { reportedItemId: foundWalletId, reason: 'spam', description: 'duplicate listing' } });
  check('report created', r.status === 201, JSON.stringify(r.data));
  r = await request('PUT', `/api/admin/reports/${r.data.report._id}`, { token: tokenB, body: { status: 'resolved' } });
  check('admin resolves report', r.status === 200 && r.data.report.status === 'resolved');

  /* ---------- Cleanup ---------- */
  await mongoose.disconnect();
  await mongo.stop();
  server.close();
  console.log('\nAll smoke tests passed');
  process.exit(0);
};

run().catch(async (err) => {
  console.error('\nSmoke test FAILED:', err.message);
  try { await mongoose.disconnect(); await mongo?.stop(); server?.close(); } catch (_) { /* noop */ }
  process.exit(1);
});
