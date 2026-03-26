import * as cheerio from 'cheerio';

export interface ParsedPoint {
  section: 'Weakness' | 'Question' | 'Limitation' | 'Thank You' | 'Other';
  label: string; // "W1", "Q2", "L1", "Thank You"
  text: string;
  priority: string;
}

export interface ParsedReview {
  reviewer: string;
  rating: string | null;
  confidence: string | null;
  rawText: string;
  sections: Record<string, string>;
  strengths: string[]; // Extracted strength points for thank-you note
  points: ParsedPoint[];
}

export function parseOpenReviewHTML(html: string): ParsedReview[] {
  const $ = cheerio.load(html);
  const reviews: ParsedReview[] = [];

  $('div.note').each((_i, noteEl) => {
    const $note = $(noteEl);

    const invitationText = $note.find('.invitation').first().text().trim();
    if (!invitationText.includes('Official Review') && !invitationText.includes('Review')) {
      const headingText = $note.find('.heading h4 span').first().text().trim();
      if (!headingText.includes('Review')) return;
    }

    let reviewerName = $note.find('.signatures span').last().text().trim();
    if (!reviewerName) {
      const heading = $note.find('.heading h4 span').first().text().trim();
      const match = heading.match(/by\s+(Reviewer\s+\w+)/i);
      if (match) reviewerName = match[1];
    }
    if (!reviewerName) reviewerName = `Reviewer ${reviews.length + 1}`;

    const sections: Record<string, string> = {};
    let rating: string | null = null;
    let confidence: string | null = null;
    const rawTextParts: string[] = [];

    $note.find('strong.note-content-field').each((_j, fieldEl) => {
      const fieldName = $(fieldEl).text().replace(/:$/, '').trim();
      const $parent = $(fieldEl).parent();

      const scalarValue = $parent.find('span.note-content-value').first();
      const markdownValue = $parent.find('div.note-content-value.markdown-rendered').first();

      let value = '';
      if (markdownValue.length > 0) {
        value = markdownValue.html() || '';
      } else if (scalarValue.length > 0) {
        value = scalarValue.text().trim();
      }
      if (!value) return;

      const fieldLower = fieldName.toLowerCase();

      if (fieldLower.includes('overall') || fieldLower === 'rating' || fieldLower === 'recommendation') {
        rating = value;
      } else if (fieldLower === 'confidence') {
        confidence = value;
      } else if (
        fieldLower.includes('code of conduct') || fieldLower.includes('llm') ||
        fieldLower.includes('submission number') || fieldLower.includes('keywords') ||
        fieldLower.includes('primary area') || fieldLower.includes('abstract') ||
        fieldLower.includes('supplementary') || fieldLower.includes('ethics') ||
        fieldLower.includes('reciprocal') || fieldLower.includes('verify author') ||
        fieldLower.includes('proceedings')
      ) {
        return;
      } else {
        sections[fieldName] = value;
        rawTextParts.push(`## ${fieldName}\n${htmlToPlainText(value)}`);
      }
    });

    if (rawTextParts.length === 0 && Object.keys(sections).length === 0) return;

    const rawText = rawTextParts.join('\n\n');
    const { points, strengths } = extractStructuredPoints(sections);

    reviews.push({ reviewer: reviewerName, rating, confidence, rawText, sections, strengths, points });
  });

  if (reviews.length === 0) {
    return parseOpenReviewTextBased(html);
  }

  return reviews;
}

function htmlToPlainText(html: string): string {
  const temp = cheerio.load(`<div id="temp">${html}</div>`);
  return temp('#temp').text().trim();
}

/**
 * Extract structured W/Q/L points from review sections.
 * Strengths are collected separately for the thank-you note.
 */
