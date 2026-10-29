// Smoke/e2e test against a running server + seeded DB:  BASE=http://localhost:3000 node tests/e2e.mjs
const BASE = process.env.BASE ?? "http://localhost:3000";
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + extra}`); if (!ok) failed++; };

async function call(method, path, { token, json } = {}) {
  const res = await fetch(BASE + path, {
    method, headers: { ...(json && { "Content-Type": "application/json" }), ...(token && { Authorization: `Bearer ${token}` }) },
    body: json ? JSON.stringify(json) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null), res };
}
const login = async (email, password) => {
  const r = await call("POST", "/api/auth/login", { json: { email, password } });
  const cookie = r.res.headers.get("set-cookie") ?? "";
  return { ...r, token: /bl_session=([^;]+)/.exec(cookie)?.[1] };
};

// --- auth ---
check("unauthenticated -> 401", (await call("GET", "/api/tickets")).status === 401);
check("bad password -> 401", (await login("priya.sharma@email.com", "nope")).status === 401);
check("invalid email format -> 400", (await login("not-an-email", "x")).status === 400);
const priya = await login("priya.sharma@email.com", "Author@123");
const rohit = await login("rohit.kapoor@email.com", "Author@123");
const admin = await login("admin@bookleaf.in", "Admin@123");
check("author login ok", priya.status === 200 && priya.token);
check("admin login ok", admin.status === 200 && admin.token);
check("garbage token -> 401", (await call("GET", "/api/books", { token: "abc" })).status === 401);

// --- books ---
const books = await call("GET", "/api/books", { token: priya.token });
check("priya sees exactly her 2 books", books.body.data.length === 2 && books.body.data.every((b) => ["BK001", "BK002"].includes(b.id)));
const sneha = await login("sneha.kulkarni@email.com", "Author@123");
const sb = (await call("GET", "/api/books", { token: sneha.token })).body.data;
check("in-production book flagged unpublished, null MRP", sb.some((b) => b.id === "BK013" && !b.isPublished && b.mrp === null));
const ananya = await login("ananya.reddy@email.com", "Author@123");
const ab = (await call("GET", "/api/books", { token: ananya.token })).body.data[0];
check("zero-payout book: paid 0 / pending 2546", ab.royaltyPaid === 0 && ab.royaltyPending === 2546);
check("admin books needs authorId -> 400", (await call("GET", "/api/books", { token: admin.token })).status === 400);

// --- ticket create + validation ---
check("short subject/description -> 400 w/ details", (await call("POST", "/api/tickets", { token: priya.token, json: { subject: "x", description: "y" } })).body?.error?.details?.length >= 2);
check("other author's book -> 400", (await call("POST", "/api/tickets", { token: priya.token, json: { bookId: "BK003", subject: "Royalty question", description: "Where is my royalty for this book please?" } })).status === 400);
check("admin cannot create tickets -> 403", (await call("POST", "/api/tickets", { token: admin.token, json: { subject: "Hello there", description: "A description that is long enough." } })).status === 403);

const created = await call("POST", "/api/tickets", { token: ananya.token, json: {
  bookId: ab.id, subject: "No royalty received for 6 months",
  description: "I published Between Two Temples 6 months ago and I haven't received any royalty at all. This is really frustrating, please look into it.",
  } });
check("ticket created -> 201", created.status === 201, JSON.stringify(created.body));
const tid = created.body.data.id;
check("author view hides triage metadata", created.body.data.priority === undefined && created.body.data.category === undefined);

const general = await call("POST", "/api/tickets", { token: priya.token, json: { subject: "Update my author bio", description: "Can I update my author bio on Amazon? Thanks a lot." } });
check("general (no book) ticket ok", general.status === 201 && general.body.data.bookId === null);

// --- isolation ---
check("other author GET ticket -> 404", (await call("GET", `/api/tickets/${tid}`, { token: rohit.token })).status === 404);
check("malformed ticket id -> 404 not 500", (await call("GET", "/api/tickets/not-a-uuid", { token: admin.token })).status === 404);
check("author cannot PATCH -> 403", (await call("PATCH", `/api/tickets/${tid}`, { token: ananya.token, json: { status: "Closed" } })).status === 403);
check("author cannot use AI endpoint -> 403", (await call("POST", `/api/tickets/${tid}/ai/draft`, { token: ananya.token, json: {} })).status === 403);
const mine = await call("GET", "/api/tickets", { token: rohit.token });
check("rohit's list excludes others' tickets", mine.body.data.every((t) => t.id !== tid));

// --- admin queue ---
const q = await call("GET", "/api/tickets", { token: admin.token });
const mineT = q.body.data.find((t) => t.id === tid);
check("admin sees all with triage", mineT && mineT.category && mineT.priority && mineT.authorName === "Ananya Reddy");
console.log(`      triage -> ${mineT.category} / ${mineT.priority} [${mineT.categorySource}] "${mineT.aiRationale ?? ""}"`);
check("filter by category", (await call("GET", `/api/tickets?category=${encodeURIComponent("Royalty & Payments")}`, { token: admin.token })).body.data.every((t) => t.category === "Royalty & Payments"));
check("bad filter value -> 400", (await call("GET", "/api/tickets?status=Nope", { token: admin.token })).status === 400);
const urgent = (await call("GET", "/api/tickets?sort=urgency", { token: admin.token })).body.data;
const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const open_ = urgent.filter((t) => t.status === "Open" || t.status === "In Progress");
check("urgency sort: unresolved first, then by priority", urgent.slice(0, open_.length).every((t) => open_.includes(t)) && open_.every((t, i) => i === 0 || rank[open_[i - 1].priority] <= rank[t.priority]));

// --- attachments ---
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0000003010100c9fe92ef0000000049454e44ae426082", "hex");
async function upload(token, ticketId, bytes, name) {
  const fd = new FormData(); fd.append("file", new Blob([bytes]), name);
  const res = await fetch(`${BASE}/api/tickets/${ticketId}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const up = await upload(ananya.token, tid, PNG, "../../defect photo.png");
