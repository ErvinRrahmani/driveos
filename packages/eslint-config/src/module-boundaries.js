import path from 'node:path';

const MODULE_PATH = /^(.*\/src\/modules)\/([^/]+)(\/.*)?$/;
const PUBLIC_ENTRY = /^\/index(\.[cm]?[jt]s)?$/;
const SCHEMA_FILE = /^\/infra\/schema(\.[cm]?[jt]s)?$/;
const NEST_MODULE_FILE = /^\/[^/]+\.module(\.[cm]?[jt]s)?$/;

function locate(filePath) {
  const match = MODULE_PATH.exec(filePath.split(path.sep).join('/'));
  if (!match) return null;
  return { root: match[1], name: match[2], rest: match[3] ?? '' };
}

/** @type {import('eslint').Rule.RuleModule} */
export const moduleBoundaries = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "A module under src/modules/<a> may import another module <b> only through modules/<b>/index.ts. Exceptions: infra/schema.ts may import another module's infra/schema.ts for foreign keys; a top-level <a>*.module.ts may import another module's top-level *.module.ts (Nest module classes are not exported from index.ts).",
    },
    schema: [],
    messages: {
      deepImport:
        "Module '{{from}}' may import module '{{to}}' only through its index.ts (import '{{to}}/index.js').",
    },
  },
  create(context) {
    const importer = locate(context.filename);
    if (!importer) return {};

    function check(node) {
      const source = node?.type === 'Literal' ? node.value : null;
      if (typeof source !== 'string' || !source.startsWith('.')) return;
      const target = locate(path.resolve(path.dirname(context.filename), source));
      if (!target || target.root !== importer.root || target.name === importer.name) return;
      if (target.rest === '' || PUBLIC_ENTRY.test(target.rest)) return;
      if (SCHEMA_FILE.test(importer.rest) && SCHEMA_FILE.test(target.rest)) return;
      if (NEST_MODULE_FILE.test(importer.rest) && NEST_MODULE_FILE.test(target.rest)) return;
      context.report({
        node,
        messageId: 'deepImport',
        data: { from: importer.name, to: target.name },
      });
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      TSExternalModuleReference: (node) => check(node.expression),
    };
  },
};

export default { rules: { 'module-boundaries': moduleBoundaries } };
