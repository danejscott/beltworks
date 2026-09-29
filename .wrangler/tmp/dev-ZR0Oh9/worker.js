var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// server/relay.ts
var PROTO = 2;
var PLAYER_COLS = ["#e8543f", "#3a7bd5", "#2fb86b", "#f2c12e", "#9b59d6", "#1fb5b5", "#ff7fb0", "#8d6e4f", "#e67e22", "#d0d4dc", "#6a8f2f", "#2c3e8f"];
var PER = 6;
var STEP_MS = 100;
var SNAP_EVERY = 12e4;
var CHUNK = 1e6;
var WorldRelay = class {
  constructor(store, log_ = (..._a) => {
  }) {
    this.store = store;
    this.log_ = log_;
  }
  store;
  log_;
  static {
    __name(this, "WorldRelay");
  }
  meta = null;
  players = /* @__PURE__ */ new Map();
  tick = 0;
  base = null;
  log = [];
  queue = [];
  conns = /* @__PURE__ */ new Map();
  hashes = /* @__PURE__ */ new Map();
  // tick -> conn -> hash
  invites = /* @__PURE__ */ new Map();
  loaded = false;
  timer = null;
  lastSnapReq = 0;
  snapWaiters = [];
  snapPending = false;
  dirty = false;
  lastSave = 0;
  // ---------------------------------------------------------------------------
  async load() {
    if (this.loaded) return;
    this.loaded = true;
    this.meta = await this.store.get("meta") || null;
    if (!this.meta) return;
    const st = await this.store.get("state") || {};
    this.tick = st.tick || 0;
    this.log = st.log || [];
    for (const p of st.players || []) this.players.set(p.id, p);
    const bm = await this.store.get("base");
    if (bm) {
      const parts = [];
      for (let i = 0; i < bm.chunks; i++) parts.push(new Uint8Array(await this.store.get("base" + i)));
      const data = new Uint8Array(bm.size);
      let o = 0;
      for (const p of parts) {
        data.set(p, o);
        o += p.length;
      }
      this.base = { tick: bm.tick, data };
    }
  }
  async create(m) {
    this.meta = { ...m, seed: Math.random() * 1e9 | 0, created: Date.now() };
    this.loaded = true;
    await this.store.put("meta", this.meta);
    await this.persist(true);
  }
  async persist(force = false) {
    if (!this.meta || !this.dirty && !force) return;
    this.dirty = false;
    this.lastSave = Date.now();
    await this.store.put("state", { tick: this.tick, log: this.log, players: [...this.players.values()] });
  }
  async saveBase() {
    if (!this.base) return;
    const d = this.base.data, n = Math.ceil(d.length / CHUNK);
    for (let i = 0; i < n; i++) await this.store.put("base" + i, d.slice(i * CHUNK, (i + 1) * CHUNK));
    await this.store.put("base", { tick: this.base.tick, size: d.length, chunks: n });
  }
  // ---------------------------------------------------------------------------
  /** a player connects: who are they, and do they get a new base? */
  async join(c, hello) {
    await this.load();
    if (!this.meta) {
      c.send(JSON.stringify({ t: "err", msg: "No world has that code. Check it with whoever shared it." }));
      c.close();
      return;
    }
    const key = String(hello.key || "").slice(0, 64);
    const name = String(hello.name || "").trim().slice(0, 24) || "Player";
    let p = [...this.players.values()].find((q) => q.key === key);
    let isNew = false;
    if (!p) {
      const id = Math.max(0, ...this.players.keys()) + 1;
      const team = Math.max(0, ...[...this.players.values()].map((q) => q.team)) + 1;
      const used = new Set([...this.players.values()].map((q) => q.col.toLowerCase()));
      const want = /^#[0-9a-f]{6}$/i.test(hello.col || "") ? String(hello.col).toLowerCase() : "";
      const col = want && !used.has(want) ? want : PLAYER_COLS.find((q) => !used.has(q.toLowerCase())) || PLAYER_COLS[id % PLAYER_COLS.length];
      p = { id, name, col, team, key };
      this.players.set(id, p);
      isNew = true;
    } else p.name = name;
    this.conns.set(c.id, { c, pid: p.id, at: Date.now(), budget: 60, last: Date.now() });
    c.send(JSON.stringify({ t: "welcome", code: this.meta.code, pid: p.id, meta: this.meta, baseTick: this.base ? this.base.tick : 0, hasBase: !!this.base, log: this.log, tick: this.tick }));
    if (this.base) c.send(this.base.data);
    this.queue.push([0, 0, { k: "_join", pid: p.id, team: p.team, name: p.name, col: p.col, isNew }]);
    this.queuePresence();
    this.dirty = true;
    this.start();
    this.broadcastPlayers();
    this.log_("join", this.meta.code, name, isNew ? "(new)" : "", `${this.conns.size} here`);
  }
  leave(connId) {
    const k = this.conns.get(connId);
    if (!k) return;
    this.conns.delete(connId);
    this.queuePresence();
    this.broadcastPlayers();
    if (!this.conns.size) this.stop();
  }
  onlinePids() {
    return new Set([...this.conns.values()].map((k) => k.pid));
  }
  queuePresence() {
    const on = this.onlinePids();
    const teams = new Set([...this.players.values()].map((p) => p.team));
    const paused = [0, ...[...teams].filter((t) => ![...this.players.values()].some((p) => p.team === t && on.has(p.id)))];
    this.queue.push([0, 0, { k: "_presence", paused, online: [...on] }]);
  }
  broadcastPlayers() {
    const on = this.onlinePids();
    this.broadcast({ t: "players", list: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, col: p.col, online: on.has(p.id) })) });
  }
  broadcast(m) {
    const s = JSON.stringify(m);
    for (const k of this.conns.values()) k.c.send(s);
  }
  sendTo(pid, m) {
    const s = JSON.stringify(m);
    for (const k of this.conns.values()) if (k.pid === pid) k.c.send(s);
  }
  /** the player whose copy we trust for saves: the one connected longest */
  provider() {
    let best = null;
    for (const [id, k] of this.conns) if (!best || k.at < best.at) best = { id, at: k.at };
    return best ? best.id : 0;
  }
  // ---------------------------------------------------------------------------
  onMessage(connId, raw) {
    const k = this.conns.get(connId);
    if (!k) return;
    if (typeof raw !== "string") {
      this.onSnapshot(connId, raw);
      return;
    }
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const p = this.players.get(k.pid);
    switch (m.t) {
      case "cmd": {
        const now = Date.now();
        k.budget = Math.min(60, k.budget + (now - k.last) * 0.03);
        k.last = now;
        if (k.budget < 1 || !m.c || typeof m.c.k !== "string" || m.c.k[0] === "_") return;
        k.budget--;
        this.queue.push([p.id, p.team, m.c]);
        return;
      }
      case "hash":
        this.onHash(connId, +m.tick, +m.h);
        return;
      case "chat":
        this.broadcast({ t: "chat", from: p.name, col: p.col, text: String(m.text || "").slice(0, 200) });
        return;
      case "ping":
        k.c.send(JSON.stringify({ t: "pong", at: m.at }));
        return;
      case "resync":
        this.requestSnap(connId);
        return;
      case "team": {
        if (m.op === "invite") {
          const q = this.players.get(+m.pid);
          if (!q || q.team === p.team || !this.onlinePids().has(q.id)) return;
          this.invites.set(q.id, { team: p.team, at: Date.now() });
          this.sendTo(q.id, { t: "invite", from: p.name, team: p.team, col: p.col });
        } else if (m.op === "accept") {
          const inv = this.invites.get(p.id);
          if (!inv || inv.team !== +m.team || Date.now() - inv.at > 12e4) {
            k.c.send(JSON.stringify({ t: "err-soft", msg: "That invitation has expired" }));
            return;
          }
          this.invites.delete(p.id);
          const to = this.players.get([...this.players.values()].find((q) => q.team === inv.team)?.id || 0);
          if (!to) return;
          p.team = inv.team;
          p.col = to.col;
          this.queue.push([0, 0, { k: "_team", pid: p.id, to: inv.team }]);
          this.queuePresence();
          this.broadcastPlayers();
          this.dirty = true;
        } else if (m.op === "leave") {
          if (![...this.players.values()].some((q) => q.id !== p.id && q.team === p.team)) return;
          const team = Math.max(0, ...[...this.players.values()].map((q) => q.team)) + 1;
          p.team = team;
          const used = new Set([...this.players.values()].filter((q) => q.id !== p.id).map((q) => q.col.toLowerCase()));
          p.col = PLAYER_COLS.find((q) => !used.has(q.toLowerCase())) || p.col;
          this.queue.push([0, 0, { k: "_leave", pid: p.id, team, col: p.col }]);
          this.queuePresence();
          this.broadcastPlayers();
          this.dirty = true;
        }
        return;
      }
    }
  }
  // ---------------------------------------------------------------------------
  // the clock
  start() {
    if (this.timer) return;
    let last = Date.now(), acc = 0;
    this.timer = setInterval(() => {
      const now = Date.now();
      acc += now - last;
      last = now;
      if (acc > 1e3) acc = 1e3;
      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        this.step();
      }
      if (now - this.lastSnapReq > SNAP_EVERY) this.requestSnap(0);
      if (now - this.lastSave > 1e4) this.persist();
    }, 25);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.persist(true);
  }
  step() {
    const out = [];
    for (const [pid, team, c] of this.queue.splice(0)) out.push([this.tick, pid, team, c]);
    this.tick += PER;
    if (out.length) {
      this.log.push(...out);
      this.dirty = true;
    }
    this.broadcast({ t: "tick", n: this.tick, cmds: out });
    if (this.log.length > 2e5) this.log.splice(0, this.log.length - 2e5);
  }
  // ---------------------------------------------------------------------------
  // saves from players
  requestSnap(forConn) {
    if (forConn) this.snapWaiters.push(forConn);
    const prov = this.provider();
    if (!prov || this.snapPending && Date.now() - this.lastSnapReq < 2e4) return;
    this.snapPending = true;
    this.lastSnapReq = Date.now();
    this.conns.get(prov).c.send(JSON.stringify({ t: "snapreq" }));
  }
  async onSnapshot(connId, buf) {
    if (buf.length < 8) return;
    const tick = new DataView(buf.buffer, buf.byteOffset, 8).getFloat64(0, true);
    if (!(tick >= 0) || tick > this.tick || this.base && tick < this.base.tick) return;
    this.snapPending = false;
    this.base = { tick, data: buf.slice(8) };
    this.log = this.log.filter((e) => e[0] >= tick);
    this.dirty = true;
    await this.saveBase();
    await this.persist(true);
    for (const id of this.snapWaiters.splice(0)) {
      const k = this.conns.get(id);
      if (!k || id === connId) continue;
      k.c.send(JSON.stringify({ t: "reload", baseTick: tick, log: this.log, tick: this.tick }));
      k.c.send(this.base.data);
    }
  }
  /** fingerprints: the majority is right; anyone else reloads */
  onHash(connId, tick, h) {
    let m = this.hashes.get(tick);
    if (!m) {
      this.hashes.set(tick, m = /* @__PURE__ */ new Map());
      for (const t of this.hashes.keys()) if (t < tick - 3e3) this.hashes.delete(t);
    }
    m.set(connId, h);
    if (m.size < Math.min(2, this.conns.size)) return;
    const count = /* @__PURE__ */ new Map();
    for (const v of m.values()) count.set(v, (count.get(v) || 0) + 1);
    const prov = this.provider();
    let good = m.get(prov) ?? [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top[1] > (count.get(good) || 0)) good = top[0];
    for (const [id, v] of m) if (v !== good) {
      this.log_("drift", id, tick);
      this.requestSnap(id);
    }
  }
};

