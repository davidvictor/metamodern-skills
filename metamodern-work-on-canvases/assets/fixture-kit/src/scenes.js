/* The fixture kit's second script: screen shortcuts on window.Fixture.Scenes, loaded after bundle.js. */
(function () {
  'use strict';
  var kit = window.Fixture;
  if (!kit) throw new Error('scenes.js needs window.Fixture: load components/bundle.js first');
  function screen(id, name) {
    var component = function (props) { return kit.Scene(Object.assign({}, props, { id: id })); };
    component.displayName = 'Scenes.' + name;
    return component;
  }
  kit.Scenes = { Overview: screen('overview', 'Overview'), Settings: screen('settings', 'Settings') };
})();
