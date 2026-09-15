import { useEffect, useRef, useState } from 'react';

const COLORS = ['#166534', '#15803d', '#22c55e', '#d4af37', '#b8942b', '#0f766e'];

/**
 * Roleta VISUAL. A animação é apenas estética: o índice vencedor vem do
 * backend (props) e a roleta apenas para nele.
 */
export function Roulette({ names = [], targetIndex = null, spinKey = 0, onEnd }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const prevKey = useRef(null);
  const n = Math.max(1, names.length);
  const seg = 360 / n;

  useEffect(() => {
    if (spinKey === prevKey.current) return;
    prevKey.current = spinKey;
    if (targetIndex === null || targetIndex === undefined || names.length === 0) return;
    setSpinning(true);
    setRotation((prev) => {
      const currentMod = ((prev % 360) + 360) % 360;
      const desired = (360 - (targetIndex * seg + seg / 2)) % 360;
      const delta = 360 * 5 + ((desired - currentMod + 360) % 360);
      return prev + delta;
    });
  }, [spinKey, targetIndex, seg, names.length]);

  const gradient = names.length
    ? `conic-gradient(${names.map((_, i) => `${COLORS[i % COLORS.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ')})`
    : '#1f2937';

  return (
    <div className="roulette">
      <div className="roulette__pointer" />
      <div
        className="roulette__wheel"
        style={{ background: gradient, transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 4.2s cubic-bezier(.17,.67,.2,1)' : 'none' }}
        onTransitionEnd={() => {
          if (spinning) { setSpinning(false); onEnd?.(); }
        }}
      >
        {names.map((name, i) => (
          <span className="roulette__label" key={i} style={{ transform: `rotate(${i * seg + seg / 2}deg)` }}>{name}</span>
        ))}
      </div>
      <div className="roulette__hub">SORTEIO</div>
    </div>
  );
}
