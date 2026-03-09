import { X, GitCompareArrows } from "lucide-react";
import { useCompare } from "../../hooks/useCompare";
import { getTickerColor } from "../../utils/colors";

interface CompareBarProps {
  onCompare: () => void;
}

export function CompareBar({ onCompare }: CompareBarProps) {
  const { selected, remove, clear } = useCompare();

  if (selected.length === 0) return null;

  return (
    <div className="compare-bar">
      <div className="compare-bar-chips">
        {selected.map((symbol) => (
          <span key={symbol} className="compare-bar-chip">
            <span className="ticker-dot" style={{ background: getTickerColor(symbol) }} />
            {symbol}
            <button className="compare-bar-chip-remove" onClick={() => remove(symbol)}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      <div className="compare-bar-actions">
        <button className="compare-bar-clear" onClick={clear}>Clear</button>
        <button
          className="compare-bar-btn"
          onClick={onCompare}
          disabled={selected.length < 2}
        >
          <GitCompareArrows size={15} />
          Compare ({selected.length})
        </button>
      </div>
    </div>
  );
}
