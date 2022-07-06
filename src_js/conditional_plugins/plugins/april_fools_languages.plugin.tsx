/** @jsx JSXDom.h */
import * as JSXDom from 'jsx-dom';
import type { PluginDefinition } from '../types';
import { printEnablingURLToConsole } from '../utils/print_enabling_url_to_console';

const PLUGIN_ID = 'april_fools_languages';

let currentLanguage = 'english';

export function initialize(): PluginDefinition {
  return {
    id: PLUGIN_ID,
    plugin: AprilFoolsLanguagesPlugin,
    shouldRun: () => {
      const today = new Date();
      // Console message if we are *just* past the April Fools end-date.
      // After April 3 until April 13.
      if (
        today.getMonth() === 3 &&
        today.getDate() > 3 &&
        today.getDate() <= 13
      ) {
        printEnablingURLToConsole(
          PLUGIN_ID,
          "🤫 Psst... It's well past halloween, but you can re-enable halloween mode by clicking this url:",
        );
      }

      // Remember that months are 0-indexed in JS!
      return (
        (today.getMonth() === 2 && today.getDate() >= 29) || // March 29
        (today.getMonth() === 3 && today.getDate() <= 3) // April 3
      );
    },
  };
}

async function AprilFoolsLanguagesPlugin(): Promise<void> {
  insertLanguageToggleIfNeeded();
  insertDarkModeStylesIfNeeded();
  storeOriginalPageContentsIfNeeded();
}

///////////
//  UI  ///
///////////

function insertLanguageToggleIfNeeded() {
  const languageToggleId = 'primer-spec-april-fools-language-toggle';
  const existingLanguageToggle = document.querySelector(`#${languageToggleId}`);
  if (existingLanguageToggle) {
    return;
  }

  const settingsToggleContainer = document.querySelector(
    '.primer-spec-settings-toggle',
  );
  const settingsToggle = settingsToggleContainer?.querySelector(
    '.primer-spec-hoverable',
  );
  if (!settingsToggle || !settingsToggleContainer) {
    console.warn(
      'Primer Spec: April Fools Languages joke: Could not find settings toggle',
    );
    return;
  }

  const languageToggle = settingsToggle.cloneNode(true) as HTMLElement;
  languageToggle.id = languageToggleId;
  languageToggle.style.paddingRight = '1em';
  const languageIcon = languageToggle.querySelector('i.fa-cog');
  languageIcon?.classList.remove('fa-cog');
  languageIcon?.classList.add('fa-language');
  settingsToggleContainer.prepend(languageToggle);

  const languageToggleBtn = languageToggle.querySelector('button');
  languageToggleBtn?.addEventListener('click', () => toggleLanguagePopover());
}

const languagePopoverId = 'primer-spec-april-fools-language-popover';
function toggleLanguagePopover() {
  const existingPopover = document.querySelector(`#${languagePopoverId}`);
  if (existingPopover) {
    existingPopover.remove();
  } else {
    const topbar = document.querySelector('header.primer-spec-topbar');
    topbar?.appendChild(
      <div
        id={languagePopoverId}
        class="Popover position-absolute"
        style="right: 8em; pointer-events: auto;"
      >
        <div class="Popover-message Popover-message--right-top p-4 mr-2 Box color-shadow-large">
          <button
            class="btn-link position-absolute primer-spec-hoverable"
            style="top: 0.25em; right: 0.5em; font-size: 20px;"
            onClick={() => toggleLanguagePopover()}
          >
            <i class="fas fa-times" />
          </button>
          <h4 class="mb-2">Change this page's "language"</h4>
          <p>April Fools! Try reading this page in another "language".</p>
          <div style="margin-bottom: 100px">
            <details class="dropdown details-reset details-overlay d-inline-block">
              <summary class="btn" aria-haspopup="true">
                <span id={`${languagePopoverId}-chosen-language`}>
                  Choose language
                </span>
                <div class="dropdown-caret" />
              </summary>

              <ul class="dropdown-menu dropdown-menu-se">
                <li>{getLanguageButton('english', 'English')}</li>
                <li>{getLanguageButton('pig-latin', 'Pig Latin')}</li>
                <li>{getLanguageButton('pirate', 'Pirate')}</li>
              </ul>
            </details>
          </div>
        </div>
      </div>,
    );

    setCurrentLanguage('english');
  }
}

function getLanguageButton(id: string, label: string) {
  return (
    <button
      id={`${languagePopoverId}-${id}`}
      class="btn btn-link dropdown-item"
      onClick={() => {
        setCurrentLanguage(id);
      }}
    >
      {label}
    </button>
  );
}

const DARK_MODE_STYLE_ID = 'primer-spec-april-fools-languages-dark-mode-styles';
function insertDarkModeStylesIfNeeded() {
  if (!document.querySelector(`#${DARK_MODE_STYLE_ID}`)) {
    document.head.appendChild(
      <style>
        {':root[data-theme-mode="dark"] .Popover .dropdown {'}
        {'  filter: invert(93%) hue-rotate(180deg);'}
        {'}'}
        {':root[data-theme-mode="dark"] .Popover .dropdown .dropdown-item {'}
        {'  color: #24292e'}
        {'}'}
        {
          ':root[data-theme-mode="dark"] .Popover .dropdown .dropdown-item:hover {'
        }
        {'  color: #000;'}
        {'}'}
        {'.Popover {'}
        {'  color: var(--main-text-color)'}
        {'}'}
        {':root[data-theme-mode="dark"] .Popover-message {'}
        {'  background-color: var(--code-block-header-bg-color);'}
        {'  border: 1px solid #30363d;'}
        {'}'}
      </style>,
    );
  }
}

function setCurrentLanguage(languageId: string) {
  currentLanguage = languageId;
  changePageLanguage(languageId);

  const chosenLanguageLabel = document.querySelector(
    `#${languagePopoverId}-chosen-language`,
  );
  const chosenLanguageButton = document.querySelector(
    `#${languagePopoverId}-${currentLanguage}`,
  );
  if (chosenLanguageLabel && chosenLanguageButton) {
    chosenLanguageLabel.innerHTML = chosenLanguageButton.innerHTML;
  }

  // Close the dropdown
  document
    .querySelector('#primer-spec-april-fools-language-popover details.dropdown')
    ?.removeAttribute('open');
}

/////////////////////////////
//  LANGUAGE CHANGE INFRA  //
/////////////////////////////

let originalPageContents: string | null = null;

function storeOriginalPageContentsIfNeeded() {
  if (!originalPageContents) {
    const mainContent = document.querySelector(
      'main#primer-spec-preact-main-content',
    );
    originalPageContents = mainContent?.innerHTML ?? null;
  }
}

function changePageLanguage(languageId: string) {
  if (originalPageContents) {
    switch (languageId) {
      case 'english':
        setMainContentHTML(originalPageContents);
        break;
      case 'pig-latin':
        translateToPigLatin(originalPageContents);
        break;
      case 'pirate':
        break;
    }
  }
}

function setMainContentHTML(html: string) {
  const mainContent = document.querySelector(
    'main#primer-spec-preact-main-content',
  );
  if (!mainContent) {
    return;
  }
  mainContent.innerHTML = html;
}

////////////////////////////////
//  LANGUAGE IMPLEMENTATIONS  //
////////////////////////////////

function translateToPigLatin(originalHtml: string) {
  return originalHtml;
}