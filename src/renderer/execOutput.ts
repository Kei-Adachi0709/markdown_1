import type { ExecutionResult } from '@common/ipc.js';
import { createExecId } from '@common/crypto.js';

export interface CodeBlockPosition {
  start: number;
  end: number;
  lang: string;
  fence: string;
  codeRaw: string;
  codeForHash: string;
}

export type CodeBlockMap = Map<string, CodeBlockPosition>;

export interface ExecOutputUpdate {
  execId: string;
  result: ExecutionResult;
  output: string;
}

/** Build a lookup table of code blocks keyed by their execution id. */
/** Parse the Markdown source and index code fences by their execution id. */
export async function buildCodeBlockMap(markdown: string): Promise<CodeBlockMap> {
  const map: CodeBlockMap = new Map();
  const blocks = parseCodeBlocks(markdown);
  for (const block of blocks) {
    const execId = await createExecId(block.lang, block.codeForHash);
    map.set(execId, block);
  }
  return map;
}

/**
 * Insert or replace the execution result block corresponding to the provided execution id.
 */
/**
 * Insert or replace the execution result block corresponding to the provided execution id.
 */
export function updateMarkdownWithExecution(
  markdown: string,
  update: ExecOutputUpdate,
  blockMap: CodeBlockMap,
): string {
  const block = blockMap.get(update.execId);
  if (!block) {
    return markdown;
  }

  const newline = detectDominantNewline(markdown);
  const before = markdown.slice(0, block.end);
  let after = markdown.slice(block.end);

  const existingPattern = new RegExp(
    `^\s*<!--\s*exec-output:start id=${escapeRegExp(update.execId)}\s*-->[\s\S]*?<!--\s*exec-output:end\s*-->\s*`,
  );
  const existingMatch = after.match(existingPattern);
  if (existingMatch) {
    after = after.slice(existingMatch[0].length);
  }

  const needsLeadingNewline = before.length > 0 && !/[\r\n]$/.test(before);
  const needsTrailingNewline = after.length > 0 && !after.startsWith('\n') && !after.startsWith('\r');
  const resultBlock = buildResultBlock(update);
  const formattedResultBlock =
    newline === '\n' ? resultBlock : resultBlock.replace(/(?<!\r)\n/g, '\r\n');

  let insertion = `${needsLeadingNewline ? newline : ''}${formattedResultBlock}`;
  if (needsTrailingNewline) {
    insertion += newline;
  }

  return `${before}${insertion}${after}`;
}

/** Render the fenced output segment including metadata comments and header. */
function buildResultBlock(update: ExecOutputUpdate): string {
  const header = formatHeader(update.result);
  const combined = header ? `${header}${update.output.length > 0 ? '\n' : ''}${update.output}` : update.output;
  const fence = computeFence(combined);
  const markerStart = `<!-- exec-output:start id=${update.execId} -->`;
  const markerEnd = '<!-- exec-output:end -->';
  const fencedBody = combined.length > 0 ? `${fence}text\n${combined}\n${fence}` : `${fence}text\n${fence}`;
  return `${markerStart}\n${fencedBody}\n${markerEnd}`;
}

function formatHeader(result: ExecutionResult): string {
  const exitCode = result.exitCode ?? 'N/A';
  return `exitCode: ${exitCode} status: ${result.status}`;
}

function computeFence(body: string): string {
  const ticks = body.match(/`+/g);
  const maxTicks = ticks ? Math.max(...ticks.map(t => t.length)) : 0;
  const length = Math.max(3, maxTicks + 1);
  return '`'.repeat(length);
}

function detectDominantNewline(text: string): string {
  const crlfCount = (text.match(/\r\n/g) ?? []).length;
  const lfCount = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlfCount > lfCount ? '\r\n' : '\n';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCodeBlocks(markdown: string): CodeBlockPosition[] {
  const blocks: CodeBlockPosition[] = [];
  const fenceRegex = /(^|\r?\n)(`{3,})([^\r\n]*)\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(markdown)) !== null) {
    const fence = match[2];
  const info = match[3]?.trim() ?? '';
  const lang = normalizeLanguageId(info);
    const contentStart = fenceRegex.lastIndex;
    const closingRegex = new RegExp(`\r?\n${fence}(?=[ \t]*\r?\n|[ \t]*$)`, 'g');
    closingRegex.lastIndex = contentStart;
    const closingMatch = closingRegex.exec(markdown);

    if (!closingMatch) {
      break;
    }

    const closingIndex = closingMatch.index;
    const codeRaw = markdown.slice(contentStart, closingIndex);
    const closingLength = closingMatch[0].length;
    const codeForHash = normalizeLineEndings(codeRaw);
    let blockEnd = closingIndex + closingLength;

    // Include any trailing whitespace on the closing fence line.
    while (blockEnd < markdown.length && /[ \t]/.test(markdown[blockEnd])) {
      blockEnd += 1;
    }
    if (markdown[blockEnd] === '\n' || markdown[blockEnd] === '\r') {
      blockEnd += 1;
      if (markdown[blockEnd] === '\n') {
        blockEnd += 1;
      }
    }

    blocks.push({
      start: match.index + match[1].length,
      end: blockEnd,
      lang,
      fence,
      codeRaw,
      codeForHash,
    });

    fenceRegex.lastIndex = blockEnd;
  }

  return blocks;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

export function normalizeLanguageId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return 'plaintext';
  }
  return trimmed.split(/\s+/)[0];
}
