import type { ReactNode } from 'react'
import type { List, Tag } from '../../db/types'
import type { View } from '../../lib/view'
import { useOnlineStatus } from '../../lib/useOnlineStatus'
import { reorderLists } from '../../db/repo/lists'
import { SortableItem, SortableList } from '../ui/Sortable'
import { PlayerCard } from '../rpg/PlayerCard'

interface SidebarProps {
  lists: List[]
  tags: Tag[]
  view: View
  counts: { today: number; upcoming: number; all: number; byList: Record<string, number>; byTag: Record<string, number> }
  onSelect: (view: View) => void
  onNewList: () => void
  onEditList: (id: string) => void
  onEditTag: (id: string) => void
  onOpenSettings: () => void
}

function NavItem({
  active,
  onClick,
  icon,
  label,
  count,
  badge,
  fadeMetaOnHover = false,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  count?: number
  badge?: string
  /** Al hacer hover en la fila (grupo), nivel y contador se desvanecen para dejar sitio al lápiz de editar. */
  fadeMetaOnHover?: boolean
}) {
  const metaFade = fadeMetaOnHover ? ' transition-opacity group-hover:opacity-0' : ''
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors lg:gap-2.5 lg:py-2 lg:text-sm ${
        active ? 'bg-accent-500/15 text-accent-300' : 'text-ink-dim hover:bg-ink/5 hover:text-ink'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {badge && (
        <span className={`rounded bg-accent-500/15 px-1.5 py-px text-xs font-bold text-accent-300 lg:px-1 lg:text-[10px]${metaFade}`}>{badge}</span>
      )}
      {count !== undefined && count > 0 && (
        <span className={`text-sm lg:text-xs ${active ? 'text-accent-300/80' : 'text-ink-faint'}${metaFade}`}>{count}</span>
      )}
    </button>
  )
}

// Iconos más grandes en móvil (accesibilidad); tamaño compacto en escritorio.
const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-6 shrink-0 lg:size-4.5" aria-hidden="true">
    {path}
  </svg>
)

