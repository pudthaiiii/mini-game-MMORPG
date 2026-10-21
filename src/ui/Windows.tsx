import { useEffect, useState, type ReactNode } from 'react';
import { MONSTERS } from '../shared/data/monsters';
import { QUESTS } from '../shared/data/quests';
import { SKILLS } from '../shared/data/skills';
import { statCost } from '../shared/formulas';
import { canRaiseSkill, canRaiseStat, questReady, skillLevel } from '../shared/progression';
import { STAT_HINT, STAT_KEYS, STAT_LABEL } from '../shared/types';
import meteorStormIcon from './icons/meteor_storm.svg';
import stormGustIcon from './icons/storm_gust.svg';
import { useGame } from './useGame';

const AOE_ICONS: Record<string, string> = { storm_gust: stormGustIcon, meteor_storm: meteorStormIcon };

function Win({ title, onClose, className, children }: { title: string; onClose: () => void; className?: string; children: ReactNode }) {
  return (
    <div className={`panel window ${className ?? ''}`}>
      <div className="panel-title">
        {title}
        <button className="close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}

export function StatusWindow({ onClose }: { onClose: () => void }) {
  const game = useGame();
  const s = game.state!;
  const d = game.derived!;
  return (
    <Win title="สถานะ (Status)" onClose={onClose} className="status-window">
      <div className="status-grid">
        <div className="stat-list">
          {STAT_KEYS.map((k) => (
            <div className="stat-row" key={k} title={STAT_HINT[k]}>
              <span className="stat-key">{STAT_LABEL[k]}</span>
              <span className="stat-val">{s.stats[k]}</span>
              <button className="mini" disabled={!canRaiseStat(s, k)} onClick={() => game.raiseStat(k)}>
                +
              </button>
              <span className="stat-cost">{statCost(s.stats[k])}</span>
            </div>
          ))}
          <div className="points">
            แต้มสถานะ <b>{s.statPoints}</b>
          </div>
        </div>
        <div className="derived">
          <Row label="ATK" value={d.atk} />
          <Row label="MATK" value={d.matk} />
          <Row label="HIT" value={d.hit} />
          <Row label="FLEE" value={d.flee} />
          <Row label="CRIT" value={`${d.crit}%`} />
          <Row label="ASPD" value={`${d.aspd}`} />
          <Row label="ตี/วิ" value={d.attacksPerSec.toFixed(2)} />
          <Row label="DEF" value={`${d.def} + ${d.softDef}`} />
          <Row label="HP/SP" value={`${d.maxHp}/${d.maxSp}`} />
        </div>
      </div>
      <p className="note">ตัวเลขข้าง + คือแต้มที่ต้องใช้ ยิ่ง stat สูงยิ่งแพง · ได้แต้มเพิ่มทุก Base Lv</p>
    </Win>
  );
}

export function SkillWindow({ onClose }: { onClose: () => void }) {
  const game = useGame();
  const s = game.state!;
  const bt = SKILLS.basic_training;
  const lv = skillLevel(s, bt.id);
  return (
    <Win title="สกิล (Skill)" onClose={onClose} className="skill-window">
      <div className="skill-points">
        แต้มสกิล <b>{s.skillPoints}</b>
        <span className="muted"> · ได้ 1 แต้มทุก Job Lv</span>
      </div>
      <div className="skill-card">
        <div className="skill-head">
          <div>
            <div className="skill-name">{bt.nameTh}</div>
            <div className="muted">{bt.description}</div>
          </div>
          <div className="skill-lv">
            Lv <b>{lv}</b>/{bt.maxLevel}
            <button className="mini" disabled={!canRaiseSkill(s, bt.id)} onClick={() => game.raiseSkill(bt.id)}>
              +
            </button>
          </div>
        </div>
        <ol className="unlocks">
          {bt.unlocks!.map((u) => (
            <li key={u.level} className={lv >= u.level ? 'got' : ''}>
              <span className="u-lv">{u.level}</span>
              <span className="u-label">{u.label}</span>
              {u.phase > 0 && <span className="phase">Phase {u.phase}</span>}
            </li>
          ))}
        </ol>
      </div>
      {(['storm_gust', 'meteor_storm'] as const).map((id) => {
        const def = SKILLS[id];
        const lv2 = skillLevel(s, id);
        return (
          <div className="skill-card small" key={id}>
            <div className="skill-head">
              <img src={AOE_ICONS[id]} alt="" className="skill-icon" />
              <div>
                <div className="skill-name">
                  {def.nameTh} <span className="muted">· {def.spCost} SP · cd {def.cooldown}s</span>
                </div>
                <div className="muted">{def.description}</div>
              </div>
              <div className="skill-lv">
                Lv <b>{lv2}</b>/{def.maxLevel}
                <button className="mini" disabled={!canRaiseSkill(s, id)} onClick={() => game.raiseSkill(id)}>
                  +
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {(['first_aid', 'play_dead'] as const).map((id) => {
        const def = SKILLS[id];
        const learned = skillLevel(s, id) > 0;
        return (
          <div className={`skill-card small${learned ? '' : ' locked'}`} key={id}>
            <div className="skill-head">
              <div>
                <div className="skill-name">
                  {def.nameTh} <span className="muted">· {def.spCost} SP</span>
                </div>
                <div className="muted">{def.description}</div>
              </div>
              <div className="skill-lv">{learned ? <span className="ok">เรียนแล้ว</span> : <span className="muted">ได้จากเควสต์</span>}</div>
            </div>
          </div>
        );
      })}
    </Win>
  );
}

export function QuestWindow({ onClose }: { onClose: () => void }) {
  const game = useGame();
  const s = game.state!;
  const entries = Object.values(QUESTS);
  return (
    <Win title="เควสต์" onClose={onClose} className="quest-window">
      {entries.map((q) => {
        const p = s.quests[q.id];
        const npc = game.map.npcs.find((n) => n.id === q.npc)!;
        const status = !p ? 'ยังไม่รับ' : p.state === 'done' ? 'สำเร็จแล้ว' : questReady(s, q.id) ? 'กลับไปส่ง' : 'กำลังทำ';
        return (
          <div className={`quest ${p?.state ?? 'none'}`} key={q.id}>
            <div className="quest-head">
              <b>{q.nameTh}</b>
              <span className="quest-status">{status}</span>
            </div>
            <div className="muted">
              {npc.nameTh} · ปราบ {MONSTERS[q.kill.monster].nameTh} {p ? Math.min(p.count, q.kill.count) : 0}/{q.kill.count} · รางวัล:{' '}
              {SKILLS[q.rewardSkill].nameTh}
            </div>
          </div>
        );
      })}
      <div className="quest">
        <div className="quest-head">
          <b>เตรียมเปลี่ยนอาชีพ</b>
          <span className="quest-status">{game.readyForJobChange ? 'พร้อมแล้ว' : 'กำลังทำ'}</span>
        </div>
        <div className="muted">
          Job Lv {s.jobLevel}/{game.jobMaxLevel} · Basic Training {skillLevel(s, 'basic_training')}/9 · คุยกับผู้ดูแลอาชีพ
        </div>
      </div>
    </Win>
  );
}

export function HelpWindow({ onClose }: { onClose: () => void }) {
  const game = useGame();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Win title="วิธีเล่น" onClose={onClose} className="help-window">
      <ul className="help">
        <li>
          <b>คลิกซ้าย</b> ที่พื้นเพื่อเดิน (กดค้างเพื่อเดินตามเมาส์)
        </li>
        <li>
          <b>คลิกมอนสเตอร์</b> เดินเข้าไปตีอัตโนมัติจนตาย
        </li>
        <li>
          <b>คลิกขวาลาก</b> หรือ <kbd>←</kbd> <kbd>→</kbd> หมุนกล้อง · <b>ล้อเมาส์</b> หรือ <kbd>↑</kbd> <kbd>↓</kbd> ซูม
        </li>
        <li>
          <kbd>A</kbd> สถานะ · <kbd>S</kbd> สกิล · <kbd>Q</kbd> เควสต์ · <kbd>Esc</kbd> ปิดหน้าต่าง
        </li>
        <li>
          <kbd>1</kbd> ปฐมพยาบาล · <kbd>2</kbd> แกล้งตาย · <kbd>3</kbd> นั่งพัก · <kbd>4</kbd> อีโมต
        </li>
        <li>
          <kbd>5</kbd> Storm Gust · <kbd>6</kbd> Meteor Storm — ต้องลงแต้มสกิลก่อนที่หน้าต่างสกิล (กด S)
        </li>
        <li>
          เติม <code>?rate=10</code> หรือ <code>#x10</code> ท้ายลิงก์ แล้วรีโหลด เพื่อทดสอบด้วย EXP x10
        </li>
      </ul>
      <div className="help-map">
        <b>แผนที่ทุ่งฝึกหัด</b>
        <span>เหนือ: ม็อสบอล → มอดฝุ่น (ไกลขึ้นไป)</span>
        <span>ตะวันออก: ด้วงกรวด · ตะวันออกเฉียงเหนือ: ราชินีด้วงกรวด + ศิลาบันทึก</span>
        <span>ตะวันตกเฉียงใต้: ป่าจิ้งจกใบไม้ (ตีก่อน!)</span>
      </div>
      <button className="danger" onClick={() => (armed ? game.resetCharacter() : setArmed(true))}>
        {armed ? 'กดอีกครั้งเพื่อยืนยัน' : 'ลบตัวละครแล้วเริ่มใหม่'}
      </button>
    </Win>
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
