import JSZip from 'jszip';

export interface LatexFile {
  name: string;
  content: string;
  isMain: boolean;
}

export async function processLatexZip(zipBuffer: Buffer): Promise<{
  files: LatexFile[];
  mainTex: string;
  markdown: string;
  fileTree: FileTreeNode[];
}> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const files: LatexFile[] = [];
  const textExtensions = ['.tex', '.bib', '.sty', '.cls', '.bst', '.txt', '.cfg'];

  const promises: Promise<void>[] = [];
  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    const ext = '.' + relativePath.split('.').pop()?.toLowerCase();
    if (textExtensions.includes(ext)) {
      promises.push(
        zipEntry.async('string').then((content) => {
          const isMain =
            ext === '.tex' &&
            (content.includes('\\documentclass') || content.includes('\\begin{document}'));
          files.push({ name: relativePath, content, isMain });
        })
      );
    }
  });
  await Promise.all(promises);

  const mainFile = files.find((f) => f.isMain) || files.find((f) => f.name.endsWith('.tex'));
  const mainTex = mainFile?.content || '';
  const markdown = convertLatexToMarkdown(mainTex, files);
  const fileTree = buildFileTree(zip);

  return { files, mainTex, markdown, fileTree };
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  size?: number;
}

function buildFileTree(zip: JSZip): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const dirMap = new Map<string, FileTreeNode>();
  zip.forEach((path, entry) => {
    const parts = path.split('/').filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join('/');
      const isLast = i === parts.length - 1;
      if (isLast && !entry.dir) {
        current.push({ name, path: fullPath, type: 'file' });
      } else {
        let dir = dirMap.get(fullPath);
        if (!dir) {
          dir = { name, path: fullPath, type: 'directory', children: [] };
          dirMap.set(fullPath, dir);
          current.push(dir);
        }
        current = dir.children!;
      }
    }
  });
  return root;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main converter
// ─────────────────────────────────────────────────────────────────────────────

