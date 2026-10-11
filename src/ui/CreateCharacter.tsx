import { useMemo, useState } from 'react';
import { JOBS } from '../shared/data/jobs';
import { ITEMS } from '../shared/data/items';
import { CREATION_POINTS, CREATION_STAT_CAP, deriveStats } from '../shared/formulas';
import { STAT_HINT, STAT_KEYS, STAT_LABEL, type StatKey, type Stats } from '../shared/types';
import { useGame } from './useGame';

const START: Stats = { str: 9, agi: 9, vit: 9, int: 5, dex: 9, luk: 10 };

function spent(s: Stats) {
  return STAT_KEYS.reduce((sum, k) => sum + (s[k] - 1), 0);
}

export function CreateCharacter() {
  const game = useGame();
  const [name, setName] = useState('');
  const [stats, setStats] = useState<Stats>(normalize(START));
  const [error, setError] = useState<string | null>(null);
  const left = CREATION_POINTS - spent(stats);

  const preview = useMemo(
    () => deriveStats(stats, 1, JOBS.novice, ITEMS.training_knife.atk ?? 0, ITEMS.cotton_shirt.def ?? 0),
    [stats],
  );

  const bump = (k: StatKey, delta: number) => {
    setStats((s) => {
      const v = s[k] + delta;
      if (v < 1 || v > CREATION_STAT_CAP) return s;
      if (delta > 0 && CREATION_POINTS - spent(s) <= 0) return s;
      return { ...s, [k]: v };
    });
  };

  const randomize = () => {
    const s: Stats = { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 };
    let pts = CREATION_POINTS;
    while (pts > 0) {
      const k = STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)];
      if (s[k] < CREATION_STAT_CAP) {
        s[k]++;
        pts--;
      }
    }
    setStats(s);
  };

  const submit = () => {
    if (!name.trim()) return setError('ตั้งชื่อตัวละครก่อนนะ');
    const err = game.createCharacter(name, stats);
    setError(err);
  };

  return (
    <div className="create-backdrop">
      <div className="panel create">
        <div className="panel-title">สร้างตัวละคร · Novice</div>
        <div className="create-body">
          <label className="field">
            <span>ชื่อตัวละคร</span>
            <input
              autoFocus
              maxLength={16}
              value={name}
              placeholder="เช่น Pudthai"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>

          <div className="create-points">
            แต้มคงเหลือ <b className={left === 0 ? 'ok' : ''}>{left}</b> / {CREATION_POINTS}
            <span className="muted"> · แต่ละค่าสูงสุด {CREATION_STAT_CAP}</span>
          </div>

          <div className="create-grid">
            <div className="stat-list">
              {STAT_KEYS.map((k) => (
                <div className="stat-row" key={k}>
                  <span className="stat-key">{STAT_LABEL[k]}</span>
                  <button className="mini" onClick={() => bump(k, -1)} disabled={stats[k] <= 1}>
                    −
                  </button>
                  <span className="stat-val">{stats[k]}</span>
                  <button className="mini" onClick={() => bump(k, 1)} disabled={stats[k] >= CREATION_STAT_CAP || left <= 0}>
                    +
                  </button>
                  <span className="stat-hint">{STAT_HINT[k]}</span>
                </div>
              ))}
            </div>
            <div className="derived">
              <Row label="HP" value={preview.maxHp} />
              <Row label="SP" value={preview.maxSp} />
              <Row label="ATK" value={preview.atk} />
              <Row label="HIT" value={preview.hit} />
              <Row label="FLEE" value={preview.flee} />
              <Row label="CRIT" value={`${preview.crit}%`} />
              <Row label="ASPD" value={preview.aspd} />
            </div>
          </div>

          {error && <div className="error">{error}</div>}
          <div className="create-actions">
            <button onClick={randomize}>สุ่มแต้ม</button>
            <button className="primary" onClick={submit} disabled={left !== 0}>
              เริ่มผจญภัย
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="derived-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function normalize(s: Stats): Stats {
  // make sure the default preset spends exactly the creation points
  const out = { ...s };
  let diff = CREATION_POINTS - spent(out);
  let i = 0;
  while (diff !== 0 && i < 200) {
    const k = STAT_KEYS[i % STAT_KEYS.length];
    if (diff > 0 && out[k] < CREATION_STAT_CAP) {
      out[k]++;
      diff--;
    } else if (diff < 0 && out[k] > 1) {
      out[k]--;
      diff++;
    }
    i++;
  }
  return out;
}