function extractStructuredPoints(sections: Record<string, string>): {
  points: ParsedPoint[];
  strengths: string[];
} {
  const points: ParsedPoint[] = [];
  const strengths: string[] = [];
  let wCount = 0, qCount = 0, lCount = 0;

  for (const [sectionName, sectionHtml] of Object.entries(sections)) {
    const sectionLower = sectionName.toLowerCase();
    const $section = cheerio.load(`<div id="root">${sectionHtml}</div>`);
    const plainText = $section('#root').text().trim();

    // Determine what type of content this section contains
    const isStrengthSection = sectionLower.includes('strength') && !sectionLower.includes('weakness');
    const isWeaknessSection = sectionLower.includes('weakness') || sectionLower.includes('concern');
    const isQuestionSection = sectionLower.includes('question');
    const isLimitationSection = sectionLower.includes('limitation');
    const isCombined = sectionLower.includes('strength') && sectionLower.includes('weakness');

    if (isCombined) {
      // Combined "Strengths And Weaknesses" field - split by subsection headers
      let currentType: 'strength' | 'weakness' | 'question' | 'limitation' | 'other' = 'other';

      const elements = $section('#root').children().toArray();
      let currentItems: string[] = [];

      const flushItems = () => {
        for (const item of currentItems) {
          if (!item || item.length < 15) continue;
          if (currentType === 'strength') {
            strengths.push(item);
          } else if (currentType === 'weakness' || currentType === 'other') {
            wCount++;
            points.push({ section: 'Weakness', label: `W${wCount}`, text: item, priority: 'high' });
          } else if (currentType === 'question') {
            qCount++;
            points.push({ section: 'Question', label: `Q${qCount}`, text: item, priority: 'medium' });
          } else if (currentType === 'limitation') {
            lCount++;
            points.push({ section: 'Limitation', label: `L${lCount}`, text: item, priority: 'medium' });
          }
        }
        currentItems = [];
      };

      for (const el of elements) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tag = (el as any).name || '';
        const text = $section(el).text().trim();

        if (tag === 'h2' || tag === 'h3') {
          flushItems();
          const headerLower = text.toLowerCase();
          if (headerLower.includes('strength')) currentType = 'strength';
          else if (headerLower.includes('weakness') || headerLower.includes('concern')) currentType = 'weakness';
          else if (headerLower.includes('question')) currentType = 'question';
          else if (headerLower.includes('limitation') || headerLower.includes('minor')) currentType = 'limitation';
          else currentType = 'other';
          continue;
        }

        if (tag === 'ul' || tag === 'ol') {
          $section(el).children('li').each((_j, li) => {
            const liText = $section(li).text().trim();
            if (liText && liText.length > 15) currentItems.push(liText);
          });
        } else if (tag === 'p') {
          if (text && text.length > 20) currentItems.push(text);
        }
      }
      flushItems();
      continue;
    }

    // Single-type section
    const items = extractListItems($section, plainText);

    if (isStrengthSection) {
      for (const item of items) {
        if (item.length > 15) strengths.push(item);
      }
    } else if (isQuestionSection) {
      for (const item of items) {
        if (item.length > 15) {
          qCount++;
          points.push({ section: 'Question', label: `Q${qCount}`, text: item, priority: 'medium' });
        }
      }
    } else if (isLimitationSection) {
      for (const item of items) {
        if (item.length > 15) {
          lCount++;
          points.push({ section: 'Limitation', label: `L${lCount}`, text: item, priority: 'medium' });
        }
      }
    } else if (isWeaknessSection) {
      for (const item of items) {
        if (item.length > 15) {
          wCount++;
          points.push({ section: 'Weakness', label: `W${wCount}`, text: item, priority: 'high' });
        }
      }
    } else {
      // "Summary", "Soundness", etc. - skip or treat as weakness if substantive
      // Only extract if there are numbered/bulleted points suggesting actionable items
      for (const item of items) {
        if (item.length > 40 && /\b(should|could|lack|miss|unclear|confus|concern|issue|problem|limit)/i.test(item)) {
          wCount++;
          points.push({ section: 'Weakness', label: `W${wCount}`, text: item, priority: 'medium' });
        }
      }
    }
  }

  // If no points were extracted, try splitting raw text
  if (points.length === 0) {
    const allText = Object.values(sections).map(h => htmlToPlainText(h)).join('\n');
    const numbered = allText.split(/(?=\d+[\.\)]\s)/);
    for (const item of numbered) {
      const text = item.trim();
      if (text.length > 30) {
        wCount++;
        points.push({ section: 'Weakness', label: `W${wCount}`, text, priority: 'medium' });
      }
    }
  }

  return { points, strengths };
}

function extractListItems($section: cheerio.CheerioAPI, plainText: string): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  // Try list items first
  $section('li').each((_i, el) => {
    const text = $section(el).text().trim();
    if (text && text.length > 15 && !seen.has(text)) {
      seen.add(text);
      items.push(text);
    }
  });

  if (items.length > 0) return items;

  // Try paragraphs
  $section('p').each((_i, el) => {
    const text = $section(el).text().trim();
    if (text && text.length > 20 && !seen.has(text)) {
      seen.add(text);
      items.push(text);
    }
  });

  if (items.length > 0) return items;

  // Fallback: split by numbered patterns
  const numbered = plainText.split(/(?=\d+[\.\)]\s)/);
  for (const item of numbered) {
    const text = item.trim();
    if (text && text.length > 20 && !seen.has(text)) {
      seen.add(text);
      items.push(text);
    }
  }

  // Last resort: return the whole text as one item
  if (items.length === 0 && plainText.length > 30) {
    items.push(plainText);
  }

  return items;
}