export function Sidebar({
  lists,
  tags,
  view,
  counts,
  onSelect,
  onNewList,
  onEditList,
  onEditTag,
  onOpenSettings,
}: SidebarProps) {
  const online = useOnlineStatus()

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2.5 px-3 pt-1 pb-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-400 to-accent-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="M5 14l7-7 7 7" />
            <path d="M5 20l7-7 7 7" />
          </svg>
        </div>
        <span className="text-lg font-bold text-ink lg:text-base">Quest</span>
      </div>

      <div className="shrink-0">
        <PlayerCard />
      </div>

      {/* Desde "Hoy" hasta las etiquetas todo va en una sola zona con scroll:
          en móvil el menú completo no cabe en pantalla y quedaba cortado. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <nav className="flex shrink-0 flex-col gap-0.5" aria-label="Vistas">
        <NavItem
          active={view.kind === 'today'}
          onClick={() => onSelect({ kind: 'today' })}
          label="Hoy"
          count={counts.today}
          icon={icon(
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </>,
          )}
        />
        <NavItem
          active={view.kind === 'all'}
          onClick={() => onSelect({ kind: 'all' })}
          label="Todas"
          count={counts.all}
          icon={icon(
            <>
              <path d="M22 12h-6l-2 3h-4l-2-3H2" />
              <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" />
            </>,
          )}
        />
        <NavItem
          active={view.kind === 'upcoming'}
          onClick={() => onSelect({ kind: 'upcoming' })}
          label="Próximas"
          count={counts.upcoming}
          icon={icon(
            <>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </>,
          )}
        />
        <NavItem
          active={view.kind === 'calendar'}
          onClick={() => onSelect({ kind: 'calendar' })}
          label="Calendario"
          icon={icon(
            <>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
              <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
            </>,
          )}
        />
        <NavItem
          active={view.kind === 'habits'}
          onClick={() => onSelect({ kind: 'habits' })}
          label="Hábitos"
          icon={icon(
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
          )}
        />
        <NavItem
          active={view.kind === 'study'}
          onClick={() => onSelect({ kind: 'study' })}
          label="Pomodoro"
          icon={icon(
            <>
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2.5M9 2h6" />
            </>,
          )}
        />
        <NavItem
          active={view.kind === 'stats'}
          onClick={() => onSelect({ kind: 'stats' })}
          label="Estadísticas"
          icon={icon(<path d="M3 3v18h18M8 17V9m5 8V5m5 12v-6" />)}
        />
        <NavItem
          active={view.kind === 'quests'}
          onClick={() => onSelect({ kind: 'quests' })}
          label="Misiones"
          icon={icon(
            <>
              <path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 3-.8V14a6 6 0 0 1-3 .8c-3 0-5-2-8-2a6 6 0 0 0-4 1.2" />
            </>,
          )}
        />
      </nav>

      <div className="mt-5 mb-1 flex shrink-0 items-center justify-between px-3">
        <span className="text-sm font-semibold tracking-wide text-ink-faint uppercase lg:text-xs">Listas</span>
        <button
          onClick={onNewList}
          aria-label="Nueva lista"
          className="flex size-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Las listas se reordenan arrastrando (ratón y táctil) y además son
          zona de destino: soltar una tarea o un hábito encima la mueve aquí. */}
      <SortableList
        ids={lists.map((l) => l.id)}
        onReorder={(ids) => void reorderLists(ids)}
        className="flex flex-col gap-0.5"
      >
        {lists.map((list) => (
          <SortableItem key={list.id} id={list.id}>
          <div
            data-drop-list={list.id}
            className="group relative rounded-lg transition-shadow data-[drop-over=true]:ring-2 data-[drop-over=true]:ring-accent-400 data-[drop-over=true]:ring-inset"
          >
            <NavItem
              active={view.kind === 'list' && view.listId === list.id}
              onClick={() => onSelect({ kind: 'list', listId: list.id })}
              label={list.emoji ? `${list.emoji} ${list.name}` : list.name}
              count={counts.byList[list.id] ?? 0}
              badge={list.statLevel > 1 ? `Nv ${list.statLevel}` : undefined}
              fadeMetaOnHover
              icon={
                <span
                  className={`size-2.5 shrink-0 rounded-full ${list.color ? '' : 'border-2 border-ink-muted'}`}
                  style={list.color ? { backgroundColor: list.color } : undefined}
                  aria-hidden="true"
                />
              }
            />
            <button
              onClick={() => onEditList(list.id)}
              aria-label={`Editar lista ${list.name}`}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus:opacity-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
          </div>
          </SortableItem>
        ))}
      </SortableList>

      <div className="flex flex-col gap-0.5">
        {lists.length === 0 && (
          <button
            onClick={onNewList}
            className="mx-3 rounded-lg border border-dashed border-line/10 px-3 py-2 text-left text-xs text-ink-faint transition-colors hover:border-line/20 hover:text-ink-dim"
          >
            Crea tu primera lista (Hogar, Trabajo…)
          </button>
        )}

        {tags.length > 0 && (
          <>
            <div className="mt-4 mb-1 px-3">
              <span className="text-sm font-semibold tracking-wide text-ink-faint uppercase lg:text-xs">Etiquetas</span>
            </div>
            {tags.map((tag) => (
              <div key={tag.id} className="group relative">
                <NavItem
                  active={view.kind === 'tag' && view.tagId === tag.id}
                  onClick={() => onSelect({ kind: 'tag', tagId: tag.id })}
                  label={tag.name}
                  count={counts.byTag[tag.id] ?? 0}
                  fadeMetaOnHover
                  icon={icon(
                    <>
                      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
                      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" stroke={tag.color} />
                    </>,
                  )}
                />
                <button
                  onClick={() => onEditTag(tag.id)}
                  aria-label={`Editar etiqueta ${tag.name}`}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus:opacity-100"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
              </div>
            ))}
          </>
        )}
      </div>
      </div>

      {/* En móvil el texto y el engranaje son más grandes (objetivo táctil cómodo); en escritorio, compactos */}
      <div className="mt-4 flex items-center gap-2 border-t border-line/5 px-3 pt-3 text-sm text-ink-faint lg:text-xs">
        <span className={`size-2 rounded-full lg:size-1.5 ${online ? 'bg-ok' : 'bg-warn'}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{online ? 'Online' : 'Offline — todo se guarda local'}</span>
        <button
          onClick={onOpenSettings}
          aria-label="Ajustes"
          className="flex size-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink lg:size-7 lg:rounded-md"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5.5 lg:size-4" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
