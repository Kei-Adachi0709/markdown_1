import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  highlight(code: string, lang: string) {
    const language = lang?.trim().toLowerCase();
    if (language && hljs.getLanguage(language)) {
      const { value } = hljs.highlight(code, { language });
      return value;
    }
    return MarkdownIt.utils.escapeHtml(code);
  },
});

export function renderMarkdown(source: string): string {
  return markdown.render(source);
}
