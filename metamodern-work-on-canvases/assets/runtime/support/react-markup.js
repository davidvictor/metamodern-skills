/*
 * Canvas markup for React (canvas-markup/1).
 *
 * The board runtime has no framework. It turns a board into markup nodes and hands each outermost
 * <x-import> to a kit's mount(el, name, props), with nested board markup inside props.children.
 * This file turns those markup nodes into React elements and implements mount() with one root per
 * host element, so mounting the same element again updates it in place.
 *
 * Contract kits bundle this file (CommonJS or ESM import through a bundler) and call
 * createMount({ React, createRoot, global }). The runtime loads it as a classic script for legacy
 * kits that expect React from the page. Markup nodes:
 *
 *   "text" | number                                         text
 *   { $canvas: "element", tag, ns, attrs, children }        a plain element; attrs as written in the board
 *   { $canvas: "component", name, props, style }            a component, name dotted from window
 *                                                           (for example "Ns.Path"); style places a wrapper
 */
(function (root, factory) {
  if (typeof module === 'object' && module && module.exports) module.exports = factory();
  else root.CanvasReactMarkup = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SVG = 'http://www.w3.org/2000/svg';

  // Lowercase attribute names (as an HTML parser writes them) to React prop names.
  var HTML_NAMES = {};
  [
    'acceptCharset', 'accessKey', 'allowFullScreen', 'autoCapitalize', 'autoComplete', 'autoCorrect', 'autoFocus',
    'autoPlay', 'cellPadding', 'cellSpacing', 'charSet', 'classID', 'colSpan', 'contentEditable', 'contextMenu',
    'controlsList', 'crossOrigin', 'dateTime', 'encType', 'enterKeyHint', 'fetchPriority', 'formAction', 'formEncType',
    'formMethod', 'formNoValidate', 'formTarget', 'frameBorder', 'hrefLang', 'htmlFor', 'httpEquiv', 'inputMode',
    'itemID', 'itemProp', 'itemRef', 'itemScope', 'itemType', 'keyParams', 'keyType', 'marginHeight', 'marginWidth',
    'maxLength', 'mediaGroup', 'minLength', 'noModule', 'noValidate', 'playsInline', 'popoverTarget',
    'popoverTargetAction', 'readOnly', 'referrerPolicy', 'rowSpan', 'spellCheck', 'srcDoc', 'srcLang', 'srcSet',
    'tabIndex', 'useMap',
  ].forEach(function (name) { HTML_NAMES[name.toLowerCase()] = name; });
  HTML_NAMES['class'] = 'className';
  HTML_NAMES['for'] = 'htmlFor';
  HTML_NAMES['http-equiv'] = 'httpEquiv';
  HTML_NAMES['accept-charset'] = 'acceptCharset';

  var BOOLEAN = {};
  ('allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate hidden inert ' +
    'itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected')
    .split(' ').forEach(function (name) { BOOLEAN[name] = true; });

  var EVENTS = {};
  [
    'Abort', 'AnimationEnd', 'AnimationIteration', 'AnimationStart', 'AuxClick', 'Blur', 'CanPlay', 'CanPlayThrough',
    'Change', 'Click', 'Close', 'CompositionEnd', 'CompositionStart', 'CompositionUpdate', 'ContextMenu', 'Copy', 'Cut',
    'DoubleClick', 'Drag', 'DragEnd', 'DragEnter', 'DragExit', 'DragLeave', 'DragOver', 'DragStart', 'Drop',
    'DurationChange', 'Emptied', 'Ended', 'Error', 'Focus', 'GotPointerCapture', 'Input', 'Invalid', 'KeyDown',
    'KeyPress', 'KeyUp', 'Load', 'LoadedData', 'LoadedMetadata', 'LoadStart', 'LostPointerCapture', 'MouseDown',
    'MouseEnter', 'MouseLeave', 'MouseMove', 'MouseOut', 'MouseOver', 'MouseUp', 'Paste', 'Pause', 'Play', 'Playing',
    'PointerCancel', 'PointerDown', 'PointerEnter', 'PointerLeave', 'PointerMove', 'PointerOut', 'PointerOver',
    'PointerUp', 'Progress', 'RateChange', 'Reset', 'Resize', 'Scroll', 'ScrollEnd', 'Seeked', 'Seeking', 'Select',
    'Stalled', 'Submit', 'Suspend', 'TimeUpdate', 'Toggle', 'TouchCancel', 'TouchEnd', 'TouchMove', 'TouchStart',
    'TransitionEnd', 'TransitionRun', 'TransitionStart', 'VolumeChange', 'Waiting', 'Wheel', 'BeforeInput',
  ].forEach(function (name) { EVENTS['on' + name.toLowerCase()] = 'on' + name; });
  EVENTS.ondblclick = 'onDoubleClick';
  EVENTS.onfocusin = 'onFocus';
  EVENTS.onfocusout = 'onBlur';

  var camel = function (name) { return name.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); };

  function isNode(value) {
    return !!value && typeof value === 'object' && (value.$canvas === 'element' || value.$canvas === 'component');
  }

  /** A CSS declaration list as a React style object. Keeps custom properties; splits only at top-level semicolons. */
  function styleObject(text) {
    var out = {};
    var parts = [];
    var depth = 0; var quote = null; var start = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (quote) { if (c === quote && text[i - 1] !== '\\') quote = null; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (c === ';' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
    }
    parts.push(text.slice(start));
    parts.forEach(function (part) {
      var at = part.indexOf(':');
      if (at < 1) return;
      var property = part.slice(0, at).trim();
      var value = part.slice(at + 1).trim();
      if (!property || !value) return;
      if (property.indexOf('--') === 0) { out[property] = value; return; }
      property = property.toLowerCase();
      if (property.indexOf('-ms-') === 0) property = 'ms-' + property.slice(4);
      else if (property.charAt(0) === '-') property = property.slice(1).replace(/^[a-z]/, function (c) { return c.toUpperCase(); });
      out[camel(property)] = value;
    });
    return out;
  }

  function text(value) {
    if (value == null || typeof value === 'boolean') return null;
    return typeof value === 'object' ? String(value) : value;
  }

  function create(options) {
    var React = options.React;
    var h = React.createElement;
    var lookup = options.resolve || function (name) {
      return name.split('.').reduce(function (value, key) { return value == null ? undefined : value[key]; }, root());
    };

    function root() { return typeof window !== 'undefined' ? window : globalThis; }

    function elementProps(node, key) {
      var attrs = node.attrs || {};
      var svg = node.ns === SVG;
      var props = { key: key };
      var tag = node.tag;
      var hasHandler = false;
      Object.keys(attrs).forEach(function (name) {
        var value = attrs[name];
        if (value === undefined) return;
        var lower = name.toLowerCase();
        if (lower.indexOf('on') === 0 && lower.length > 2) {
          if (typeof value !== 'function') return;
          props[EVENTS[lower] || 'on' + lower.charAt(2).toUpperCase() + camel(lower.slice(3))] = value;
          hasHandler = true;
          return;
        }
        if (lower === 'style') { props.style = typeof value === 'string' ? styleObject(value) : value; return; }
        if (lower === 'key' || lower === 'ref') return;
        if (lower.indexOf('aria-') === 0 || lower.indexOf('data-') === 0) { props[lower] = value === true ? 'true' : value; return; }
        var prop;
        if (svg) {
          if (name === 'class') prop = 'className';
          else if (name.indexOf(':') > 0) prop = name.replace(/:([a-z])/, function (_, c) { return c.toUpperCase(); });
          else prop = camel(name);
        } else {
          prop = HTML_NAMES[lower] || name;
          if (BOOLEAN[lower]) value = value === '' || value === true || value === lower;
        }
        props[prop] = value;
      });
      // Uncontrolled form fields: initial values only, unless the board gives a change handler.
      if (!svg && !hasHandler && (tag === 'input' || tag === 'select' || tag === 'textarea')) {
        if ('value' in props) { props.defaultValue = props.value; delete props.value; }
        if ('checked' in props) { props.defaultChecked = props.checked; delete props.checked; }
      }
      return props;
    }

    function toReact(node, key) {
      if (Array.isArray(node)) return node.map(function (child, index) { return toReact(child, index); });
      if (!isNode(node)) return text(node);
      if (node.$canvas === 'element') {
        var props = elementProps(node, key);
        var children = node.children || [];
        if (node.tag === 'textarea' && node.ns !== SVG) {
          if (!('defaultValue' in props) && !('value' in props)) props.defaultValue = children.map(text).join('');
          return h('textarea', props);
        }
        if (node.tag === 'select' && node.ns !== SVG && !('defaultValue' in props) && !('value' in props)) {
          children.forEach(function (child) {
            if (isNode(child) && child.tag === 'option' && child.attrs && 'selected' in child.attrs && child.attrs.selected !== false)
              props.defaultValue = child.attrs.value != null ? child.attrs.value : (child.children || []).map(text).join('');
          });
        }
        var kids = children.map(function (child, index) {
          if (isNode(child) && child.tag === 'option' && child.attrs && 'selected' in child.attrs) {
            var copy = {}; Object.keys(child.attrs).forEach(function (k) { if (k !== 'selected') copy[k] = child.attrs[k]; });
            child = { $canvas: 'element', tag: 'option', ns: child.ns, attrs: copy, children: child.children };
          }
          return toReact(child, index);
        });
        return kids.length ? h.apply(null, [node.tag, props].concat(kids)) : h(node.tag, props);
      }
      var type = lookup(node.name);
      if (type == null) throw new Error(node.name + ' is not defined on the page');
      var element = h(type, componentProps(node.props, key));
      return node.style ? h('div', { key: key, style: styleObject(node.style) }, element) : element;
    }

    function componentProps(source, key) {
      var props = {};
      Object.keys(source || {}).forEach(function (name) {
        if (name === 'children') return;
        props[name] = source[name];
      });
      if (key != null) props.key = key;
      if (source && 'children' in source) {
        var children = source.children;
        if (Array.isArray(children)) {
          var converted = children.map(function (child, index) { return toReact(child, index); });
          props.children = converted.length === 1 ? converted[0] : converted;
        } else {
          props.children = toReact(children, undefined);
        }
      }
      return props;
    }

    return { toReact: toReact, componentProps: componentProps, lookup: lookup };
  }

  /**
   * mount(el, name, props): renders the component `name` (dotted, resolved on `global`) into el.
   * Markup nodes in props.children become React elements. Mounting the same element again updates
   * it in place; the returned function unmounts it.
   */
  function createMount(options) {
    var React = options.React;
    var createRoot = options.createRoot;
    var global = options.global;
    var markup = create({ React: React, resolve: options.resolve });
    var roots = typeof WeakMap === 'function' ? new WeakMap() : null;
    function resolveName(name) {
      return String(name).split('.').reduce(function (value, key) { return value == null ? undefined : value[key]; }, global);
    }
    return function mount(el, name, props) {
      var type = typeof name === 'string' ? resolveName(name) : name;
      if (type == null) throw new Error('No component named ' + name);
      var entry = roots.get(el);
      if (!entry) {
        entry = { root: createRoot(el) };
        roots.set(el, entry);
      }
      entry.root.render(React.createElement(type, markup.componentProps(props || {})));
      return function unmount() {
        if (roots.get(el) !== entry) return;
        roots.delete(el);
        entry.root.unmount();
      };
    };
  }

  return { schema: 'canvas-markup/1', createMount: createMount, create: create, isNode: isNode, styleObject: styleObject };
});
