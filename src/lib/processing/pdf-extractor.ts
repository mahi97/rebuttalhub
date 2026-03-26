import pdf from 'pdf-parse';

export async function processPDF(fileBuffer: Buffer): Promise<{
  text: string;
  markdown: string;
  pageCount: number;
}> {
  const data = await pdf(fileBuffer);

  const text = data.text;
  const pageCount = data.numpages;

  // Convert extracted text to markdown
  const markdown = convertPdfTextToMarkdown(text);

  return { text, markdown, pageCount };
}

function convertPdfTextToMarkdown(text: string): string {
  const lines = text.split('\n');
  const mdLines: string[] = [];
  let inAbstract = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      mdLines.push('');
      continue;
    }

    // Detect section headers (all caps, short lines, common section names)
    const sectionPattern = /^(Abstract|Introduction|Related Work|Background|Method(?:ology)?|Approach|Experiments?|Results?|Discussion|Conclusion|Acknowledgments?|References|Appendix|Supplementary)/i;

    if (sectionPattern.test(line) && line.length < 80) {
      mdLines.push(`\n## ${titleCase(line)}\n`);
      if (line.toLowerCase() === 'abstract') inAbstract = true;
      else inAbstract = false;
      continue;
    }

    // Detect numbered section headers like "1 Introduction" or "1. Introduction"
    const numberedSection = line.match(/^(\d+\.?\s+)([A-Z][a-zA-Z\s]+)$/);
    if (numberedSection && line.length < 80) {
      mdLines.push(`\n## ${line}\n`);
      continue;
    }

    // Detect sub-section headers like "3.1 Setup"
    const subSection = line.match(/^(\d+\.\d+\.?\s+)([A-Z][a-zA-Z\s]+)$/);
    if (subSection && line.length < 80) {
      mdLines.push(`\n### ${line}\n`);
      continue;
    }

    // Regular paragraph text
    if (inAbstract) {
      mdLines.push(`*${line}*`);
    } else {
      mdLines.push(line);
    }
  }

  return mdLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
