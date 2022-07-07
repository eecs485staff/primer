/** @jsx JSXDom.h */
import { RefObject } from 'preact';
import * as JSXDom from 'jsx-dom';
import clsx from 'clsx';
import AnchorJS from 'anchor-js';
import slugify from '@sindresorhus/slugify';
import Config from '../../Config';
import { CodeblockVariant } from './types';

const CODEBLOCK_LINE_CLASS = 'primer-spec-code-block-line-code';
// We use the following class to ensure that we don't double-process code
// blocks.
const CODEBLOCK_PROCESSED_CLASS = 'primer-spec-code-block-processed';
// Since we want to linkify code block titles, this is the class used to
// identify them to AnchorJS.
const CODEBLOCK_TITLE_CLASS = 'primer-spec-code-block-title';
// We perform special handling for blocks in the `console` language: If a user
// clicks the line number, the entire line will be highlighted EXCLUDING the
// prompt (`$`) at the beginning, if it exists.
// See the special handling in `createCodeBlockLine()`.
const LANGUAGE_CONSOLE = 'console';

// We use this to keep track of click-then-drag on line numbers to select
// multiple lines simultaneously.
let mouseDownStartLine: number | null = null;

/**
 * A custom hook that enhances code blocks that are longer than two lines.
 * These enhancecd code blocks show line numbers, and can optionally highlight
 * lines.
 * @param mainElRef A ref to the `<main>` element from MainContent
 */
export default function useEnhancedCodeBlocks(
  mainElRef: RefObject<HTMLElement>,
): () => void {
  if (!mainElRef.current) {
    throw new Error(
      'Primer Spec: Main Content: Expected main content ref to be initialized.',
    );
  }

  // First enhance codeblocks formatted by Jekyll + Rouge
  const numCodeBlocks = enhanceBlocks(
    mainElRef.current.querySelectorAll('div.highlighter-rouge'),
    getCodeElFromJekyllRougeCodeblock,
    0,
  );
  // Then attempt to enhance ordinary <pre> blocks.
  enhanceBlocks(
    mainElRef.current.querySelectorAll('pre'),
    getCodeElFromPreCodeblock,
    numCodeBlocks,
  );

  return () => {};
}

function getCodeElFromJekyllRougeCodeblock(
  codeblock: HTMLElement,
): HTMLElement | null {
  // The original structure of a codeblock:
  // <div
  //   class="highlighter-rouge language-[lang]"
  //   data-highlight="[highlight-range]" {/* OPTIONAL */}
  //   data-variant="[legacy|enhanced]"   {/* OPTIONAL */}
  //   data-title="[title]"               {/* OPTIONAL */}
  // >
  //   <div class="highlight">
  //     <pre class="highlight">
  //       <code>
  //         [contents]
  //       </code>
  //     </pre>
  //   </div>
  // </div>
  //
  // Notice that `contents` is wrapped in a pre-formatted block. Hence, we will
  // use newlines in `contents` to demarcate lines, and we need to preserve
  // whitespace within the line.
  const codeEl =
    codeblock.firstElementChild?.firstElementChild?.firstElementChild;
  if (codeEl == null) {
    console.warn(
      'useEnhancedCodeBlocks: Code Block has malformed structure. See Primer Spec Docs for expected structure. https://github.com/eecs485staff/primer-spec/blob/main/docs/USAGE_ADVANCED.md#enhanced-code-blocks',
      'codeblock',
      codeblock,
    );
    return null;
  }

  return codeEl as HTMLElement;
}

function getCodeElFromPreCodeblock(codeblock: HTMLElement): HTMLElement | null {
  // The structure of a <pre> codeblock:
  // <pre>
  //   <code> <!-- OPTIONAL -->
  //     [contents]
  //   </code>
  // </pre>
  if (
    codeblock.childNodes.length === 1 &&
    codeblock.firstElementChild?.tagName === 'CODE'
  ) {
    return codeblock.firstElementChild as HTMLElement;
  }
  return codeblock;
}

/**
 * @param codeblocks Output from `.querySelectorAll()`
 * @param getContents A method that extracts a string with the codeblock contents given a codeblock element
 * @param startId The ID to use for the first enhanced code block
 */
