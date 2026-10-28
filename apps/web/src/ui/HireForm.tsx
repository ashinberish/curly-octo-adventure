import { useState, type FormEvent } from 'react';
import { SKILLS, SKILL_NAMES, type HairStyle, type Look, type SkillName } from '@pixel-office/shared';
import { officeStore } from '../state/store.ts';
import { Portrait, useOffice } from './common.tsx';

const HAIR = ['#141414', '#2b1d14', '#6b4226', '#b8402e', '#e3c86a', '#d9cfc0', '#5a3e8a'];
const SKIN = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#b97a50', '#8d5524'];
const SHIRT = ['#5b7fd6', '#e0884f', '#4fa6a0', '#5aa86a', '#9b78f0', '#e07aa8', '#e9c24f', '#cf5a4f'];
const PANTS = ['#3b3a4a', '#2f3b4a', '#40355e', '#2b2d42'];
const STYLES: HairStyle[] = ['short', 'long', 'bun', 'bald'];
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const randomLook = (): Look => ({ hair: pick(HAIR), style: pick(STYLES), skin: pick(SKIN), shirt: pick(SHIRT), pants: pick(PANTS) });

export function HireForm() {
  const desks = useOffice(s => s.desks);
  const employees = useOffice(s => s.employees);
  const free = desks.filter(d => !employees.some(e => e.deskId === d));
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [skills, setSkills] = useState<SkillName[]>([]);
  const [deskId, setDeskId] = useState('');
  const [look, setLook] = useState(randomLook);
  const [sending, setSending] = useState(false);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (sending) return;
    setSending(true);
    const hired = await officeStore.getState().hire({ name: name.trim(), role: role.trim(), skills, look, ...(deskId ? { deskId } : {}) });
    setSending(false);
    if (hired) officeStore.getState().select(hired.id, { focus: true });
  };

  if (!free.length) return <div className="empty"><span className="px">The office is full</span>Every desk is taken. Let someone go, or add desks to the map.</div>;

  return (
    <div>
      <div className="emp-head">
        <Portrait look={look} size={72} />
        <div>
          <h2>Hire someone</h2>
          <button type="button" className="btn small" onClick={() => setLook(randomLook())}>Shuffle look</button>
        </div>
      </div>
      <form onSubmit={e => void submit(e)} autoComplete="off" style={{ marginTop: 14 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" required maxLength={40} aria-label="Name" />
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role, e.g. Frontend Engineer" required maxLength={60} aria-label="Role" />
        <h3>Skills</h3>
        <div className="chips">
          {SKILL_NAMES.map(s => {
            const on = skills.includes(s);
            return (
              <button key={s} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} title={SKILLS[s].description}
                style={on ? { background: SKILLS[s].color } : undefined}
                onClick={() => setSkills(on ? skills.filter(x => x !== s) : [...skills, s])}>{s}</button>
            );
          })}
        </div>
        <h3>Desk</h3>
        <select value={deskId} onChange={e => setDeskId(e.target.value)} aria-label="Desk">
          <option value="">First free desk ({free[0]})</option>
          {free.map(d => <option key={d}>{d}</option>)}
        </select>
        <button className="btn" type="submit" disabled={sending} style={{ marginTop: 6 }}>Hire ▶</button>
      </form>
    </div>
  );
}
