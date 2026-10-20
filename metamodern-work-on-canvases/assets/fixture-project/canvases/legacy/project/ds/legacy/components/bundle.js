/* A legacy kit: a classic script that reads React from the page when it loads, as kits built for React 18
   globals do. It defines window.Legacy and no mount() of its own. */
(function () {
  'use strict';
  var React = window.React;
  if (!React || !window.ReactDOM) throw new Error('Legacy kit: React must be on the page before this script');
  var h = React.createElement;
  function Panel(props) {
    var count = React.useState(0);
    return h('section', { 'data-kit-component': 'Panel', className: 'lg-panel' },
      h('h2', null, props.title),
      props.children,
      h('button', { type: 'button', 'data-test': 'legacy-count', onClick: function () { count[1](count[0] + 1); } }, 'Counted ' + count[0]));
  }
  function Tag(props) { return h('span', { 'data-kit-component': 'Tag', className: 'lg-tag' }, props.children); }
  window.Legacy = { Panel: Panel, Tag: Tag, reactVersion: React.version };
})();
