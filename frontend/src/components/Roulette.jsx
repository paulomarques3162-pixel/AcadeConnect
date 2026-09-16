import { useEffect, useRef, useState } from 'react';
import '../styles/sorteio.css';

// Paleta institucional (verde + dourado). Mantida curta para não poluir.
const COLORS = ['#14532d', '#166534', '#15803d', '#1f7a44', '#b8942b', '#d4af37'];

/**
 * Roleta VISUAL do sorteio.
 *
 * A animação é puramente estética: o ÍNDICE VENCEDOR vem do backend (prop
 * `targetIndex`) e a roleta apenas para nele. Nenhuma regra de sorteio é
 * decidida aqui — o resultado nunca é revelado antes do fim da animação.
 */
export function Roulette({ names = [], targetIndex = null, spinKey = 0, onEnd }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const prevKey = useRef(null);
  const endTimer = useRef(null);
  const ended = useRef(true);
  const n = Math.max(1, names.length);
  const seg = 360 / n;

  const finish = () => {
    if (ended.current) return;
    ended.current = true;
    if (endTimer.current) clearTimeout(endTimer.current);
    setSpinning(false);
    onEnd?.();
  };

  useEffect(() => {
    if (spinKey === prevKey.current) return;
    prevKey.current = spinKey;
    if (targetIndex === null || targetIndex === undefined || names.length === 0) return;

    ended.current = false;
    setSpinning(true);
    setRotation((prev) => {
      const currentMod = ((prev % 360) + 360) % 360;
      const desired = (360 - (targetIndex * seg + seg / 2)) % 360;
      const delta = 360 * 6 + ((desired - currentMod + 360) % 360);
      return prev + delta;
    });
    // Fallback: onTransitionEnd pode não disparar (aba em background, reduced
    // motion). Garantimos a revelação do vencedor mesmo assim.
    if (endTimer.current) clearTimeout(endTimer.current);
    endTimer.current = setTimeout(finish, 4600);
    return () => {
      if (endTimer.current) clearTimeout(endTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey, targetIndex, seg, names.length]);

  const gradient = names.length
    ? `conic-gradient(${names.map((_, i) => `${COLORS[i % COLORS.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ')})`
    : 'var(--surface-2)';

  return (
    <div className="raffle-wheel-wrap">
      <div className="raffle-wheel" role="img" aria-label={`Roleta com ${names.length} participante(s) elegível(is)`}>
        <div className="raffle-wheel__pointer" aria-hidden="true" />
        <div
          className="raffle-wheel__disc"
          style={{
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 4.2s cubic-bezier(.16,.72,.18,1)' : 'none',
          }}
          onTransitionEnd={finish}
        >
          {names.map((name, i) => (
            <span className="raffle-wheel__label" key={i} style={{ transform: `rotate(${i * seg + seg / 2}deg)` }}>
              {name}
            </span>
          ))}
        </div>
        <div className="raffle-wheel__hub" aria-hidden="true">{spinning ? '...' : 'SORTEIO'}</div>
      </div>
      <p className="raffle-wheel__spin-text" aria-live="polite">
        {spinning ? 'Sorteando…' : `${names.length} participante(s) na roleta`}
      </p>
    </div>
  );
}
