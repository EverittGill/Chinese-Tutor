import { useRef, useEffect } from 'react';

function getPronColor(pronScore) {
  if (pronScore == null) return '';
  if (pronScore >= 80) return 'pron-good';
  if (pronScore >= 60) return 'pron-ok';
  return 'pron-bad';
}

export default function ClickableWord({ word, isActive, onTap, displayMode, pronScore }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!isActive) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onTap(null);
      }
    }
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isActive, onTap]);

  const pronClass = getPronColor(pronScore);

  return (
    <span ref={ref} className={`clickable-word ${pronClass}`} onClick={() => onTap(isActive ? null : word)}>
      {displayMode >= 1 ? (
        <ruby>
          {word.chinese}
          <rp>(</rp><rt className="text-brand-600">{word.pinyin}</rt><rp>)</rp>
        </ruby>
      ) : (
        word.chinese
      )}
      {isActive && (
        <span className="word-popover">
          <span className="font-medium text-brand-600">{word.pinyin}</span>
          <span className="text-warm-700">{word.english}</span>
          {pronScore != null && (
            <span className={`text-xs ${pronScore >= 80 ? 'text-green-700' : pronScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
              {pronScore}/100
            </span>
          )}
        </span>
      )}
    </span>
  );
}
