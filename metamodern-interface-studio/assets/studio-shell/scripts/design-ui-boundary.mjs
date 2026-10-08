import path from 'node:path';
const roots = ['src/design-ui/', 'example/design-ui/'];
const root = path.resolve(import.meta.dirname, '..');
export function designUiImportProblem(filename, source, cwd = root) {
  if (['react', '@studio/kit', '@studio/design-ui'].includes(source)) return null;
  const relative = path.relative(cwd, filename).split(path.sep).join('/');
  const folder = roots.find(r => relative.startsWith(r));
  if (!folder || typeof source !== 'string') return 'Design panels need literal local imports';
  const target = path.relative(cwd, path.resolve(path.dirname(filename), source)).split(path.sep).join('/');
  if (source.startsWith('.') && target.startsWith(folder) && !/\.css$/i.test(target)) return null;
  return `${source} is outside the design editor boundary. Use @studio/kit, @studio/design-ui, React or own panel files.`;
}
export const designUiBoundary = { rules: { imports: { meta: { type: 'problem', schema: [], messages: { boundary: '{{reason}}' } }, create(context) {
  const check = node => { const value = node?.source?.value; const reason = designUiImportProblem(context.filename, value); if (reason) context.report({ node, messageId: 'boundary', data: { reason } }); };
  return { ImportDeclaration: check, ExportNamedDeclaration(node) { if (node.source) check(node); }, ExportAllDeclaration: check, ImportExpression: check };
} } } };
