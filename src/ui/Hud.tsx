import { useEffect, useRef, useState } from 'react';
import { SKILLS } from '../shared/data/skills';
import { skillLevel } from '../shared/progression';
import { useGame } from './useGame';

export type WindowId = 'status' | 'skills' | 'quests' | 'help';

export function Bar({ value, max, kind, text }: { value: number; max: number; kind: string; text?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  return (
    <div className={`hud-bar hud-${kind}${kind === 'hp' && pct < 25 ? ' low' : ''}`}>
      <div className="fill" style={{ width: `${pct}%` }} />
      <span>{text ?? `${value} / ${max}`}</span>
    </div>
  );
}

export function BasicInfo({ open, toggle }: { open: Record<WindowId, boolean>; toggle: (w: WindowId) => void }) {
  const game = useGame();
  const s = game.state!;
  const d = game.derived!;
  const jobMax = s.jobLevel >= game.jobMaxLevel;
  const basePct = ((s.baseExp / game.baseToNext) * 100).toFixed(1);
  const jobPct = jobMax ? 'MAX' : `${((s.jobExp / game.jobToNext) * 100).toFixed(1)}%`;
  return (
    <div className="panel basic-info">
      <div className="bi-head">
        <div>
          <div className="bi-name">{s.name}</div>
          <div className="bi-job">Novice{game.readyForJobChange && <span className="tag">พร้อมเปลี่ยนอาชีพ</span>}</div>
        </div>
        <div className="bi-levels">
          <div>
            Base Lv <b>{s.baseLevel}</b>
          </div>
          <div>
            Job Lv <b>{s.jobLevel}</b>
          </div>
        </div>
      </div>
      <Bar value={s.hp} max={d.maxHp} kind="hp" text={`HP ${s.hp} / ${d.maxHp}`} />
      <Bar value={s.sp} max={d.maxSp} kind="sp" text={`SP ${s.sp} / ${d.maxSp}`} />
      <Bar value={s.baseExp} max={game.baseToNext} kind="bexp" text={`Base EXP ${basePct}%`} />
      <Bar value={jobMax ? 1 : s.jobExp} max={jobMax ? 1 : game.jobToNext} kind="jexp" text={`Job EXP ${jobPct}`} />
      <div className="bi-buttons">
        <button className={open.status ? 'on' : ''} onClick={() => toggle('status')}>
          สถานะ <kbd>A</kbd>
          {s.statPoints > 0 && <i className="dot" />}
        </button>
        <button className={open.skills ? 'on' : ''} onClick={() => toggle('skills')}>
          สกิล <kbd>S</kbd>
          {s.skillPoints > 0 && <i className="dot" />}
        </button>
        <button className={open.quests ? 'on' : ''} onClick={() => toggle('quests')}>
          เควสต์ <kbd>Q</kbd>
        </button>
        <button className={open.help ? 'on' : ''} onClick={() => toggle('help')}>
          ? <kbd>H</kbd>
        </button>
      </div>
    </div>
  );
}

export function TargetFrame() {
  const game = useGame();
  const m = game.targetMonster;
  if (!m || !m.alive) return null;
  return (
    <div className={`panel target-frame${m.def.boss ? ' boss' : ''}`}>
      <div className="tf-name">
        {m.def.nameTh} <span className="muted">{m.def.name}</span> <b>Lv.{m.def.level}</b>
      </div>
      <Bar value={Math.max(0, m.hp)} max={m.def.hp} kind="mhp" />
      <div className="tf-lesson">บทเรียน: {m.def.lesson}</div>
    </div>
  );
}

export function Hotbar({ emoteOpen, setEmoteOpen }: { emoteOpen: boolean; setEmoteOpen: (v: boolean) => void }) {
  const game = useGame();
  const s = game.state!;
  const bt = skillLevel(s, 'basic_training');
  const slots = [
    {
      key: '1',
      label: SKILLS.first_aid.nameTh,
      icon: '✚',
      sub: `${SKILLS.first_aid.spCost} SP`,
      ok: skillLevel(s, 'first_aid') > 0,
      lockText: 'เควสต์พยาบาล',
      onClick: () => game.useSkill('first_aid'),
      active: false,
    },
    {
      key: '2',
      label: SKILLS.play_dead.nameTh,
      icon: '☠',
      sub: `${SKILLS.play_dead.spCost} SP`,
      ok: skillLevel(s, 'play_dead') > 0,
      lockText: 'เควสต์พราน',
      onClick: () => game.useSkill('play_dead'),
      active: game.isPlayingDead,
    },
    {
      key: '3',
      label: 'นั่งพัก',
      icon: '⛺',
      sub: 'ฟื้น x2',
      ok: bt >= 3,
      lockText: 'Basic Lv 3',
      onClick: () => game.toggleSit(),
      active: game.isSitting,
    },
    {
      key: '4',
      label: 'อีโมต',
      icon: '♥',
      sub: '',
      ok: bt >= 2,
      lockText: 'Basic Lv 2',
      onClick: () => (bt >= 2 ? setEmoteOpen(!emoteOpen) : game.emote('!')),
      active: emoteOpen,
    },
  ];
  return (
    <div className="hotbar">
      {emoteOpen && (
        <div className="panel emote-picker">
          {game.emotes.map((e) => (
            <button
              key={e}
              onClick={() => {
                game.emote(e);
                setEmoteOpen(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {slots.map((sl) => (
        <button
          key={sl.key}
          className={`slot${sl.ok ? '' : ' locked'}${sl.active ? ' active' : ''}`}
          onClick={sl.onClick}
          title={sl.ok ? sl.label : `ล็อก — ${sl.lockText}`}
        >
          <kbd>{sl.key}</kbd>
          <span className="slot-icon">{sl.icon}</span>
          <span className="slot-label">{sl.label}</span>
          <span className="slot-sub">{sl.ok ? sl.sub : sl.lockText}</span>
        </button>
      ))}
    </div>
  );
}

export function ChatLog() {
  const game = useGame();
  const ref = useRef<HTMLDivElement>(null);
  const lastId = game.log.at(-1)?.id;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  return (
    <div className="panel chat-log" ref={ref}>
      {game.log.map((l) => (
        <div key={l.id} className={`log log-${l.kind}`}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

export function NpcDialog() {
  const game = useGame();
  const d = game.dialog;
  if (!d) return null;
  return (
    <div className="panel npc-dialog">
      <div className="panel-title">
        {d.speaker}
        <button className="close" onClick={() => game.closeDialog()}>
          ×
        </button>
      </div>
      <div className="dialog-lines">
        {d.lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
      <div className="dialog-options">
        {d.options.map((o) => (
          <button key={o.action + o.label} className={o.action === 'close' ? '' : 'primary'} onClick={() => game.dialogAction(o.action)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DeathOverlay() {
  const game = useGame();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!game.isDead) return setShown(false);
    const t = setTimeout(() => setShown(true), 700);
    return () => clearTimeout(t);
  }, [game.isDead]);
  if (!game.isDead || !shown) return null;
  return (
    <div className="death">
      <div className="panel death-box">
        <div className="death-title">คุณหมดสติ</div>
        <p className="muted">Novice ไม่เสีย EXP — ลุกขึ้นมาลุยใหม่ได้เลย</p>
        <button className="primary" onClick={() => game.respawn()}>
          ฟื้นที่จุดเกิด
        </button>
      </div>
    </div>
  );
}
