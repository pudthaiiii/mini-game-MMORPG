import { useCallback, useEffect, useState } from 'react';
import { CreateCharacter } from './CreateCharacter';
import { BasicInfo, ChatLog, DeathOverlay, Hotbar, NpcDialog, TargetFrame, type WindowId } from './Hud';
import { useGame } from './useGame';
import { HelpWindow, QuestWindow, SkillWindow, StatusWindow } from './Windows';

const CLOSED: Record<WindowId, boolean> = { status: false, skills: false, quests: false, help: false };

export function App() {
  const game = useGame();
  const [open, setOpen] = useState<Record<WindowId, boolean>>(CLOSED);
  const [emoteOpen, setEmoteOpen] = useState(false);

  const toggle = useCallback((w: WindowId) => setOpen((o) => ({ ...o, [w]: !o[w] })), []);
  const close = useCallback((w: WindowId) => setOpen((o) => ({ ...o, [w]: false })), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!game.hasCharacter || e.metaKey || e.ctrlKey || e.altKey) return;
      // e.code keeps the shortcuts working on a Thai keyboard layout too
      switch (e.code) {
        case 'KeyA':
          toggle('status');
          break;
        case 'KeyS':
          toggle('skills');
          break;
        case 'KeyQ':
          toggle('quests');
          break;
        case 'KeyH':
          toggle('help');
          break;
        case 'Digit1':
          game.useSkill('first_aid');
          break;
        case 'Digit2':
          game.useSkill('play_dead');
          break;
        case 'Digit3':
          game.toggleSit();
          break;
        case 'Digit4':
          setEmoteOpen((v) => !v);
          break;
        case 'Digit5':
          game.castSkill('storm_gust');
          break;
        case 'Digit6':
          game.castSkill('meteor_storm');
          break;
        case 'Escape':
          if (game.pendingCastId) game.cancelCast();
          else if (game.dialog) game.closeDialog();
          else if (emoteOpen) setEmoteOpen(false);
          else setOpen(CLOSED);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, toggle, emoteOpen]);

  if (!game.hasCharacter) return <CreateCharacter />;

  return (
    <div className="hud">
      <div className="left-col">
        <BasicInfo open={open} toggle={toggle} />
        {open.status && <StatusWindow onClose={() => close('status')} />}
      </div>
      <div className="right-col">
        {open.skills && <SkillWindow onClose={() => close('skills')} />}
        {open.quests && <QuestWindow onClose={() => close('quests')} />}
        {open.help && <HelpWindow onClose={() => close('help')} />}
      </div>
      <TargetFrame />
      <NpcDialog />
      <ChatLog />
      <Hotbar emoteOpen={emoteOpen} setEmoteOpen={setEmoteOpen} />
      <div className="map-name">ทุ่งฝึกหัด · Phase 0</div>
      <DeathOverlay />
    </div>
  );
}