function enhanceBlocks(
  codeblocks: NodeListOf<HTMLElement>,
  getCodeEl: (node: HTMLElement) => HTMLElement | null,
  startId = 0,
): number {
  let nextCodeBlockId = startId;

  [...codeblocks]
    .filter(
      (codeblock: HTMLElement) =>
        codeblock.querySelector(`.${CODEBLOCK_PROCESSED_CLASS}`) == null &&
        codeblock.closest(`.${CODEBLOCK_PROCESSED_CLASS}`) == null,
    )
    .forEach((codeblock) => {
      if (shouldRetainLegacyCodeBlock(codeblock)) {
        // We decided not to enhance this block. Mark it as processed.
        codeblock.classList.add(CODEBLOCK_PROCESSED_CLASS);
        return;
      }
      const codeblockNumericId = nextCodeBlockId++;

      const codeblockParent = codeblock.parentElement;
      if (!codeblockParent) {
        console.warn('useEnhanccedCodeBlocks: Codeblock missing parent');
        return;
      }

      const codeblockContentsEl = getCodeEl(codeblock);
      if (codeblockContentsEl == null) {
        return;
      }
      const codeblockContents = getCodeblockContents(codeblockContentsEl);

      const title = codeblock.dataset['title'] || null;
      const anchorId = title
        ? createCodeBlockAnchorId(codeblockNumericId, title)
        : null;

      const enhancedCodeBlock = createEnhancedCodeBlock({
        codeblockNumericId,
        rawContent: codeblockContents,
        language: getCodeBlockLanguage(codeblock),
        rawHighlightRanges: codeblock.dataset['highlight'] || null,
        title,
        anchorId,
        showLineNumbers:
          getCodeblockVariant(codeblock) !== CodeblockVariant.NO_LINE_NUMBERS,
      });
      if (!enhancedCodeBlock) {
        return;
      }

      // Clear the old code block and replace with the enhanced block
      codeblockParent.replaceChild(
        <div id={anchorId ?? undefined} class="primer-spec-code-block">
          {enhancedCodeBlock}
        </div>,
        codeblock,
      );
    });

  // We need to add anchors to Code Block titles if applicable
  new AnchorJS().add(`.${CODEBLOCK_TITLE_CLASS}`);

  return nextCodeBlockId;
}

function shouldRetainLegacyCodeBlock(codeblock: HTMLElement): boolean {
  // Don't mess with Mermaid blocks, they'll be handled by the Mermaid plugin.
  if (codeblock.querySelector('.language-mermaid') != null) {
    return true;
  }
  return getCodeblockVariant(codeblock) === CodeblockVariant.LEGACY;
}

function getCodeblockVariant(codeblock: HTMLElement): CodeblockVariant {
  const rawVariant = codeblock.dataset[
    'variant'
  ]?.toLowerCase() as CodeblockVariant | null;
  if (rawVariant && Object.values(CodeblockVariant).includes(rawVariant)) {
    return rawVariant as CodeblockVariant;
  }
  return Config.DEFAULT_CODEBLOCK_VARIANT;
}

