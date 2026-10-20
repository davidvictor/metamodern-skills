// window.Fixture: the neutral fixture kit (canvas-kit/1).
type Node = unknown;
type Component<P> = (props: P) => Node;
interface RootProps { theme?: 'light' | 'dark'; contrast?: 'standard' | 'high'; density?: string; inputContext?: 'pointer' | 'touch'; scope?: string; children?: Node }
interface Scene { id: string; title: string; area: string; states: { id: string; label: string }[]; viewports: ('desktop' | 'phone')[] }
interface Task { id: string; title: string; owner: string; due: string; done: boolean }
interface Member { id: string; name: string; role: string }
export interface FixtureKit {
  version: string;
  mount(el: HTMLElement, name: string, props?: Record<string, unknown>): () => void;
  Root: Component<RootProps>;
  Scene: Component<{ id: string; state?: string } & RootProps>;
  scenes: Scene[];
  sample: { team: string; tasks: Task[]; members: Member[]; formatDate(iso: string): string; formatCount(n: number, one: string, many: string): string };
  Button: Component<{ variant?: 'primary' | 'secondary' | 'ghost'; size?: 'default' | 'small'; disabled?: boolean; busy?: boolean; onClick?: (event: unknown) => void; className?: string; children?: Node }>;
  Card: Component<{ title?: string; description?: string; footer?: Node; className?: string; children?: Node }>;
  List: Component<{ label?: string; children?: Node }>;
  ListItem: Component<{ label: string; detail?: string; selected?: boolean; children?: Node }>;
  Badge: Component<{ tone?: 'neutral' | 'positive' | 'critical'; children?: Node }>;
  Input: Component<{ label: string; defaultValue?: string; placeholder?: string; onChange?: (event: unknown) => void }>;
  Dialog: Component<{ open?: boolean; title?: string; description?: string; onOpenChange?: (open: boolean) => void; children?: Node }>;
  Tabs: Component<{ items: { id: string; label: string }[]; defaultValue?: string; onChange?: (id: string) => void; children?: Node }>;
  Icons: { Check: Component<{ size?: number; label?: string }>; Close: Component<{ size?: number; label?: string }>; Plus: Component<{ size?: number; label?: string }> };
  Scenes?: { Overview: Component<{ state?: string } & RootProps>; Settings: Component<{ state?: string } & RootProps> };
}
declare global { interface Window { Fixture: FixtureKit } }
