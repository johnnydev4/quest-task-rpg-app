export type View =
  | { kind: 'today' }
  | { kind: 'quests' }
  | { kind: 'habits' }
  | { kind: 'upcoming' }
  | { kind: 'calendar' }
  | { kind: 'all' }
  | { kind: 'list'; listId: string }
  | { kind: 'tag'; tagId: string }
  | { kind: 'study' }
  | { kind: 'stats' }