// src/codes.ts
var CODE_ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode(rand = Math.random) {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ABC[Math.floor(rand() * CODE_ABC.length)];
  return s;
}
__name(newCode, "newCode");
function normCode(s) {
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 8 && [...c].every((ch) => CODE_ABC.includes(ch)) ? c : "";
}
__name(normCode, "normCode");

// server/worker.ts
var SIZES = /* @__PURE__ */ new Set([512, 1024, 2304, 4608]);
var worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Beltworks relay is running.", { headers: { "access-control-allow-origin": "*" } });
    let code = normCode(url.searchParams.get("code") || "");
    const create = url.searchParams.get("create") === "1";
    if (create) code = newCode();
    if (!code) return new Response("bad code", { status: 400 });
    const stub = env.WORLD.get(env.WORLD.idFromName(code));
    const fwd = new Request(req.url, req);
    fwd.headers.set("x-bw-code", code);
    fwd.headers.set("x-bw-create", create ? "1" : "0");
    return stub.fetch(fwd);
  }
};
var World = class {
  constructor(state, _env) {
    this.state = state;
    const st = state.storage;
    const store = { get: /* @__PURE__ */ __name((k) => st.get(k), "get"), put: /* @__PURE__ */ __name((k, v) => st.put(k, v), "put"), del: /* @__PURE__ */ __name(async (k) => {
      await st.delete(k);
    }, "del") };
    this.relay = new WorldRelay(store, (...a) => console.log(...a));
  }
  state;
  static {
    __name(this, "World");
  }
  relay;
  nextConn = 1;
  async fetch(req) {
    const code = req.headers.get("x-bw-code"), create = req.headers.get("x-bw-create") === "1";
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const id = this.nextConn++;
    const conn = { id, send: /* @__PURE__ */ __name((m) => {
      try {
        server.send(m);
      } catch {
      }
    }, "send"), close: /* @__PURE__ */ __name(() => {
      try {
        server.close(1e3, "bye");
      } catch {
      }
    }, "close") };
    let joined = false;
    const err = /* @__PURE__ */ __name((msg) => {
      conn.send(JSON.stringify({ t: "err", msg }));
      conn.close();
    }, "err");
    server.addEventListener("message", async (ev) => {
      const data = ev.data;
      if (joined) {
        this.relay.onMessage(id, typeof data === "string" ? data : new Uint8Array(data));
        return;
      }
      if (typeof data !== "string") return;
      let m;
      try {
        m = JSON.parse(data);
      } catch {
        return;
      }
      if (m.t !== "hello") return;
      if (m.v !== PROTO) return err("Your game is a different version from this server \u2014 reload the page to update.");
      if (String(m.key || "").length < 16) return err("Missing player key");
      await this.relay.load();
      if (create) {
        if (this.relay.meta) return err("Please try again");
        const o = m.create || {};
        await this.relay.create({ code, name: String(o.name || "Online World").slice(0, 40), size: SIZES.has(+o.size) ? +o.size : 1024, mode: ["easy", "normal", "hard", "creative"].includes(o.mode) ? o.mode : "normal", dayNight: o.dayNight !== false });
      } else if (!this.relay.meta) return err("No world has that code. Check it with whoever shared it.");
      joined = true;
      await this.relay.join(conn, m);
    });
    const bye = /* @__PURE__ */ __name(() => {
      if (joined) this.relay.leave(id);
    }, "bye");
    server.addEventListener("close", bye);
    server.addEventListener("error", bye);
    return new Response(null, { status: 101, webSocket: client });
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-5Q2FcV/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-5Q2FcV/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  World,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
