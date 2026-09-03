/**
 * Server surface: the client-safe barrel plus the pieces that touch node:
 * builtins or act as write plane. Importing this from a "use client" component
 * pulls node:fs into the browser bundle and the build will fail — that's intentional.
 */
export * from "./index";
export { compileBundle, compileFiles, type SourceFile, type LintIssue } from "./compile";
export { fsStore } from "./stores/fs";
export { githubStore } from "./stores/github";
