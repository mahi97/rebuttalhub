export const PARSE_REVIEWS_SYSTEM = `You are an expert at extracting structured review data from academic peer review pages. You must return valid JSON only.`;

export function parseReviewsPrompt(htmlText: string): string {
  return `Extract all individual reviewer comments from this OpenReview page content. For each review identify:
- Reviewer name/ID
- Rating and confidence
- Each individual point categorized as: Strength, Weakness, Question, Suggestion, Minor Issue
- Priority: critical (fundamental flaw), high (weakness), medium (question/suggestion), low (minor/strength)

Return ONLY valid JSON in this format:
[{"reviewer": "Reviewer ABC", "rating": "5", "confidence": "3", "points": [{"section": "Weakness", "text": "The paper lacks...", "priority": "high"}]}]

Content:
${htmlText.slice(0, 50000)}`;
}

export const DRAFT_RESPONSE_SYSTEM = `You are an expert academic author writing a rebuttal to peer reviewers. Be professional, specific, and constructive. Write concise responses under 200 words.`;

export function draftResponsePrompt(
  paperContext: string,
  sectionName: string,
  pointText: string
): string {
  return `Draft a rebuttal response to this reviewer point.

Paper context: ${paperContext.slice(0, 3000)}

Reviewer section: ${sectionName}
Reviewer comment: "${pointText}"

Guidelines:
- Acknowledge the reviewer's concern respectfully
- Address the specific issue directly
- Reference concrete evidence, experiments, or revisions you will make
- If the reviewer is mistaken, politely clarify with evidence
- Keep under 200 words
- Use professional academic tone`;
}

export const IMPROVE_DRAFT_SYSTEM = `You are editing an academic rebuttal response. Improve clarity, strengthen arguments, and maintain professional tone.`;

export function improveDraftPrompt(pointText: string, currentDraft: string): string {
  return `Improve this draft rebuttal response:

Original reviewer comment: "${pointText}"
Current draft: "${currentDraft}"

Make it more concise, professional, and compelling. Fix any grammatical issues. Keep the same key arguments but strengthen them.`;
}

export const SUMMARIZE_SYSTEM = `Summarize this peer review in 2-3 sentences, highlighting the main concerns and overall sentiment.`;

export function summarizePrompt(reviewText: string): string {
  return reviewText.slice(0, 10000);
}

export const COMPILE_REBUTTAL_SYSTEM = `You are compiling individual rebuttal responses into a polished, submission-ready rebuttal document. Be concise and professional.`;

export function compileRebuttalPrompt(
  responses: { reviewer: string; section: string; point: string; response: string }[],
  charLimit: number
): string {
  return `Compile these responses into a complete rebuttal document.

Character limit: ${charLimit} characters (STRICT - the submission system will reject longer responses)

Responses by reviewer:
${JSON.stringify(responses, null, 2)}

Format:
- Clear header for each reviewer
- Number each response matching the reviewer's points
- Professional transitions between responses
- If over the character limit, condense while preserving all key arguments
- End with a brief summary of all changes/revisions promised

Output format: Markdown`;
}

export const REDUCE_LENGTH_SYSTEM = `You are condensing an academic rebuttal to meet a strict character limit. Preserve all key arguments and evidence while removing redundancy.`;

export function reduceLengthPrompt(
  rebuttalText: string,
  charLimit: number
): string {
  const currentLength = rebuttalText.length;
  const overage = currentLength - charLimit;
  return `Current rebuttal (${currentLength} chars) exceeds the ${charLimit} char limit by ${overage} characters.

Current text:
${rebuttalText}

Condense to under ${charLimit} characters. Prioritize:
1. Keep all key counter-arguments
2. Keep all promises of new experiments/revisions
3. Remove pleasantries and redundant thank-yous
4. Shorten transitions
5. Combine similar points across reviewers`;
}
