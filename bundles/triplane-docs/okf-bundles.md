---
id: okf-bundles
type: term
title: OKF bundles
---
An OKF bundle is a directory of markdown files with YAML frontmatter, cross-linked into
a graph. Required frontmatter: `type`. Recommended: `id`, `title`, `links: [{to, rel}]`.
Double-square-bracket wiki-links in the body become `mentions` edges. The compiler lints for broken
links, duplicate ids, and orphans, then emits `graph.json` — the single artifact every
plane reads (see [[three-planes]]).