function parseOpenReviewTextBased(html: string): ParsedReview[] {
  const $ = cheerio.load(html);
  const bodyText = $('body').text();
  const reviews: ParsedReview[] = [];
  const reviewBlocks = bodyText.split(/(?=Official Review.*?by\s+Reviewer\s+\w+)/i);

  for (const block of reviewBlocks) {
    if (block.length < 100) continue;
    const reviewerMatch = block.match(/by\s+(Reviewer\s+\w+)/i);
    if (!reviewerMatch) continue;

    const ratingMatch = block.match(/(?:Overall|Rating|Recommendation)[:\s]+(\d[^,\n]*)/i);
    const confidenceMatch = block.match(/Confidence[:\s]+(\d[^,\n]*)/i);

    reviews.push({
      reviewer: reviewerMatch[1],
      rating: ratingMatch?.[1]?.trim() || null,
      confidence: confidenceMatch?.[1]?.trim() || null,
      rawText: block.trim(),
      sections: { 'Full Review': block.trim() },
      strengths: [],
      points: [{ section: 'Weakness', label: 'W1', text: block.trim().slice(0, 500), priority: 'medium' }],
    });
  }

  return reviews;
}

export function openReviewHtmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];

  $('div.note').each((_i, noteEl) => {
    const $note = $(noteEl);
    const heading = $note.find('.heading h4 span').first().text().trim();
    if (!heading) return;

    const invitationText = $note.find('.invitation').first().text().trim();
    if (!invitationText.includes('Review')) return;

    parts.push(`# ${heading}\n`);

    const signatures = $note.find('.signatures').first().text().trim();
    const date = $note.find('.created-date').first().text().trim();
    if (signatures) parts.push(`**${signatures}** | ${date}\n`);

    $note.find('strong.note-content-field').each((_j, fieldEl) => {
      const fieldName = $(fieldEl).text().replace(/:$/, '').trim();
      const $parent = $(fieldEl).parent();

      const skipFields = ['code of conduct', 'llm', 'submission number', 'keywords',
        'primary area', 'abstract', 'supplementary', 'ethics', 'reciprocal',
        'verify author', 'proceedings'];
      if (skipFields.some(s => fieldName.toLowerCase().includes(s))) return;

      const markdownValue = $parent.find('div.markdown-rendered').first();
      const scalarValue = $parent.find('span.note-content-value').first();

      if (markdownValue.length > 0) {
        parts.push(`## ${fieldName}\n`);
        parts.push(htmlContentToMarkdown(markdownValue.html() || '') + '\n');
      } else if (scalarValue.length > 0) {
        parts.push(`**${fieldName}:** ${scalarValue.text().trim()}\n`);
      }
    });

    parts.push('\n---\n');
  });

  return parts.join('\n');
}

function htmlContentToMarkdown(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function processNode(el: any): string {
    if (el.type === 'text') {
      return el.data || '';
    }
    if (el.type !== 'tag') return '';

    const tag = el.name;
    const $el = $(el);
    const children = $el.contents().toArray().map(processNode).join('');

    switch (tag) {
      case 'h1': return `# ${children}\n\n`;
      case 'h2': return `## ${children}\n\n`;
      case 'h3': return `### ${children}\n\n`;
      case 'h4': return `#### ${children}\n\n`;
      case 'p': return `${children}\n\n`;
      case 'strong':
      case 'b': return `**${children}**`;
      case 'em':
      case 'i': return `*${children}*`;
      case 'code': return `\`${children}\``;
      case 'pre': return `\n\`\`\`\n${children}\n\`\`\`\n`;
      case 'ul': return `${children}\n`;
      case 'ol': return `${children}\n`;
      case 'li': {
        const parent = $el.parent();
        if (parent.is('ol')) {
          const idx = $el.index() + 1;
          return `${idx}. ${children.trim()}\n`;
        }
        return `- ${children.trim()}\n`;
      }
      case 'a': return `[${children}](${$el.attr('href') || ''})`;
      case 'br': return '\n';
      case 'hr': return '\n---\n';
      case 'blockquote': return `> ${children.trim()}\n\n`;
      default: return children;
    }
  }

  return $('#root').contents().toArray().map(processNode).join('').trim();
}