export function convertLatexToMarkdown(tex: string, allFiles?: LatexFile[]): string {
  let md = tex;

  // 1. Merge \input / \include files
  if (allFiles?.length) {
    md = mergeInputFiles(md, allFiles);
  }

  // 2. Extract title/author from preamble, then slice to document body
  let frontMatter = '';
  const docStart = md.indexOf('\\begin{document}');
  if (docStart !== -1) {
    const preamble = md.slice(0, docStart);
    const titleM = preamble.match(/\\title\{([\s\S]*?)\}/);
    const authorM = preamble.match(/\\author\{([\s\S]*?)\}/);
    if (titleM) frontMatter += `# ${stripLatexCommands(titleM[1])}\n\n`;
    if (authorM) frontMatter += `*${stripLatexCommands(authorM[1]).replace(/\s+/g, ' ').trim()}*\n\n`;
    md = md.slice(docStart + '\\begin{document}'.length);
  }
  const docEnd = md.indexOf('\\end{document}');
  if (docEnd !== -1) md = md.slice(0, docEnd);

  // 3. Remove comments (skip inside math — good-enough heuristic: only remove % at start or after space/punctuation)
  md = md.replace(/(?<!\\)%[^\n]*/g, '');

  // 4. Protect verbatim blocks first (they must not be touched by later passes)
  const verbatimPlaceholders: string[] = [];
  md = md.replace(
    /\\begin\{(?:verbatim|lstlisting|minted|Verbatim)(?:\*|\[[^\]]*\])?\}([\s\S]*?)\\end\{(?:verbatim|lstlisting|minted|Verbatim)\*?\}/g,
    (_, inner) => {
      verbatimPlaceholders.push('```\n' + inner.trim() + '\n```');
      return `\x00VERB${verbatimPlaceholders.length - 1}\x00`;
    }
  );

  // 5. Protect ALL math environments (replace with placeholders, restore at the end)
  const mathPlaceholders: string[] = [];
  const saveMath = (math: string) => {
    mathPlaceholders.push(math);
    return `\x00MATH${mathPlaceholders.length - 1}\x00`;
  };

  // display math environments
  md = md.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_, m) => saveMath(`$$${m.trim()}$$`));
  md = md.replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g, (_, m) => saveMath(`$$${m.trim()}$$`));
  md = md.replace(/\\begin\{multline\*?\}([\s\S]*?)\\end\{multline\*?\}/g, (_, m) => saveMath(`$$${m.trim()}$$`));
  md = md.replace(/\\begin\{gather\*?\}([\s\S]*?)\\end\{gather\*?\}/g, (_, m) => saveMath(`$$${m.trim()}$$`));
  md = md.replace(/\\begin\{eqnarray\*?\}([\s\S]*?)\\end\{eqnarray\*?\}/g, (_, m) => saveMath(`$$${m.trim()}$$`));
  md = md.replace(/\\begin\{math\}([\s\S]*?)\\end\{math\}/g, (_, m) => saveMath(`$${m.trim()}$`));
  // \[ ... \]
  md = md.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => saveMath(`$$${m.trim()}$$`));
  // \( ... \)
  md = md.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => saveMath(`$${m.trim()}$`));
  // $$ ... $$  (before single-dollar pass)
  md = md.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => saveMath(`$$${m}$$`));
  // $ ... $  (non-greedy, single line)
  md = md.replace(/\$([^$\n]+?)\$/g, (_, m) => saveMath(`$${m}$`));

  // 6. \maketitle → insert frontMatter placeholder
  md = md.replace(/\\maketitle\b/g, '\x00FRONT\x00');

  // 7. Abstract
  md = md.replace(
    /\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g,
    (_, inner) => `\n## Abstract\n\n${inner.trim()}\n\n`
  );

  // 8. Sections (numbered & starred)
  const sectionCounter = [0, 0, 0];
  md = md.replace(/\\(?:(sub){0,2})section\*?\{([\s\S]*?)\}/g, (_, subs, title) => {
    const level = subs ? (subs.length / 3) + 1 : 1; // section=1, subsection=2, subsubsection=3
    sectionCounter[level - 1]++;
    sectionCounter.slice(level).fill(0);
    const hashes = '#'.repeat(level + 1); // section → ##, subsection → ###, subsubsection → ####
    return `\n${hashes} ${stripLatexCommands(title).trim()}\n`;
  });
  md = md.replace(/\\paragraph\*?\{([\s\S]*?)\}/g, (_, t) => `\n**${stripLatexCommands(t).trim()}**\n`);
  md = md.replace(/\\subparagraph\*?\{([\s\S]*?)\}/g, (_, t) => `\n*${stripLatexCommands(t).trim()}*\n`);

  // 9. Tables — must happen before generic environment removal
  md = processTabularEnvironments(md);

  // 10. Figures
  md = md.replace(
    /\\begin\{figure\*?\}([\s\S]*?)\\end\{figure\*?\}/g,
    (_, inner) => {
      const captionM = inner.match(/\\caption\{([\s\S]*?)\}/);
      const labelM = inner.match(/\\label\{([^}]+)\}/);
      const caption = captionM ? stripLatexCommands(captionM[1]).trim() : '';
      const label = labelM ? labelM[1] : '';
      return caption
        ? `\n> **Figure${label ? ` (${label})` : ''}:** ${caption}\n`
        : '';
    }
  );

  // 11. Lists (handle nesting by running multiple passes)
  for (let pass = 0; pass < 4; pass++) {
    md = processLists(md);
  }

  // 12. Text formatting — use brace-balanced extraction for robustness
  md = applyTextFormatting(md);

  // 13. Citations & refs
  md = md.replace(/\\cite[tp]?\*?\{([^}]+)\}/g, (_, keys) => `[${keys}]`);
  md = md.replace(/\\citeauthor\{([^}]+)\}/g, (_, k) => `[${k}]`);
  md = md.replace(/\\citeyear\{([^}]+)\}/g, (_, k) => `[${k}]`);
  md = md.replace(/\\ref\{([^}]+)\}/g, (_, k) => `[§${k}]`);
  md = md.replace(/\\eqref\{([^}]+)\}/g, (_, k) => `(${k})`);
  md = md.replace(/\\label\{[^}]+\}/g, '');
  md = md.replace(/\\autoref\{([^}]+)\}/g, (_, k) => `[${k}]`);

  // 14. Footnotes → inline parenthetical
  md = md.replace(/\\footnote\{([\s\S]*?)\}/g, (_, inner) => ` *(footnote: ${stripLatexCommands(inner).trim()})*`);

  // 15. Special chars and typography
  md = md.replace(/---/g, '—');
  md = md.replace(/--/g, '–');
  md = md.replace(/``/g, '\u201C');
  md = md.replace(/''/g, '\u201D');
  md = md.replace(/`/g, '\u2018');
  md = md.replace(/(?<![\\])'(?!\s)/g, '\u2019');
  md = md.replace(/\\ldots\b/g, '…');
  md = md.replace(/\\cdots\b/g, '⋯');
  md = md.replace(/\\vdots\b/g, '⋮');
  md = md.replace(/\\ddots\b/g, '⋱');
  md = md.replace(/\\dots\b/g, '…');
  md = md.replace(/\\&/g, '&');
  md = md.replace(/\\\$/g, '$');
  md = md.replace(/\\%/g, '%');
  md = md.replace(/\\#/g, '#');
  md = md.replace(/\\_/g, '\\_');
  md = md.replace(/\\textasciitilde\b/g, '~');
  md = md.replace(/\\textasciicircum\b/g, '^');
  md = md.replace(/~/g, '\u00A0'); // non-breaking space → regular space in md
  md = md.replace(/\\{/g, '{');
  md = md.replace(/\\}/g, '}');

  // 16. Layout commands → blank lines or remove
  md = md.replace(/\\(?:newpage|clearpage|cleardoublepage)\b/g, '\n---\n');
  md = md.replace(/\\(?:vspace|hspace|vskip|hskip)\*?\{[^}]*\}/g, '');
  md = md.replace(/\\(?:smallskip|medskip|bigskip|noindent|centering|raggedright|raggedleft)\b/g, '');
  md = md.replace(/\\(?:linebreak|pagebreak|allowbreak)\b/g, '\n');
  md = md.replace(/\\\\(?:\[[^\]]*\])?/g, '\n'); // line breaks outside math/tables

  // 17. Remove remaining known no-arg commands
  md = md.replace(/\\(?:maketitle|tableofcontents|listoffigures|listoftables|printbibliography|bibliography\{[^}]*\})\b/g, '');

  // 18. Remove generic single-arg commands by extracting their content
  //     (keep the inner text, discard the command name)
  md = md.replace(/\\(?:mbox|hbox|vbox|fbox|framebox|colorbox|textrm|textsf|textmd|textup|textsl|textsc)\{([^}]*)\}/g, '$1');
  md = md.replace(/\\(?:color|textcolor)\{[^}]*\}\{([^}]*)\}/g, '$1');
  md = md.replace(/\\(?:href|url)\{[^}]*\}\{([^}]*)\}/g, '$1');
  md = md.replace(/\\url\{([^}]*)\}/g, '<$1>');

  // 19. Strip any remaining \begin{...} / \end{...} wrappers
  md = md.replace(/\\begin\{[^}]+\}(?:\[[^\]]*\])?(?:\{[^}]*\})*/g, '');
  md = md.replace(/\\end\{[^}]+\}/g, '');

  // 20. Strip remaining unknown single-arg commands (fallback: keep arg)
  md = md.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1');
  // Strip no-arg commands
  md = md.replace(/\\[a-zA-Z]+\b\*?/g, '');
  // Strip leftover lone backslashes followed by punctuation
  md = md.replace(/\\([^a-zA-Z\s])/g, '$1');

  // 21. Restore math, verbatim, and front matter
  mathPlaceholders.forEach((val, i) => { md = md.replace(`\x00MATH${i}\x00`, val); });
  verbatimPlaceholders.forEach((val, i) => { md = md.replace(`\x00VERB${i}\x00`, val); });
  md = md.replace('\x00FRONT\x00', frontMatter.trim());

  // 22. Final whitespace cleanup
  md = md.replace(/\n{3,}/g, '\n\n').trim();

  return md;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mergeInputFiles(tex: string, files: LatexFile[]): string {
  return tex.replace(/\\(?:input|include)\{([^}]+)\}/g, (_, name) => {
    const base = name.endsWith('.tex') ? name : name + '.tex';
    const found = files.find(
      (f) => f.name === base || f.name === name || f.name.endsWith('/' + base) || f.name.endsWith('/' + name)
    );
    return found ? found.content : `<!-- [input: ${name} not found] -->`;
  });
}

/** Strip all LaTeX commands from a string, leaving only the text content */
function stripLatexCommands(s: string): string {
  return s
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+\b/g, '')
    .replace(/[{}]/g, '')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────────────────────

function processTabularEnvironments(md: string): string {
  // Handle \begin{table}...\end{table} wrappers — extract caption then inner tabular
  md = md.replace(
    /\\begin\{table\*?\}([\s\S]*?)\\end\{table\*?\}/g,
    (_, inner) => {
      const captionM = inner.match(/\\caption\{([\s\S]*?)\}/);
      const caption = captionM ? stripLatexCommands(captionM[1]).trim() : '';
      // Remove caption / label from inner before passing to tabular converter
      const cleanInner = inner.replace(/\\caption\{[\s\S]*?\}/g, '').replace(/\\label\{[^}]+\}/g, '');
      const tableContent = processTabular(cleanInner);
      return (caption ? `\n*Table: ${caption}*\n` : '\n') + tableContent + '\n';
    }
  );

  // Standalone \begin{tabular}...\end{tabular}
  md = md.replace(
    /\\begin\{tabular\*?\}\{[^}]*\}([\s\S]*?)\\end\{tabular\*?\}/g,
    (_, inner) => '\n' + processTabular(inner) + '\n'
  );

  return md;
}

function processTabular(inner: string): string {
  // Split by \\ (row separator), keeping content
  const rawRows = inner.split(/\\\\(?:\[[^\]]*\])?/).map((r) => r.trim());

  const rows: string[][] = [];
  for (const rawRow of rawRows) {
    // Skip pure \hline rows
    const cleaned = rawRow.replace(/\\hline\b/g, '').trim();
    if (!cleaned) continue;
    // Split cells by &
    const cells = cleaned.split('&').map((c) => stripLatexCommands(c.trim()));
    if (cells.length === 0 || cells.every((c) => !c)) continue;
    rows.push(cells);
  }

  if (rows.length === 0) return '';

  const colCount = Math.max(...rows.map((r) => r.length));

  const pad = (cells: string[]) => {
    while (cells.length < colCount) cells.push('');
    return cells;
  };

  const header = pad(rows[0]);
  const separator = Array(colCount).fill('---');
  const body = rows.slice(1).map(pad);

  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Lists
// ─────────────────────────────────────────────────────────────────────────────

function processLists(md: string): string {
  // itemize → unordered
  md = md.replace(
    /\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g,
    (_, inner) => '\n' + convertItems(inner, '-') + '\n'
  );
  // enumerate → ordered
  md = md.replace(
    /\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g,
    (_, inner) => {
      let counter = 0;
      return '\n' + convertItems(inner, () => `${++counter}.`) + '\n';
    }
  );
  // description
  md = md.replace(
    /\\begin\{description\}([\s\S]*?)\\end\{description\}/g,
    (_, inner) => '\n' + convertDescriptionItems(inner) + '\n'
  );
  return md;
}

function convertItems(inner: string, bullet: string | (() => string)): string {
  // Split on \item (optionally with [...] label)
  const parts = inner.split(/\\item(?:\[[^\]]*\])?/).slice(1);
  return parts
    .map((p) => {
      const prefix = typeof bullet === 'function' ? bullet() : bullet;
      return `${prefix} ${p.trim().replace(/\n+/g, ' ')}`;
    })
    .join('\n');
}

function convertDescriptionItems(inner: string): string {
  const parts = inner.split(/\\item\[([^\]]*)\]/).slice(1);
  const result: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const term = parts[i].trim();
    const def = (parts[i + 1] || '').trim().replace(/\n+/g, ' ');
    result.push(`- **${term}**: ${def}`);
  }
  return result.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Text formatting (balanced-brace extraction for each command)
// ─────────────────────────────────────────────────────────────────────────────

function applyTextFormatting(md: string): string {
  const patterns: [RegExp, (inner: string) => string][] = [
    [/\\textbf\{/, (i) => `**${i}**`],
    [/\\textit\{/, (i) => `*${i}*`],
    [/\\emph\{/, (i) => `*${i}*`],
    [/\\underline\{/, (i) => `__${i}__`],
    [/\\texttt\{/, (i) => `\`${i}\``],
    [/\\textsc\{/, (i) => i.toUpperCase()],
    [/\\textsuperscript\{/, (i) => `^${i}^`],
    [/\\textsubscript\{/, (i) => `~${i}~`],
    [/\\text\{/, (i) => i],
  ];

  for (const [re, wrap] of patterns) {
    md = replaceWithBalancedBraces(md, re, wrap);
  }
  return md;
}

function replaceWithBalancedBraces(md: string, cmdRe: RegExp, wrap: (inner: string) => string): string {
  let result = '';
  let remaining = md;
  let match: RegExpExecArray | null;
  const re = new RegExp(cmdRe.source, 'g');

  while ((match = re.exec(remaining)) !== null) {
    result += remaining.slice(0, match.index);
    let depth = 1;
    let i = match.index + match[0].length; // start after the opening {
    let inner = '';
    while (i < remaining.length && depth > 0) {
      if (remaining[i] === '{') depth++;
      else if (remaining[i] === '}') { depth--; if (depth === 0) { i++; break; } }
      if (depth > 0) inner += remaining[i];
      i++;
    }
    result += wrap(inner);
    remaining = remaining.slice(i);
    re.lastIndex = 0; // restart on the remaining string
  }
  return result + remaining;
}