function createEnhancedCodeBlock(options: {
  codeblockNumericId: number;
  rawContent: string;
  language: string | null;
  rawHighlightRanges: string | null;
  title?: string | null;
  anchorId?: string | null;
  showLineNumbers: boolean;
}): HTMLElement | null {
  const {
    codeblockNumericId,
    rawContent,
    language,
    rawHighlightRanges,
    title,
    anchorId,
    showLineNumbers,
  } = options;

  const lines = rawContent.split('\n');
  if (lines.length === 0) {
    console.warn('useEnhancedCodeBlocks: Code Block appears to have no lines!');
    return null;
  }
  const lastLine = lines[lines.length - 1];
  if (lastLine === '' || lastLine === '</span>') {
    lines.pop();
  }

  const highlightRanges = parseCodeHighlightRanges(
    rawHighlightRanges,
    lines.length,
  );

  const codeblockId = `primer-spec-code-block-${codeblockNumericId}`;

  const header = genCodeBlockHeader(title, anchorId);
  const enhancedCodeBlock = (
    <div id={codeblockId} class="Box mt-3 text-mono">
      {header}
      <div
        class={clsx(
          'Box-body',
          'p-0',
          'primer-spec-code-block-body',
          header && 'primer-spec-code-block-header-present',
        )}
      >
        <table class="highlight">
          {/* eslint-disable-next-line jsx-a11y/mouse-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
          <tbody
            onMouseOver={(e) => {
              if (mouseDownStartLine != null && e.target != null) {
                let el = e.target as HTMLElement | null;
                while (el && el.tagName !== 'TABLE') {
                  const match = el.id.match(
                    /^primer-spec-code-block-(?:\d+)-L(?:C|R)?(\d+)$/,
                  );
                  if (match && match[1] != null) {
                    selectLines(codeblockId, mouseDownStartLine, +match[1]);
                    break;
                  } else {
                    el = el.parentNode as HTMLElement;
                  }
                }
              }
            }}
            onMouseLeave={() => {
              mouseDownStartLine = null;
            }}
            onMouseUp={() => {
              mouseDownStartLine = null;
            }}
          >
            {lines.map((line, lineNumber) =>
              createCodeBlockLine({
                codeblockId,
                language,
                line,
                lineNumber: lineNumber + 1,
                shouldHighlight: highlightRanges.has(lineNumber + 1),
                showLineNumbers,
              }),
            )}
          </tbody>
        </table>
        {lines.length > 1 ? genCopyButton(codeblockId, language) : null}
      </div>
    </div>
  );
  return enhancedCodeBlock as HTMLElement;
}

function createCodeBlockLine(options: {
  codeblockId: string;
  language: string | null;
  line: string;
  lineNumber: number;
  shouldHighlight: boolean;
  showLineNumbers: boolean;
}): HTMLElement {
  const {
    codeblockId,
    language,
    line,
    lineNumber,
    shouldHighlight,
    showLineNumbers,
  } = options;

  const L_ID = `${codeblockId}-L${lineNumber}`;
  const LC_ID = `${codeblockId}-LC${lineNumber}`;
  const LR_ID = `${codeblockId}-LR${lineNumber}`;
  const codeblockLine = (
    <tr id={LR_ID}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <td
        id={L_ID}
        class={clsx(
          'primer-spec-code-block-line-number',
          showLineNumbers && 'primer-spec-code-block-line-numbers-shown',
        )}
        data-line-number={lineNumber}
        onMouseDown={(e) => {
          e.preventDefault();
          mouseDownStartLine = lineNumber;
          selectLines(codeblockId, mouseDownStartLine, mouseDownStartLine);
        }}
      />
      <td
        id={LC_ID}
        class={clsx(
          CODEBLOCK_LINE_CLASS,
          shouldHighlight && 'primer-spec-code-block-highlighted',
        )}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: line }}
      />
    </tr>
  ) as HTMLElement;

  // SPECIAL HANDLING for `console` blocks: When a user clicks the line number
  // to select the entire line, attempt to exclude the leading prompt
  // symbol (`$`).
  if (language === LANGUAGE_CONSOLE) {
    const codeLine = codeblockLine.querySelector(
      `.${CODEBLOCK_LINE_CLASS}`,
    ) as HTMLElement;
    const firstChild = codeLine.firstChild as HTMLElement | null;
    if (firstChild?.tagName === 'SPAN' && firstChild.classList.contains('gp')) {
      // This prompt needs to be excluded from selection.
      // (1) Remove the original LC_ID
      codeLine.id = '';
      // (2) Find children to exclude from selection. Do this by searching for
      //     the first child that is not of class `gp` (Generic::Prompt) or
      //     `w` (Whitespace)
      const children = [...codeLine.childNodes];
      const childrenToExcludeFromSelection = [];
      let i = 0;
      for (; i < children.length; ++i) {
        const child = children[i] as HTMLElement;
        if (
          'classList' in child &&
          (child.classList.contains('gp') || child.classList.contains('w'))
        ) {
          childrenToExcludeFromSelection.push(child);
        } else {
          break;
        }
      }
      const childrenToIncludeInSelection = children.slice(i);
      // (3) Wrap remaining children in a new <span> with id=LC_ID.
      codeLine.innerHTML = '';
      codeLine.appendChild(
        <span class="primer-spec-code-block-non-selectable">
          {childrenToExcludeFromSelection}
        </span>,
      );
      codeLine.appendChild(
        <span id={LC_ID}>{childrenToIncludeInSelection}</span>,
      );
    }
  }

  return codeblockLine;
}

function genCopyButton(codeblockId: string, language: string | null) {
  return (
    <div class="primer-spec-zeroclipboard-container position-absolute top-0 right-0">
      <button
        type="button"
        class="btn-octicon no-print m-2 p-2 tooltipped tooltipped-no-delay tooltipped-n"
        tabIndex={0}
        aria-label={
          language === LANGUAGE_CONSOLE ? 'Copy all commands' : 'Copy'
        }
        onClick={async (e) => {
          const codeblock = document.getElementById(codeblockId);
          if (codeblock) {
            // (1) Copy the lines to the clipboard
            await copyLines(
              codeblock,
              language === LANGUAGE_CONSOLE
                ? CONSOLE_COPY_LINES_MAP_FN
                : DEFAULT_COPY_LINES_MAP_FN,
            );

            // (2) Fetch the copy-button
            let btn = e.target as HTMLElement | null;
            if (btn?.tagName === 'I') {
              btn = btn.parentElement;
            }
            if (!btn) {
              return;
            }

            // (3) Temporarily change the label and icon of the button
            const originalLabel = btn.getAttribute('aria-label');
            btn.setAttribute('aria-label', 'Copied!');
            const originalIcon = btn.firstChild;
            if (!originalIcon) {
              return;
            }
            btn.innerText = '';
            btn.appendChild(<i class="fas fa-check" />);
            setTimeout(() => {
              if (!btn) {
                return;
              }
              btn.setAttribute('aria-label', originalLabel || '');
              btn.blur();
              btn.innerText = '';
              btn.appendChild(originalIcon);
            }, 2000);
          }
        }}
      >
        <i class="far fa-copy" />
      </button>
    </div>
  );
}

const DEFAULT_COPY_LINES_MAP_FN = (line: HTMLElement) => line.innerText;
const CONSOLE_COPY_LINES_MAP_FN = (
  line: HTMLElement,
  lineNumber: number,
  codeblock: HTMLElement,
) => {
  // (1) Skip console output lines
  // (Class name 'go' refers to the Rouge class `Generic::Output`.)
  const outputText = line.querySelector('.go');
  if (outputText) {
    return null;
  }
  // (2) If there's a console prompt, skip it
  const LC_ID = `${codeblock.id}-LC${lineNumber}`;
  const lineText = line.querySelector(`#${LC_ID}`) as HTMLElement | null;
  return lineText?.innerText;
};
/**
 * Copy the text of a codeblock into the clipboard. Optionally accepts a custom
 * map/filter method to extract text from each line.
 *
 * @param codeblock The codeblock whose lines need to be copied
 * @param mapFn (OPTIONAL) A method that extracts text from a given line HTMLElement
 */
async function copyLines(
  codeblock: HTMLElement,
  mapFn: (
    line: HTMLElement,
    lineNumber: number,
    codeblock: HTMLElement,
  ) => string | null | void = DEFAULT_COPY_LINES_MAP_FN,
) {
  const lines = codeblock.querySelectorAll(
    `.${CODEBLOCK_LINE_CLASS}`,
  ) as NodeListOf<HTMLElement>;
  const linesOfText = [...lines]
    .map((line, i) => mapFn(line, i + 1, codeblock))
    .filter(Boolean);
  const text = linesOfText.join('\n');
  await navigator.clipboard.writeText(text);
}

function genCodeBlockHeader(title?: string | null, anchorId?: string | null) {
  if (title == null) {
    return null;
  }
  return (
    <div class="Box-header py-2 pr-2 d-flex flex-shrink-0 flex-md-row flex-items-center primer-spec-code-block-header">
      <span
        class={clsx('flex-auto', CODEBLOCK_TITLE_CLASS)}
        data-anchor-id={anchorId}
      >
        {title}
      </span>
    </div>
  );
}

/***********/
/** UTILS **/
/***********/

/**
 * Given an element, return the codeblock's language (if present) if the
 * element's `classList` contains a class of the form `language-[language]`.
 */
function getCodeBlockLanguage(codeblockSrc: Element): string | null {
  for (const className of codeblockSrc.classList) {
    if (className.startsWith('language-')) {
      return className.replace('language-', '');
    }
  }
  return null;
}

/**
 * Parse a string reprenting a list of line numbers, some of which may be
 * ranges. The parsed output is a Set of line numbers that are included in the
 * range.
 *
 * For instance, the string `'13, 24-26, 25-27'` is parsed as
 * `Set([13, 24, 25, 26, 27])`
 *
 * @param rawHighlightRanges A comma-separated string representing ranges
 * @param maxLineNumber The maximum valid line number
 */
export function parseCodeHighlightRanges(
  rawHighlightRanges: string | null,
  maxLineNumber: number,
): Set<number> {
  const highlightedLines = new Set<number>();
  if (!rawHighlightRanges) {
    return highlightedLines;
  }

  const ranges = rawHighlightRanges.split(',');
  ranges.forEach((range) => {
    // First check if it's a single number
    const potentialLineNum = +range;
    if (isNumWithinInclusiveRange(potentialLineNum, 1, maxLineNumber)) {
      highlightedLines.add(potentialLineNum);
    } else {
      const rangeParts = range.trim().split('-');
      if (rangeParts.length === 2) {
        const lower = +rangeParts[0];
        const upper = +rangeParts[1];
        if (
          isNumWithinInclusiveRange(lower, 1, maxLineNumber) &&
          isNumWithinInclusiveRange(upper, 1, maxLineNumber) &&
          lower <= upper
        ) {
          for (let i = lower; i <= upper; ++i) {
            highlightedLines.add(i);
          }
        }
      }
    }
  });
  return highlightedLines;
}

/**
 * Return a boolean indicating whether `num` is in the range [`lower`, `upper`]
 * (inclusive).
 */
function isNumWithinInclusiveRange(
  num: number | null,
  lower: number,
  upper: number,
): boolean {
  return num != null && !Number.isNaN(num) && num >= lower && num <= upper;
}

/**
 * Using the Selection API, select all content between `startLine_` and
 * `endLine_` for the codeblock identified by `codeblockId`.
 */
function selectLines(
  codeblockId: string,
  startLine_: number,
  endLine_: number,
) {
  let startLine = startLine_;
  let endLine = endLine_;
  if (startLine > endLine) {
    // The range is inverted (for example, start selecting from line 4 to
    // line 2).
    startLine = endLine_;
    endLine = startLine_;
  }
  const startNode = document.getElementById(`${codeblockId}-LC${startLine}`);
  const endNode = document.getElementById(`${codeblockId}-LC${endLine}`);
  if (!startNode || !endNode) {
    console.error(
      'Primer Spec Code Block: selectLines: start or end nodes are null. Please report this issue on https://github.com/eecs485staff/primer-spec/issues. Thanks!',
    );
    return;
  }

  const range = document.createRange();
  range.setStart(startNode, 0);
  range.setEnd(endNode, endNode.childNodes.length);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

function createCodeBlockAnchorId(
  codeblockNumericId: number,
  title: string,
): string {
  return `${slugify(title)}-${codeblockNumericId}`;
}

/**
 * Given a codeblock / pre element, return a string reprensenting the HTML of
 * the codeblock.
 *
 * One edge case that this method handles: Lines split within a single span.
 * Consider the following codeblock (observe lines 3-4):
 * ```html
 *   <code><span class="c">Line 1</span>
 *   <span class="c">Line 2</span>
 *   <span class="c">Line 3
 *   Line 4</span></code>
 * ```
 * Since the rest of the code assumes that "\n" characters separate lines, we
 * need to ensure that each line starts with its own span if necessary. The
 * output of this method should be:
 * ```html
 *   <code><span class="c">Line 1</span>
 *   <span class="c">Line 2</span>
 *   <span class="c">Line 3</span>
 *   <span class="c">Line 4</span></code>
 * ```
 */
function getCodeblockContents(codeEl: HTMLElement): string {
  const resultNode = codeEl.cloneNode() as HTMLElement;
  codeEl.childNodes.forEach((childNode) => {
    if (childNode.nodeType === Node.ELEMENT_NODE) {
      if (
        (childNode as HTMLElement).tagName === 'SPAN' &&
        childNode.textContent != null
      ) {
        const lines = childNode.textContent.split('\n');
        lines.forEach((line, i) => {
          // Ignore empty lines within a span, but still insert the \n.
          if (line) {
            const lineEl = childNode.cloneNode() as HTMLElement;
            lineEl.textContent = line;
            resultNode.appendChild(lineEl);
          }
          // Append a new line except after the last line in this span
          if (i < lines.length - 1) {
            resultNode.appendChild(document.createTextNode('\n'));
          }
        });
      }
    } else {
      resultNode.appendChild(childNode.cloneNode(true));
    }
  });
  return resultNode.innerHTML;
}
