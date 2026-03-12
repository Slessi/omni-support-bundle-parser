import { esc } from './esc';

export function syntaxHighlightYaml(text: string): string {
  return esc(text)
    .replace(/^(\s*)([\w-]+):/gm, (_, ws: string, key: string) => `${ws}<span class="y-key">${key}</span>:`)
    .replace(/: (true|false)/g, (_: string, v: string) => `: <span class="y-bool">${v}</span>`)
    .replace(/: (null|~)\s*$/gm, (_: string, v: string) => `: <span class="y-null">${v}</span>`)
    .replace(/: (-?\d+(?:\.\d+)?)\s*$/gm, (_: string, n: string) => `: <span class="y-num">${n}</span>`)
    .replace(/: ([^\s<][^\n<]*)\s*$/gm, (_: string, s: string) => `: <span class="y-str">${s}</span>`);
}
