// Searchable room dropdown (WAI-ARIA combobox). Type "C1.3.2" → block 3, floor 2; "237" → every room 237.
// Rooms that suit the session type (lecture → L, practice → P, lab → K) are listed first in each block.
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CAMPUS_BLOCKS, findRoom, preferredRoomKind, searchRooms, type Room, type RoomKind, type SessionType } from '@aitu/domain';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { Icon } from './Icon.tsx';

const KIND_KEY: Record<RoomKind, MessageKey> = { L: 'roomKindL', P: 'roomKindP', K: 'roomKindK' };
const MAX_OPTIONS = 60;

export function RoomPicker({ value, onChange, sessionType, label }: {
  value: string; onChange: (code: string) => void; sessionType: SessionType; label: string;
}) {
  const { t, lang } = useI18n();
  const id = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const prefer = preferredRoomKind(sessionType);

  const options = useMemo(() => searchRooms(open && query !== value ? query : '', prefer).slice(0, MAX_OPTIONS), [open, query, value, prefer]);
  const choose = (r: Room) => { onChange(r.code); setQuery(r.code); setOpen(false); };
  const activeOption = options[Math.min(active, options.length - 1)];

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(options.length - 1, a + 1)); scrollTo(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); scrollTo(active - 1); }
    else if (e.key === 'Enter' && open && activeOption) { e.preventDefault(); choose(activeOption); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(value); }
  };
  const scrollTo = (i: number) => listRef.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });

  const selected = findRoom(value);
  let lastBlock = 0;
  return (
    <div className="field room-picker">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="room-input">
        <Icon name="search" size={16} />
        <input
          id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={open && activeOption ? `${id}-${activeOption.code}` : undefined}
          value={query} placeholder={t('roomPlaceholder')} autoComplete="off" spellCheck={false}
          onFocus={() => { setOpen(true); setActive(0); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); if (e.target.value === '') onChange(''); }}
          onBlur={() => setTimeout(() => { setOpen(false); setQuery((q) => (findRoom(q)?.code ?? value)); }, 120)}
          onKeyDown={onKey}
        />
        {value && <button type="button" className="room-clear" aria-label={t('clearMark')} onClick={() => { onChange(''); setQuery(''); }}><Icon name="x" size={14} /></button>}
      </div>
      {selected && !open && (
        <span className="room-hint">{t('roomFloor', { n: selected.floor })} · {t(KIND_KEY[selected.kind])}{selected.kind !== prefer ? ` · ${t('roomNotTypical')}` : ''}</span>
      )}
      {open && (
        <ul id={`${id}-list`} ref={listRef} role="listbox" className="room-list" aria-label={label}>
          {options.length === 0 && <li className="room-empty">{t('roomNone')}</li>}
          {options.map((r, i) => {
            const header = r.block !== lastBlock;
            lastBlock = r.block;
            const block = CAMPUS_BLOCKS[r.block - 1]!;
            return [
              header && <li key={`h${r.block}`} className="room-group" role="presentation">{block.prefix} — {lang === 'ru' ? block.ru : block.en}</li>,
              <li key={r.code} id={`${id}-${r.code}`} data-i={i} role="option" aria-selected={r.code === value}
                className={'room-option' + (i === active ? ' active' : '') + (r.kind === prefer ? ' preferred' : '')}
                onMouseDown={(e) => { e.preventDefault(); choose(r); }} onMouseEnter={() => setActive(i)}>
                <b className="num">{r.code}</b>
                <span>{t('roomFloor', { n: r.floor })}</span>
                <span className={`room-kind kind-${r.kind}`}>{t(KIND_KEY[r.kind])}</span>
              </li>,
            ];
          })}
        </ul>
      )}
    </div>
  );
}
