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
          {word.english && (() => {
            const defs = word.english.split(';').map(d => d.trim()).filter(Boolean);
            const primary = defs[0];
            const rest = defs.slice(1, 4).join('; ');
            return (
              <>
                <span className="font-medium text-brand-600">{primary}</span>
                {rest && <span className="text-warm-500 text-[10px]">{rest}</span>}
              </>
            );
          })()}
          <span className="text-warm-700">{word.pinyin}</span>
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
