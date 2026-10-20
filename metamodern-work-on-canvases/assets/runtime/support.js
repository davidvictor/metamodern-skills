/*
 * Canvas board runtime (board language 1, canvas-runtime 0.0.2). Written from scratch, no framework.
 *
 * Every board loads this file first as ./support.js. It takes over the rest of the document so the
 * board source is read inert, loads the head in order (kits through ds/<ns>/, with React 18.3.1
 * supplied only for legacy kits), runs the board's DCLogic, expands the markup (<x-import>,
 * <dc-import>, <sc-for>, <sc-if>, {{values}}) and mounts kit components through the kit's
 * mount(el, name, props). It speaks the board side of the viewer messages (canvas:ready,
 * canvas:set-props, canvas:props-changed, canvas:motion); other message types go to handlers
 * registered on window.__canvasRuntime.on(type, handler).
 */
(function () {
  'use strict';
  if (window.__canvasRuntime) return;

  var VERSION = '0.0.2';
  var SVG = 'http://www.w3.org/2000/svg';
  var XLINK = 'http://www.w3.org/1999/xlink';
  var XML = 'http://www.w3.org/XML/1998/namespace';
  var self = document.currentScript;
  var runtimeUrl = self && self.src ? self.src : location.href;
  var boardFile = decodeURIComponent(location.pathname.split('/').pop() || '');
  var boardId = boardFile.replace(/\.dc\.html$/, '');
  var params = new URLSearchParams(location.search);

  // ---------------------------------------------------------------- the motion clock
  // canvas:motion scales the board's JavaScript clock as well as its Web Animations. performance.now(),
  // requestAnimationFrame timestamps and timers with a delay (setTimeout, setInterval) run at the motion rate
  // (0 freezes them) and stay continuous when the rate changes, so spring, frame and timer-driven motion slows
  // and pauses with CSS motion. Timers with no delay stay immediate, and Date.now() stays real. Installed
  // before any kit script runs, so a library that keeps a reference to one of these functions gets this one.
  var clock = (function () {
    var perf = window.performance;
    var realNow = perf && perf.now ? perf.now.bind(perf) : function () { return Date.now(); };
    var realRaf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
    var realSetTimeout = window.setTimeout.bind(window);
    var realClearTimeout = window.clearTimeout.bind(window);
    var realClearInterval = window.clearInterval.bind(window);
    var rate = 1;
    var from = realNow();
    var base = from;
    var last = from;
    function at(real) {
      var virtual = base + (real - from) * rate;
      if (virtual < last) virtual = last;
      last = virtual;
      return virtual;
    }
    function now() { return at(realNow()); }
    try { if (perf) perf.now = function now$() { return now(); }; } catch (error) { /* a read-only performance object */ }
    // Every callback of one frame gets the same timestamp, as in the browser.
    var frameReal = null;
    var frameVirtual = 0;
    function frameAt(timestamp) {
      if (timestamp !== frameReal) {
        frameReal = timestamp;
        frameVirtual = Math.max(base, base + (timestamp - from) * rate);
      }
      return frameVirtual;
    }
    if (realRaf) {
      window.requestAnimationFrame = function requestAnimationFrame(callback) {
        return realRaf(function (timestamp) { callback(frameAt(timestamp)); });
      };
    }

    // Timers with a delay wait in board time. Their ids start far above the browser's own.
    var timers = {};
    var nextId = 1000000000;
    function schedule(timer) {
      if (timer.handle != null) realClearTimeout(timer.handle);
      timer.handle = null;
      if (rate === 0) return;
      timer.handle = realSetTimeout(function () { fire(timer); }, Math.max(0, Math.ceil((timer.due - now()) / rate)));
    }
    function fire(timer) {
      timer.handle = null;
      var current = now();
      // Never early: the browser may round a delay down.
      if (current < timer.due) { schedule(timer); return; }
      if (timer.interval != null) {
        timer.due += timer.interval;
        // Missed beats (a throttled frame) are skipped, as browsers do, rather than caught up.
        if (timer.due <= current) timer.due = current + timer.interval - ((current - timer.due) % timer.interval);
        schedule(timer);
      } else {
        delete timers[timer.id];
      }
      timer.fn.apply(window, timer.args);
    }
    function add(fn, delay, args, repeat) {
      var ms = Number(delay) || 0;
      if (typeof fn !== 'function' || !(ms > 0)) return null;
      var timer = { id: nextId++, fn: fn, args: args, due: now() + ms, interval: repeat ? ms : null, handle: null };
      timers[timer.id] = timer;
      schedule(timer);
      return timer.id;
    }
    function clear(id) {
      var timer = timers[id];
      if (!timer) return false;
      if (timer.handle != null) realClearTimeout(timer.handle);
      delete timers[id];
      return true;
    }
    var realSetInterval = window.setInterval.bind(window);
    window.setTimeout = function setTimeout(fn, delay) {
      var id = add(fn, delay, Array.prototype.slice.call(arguments, 2), false);
      return id != null ? id : realSetTimeout.apply(window, arguments);
    };
    window.setInterval = function setInterval(fn, delay) {
      var id = add(fn, delay, Array.prototype.slice.call(arguments, 2), true);
      return id != null ? id : realSetInterval.apply(window, arguments);
    };
    window.clearTimeout = function clearTimeout(id) { if (!clear(id)) realClearTimeout(id); };
    window.clearInterval = function clearInterval(id) { if (!clear(id)) realClearInterval(id); };

    return {
      now: now,
      // Back to the browser's clock (a replay draws the board afresh, so nothing in it can see the jump).
      resync: function () {
        var real = realNow();
        base = real;
        from = real;
        last = Math.min(last, real);
        frameReal = null;
        Object.keys(timers).forEach(function (id) { schedule(timers[id]); });
      },
      setRate: function (next) {
        var real = realNow();
        base = at(real);
        from = real;
        rate = next;
        Object.keys(timers).forEach(function (id) { schedule(timers[id]); });
      },
    };
  })();

  var handlers = {};
  var readyResolve;
  var runtime = (window.__canvasRuntime = {
    version: VERSION,
    language: 1,
    board: boardId,
    ready: new Promise(function (resolve) { readyResolve = resolve; }),
    on: function (type, handler) { (handlers[type] = handlers[type] || []).push(handler); },
    post: post,
    props: {},
    schema: {},
    kit: null,
    kits: {},
    motion: { rate: 1 },
    clock: clock,
    render: function () { scheduleRender(); },
  });

  function post(type, payload) {
    if (window.parent === window) return;
    var message = { type: type, board: boardId };
    if (payload) Object.keys(payload).forEach(function (key) { message[key] = payload[key]; });
    window.parent.postMessage(message, location.origin);
  }

  function fail(message, error) {
    console.error('[canvas] ' + message + (error && error.message ? ': ' + error.message : ''));
  }

  // ---------------------------------------------------------------- taking over the document

  var takeover = document.readyState === 'loading' && self && !self.async && !self.defer;
  if (takeover) document.write('<plaintext id="__canvas_source" style="display:none">');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);

  function sourceDocument() {
    var holder = document.getElementById("__canvas_source");
    runtime.source = holder ? "takeover" : "live";
    if (holder) {
      var rest = holder.textContent;
      holder.parentNode.removeChild(holder);
      return new DOMParser().parseFromString('<!doctype html><html><head>' + rest, 'text/html');
    }
    // Loaded late (for example injected by a test page): read the live document instead.
    var copy = document.implementation.createHTMLDocument('');
    copy.documentElement.innerHTML = document.documentElement.innerHTML;
    // The copy is drawn afresh, so the live body keeps only its scripts.
    Array.prototype.slice.call(document.body.childNodes).forEach(function (n) {
      if (!(n.nodeType === 1 && n.localName === 'script')) n.parentNode.removeChild(n);
    });
    Array.prototype.forEach.call(copy.head.querySelectorAll('script[src],link[rel~="stylesheet"]'), function (n) { n.remove(); });
    return copy;
  }

  // ---------------------------------------------------------------- loading head content in order

  var kitPrep = {};
  var legacyReady = null;

  var loaded = {};
  function load(tag, attrs) {
    var url = new URL(attrs.src || attrs.href, location.href).href;
    if (loaded[url]) return loaded[url];
    return (loaded[url] = new Promise(function (resolve) {
      var el = document.createElement(tag);
      Object.keys(attrs).forEach(function (name) { el.setAttribute(name, attrs[name]); });
      if (tag === 'script') el.async = false;
      el.onload = function () { resolve(true); };
      el.onerror = function () { fail('could not load ' + (attrs.src || attrs.href)); resolve(false); };
      document.head.appendChild(el);
    }));
  }

  function supportFile(name) { return new URL('support/' + name, runtimeUrl).href; }

  function ensureLegacyReact() {
    if (!legacyReady) {
      legacyReady = Promise.resolve()
        .then(function () { return window.React ? true : load('script', { src: supportFile('react-18.3.1.production.min.js') }); })
        .then(function () { return window.ReactDOM ? true : load('script', { src: supportFile('react-dom-18.3.1.production.min.js') }); })
        .then(function () { return window.CanvasReactMarkup ? true : load('script', { src: supportFile('react-markup.js') }); });
    }
    return legacyReady;
  }

  function kitFolder(ref) {
    var m = /^(?:\.\/)?ds\/([^/]+)\//.exec(ref || '');
    return m ? m[1] : null;
  }

  /** Reads ds/<folder>/kit.json once. A legacy kit (no kit.json in its folder) answers with schema canvas-kit/legacy. */
  function prepareKit(folder) {
    if (!kitPrep[folder]) {
      kitPrep[folder] = fetch('ds/' + folder + '/kit.json', { cache: 'no-store' })
        .then(function (response) { return response.ok ? response.json() : null; })
        .catch(function () { return null; })
        .then(function (manifest) {
          var info = { folder: folder, manifest: manifest, legacy: !manifest || manifest.schema !== 'canvas-kit/1' };
          runtime.kits[folder] = info;
          if (!runtime.kit) runtime.kit = info;
          return info.legacy ? ensureLegacyReact().then(function () { return info; }) : info;
        });
    }
    return kitPrep[folder];
  }

  function copyAttributes(node) {
    var attrs = {};
    Array.prototype.forEach.call(node.attributes, function (a) { attrs[a.name] = a.value; });
    return attrs;
  }

  function runInline(code, type) {
    var el = document.createElement('script');
    if (type) el.type = type;
    el.textContent = code;
    document.head.appendChild(el);
  }

  function processHeadNode(node) {
    var tag = node.localName;
    if (tag === 'script') {
      var type = (node.getAttribute('type') || '').trim().toLowerCase();
      if (type && type !== 'text/javascript' && type !== 'application/javascript' && type !== 'module') return Promise.resolve();
      var src = node.getAttribute('src');
      if (!src) { runInline(node.textContent, type); return Promise.resolve(); }
      if (/(^|\/)support\.js$/.test(src.split('?')[0])) return Promise.resolve();
      var folder = kitFolder(src);
      var before = folder ? prepareKit(folder) : Promise.resolve();
      return before.then(function () { return load('script', copyAttributes(node)); });
    }
    if (tag === 'link' && /\bstylesheet\b/i.test(node.getAttribute('rel') || '')) {
      var href = node.getAttribute('href');
      var kit = kitFolder(href);
      if (kit) prepareKit(kit);
      var attrs = copyAttributes(node);
      // A kit stylesheet carries the board's kit choice, so what it loads (fonts, images) comes from the same kit.
      var choice = params.get('canvas-kit');
      if (kit && choice && attrs.href) {
        try {
          var sheet = new URL(attrs.href, location.href);
          if (!sheet.searchParams.has('canvas-kit')) { sheet.searchParams.set('canvas-kit', choice); attrs.href = sheet.href; }
        } catch (error) { /* keep the link as written */ }
      }
      return load('link', attrs);
    }
    if (tag === 'title') { document.title = node.textContent; return Promise.resolve(); }
    if (tag === 'meta' && node.getAttribute('charset')) return Promise.resolve();
    document.head.appendChild(document.importNode(node, true));
    return Promise.resolve();
  }

  function processSequence(nodes) {
    return nodes.reduce(function (chain, node) {
      return chain.then(function () { return processHeadNode(node); });
    }, Promise.resolve());
  }

  // ---------------------------------------------------------------- board logic

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (partial, callback) {
    var next = typeof partial === 'function' ? partial(this.state, this.props) : partial;
    if (next != null) this.state = Object.assign({}, this.state, next);
    if (typeof callback === 'function') afterCommit.push(callback.bind(this));
    scheduleRender();
  };
  DCLogic.prototype.forceUpdate = function (callback) {
    if (typeof callback === 'function') afterCommit.push(callback.bind(this));
    scheduleRender();
  };
  DCLogic.prototype.renderVals = function () { return {}; };
  window.DCLogic = window.DCLogic || DCLogic;

  function compileLogic(code, label) {
    try {
      var factory = new Function('DCLogic', '"use strict";\n' + code + '\n;return typeof Component === "undefined" ? undefined : Component;');
      var Component = factory(DCLogic);
      if (typeof Component !== 'function') throw new Error('no class Component');
      return Component;
    } catch (error) {
      fail('board logic in ' + label + ' did not compile', error);
      return DCLogic;
    }
  }

  function readProps(script) {
    if (!script) return {};
    try { return JSON.parse(script.getAttribute('data-props') || '{}') || {}; }
    catch (error) { fail('data-props is not JSON', error); return {}; }
  }

  function defaults(schema) {
    var out = {};
    Object.keys(schema).forEach(function (key) {
      var spec = schema[key];
      if (key.charAt(0) !== '$' && spec && typeof spec === 'object' && 'default' in spec) out[key] = spec['default'];
    });
    return out;
  }

  function coerce(spec, value) {
    if (!spec || typeof spec !== 'object' || typeof value !== 'string') return value;
    var editor = spec.editor;
    if (editor === 'boolean') return value === '' || value === 'true' ? true : value === 'false' ? false : Boolean(value);
    if (editor === 'int' || editor === 'number' || editor === 'float') {
      var n = Number(value);
      return value.trim() !== '' && isFinite(n) ? n : value;
    }
    return value;
  }

  // A board: its template (the <x-dc> element), its props schema and its logic class.
  function Board(doc, label) {
    var dc = doc.querySelector('x-dc');
    this.label = label;
    this.template = dc;
    this.script = doc.querySelector('script[data-dc-script]');
    this.schema = readProps(this.script);
    this.Logic = compileLogic(this.script ? this.script.textContent : '', label);
    this.helmet = dc ? Array.prototype.filter.call(dc.children, function (n) { return n.localName === 'helmet'; }) : [];
  }

  var imported = {};
  var importedBoards = {};
  function importBoard(name, chain) {
    chain = chain || [];
    if (!imported[name]) {
      imported[name] = fetch(encodeURIComponent(name) + '.dc.html', { cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.text();
        })
        .then(function (source) {
          var doc = new DOMParser().parseFromString(source, 'text/html');
          var board = new Board(doc, name + '.dc.html');
          var helmetNodes = [];
          board.helmet.forEach(function (h) { helmetNodes = helmetNodes.concat(Array.prototype.slice.call(h.childNodes)); });
          var head = Array.prototype.filter.call(doc.head.children, function (n) { return n.localName !== 'title'; });
          return processSequence(head.concat(helmetNodes.filter(function (n) { return n.nodeType === 1; })))
            .then(function () { return preloadImports(board.template, chain.concat(name)); })
            .then(function () { importedBoards[name] = board; return board; });
        })
        .catch(function (error) { fail('could not import ' + name, error); importedBoards[name] = null; return null; });
    }
    return imported[name];
  }

  // Loads every board a template imports; a board already being loaded further up the chain is not waited for,
  // so a cycle cannot stall the start.
  function preloadImports(template, chain) {
    if (!template) return Promise.resolve();
    chain = chain || [];
    var names = {};
    Array.prototype.forEach.call(template.querySelectorAll('dc-import'), function (n) {
      var name = n.getAttribute('name');
      if (name && name.indexOf('{{') < 0 && chain.indexOf(name) < 0) names[name] = true;
    });
    return Promise.all(Object.keys(names).map(function (name) { return importBoard(name, chain); }));
  }

  // ---------------------------------------------------------------- values

  var HOLE = /\{\{\s*([^{}]*?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^{}]*?)\s*\}\}\s*$/;

  function evaluate(expr, scope) {
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (expr === 'undefined' || expr === '') return undefined;
    if (/^-?\d+(?:\.\d+)?$/.test(expr)) return Number(expr);
    var quoted = /^(['"])(.*)\1$/.exec(expr);
    if (quoted) return quoted[2];
    var value = scope;
    var parts = expr.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (value == null) return undefined;
      value = value[parts[i].trim()];
    }
    return value;
  }

  function value(raw, scope) {
    if (raw == null) return raw;
    var whole = WHOLE.exec(raw);
    if (whole) return evaluate(whole[1], scope);
    if (raw.indexOf('{{') < 0) return raw;
    return raw.replace(HOLE, function (_, expr) {
      var found = evaluate(expr, scope);
      return found == null || typeof found === 'boolean' ? '' : String(found);
    });
  }

  // JSX whitespace: lines are trimmed where they meet a line break, and a whitespace-only run with a line break is dropped.
  function cleanText(text) {
    var lines = text.split(/\r\n|\n|\r/);
    if (lines.length === 1) return text;
    var last = 0;
    lines.forEach(function (line, i) { if (/[^ \t]/.test(line)) last = i; });
    var out = '';
    lines.forEach(function (line, i) {
      var t = line.replace(/\t/g, ' ');
      if (i !== 0) t = t.replace(/^[ ]+/, '');
      if (i !== lines.length - 1) t = t.replace(/[ ]+$/, '');
      if (t) { if (i !== last) t += ' '; out += t; }
    });
    return out;
  }

  // ---------------------------------------------------------------- expanding markup into nodes

  var instances = {};
  var seen = {};
  var mounted = [];

  function camel(name) { return name.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }

  function componentPropName(name) {
    if (name === 'class') return 'className';
    if (name === 'for') return 'htmlFor';
    if (/^(aria|data)-/.test(name)) return name;
    return camel(name);
  }

  function expandChildren(parent, scope, path) {
    var out = [];
    var nodes = parent.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      var result = expand(nodes[i], scope, path + '.' + i);
      if (result == null) continue;
      if (Array.isArray(result)) { for (var j = 0; j < result.length; j++) out.push(result[j]); }
      else out.push(result);
    }
    return out;
  }

  function expand(node, scope, path) {
    if (node.nodeType === 3) {
      var raw = cleanText(node.nodeValue);
      if (!raw) return null;
      var v = value(raw, scope);
      if (v == null || typeof v === 'boolean') return null;
      return typeof v === 'object' ? String(v) : v;
    }
    if (node.nodeType !== 1) return null;
    var tag = node.localName;
    if (tag === 'helmet' || tag === 'script') return null;
    if (tag === 'sc-if') return value(node.getAttribute('value'), scope) ? expandChildren(node, scope, path) : null;
    if (tag === 'sc-for') {
      var list = value(node.getAttribute('list'), scope);
      var as = node.getAttribute('as') || 'item';
      if (list == null) return null;
      var items = Array.isArray(list) ? list : typeof list === 'object' ? Object.keys(list).map(function (k) { return list[k]; }) : [];
      var out = [];
      items.forEach(function (item, index) {
        var inner = Object.create(scope);
        inner[as] = item;
        inner.$index = index;
        out = out.concat(expandChildren(node, inner, path + '[' + index + ']'));
      });
      return out;
    }
    if (tag === 'dc-import') return expandImport(node, scope, path);
    if (tag === 'x-import') {
      var name = value(node.getAttribute('component-from-global-scope') || '', scope);
      var props = {};
      var style = null;
      Array.prototype.forEach.call(node.attributes, function (a) {
        if (a.name === 'component-from-global-scope' || a.name.indexOf('hint-') === 0) return;
        var v = a.value === '' ? true : value(a.value, scope);
        if (a.name === 'style') { style = v == null || v === true ? null : String(v); return; }
        props[componentPropName(a.name)] = v;
      });
      var kids = trimEdges(expandChildren(node, scope, path));
      if (kids.length) props.children = kids;
      return { $canvas: 'component', name: String(name), props: props, style: style, path: path };
    }
    var attrs = {};
    Array.prototype.forEach.call(node.attributes, function (a) { attrs[a.name] = value(a.value, scope); });
    return { $canvas: 'element', tag: tag, ns: node.namespaceURI === SVG ? SVG : null, attrs: attrs, children: expandChildren(node, scope, path) };
  }

  function trimEdges(list) {
    if (typeof list[0] === 'string') list[0] = list[0].replace(/^\s+/, '');
    var end = list.length - 1;
    if (end >= 0 && typeof list[end] === 'string') list[end] = list[end].replace(/\s+$/, '');
    return list.filter(function (n) { return n !== ''; });
  }

  function expandImport(node, scope, path) {
    var name = value(node.getAttribute('name') || '', scope);
    if (!(name in importedBoards)) { importBoard(name).then(function () { scheduleRender(); }); return null; }
    var board = importedBoards[name];
    if (!board) return null;
    if ((path + '.').indexOf(':' + name + '.') >= 0) {
      fail(name + ' imports itself; the inner copy is not drawn');
      return null;
    }
    var props = defaults(board.schema);
    Array.prototype.forEach.call(node.attributes, function (a) {
      if (a.name === 'name' || a.name.indexOf('hint-') === 0) return;
      var key = componentPropName(a.name);
      props[key] = coerce(board.schema[key], value(a.value, scope));
    });
    return renderBoard(board, props, path + ':' + name);
  }

  /** Runs one board's logic (keeping its instance across renders) and expands its template. */
  function renderBoard(board, props, key) {
    var entry = instances[key];
    if (!entry || entry.board !== board) {
      var instance;
      try { instance = new board.Logic(props); }
      catch (error) { fail('board logic in ' + board.label + ' failed to start', error); instance = new DCLogic(props); }
      if (!instance.props) instance.props = props;
      if (!instance.state) instance.state = {};
      entry = instances[key] = { board: board, instance: instance, fresh: true, prevProps: props, prevState: instance.state };
    } else {
      entry.instance.props = props;
    }
    seen[key] = true;
    var vals;
    try { vals = entry.instance.renderVals() || {}; }
    catch (error) { fail('renderVals in ' + board.label + ' failed', error); vals = {}; }
    var scope = Object.assign({}, props, vals);
    return board.template ? expandChildren(board.template, scope, key) : [];
  }

  // ---------------------------------------------------------------- committing: DOM outside imports, kit mounts inside

  function mountFor(name) {
    var at = name.indexOf('.');
    var ns = at > 0 ? name.slice(0, at) : name;
    var rest = at > 0 ? name.slice(at + 1) : '';
    var global = window[ns];
    var info = runtime.kits[ns.toLowerCase()];
    if (global && typeof global.mount === 'function' && rest && !(info && info.legacy)) {
      return function (el, props) { return global.mount(el, rest, props); };
    }
    if (!window.React || !window.ReactDOM || !window.CanvasReactMarkup) return null;
    if (!runtime._legacyMount) {
      runtime._legacyMount = window.CanvasReactMarkup.createMount({
        React: window.React,
        createRoot: function (el) { return window.ReactDOM.createRoot(el); },
        global: window,
      });
    }
    return function (el, props) { return runtime._legacyMount(el, name, props); };
  }

  function showError(host, message) {
    host.setAttribute('data-canvas-error', message);
    host.textContent = message;
    host.style.cssText = 'display:block;font:12px/16px system-ui,sans-serif;color:#b42318;background:#fef3f2;border:1px solid #fda29b;padding:4px 8px';
  }

  function mountComponent(host, node) {
    var record = host.__canvasMount;
    var mount = mountFor(node.name);
    if (!mount) {
      fail(node.name + ' cannot mount: its kit is not loaded');
      showError(host, node.name + ' is not available');
      return;
    }
    try {
      var unmount = mount(host, node.props);
      if (!record) {
        record = host.__canvasMount = { unmount: unmount, name: node.name };
        mounted.push(host);
      } else if (typeof unmount === 'function') record.unmount = unmount;
    } catch (error) {
      fail(node.name + ' failed to mount', error);
      showError(host, node.name + ' failed to mount');
    }
  }

  function unmountTree(dom) {
    if (dom.nodeType !== 1) return;
    if (dom.__canvasMount) {
      var record = dom.__canvasMount;
      dom.__canvasMount = null;
      mounted.splice(mounted.indexOf(dom), 1);
      try { if (typeof record.unmount === 'function') record.unmount(); } catch (error) { fail('unmount failed', error); }
      return;
    }
    for (var c = dom.firstChild; c; c = c.nextSibling) unmountTree(c);
  }

  function sameKind(dom, node) {
    if (!dom) return false;
    if (typeof node !== 'object') return dom.nodeType === 3;
    if (dom.nodeType !== 1) return false;
    var prev = dom.__canvasNode;
    if (!prev || prev.$canvas !== node.$canvas) return false;
    if (node.$canvas === 'component') return prev.name === node.name && !!prev.style === !!node.style;
    return prev.tag === node.tag && prev.ns === node.ns;
  }

  function listen(el, name, fn) {
    var event = name.slice(2).toLowerCase();
    if (event === 'doubleclick') event = 'dblclick';
    var store = el.__canvasHandlers || (el.__canvasHandlers = {});
    if (!(event in store)) {
      el.addEventListener(event, function (e) { var f = store[event]; if (typeof f === 'function') return f(e); });
    }
    store[event] = fn;
  }

  function applyAttributes(el, next, prev) {
    prev = prev || {};
    Object.keys(prev).forEach(function (name) {
      if (name in next) return;
      if (/^on/i.test(name)) listen(el, name, null);
      else el.removeAttribute(name);
    });
    Object.keys(next).forEach(function (name) {
      var v = next[name];
      if (/^on/i.test(name)) {
        // Handlers come only from functions; an inline handler string never runs (as with React).
        listen(el, name, typeof v === 'function' ? v : null);
        return;
      }
      if (v === prev[name] && el.hasAttribute(name)) return;
      if (v == null || v === false) { el.removeAttribute(name); return; }
      var text = v === true ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      var ns = name.indexOf('xlink:') === 0 ? XLINK : name.indexOf('xml:') === 0 ? XML : null;
      try { if (ns) el.setAttributeNS(ns, name, text); else el.setAttribute(name, text); }
      catch (error) { fail('attribute ' + name + ' is not valid', error); }
    });
  }

  function createDom(node) {
    if (typeof node !== 'object') return document.createTextNode(String(node));
    var el;
    if (node.$canvas === 'component') {
      el = document.createElement(node.style ? 'div' : 'x-import');
      el.setAttribute('data-canvas-import', node.name);
      if (node.style) el.setAttribute('style', node.style);
      else el.style.display = 'contents';
      el.__canvasNode = node;
      pendingMounts.push([el, node]);
      return el;
    }
    el = node.ns ? document.createElementNS(node.ns, node.tag) : document.createElement(node.tag);
    applyAttributes(el, node.attrs, null);
    node.children.forEach(function (child) { el.appendChild(createDom(child)); });
    el.__canvasNode = node;
    return el;
  }

  function updateDom(dom, node) {
    if (typeof node !== 'object') {
      var text = String(node);
      if (dom.nodeValue !== text) dom.nodeValue = text;
      return;
    }
    var prev = dom.__canvasNode;
    dom.__canvasNode = node;
    if (node.$canvas === 'component') {
      if (node.style && node.style !== prev.style) dom.setAttribute('style', node.style);
      pendingMounts.push([dom, node]);
      return;
    }
    applyAttributes(dom, node.attrs, prev.attrs);
    patchChildren(dom, Array.prototype.slice.call(dom.childNodes), node.children, null);
  }

  /** Positional patch of `nodes` over the DOM list `old` inside `parent`, inserting before `before`. */
  function patchChildren(parent, old, nodes, before) {
    var i;
    for (i = 0; i < nodes.length; i++) {
      var dom = old[i];
      if (sameKind(dom, nodes[i])) updateDom(dom, nodes[i]);
      else {
        var fresh = createDom(nodes[i]);
        if (dom) { unmountTree(dom); parent.replaceChild(fresh, dom); }
        else parent.insertBefore(fresh, before);
        old[i] = fresh;
      }
    }
    for (; i < old.length; i++) {
      unmountTree(old[i]);
      if (old[i].parentNode === parent) parent.removeChild(old[i]);
    }
    return old.slice(0, nodes.length);
  }

  // ---------------------------------------------------------------- the render loop

  var main = null;
  var start$ = null;
  var end$ = null;
  var managed = [];
  var pendingMounts = [];
  var afterCommit = [];
  var scheduled = false;
  var started = false;
  var firstCommit = true;

  function scheduleRender() {
    if (!started || scheduled) return;
    scheduled = true;
    Promise.resolve().then(renderNow);
  }

  function renderNow() {
    scheduled = false;
    try { commit(); } catch (error) { fail('render failed', error); }
  }

  function commit() {
    seen = {};
    var nodes = renderBoard(main, Object.assign({}, runtime.props), 'board');
    pendingMounts = [];
    managed = patchChildren(document.body, managed, trimEdges(nodes), end$);
    var mounts = pendingMounts;
    pendingMounts = [];
    mounts.forEach(function (pair) { mountComponent(pair[0], pair[1]); });
    // Callbacks queued by setState during the lifecycle methods belong to the next render.
    var callbacks = afterCommit;
    afterCommit = [];
    lifecycle();
    callbacks.forEach(function (cb) { try { cb(); } catch (error) { fail('setState callback failed', error); } });
    applyMotion();
    if (firstCommit) {
      firstCommit = false;
      whenMounted(function () {
        readyResolve(runtime);
        post('canvas:ready', { props: runtime.schema, values: Object.assign({}, runtime.props), kit: kitReport() });
      });
    }
  }

  function lifecycle() {
    var keys = Object.keys(instances).sort(function (a, b) { return b.length - a.length; });
    keys.forEach(function (key) {
      var entry = instances[key];
      var instance = entry.instance;
      if (!seen[key]) {
        delete instances[key];
        call(instance, 'componentWillUnmount', []);
        return;
      }
      // Record what this render committed before the lifecycle runs, so a setState inside it is seen as a
      // change by the next render's componentDidUpdate.
      var prevProps = entry.prevProps;
      var prevState = entry.prevState;
      entry.prevProps = instance.props;
      entry.prevState = instance.state;
      if (entry.fresh) {
        entry.fresh = false;
        call(instance, 'componentDidMount', []);
      } else if (prevProps !== instance.props || prevState !== instance.state) {
        call(instance, 'componentDidUpdate', [prevProps, prevState]);
      }
    });
  }

  function call(instance, method, args) {
    if (typeof instance[method] !== 'function') return;
    try { instance[method].apply(instance, args); } catch (error) { fail(method + ' failed', error); }
  }

  function afterPaint(fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }

  // Ready means drawn: kits render on their own schedule (React spreads roots over frames), so wait until every
  // mounted host holds something, for at most about two seconds, then one more frame pair.
  function whenMounted(fn) {
    var frames = 0;
    (function check() {
      var waiting = mounted.some(function (host) { return !host.firstChild && !host.hasAttribute('data-canvas-error'); });
      if (waiting && frames++ < 120) requestAnimationFrame(check);
      else afterPaint(fn);
    })();
  }

  function kitReport() {
    var info = runtime.kit;
    var manifest = info && info.manifest;
    var choice = params.get('canvas-kit') || 'pinned';
    var mode = /^live:/.test(choice) ? 'live' : 'pinned';
    var ref = mode === 'live' ? choice.slice(5) : manifest && manifest.source ? manifest.source.commit || null : null;
    return { mode: mode, ref: ref, version: manifest ? manifest.version || null : null };
  }

  // ---------------------------------------------------------------- motion

  function applyMotion() {
    var rate = runtime.motion.rate;
    document.documentElement.style.setProperty('--canvas-motion-rate', String(rate));
    if (rate === 1 || !document.getAnimations) return;
    document.getAnimations().forEach(function (animation) { setRate(animation, rate); });
  }

  function setRate(animation, rate) {
    try {
      if (rate === 0) { if (animation.playState === 'running') { animation.pause(); animation.__canvasPaused = true; } return; }
      if (animation.__canvasPaused && animation.playState === 'paused') { animation.__canvasPaused = false; animation.play(); }
      animation.playbackRate = rate;
    } catch (error) { /* an animation that finished between listing and setting */ }
  }

  function onAnimationStart(event) {
    var rate = runtime.motion.rate;
    if (rate === 1 || !event.target || !event.target.getAnimations) return;
    event.target.getAnimations().forEach(function (animation) { setRate(animation, rate); });
  }

  // Animations a script starts with element.animate() (motion libraries do) start at the current rate.
  if (window.Element && Element.prototype.animate) {
    var realAnimate = Element.prototype.animate;
    var startTime = window.Animation && Object.getOwnPropertyDescriptor(Animation.prototype, 'startTime');
    Element.prototype.animate = function animate() {
      var animation = realAnimate.apply(this, arguments);
      if (startTime && startTime.get && startTime.set && document.timeline) {
        // A script that sets startTime from performance.now() means board time; the timeline runs on the
        // browser's clock, so the value is moved by the difference. Setting it plays a paused animation, so
        // a paused board pauses it again.
        Object.defineProperty(animation, 'startTime', {
          configurable: true,
          get: function () {
            var value = startTime.get.call(this);
            if (value == null) return value;
            // The value a script set, while the animation still runs from it; otherwise converted.
            if (this.__canvasStart != null && this.__canvasStartReal === value) return this.__canvasStart;
            return value - (document.timeline.currentTime - clock.now());
          },
          set: function (value) {
            startTime.set.call(this, value == null ? value : value + (document.timeline.currentTime - clock.now()));
            this.__canvasStart = value;
            this.__canvasStartReal = startTime.get.call(this);
            if (runtime.motion.rate === 0 && value != null) { try { this.pause(); this.__canvasPaused = true; } catch (error) { /* finished */ } }
          },
        });
      }
      if (runtime.motion.rate !== 1) setRate(animation, runtime.motion.rate);
      return animation;
    };
  }

  function motion(message) {
    var rate = Number(message.rate);
    if (!(rate >= 0) || !isFinite(rate)) return;
    runtime.motion.rate = rate;
    if (message.replay) clock.resync();
    clock.setRate(rate);
    if (message.replay) {
      // Replay: draw the board afresh so entrance motion runs again, then restart animations still on the page.
      managed.forEach(unmountTree);
      managed.forEach(function (dom) { if (dom.parentNode) dom.parentNode.removeChild(dom); });
      managed = [];
      if (document.getAnimations) document.getAnimations().forEach(function (a) { try { a.currentTime = 0; a.play(); } catch (e) { /* skip */ } });
      scheduleRender();
      return;
    }
    if (document.getAnimations) document.getAnimations().forEach(function (animation) {
      if (rate === 1) { if (animation.__canvasPaused) { animation.__canvasPaused = false; animation.play(); } animation.playbackRate = 1; }
      else setRate(animation, rate);
    });
    applyMotion();
  }

  // ---------------------------------------------------------------- messages

  function setProps(values) {
    if (!values || typeof values !== 'object') return;
    var changed = false;
    Object.keys(values).forEach(function (key) {
      if (key.charAt(0) === '$') return;
      if (runtime.props[key] !== values[key]) { runtime.props[key] = values[key]; changed = true; }
    });
    if (changed) scheduleRender();
    Promise.resolve().then(function () {
      post('canvas:props-changed', { values: Object.assign({}, runtime.props) });
    });
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin || event.source !== window.parent || event.source === window) return;
    var data = event.data;
    if (!data || typeof data.type !== 'string' || data.type.indexOf('canvas:') !== 0) return;
    if (data.type === 'canvas:set-props') setProps(data.values);
    else if (data.type === 'canvas:motion') motion(data);
    (handlers[data.type] || []).forEach(function (fn) {
      try { fn(data, event); } catch (error) { fail(data.type + ' handler failed', error); }
    });
  });

  // ---------------------------------------------------------------- start

  function start() {
    var doc = sourceDocument();
    Array.prototype.forEach.call(doc.documentElement.attributes, function (a) {
      if (!document.documentElement.hasAttribute(a.name)) document.documentElement.setAttribute(a.name, a.value);
    });
    Array.prototype.forEach.call(doc.body.attributes, function (a) { document.body.setAttribute(a.name, a.value); });
    main = new Board(doc, boardFile || 'board');
    runtime.schema = main.schema;
    runtime.props = defaults(main.schema);
    var initial = params.get('canvas-props');
    if (initial) {
      try { Object.assign(runtime.props, JSON.parse(initial)); } catch (error) { fail('canvas-props is not JSON', error); }
    }
    var head = Array.prototype.slice.call(doc.head.children);
    var helmet = [];
    main.helmet.forEach(function (h) { helmet = helmet.concat(Array.prototype.filter.call(h.childNodes, function (n) { return n.nodeType === 1; })); });
    var outside = Array.prototype.filter.call(doc.body.childNodes, function (n) {
      return n !== main.template && n !== main.script && !(n.nodeType === 3 && !n.nodeValue.trim());
    });
    processSequence(head.concat(helmet))
      .then(function () { return preloadImports(main.template); })
      .then(function () {
        start$ = document.createComment(' canvas board ');
        end$ = document.createComment(' /canvas board ');
        document.body.appendChild(start$);
        document.body.appendChild(end$);
        outside.forEach(function (n) {
          if (n.nodeType === 1 && n.localName === 'script') return;
          document.body.insertBefore(document.importNode(n, true), start$);
        });
        document.addEventListener('animationstart', onAnimationStart, true);
        document.addEventListener('transitionrun', onAnimationStart, true);
        started = true;
        renderNow();
      })
      .catch(function (error) { fail('the board did not start', error); });
  }
})();
