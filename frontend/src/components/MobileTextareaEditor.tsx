import { useRef } from 'react';

interface MobileTextareaEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  minHeight?: number;
}

export function MobileTextareaEditor({
  value,
  onChange,
  readOnly = false,
  minHeight = 420,
}: MobileTextareaEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Tab') return;

    e.preventDefault();

    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const indent = '    ';

    const newValue = value.substring(0, start) + indent + value.substring(end);

    onChange(newValue);

    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + indent.length;
    });
  }

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      readOnly={readOnly}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      autoComplete="off"
      inputMode="text"
      wrap="off"
      aria-label="Code editor"
      className="w-full resize-y rounded-md border border-border/50 bg-slate-950 px-3 py-2 font-mono text-sm leading-6 text-slate-100 outline-none focus:ring-2 focus:ring-primary/50 whitespace-pre overflow-auto"
      style={{
        minHeight,
        tabSize: 4,
        ...(readOnly ? { opacity: 0.85, cursor: 'default' } : {}),
      }}
    />
  );
}