check("author uploads a PNG -> 201, name sanitised", up.status === 201 && up.body.data.mimeType === "image/png" && up.body.data.filename === "defect photo.png", JSON.stringify(up.body));
check("exe renamed to .png rejected -> 415", (await upload(ananya.token, tid, Buffer.from("MZ" + "x".repeat(40)), "virus.png")).status === 415);
check("oversized file -> 413", (await upload(ananya.token, tid, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), "big.png")).status === 413);
check("admin cannot upload -> 403", (await upload(admin.token, tid, PNG, "x.png")).status === 403);
check("other author cannot upload -> 404", (await upload(rohit.token, tid, PNG, "x.png")).status === 404);
const attId = up.body.data.id;
const dl = await fetch(`${BASE}/api/tickets/${tid}/attachments/${attId}`, { headers: { Authorization: `Bearer ${admin.token}` } });
const dlBytes = Buffer.from(await dl.arrayBuffer());
check("admin downloads identical bytes w/ safe headers", dl.status === 200 && dlBytes.equals(PNG) && dl.headers.get("x-content-type-options") === "nosniff" && dl.headers.get("content-type") === "image/png");
check("other author cannot download -> 404", (await fetch(`${BASE}/api/tickets/${tid}/attachments/${attId}`, { headers: { Authorization: `Bearer ${rohit.token}` } })).status === 404);
check("download needs auth -> 401", (await fetch(`${BASE}/api/tickets/${tid}/attachments/${attId}`)).status === 401);
const withAtt = (await call("GET", `/api/tickets/${tid}`, { token: admin.token })).body.data;
check("ticket detail lists attachment metadata (no bytes)", withAtt.attachments.length === 1 && withAtt.attachments[0].data === undefined);
for (let i = 0; i < 4; i++) await upload(ananya.token, tid, PNG, `p${i}.png`);
check("6th attachment -> 409", (await upload(ananya.token, tid, PNG, "p9.png")).status === 409);

