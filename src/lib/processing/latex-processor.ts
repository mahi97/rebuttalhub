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

  // Find main .tex file
  const mainFile = files.find((f) => f.isMain) || files.find((f) => f.name.endsWith('.tex'));
  const mainTex = mainFile?.content || '';

  // Convert main LaTeX to markdown
  const markdown = convertLatexToMarkdown(mainTex);

  // Build file tree
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
        current.push({
          name,
          path: fullPath,
          type: 'file',
        });
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

function convertLatexToMarkdown(tex: string): string {
  let md = tex;

  // Remove preamble (everything before \begin{document})
  const docStart = md.indexOf('\\begin{document}');
  if (docStart !== -1) {
    md = md.slice(docStart + '\\begin{document}'.length);
  }
  const docEnd = md.indexOf('\\end{document}');
  if (docEnd !== -1) {
    md = md.slice(0, docEnd);
  }

  // Remove comments
  md = md.replace(/%.*$/gm, '');

  // Section headers
  md = md.replace(/\\section\*?\{([^}]+)\}/g, '\n## $1\n');
  md = md.replace(/\\subsection\*?\{([^}]+)\}/g, '\n### $1\n');
  md = md.replace(/\\subsubsection\*?\{([^}]+)\}/g, '\n#### $1\n');
  md = md.replace(/\\paragraph\*?\{([^}]+)\}/g, '\n**$1** ');

  // Title, author, abstract
  md = md.replace(/\\title\{([^}]+)\}/g, '# $1\n');
  md = md.replace(/\\author\{([^}]*)\}/g, '*$1*\n');
  md = md.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, '\n## Abstract\n\n$1\n');

  // Text formatting
  md = md.replace(/\\textbf\{([^}]+)\}/g, '**$1**');
  md = md.replace(/\\textit\{([^}]+)\}/g, '*$1*');
  md = md.replace(/\\emph\{([^}]+)\}/g, '*$1*');
  md = md.replace(/\\underline\{([^}]+)\}/g, '$1');
  md = md.replace(/\\texttt\{([^}]+)\}/g, '`$1`');
  md = md.replace(/\\text\{([^}]+)\}/g, '$1');

  // Citations and refs
  md = md.replace(/\\cite[pt]?\{([^}]+)\}/g, '[$1]');
  md = md.replace(/\\ref\{([^}]+)\}/g, '[Ref:$1]');
  md = md.replace(/\\eqref\{([^}]+)\}/g, '(Eq:$1)');
  md = md.replace(/\\label\{[^}]+\}/g, '');

  // Lists
  md = md.replace(/\\begin\{itemize\}/g, '');
  md = md.replace(/\\end\{itemize\}/g, '');
  md = md.replace(/\\begin\{enumerate\}/g, '');
  md = md.replace(/\\end\{enumerate\}/g, '');
  md = md.replace(/\\item\s*/g, '- ');

  // Equations
  md = md.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, '\n```math\n$1\n```\n');
  md = md.replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g, '\n```math\n$1\n```\n');
  md = md.replace(/\$\$([^$]+)\$\$/g, '\n```math\n$1\n```\n');
  md = md.replace(/\$([^$\n]+)\$/g, '`$1`');

  // Figures and tables (simplified)
  md = md.replace(/\\begin\{figure\*?\}[\s\S]*?\\caption\{([^}]+)\}[\s\S]*?\\end\{figure\*?\}/g, '\n*[Figure: $1]*\n');
  md = md.replace(/\\begin\{table\*?\}[\s\S]*?\\caption\{([^}]+)\}[\s\S]*?\\end\{table\*?\}/g, '\n*[Table: $1]*\n');
  md = md.replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}/g, '');

  // Footnotes
  md = md.replace(/\\footnote\{([^}]+)\}/g, ' (*$1*)');

  // Clean up remaining LaTeX commands
  md = md.replace(/\\(?:vspace|hspace|smallskip|medskip|bigskip|newpage|clearpage|maketitle)\*?\{?[^}]*\}?/g, '');
  md = md.replace(/\\begin\{[^}]+\}/g, '');
  md = md.replace(/\\end\{[^}]+\}/g, '');
  md = md.replace(/\\[a-zA-Z]+\{([^}]+)\}/g, '$1');

  // Special characters
  md = md.replace(/\\&/g, '&');
  md = md.replace(/\\\$/g, '$');
  md = md.replace(/\\%/g, '%');
  md = md.replace(/\\#/g, '#');
  md = md.replace(/\\_/g, '_');
  md = md.replace(/\\{/g, '{');
  md = md.replace(/\\}/g, '}');
  md = md.replace(/~/g, ' ');
  md = md.replace(/``/g, '"');
  md = md.replace(/''/g, '"');

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}
