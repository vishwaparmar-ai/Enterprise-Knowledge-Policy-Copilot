import ReactMarkdown, { type Components } from "react-markdown";

// Renders the LLM's Markdown (bold, lists, links...) with the app's styling.
// react-markdown does not render raw HTML, so model output can't inject markup.
const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-2 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 marker:text-muted">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h3 className="mb-2 mt-4 text-[15.5px] font-semibold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-4 text-[15.5px] font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-2 mt-3 text-[14.5px] font-semibold first:mt-0">{children}</h4>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline underline-offset-2 hover:text-brand-dark">{children}</a>
  ),
  code: ({ children }) => <code className="rounded bg-slate-100 px-1 py-0.5 text-[13px]">{children}</code>,
  blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-line pl-3 text-slate-600">{children}</blockquote>,
  hr: () => <hr className="my-4 border-line" />,
};

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="text-[14.5px] leading-relaxed">
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  );
}