// --- pagination + summary ---
const page1 = await call("GET", "/api/tickets?limit=1&offset=0&sort=oldest", { token: admin.token });
const page2 = await call("GET", "/api/tickets?limit=1&offset=1&sort=oldest", { token: admin.token });
check("pagination: meta.total + distinct pages", page1.body.meta.total >= 2 && page1.body.data.length === 1 && page2.body.data.length === 1 && page1.body.data.every((t) => !page2.body.data.some((u) => u.id === t.id)));
check("limit > 200 -> 400", (await call("GET", "/api/tickets?limit=500", { token: admin.token })).status === 400);
const sum = await call("GET", "/api/tickets/summary", { token: admin.token });
check("summary counts", sum.status === 200 && ["unresolved", "critical", "overdue", "unassigned"].every((k) => Number.isInteger(sum.body.data[k])), JSON.stringify(sum.body));
check("summary is admin-only -> 403", (await call("GET", "/api/tickets/summary", { token: ananya.token })).status === 403);

// --- login rate limiting ---
const victim = `ratelimit-${Date.now()}@email.com`;
let last;
for (let i = 0; i < 6; i++) last = await call("POST", "/api/auth/login", { json: { email: victim, password: "wrong" } });
check("6th failed login -> 429 TOO_MANY_ATTEMPTS", last.status === 429 && last.body.error.code === "TOO_MANY_ATTEMPTS", JSON.stringify(last.body));
check("lockout is per-email: real users unaffected", (await login("priya.sharma@email.com", "Author@123")).status === 200);

// --- AI degradation / draft ---
const d = await call("POST", `/api/tickets/${tid}/ai/draft`, { token: admin.token, json: {} });
check("draft endpoint returns 200", d.status === 200);
console.log(`      draft -> aiAvailable=${d.body.data.aiAvailable} reason=${d.body.data.reason ?? "-"} len=${d.body.data.draft?.length ?? 0}`);
if (d.body.data.aiAvailable) console.log("\n" + d.body.data.draft + "\n");

// --- lifecycle ---
const patched = await call("PATCH", `/api/tickets/${tid}`, { token: admin.token, json: { priority: "Critical", category: "Royalty & Payments", assignedTo: "me" } });
check("admin override + assign", patched.body.data.priority === "Critical" && patched.body.data.prioritySource === "admin" && patched.body.data.assignedToName === "Ops Admin");
check("empty patch -> 400", (await call("PATCH", `/api/tickets/${tid}`, { token: admin.token, json: {} })).status === 400);
await call("POST", `/api/tickets/${tid}/notes`, { token: admin.token, json: { body: "INTERNAL: check bank details with finance" } });
const reply = await call("POST", `/api/tickets/${tid}/messages`, { token: admin.token, json: { body: "Hi Ananya, we're looking into this and will update you within 48 hours." } });
check("admin reply moves Open -> In Progress", reply.body.data.status === "In Progress");
const av = await call("GET", `/api/tickets/${tid}`, { token: ananya.token });
check("author sees admin reply", av.body.data.messages.some((m) => m.senderRole === "admin"));
check("author never sees internal note", !JSON.stringify(av.body).includes("INTERNAL") && av.body.data.messages.every((m) => !m.isInternal));
const al = await call("GET", "/api/tickets?include=messages", { token: ananya.token });
check("author list w/ messages hides internal", !JSON.stringify(al.body).includes("INTERNAL"));
await call("PATCH", `/api/tickets/${tid}`, { token: admin.token, json: { status: "Resolved" } });
const reopen = await call("POST", `/api/tickets/${tid}/messages`, { token: ananya.token, json: { body: "Still nothing, please check again." } });
check("author reply reopens Resolved ticket", reopen.body.data.status === "Open");
await call("PATCH", `/api/tickets/${tid}`, { token: admin.token, json: { status: "Closed" } });
check("author cannot reply to Closed -> 409", (await call("POST", `/api/tickets/${tid}/messages`, { token: ananya.token, json: { body: "hello?" } })).status === 409);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
