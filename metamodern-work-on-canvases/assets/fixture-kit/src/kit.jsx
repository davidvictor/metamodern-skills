// The neutral fixture kit (canvas-kit/1): a few plain React 19 components, two scenes and sample data,
// assigned to window.Fixture. It exists to exercise the runtime, the viewer and the render check without
// any product. Every component renders data-kit-component on its root.
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import * as React from 'react';
// The package's markup helper is a classic UMD script; require() gives its module.exports.
const markup = require('../../runtime/support/react-markup.js');

const RootContext = createContext({ theme: 'light' });
const cx = (...parts) => parts.filter(Boolean).join(' ');

function Root({ theme = 'light', contrast = 'standard', density = 'default', inputContext = 'pointer', scope, children }) {
  return (
    <RootContext.Provider value={{ theme, contrast, density, inputContext, scope }}>
      <div
        data-kit-component="Root"
        className="fx-root"
        data-theme={theme}
        data-contrast={contrast}
        data-density={density}
        data-input={inputContext}
        data-scope={scope}
      >
        {children}
      </div>
    </RootContext.Provider>
  );
}

function Button({ variant = 'primary', size = 'default', disabled = false, busy = false, onClick, className, children, ...rest }) {
  return (
    <button
      type="button"
      data-kit-component="Button"
      className={cx('fx-button', `fx-button-${variant}`, size !== 'default' && `fx-button-${size}`, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}

function Card({ title, description, footer, className, children }) {
  return (
    <section data-kit-component="Card" className={cx('fx-card', className)}>
      {title ? <h2 className="fx-card-title">{title}</h2> : null}
      {description ? <p className="fx-card-description">{description}</p> : null}
      {children}
      {footer ? <div className="fx-card-footer">{footer}</div> : null}
    </section>
  );
}

function List({ label, children }) {
  return (
    <ul data-kit-component="List" className="fx-list" aria-label={label}>
      {children}
    </ul>
  );
}

function ListItem({ label, detail, selected = false, children }) {
  return (
    <li data-kit-component="ListItem" className="fx-list-item" aria-current={selected ? 'true' : undefined}>
      <span className="fx-list-label">{label}</span>
      {detail ? <span className="fx-list-detail">{detail}</span> : null}
      {children}
    </li>
  );
}

function Badge({ tone = 'neutral', children }) {
  return (
    <span data-kit-component="Badge" className={`fx-badge fx-badge-${tone}`}>
      {children}
    </span>
  );
}

function Input({ label, defaultValue = '', placeholder, onChange }) {
  const id = useId();
  return (
    <div data-kit-component="Input" className="fx-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} defaultValue={defaultValue} placeholder={placeholder} onChange={onChange} />
    </div>
  );
}

function Dialog({ open = false, title, description, onOpenChange, children }) {
  const { theme } = useContext(RootContext);
  if (!open) return null;
  return createPortal(
    <div data-kit-component="Dialog" className="fx-overlay fx-root" data-theme={theme}>
      <div role="dialog" aria-modal="true" aria-label={title} className="fx-dialog">
        {title ? <h2 className="fx-dialog-title">{title}</h2> : null}
        {description ? <p className="fx-dialog-description">{description}</p> : null}
        {children}
        {onOpenChange ? (
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function Tabs({ items = [], defaultValue, onChange, children }) {
  const [value, setValue] = useState(defaultValue ?? items[0]?.id);
  const list = useRef(null);
  const [bar, setBar] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const active = list.current?.querySelector('[aria-selected="true"]');
    if (active) setBar({ left: active.offsetLeft, width: active.offsetWidth });
  }, [value, items.length]);
  return (
    <div data-kit-component="Tabs" className="fx-tabs">
      <div role="tablist" className="fx-tablist" ref={list}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === value}
            className="fx-tab"
            onClick={() => {
              setValue(item.id);
              if (onChange) onChange(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
        <span className="fx-tab-indicator" style={{ transform: `translateX(${bar.left}px)`, width: bar.width }} />
      </div>
      <div role="tabpanel" className="fx-tabpanel">
        {children}
      </div>
    </div>
  );
}

// A frame-driven spring with no animation library, the way spring motion libraries run: each frame steps a
// damped spring by the frame's timestamp. It moves its box from 0 to `to` pixels when it mounts and marks
// itself settled, so a check can time it at each motion rate.
function Spring({ to = 160, stiffness = 170, damping = 26 }) {
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    let x = 0;
    let v = 0;
    let last = null;
    let frame = 0;
    const started = performance.now();
    el.removeAttribute('data-settled');
    const step = (now) => {
      if (last !== null) {
        let dt = Math.min(0.064, (now - last) / 1000);
        while (dt > 0) {
          const h = Math.min(dt, 0.004);
          v += (-stiffness * (x - to) - damping * v) * h;
          x += v * h;
          dt -= h;
        }
      }
      last = now;
      el.style.transform = `translateX(${x.toFixed(2)}px)`;
      el.dataset.x = x.toFixed(2);
      if (Math.abs(x - to) < 0.5 && Math.abs(v) < 0.5) {
        el.style.transform = `translateX(${to}px)`;
        el.dataset.x = String(to);
        el.dataset.settled = String(Math.round(performance.now() - started));
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, stiffness, damping]);
  return (
    <div data-kit-component="Spring" className="fx-spring-track">
      <div ref={box} className="fx-spring" data-x="0" />
    </div>
  );
}

const ICON_PATHS = { Check: 'M5 12.5l4.5 4.5L19 7.5', Close: 'M6 6l12 12M18 6L6 18', Plus: 'M12 5v14M5 12h14' };
const Icons = Object.fromEntries(
  Object.entries(ICON_PATHS).map(([name, d]) => {
    const Icon = ({ size = 16, label }) => (
      <svg
        data-kit-component={`Icons.${name}`}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : 'true'}
      >
        <path d={d} />
      </svg>
    );
    Icon.displayName = `Icons.${name}`;
    return [name, Icon];
  }),
);

const sample = {
  team: 'Field notes',
  tasks: [
    { id: 'outline', title: 'Draft the outline', owner: 'Rae', due: '2026-11-02', done: true },
    { id: 'interviews', title: 'Schedule interviews', owner: 'Jun', due: '2026-11-05', done: false },
    { id: 'survey', title: 'Send the survey', owner: 'Ana', due: '2026-11-09', done: false },
    { id: 'summary', title: 'Write the summary', owner: 'Rae', due: '2026-11-16', done: false },
  ],
  members: [
    { id: 'rae', name: 'Rae Okafor', role: 'Lead' },
    { id: 'jun', name: 'Jun Park', role: 'Research' },
    { id: 'ana', name: 'Ana Silva', role: 'Design' },
  ],
  formatDate(iso) {
    const [, m, d] = iso.split('-').map(Number);
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + d;
  },
  formatCount(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
  },
};

const scenes = [
  {
    id: 'overview',
    title: 'Overview',
    area: 'home',
    states: [
      { id: 'filled', label: 'Filled' },
      { id: 'empty', label: 'Empty' },
    ],
    viewports: ['desktop', 'phone'],
  },
  {
    id: 'settings',
    title: 'Settings',
    area: 'settings',
    states: [
      { id: 'default', label: 'Default' },
      { id: 'dialog', label: 'Rename dialog' },
    ],
    viewports: ['desktop'],
  },
];

function OverviewScene({ state }) {
  const tasks = state === 'empty' ? [] : sample.tasks;
  const open = tasks.filter((t) => !t.done).length;
  return (
    <Card title="This week" description={sample.formatCount(open, 'task open', 'tasks open')}>
      {tasks.length ? (
        <List label="Tasks">
          {tasks.map((task) => (
            <ListItem key={task.id} label={task.title} detail={`${task.owner}, ${sample.formatDate(task.due)}`} />
          ))}
        </List>
      ) : (
        <p className="fx-empty">Nothing is due this week.</p>
      )}
    </Card>
  );
}

function SettingsScene({ state }) {
  return (
    <>
      <Card title="Team" description={sample.team}>
        <Tabs
          items={[
            { id: 'members', label: 'Members' },
            { id: 'roles', label: 'Roles' },
          ]}
        >
          <List label="Members">
            {sample.members.map((m) => (
              <ListItem key={m.id} label={m.name} detail={m.role} />
            ))}
          </List>
        </Tabs>
      </Card>
      <Dialog open={state === 'dialog'} title="Rename team" description="The new name shows to everyone on the team.">
        <Input label="Team name" defaultValue={sample.team} />
      </Dialog>
    </>
  );
}

function Scene({ id, state, theme, contrast, density, inputContext, scope }) {
  const scene = scenes.find((s) => s.id === id);
  const current = state ?? scene?.states[0].id;
  const body = id === 'overview' ? <OverviewScene state={current} /> : id === 'settings' ? <SettingsScene state={current} /> : null;
  return (
    <Root theme={theme} contrast={contrast} density={density} inputContext={inputContext} scope={scope}>
      <div data-kit-component="Scene" data-scene={id} data-state={current} className="fx-scene">
        {body ?? <p className="fx-empty">No scene named {String(id)}.</p>}
      </div>
    </Root>
  );
}

const kit = {
  version: '__VERSION__',
  Root,
  Scene,
  scenes,
  sample,
  Button,
  Card,
  List,
  ListItem,
  Badge,
  Input,
  Dialog,
  Tabs,
  Spring,
  Icons,
};
kit.mount = markup.createMount({ React, createRoot, global: kit });
window.Fixture = kit;
