import { useState } from "react";
import type { RankingEntry } from "../../types/rrg";
import { formatNum } from "../../utils/formatters";

interface RankingsTableProps {
  data: RankingEntry[];
  title?: string;
}

type SortKey = keyof Pick<RankingEntry, "rank" | "ratio" | "momentum" | "score">;

const quadrantColors: Record<string, string> = {
  Leading: "var(--success)",
  Weakening: "var(--warning)",
  Lagging: "var(--danger)",
  Improving: "var(--accent)",
};

export function RankingsTable({ data, title }: RankingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = [...data].sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    return (a[sortKey] - b[sortKey]) * mul;
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "rank");
    }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " \u25B2" : " \u25BC") : "";

  return (
    <div className="rankings-table-wrapper">
      {title && <h3 className="table-title">{title}</h3>}
      <table className="rankings-table">
        <thead>
          <tr>
            <th onClick={() => handleSort("rank")} className="sortable">
              #{arrow("rank")}
            </th>
            <th>Ticker</th>
            <th>Name</th>
            <th>Quadrant</th>
            <th onClick={() => handleSort("ratio")} className="sortable">
              Ratio{arrow("ratio")}
            </th>
            <th onClick={() => handleSort("momentum")} className="sortable">
              Momentum{arrow("momentum")}
            </th>
            <th onClick={() => handleSort("score")} className="sortable">
              Score{arrow("score")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => (
            <tr key={entry.ticker}>
              <td className="rank-cell">{entry.rank}</td>
              <td className="ticker-cell">{entry.ticker}</td>
              <td>{entry.name}</td>
              <td>
                <span
                  className="quadrant-badge"
                  style={{ color: quadrantColors[entry.quadrant] ?? "inherit" }}
                >
                  {entry.quadrant}
                </span>
              </td>
              <td className="num-cell">{formatNum(entry.ratio)}</td>
              <td className="num-cell">{formatNum(entry.momentum)}</td>
              <td className="num-cell">{formatNum(entry.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
