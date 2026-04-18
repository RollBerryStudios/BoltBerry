/* SRD 5.2.1 creature templates seeded into token_templates on first run.

   Stats are the SRD 5.2.1 baseline (CC-BY-4.0); DMs can duplicate into
   the user-scoped library to tweak without losing the canonical copy.
   Full attribution lives in NOTICE.md and the in-app About dialog.

   Sizes follow BoltBerry's grid-cell convention: Small/Medium = 1,
   Large = 2, Huge = 3. Tiny creatures are rounded to 1 because the token
   renderer has no sub-cell mode. */

export interface SrdMonster {
  name_de: string
  name_en: string
  /** Stable identifier for artwork folders (resources/token-variants/<slug>/).
   *  Matches the too-many-tokens-dnd folder after slugify. null = no art. */
  slug: string | null
  /** Grid cells the token occupies (square). */
  size: number
  hp_max: number
  ac: number
  /** Primary ground speed in feet; Beholder etc. have 0 (hover). */
  speed: number
  /** Challenge rating as a string so fractions (1/4, 1/8) round-trip. */
  cr: string
  creature_type: string
  faction: 'enemy' | 'neutral' | 'friendly' | 'party'
  marker_color: string
  stat_block: {
    str: number; dex: number; con: number
    int: number; wis: number; cha: number
    attacks: Array<{ name: string; bonus: string; damage: string }>
    traits: string[]
  }
}

export const SRD_MONSTERS: SrdMonster[] = [
  {
    name_de: 'Goblin',
    name_en: 'Goblin',
    slug: 'goblin',
    size: 1, hp_max: 7, ac: 15, speed: 30, cr: '1/4',
    creature_type: 'humanoid', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
      attacks: [
        { name: 'Krummsäbel', bonus: '+4', damage: '5 (1W6+2) Hieb' },
        { name: 'Kurzbogen', bonus: '+4', damage: '5 (1W6+2) Stich · 80/320 ft' },
      ],
      traits: ['Schnelle Flucht: Bonusaktion für Rückzug/Hast/Verstecken'],
    },
  },
  {
    name_de: 'Kobold',
    name_en: 'Kobold',
    slug: 'kobold',
    size: 1, hp_max: 5, ac: 12, speed: 30, cr: '1/8',
    creature_type: 'humanoid', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 7, dex: 15, con: 9, int: 8, wis: 7, cha: 8,
      attacks: [
        { name: 'Dolch', bonus: '+4', damage: '4 (1W4+2) Stich' },
        { name: 'Schleuder', bonus: '+4', damage: '4 (1W4+2) Wucht · 30/120 ft' },
      ],
      traits: ['Rudeltaktik: Vorteil, wenn Verbündeter in 5 ft', 'Sonnenempfindlich'],
    },
  },
  {
    name_de: 'Skelett',
    name_en: 'Skeleton',
    slug: 'skeleton',
    size: 1, hp_max: 13, ac: 13, speed: 30, cr: '1/4',
    creature_type: 'undead', faction: 'enemy', marker_color: '#a78bfa',
    stat_block: {
      str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5,
      attacks: [
        { name: 'Kurzschwert', bonus: '+4', damage: '5 (1W6+2) Stich' },
        { name: 'Kurzbogen', bonus: '+4', damage: '5 (1W6+2) Stich · 80/320 ft' },
      ],
      traits: ['Verwundbar gegen Wucht', 'Immun gegen Gift, Erschöpfung'],
    },
  },
  {
    name_de: 'Zombie',
    name_en: 'Zombie',
    slug: 'zombie',
    size: 1, hp_max: 22, ac: 8, speed: 20, cr: '1/4',
    creature_type: 'undead', faction: 'enemy', marker_color: '#a78bfa',
    stat_block: {
      str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5,
      attacks: [{ name: 'Hieb', bonus: '+3', damage: '4 (1W6+1) Wucht' }],
      traits: ['Untoter Überlebenswille: RW KON bei 0 HP → 1 HP'],
    },
  },
  {
    name_de: 'Ork',
    name_en: 'Orc',
    slug: 'orc',
    size: 1, hp_max: 15, ac: 13, speed: 30, cr: '1/2',
    creature_type: 'humanoid', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
      attacks: [
        { name: 'Großaxt', bonus: '+5', damage: '9 (1W12+3) Hieb' },
        { name: 'Speer', bonus: '+5', damage: '6 (1W6+3) Stich · 20/60 ft' },
      ],
      traits: ['Aggressiv: Bonusaktion bis zu Geschwindigkeit auf sichtbaren Feind zu'],
    },
  },
  {
    name_de: 'Räuber',
    name_en: 'Bandit',
    slug: 'bandit',
    size: 1, hp_max: 11, ac: 12, speed: 30, cr: '1/8',
    creature_type: 'humanoid', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10,
      attacks: [
        { name: 'Krummsäbel', bonus: '+3', damage: '4 (1W6+1) Hieb' },
        { name: 'Leichte Armbrust', bonus: '+3', damage: '5 (1W8+1) Stich · 80/320 ft' },
      ],
      traits: [],
    },
  },
  {
    name_de: 'Riesenratte',
    name_en: 'Giant Rat',
    slug: 'giant-rat',
    size: 1, hp_max: 7, ac: 12, speed: 30, cr: '1/8',
    creature_type: 'beast', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4,
      attacks: [{ name: 'Biss', bonus: '+4', damage: '4 (1W4+2) Stich' }],
      traits: ['Halbsicht', 'Rudeltaktik'],
    },
  },
  {
    name_de: 'Riesenspinne',
    name_en: 'Giant Spider',
    slug: 'giant-spider',
    size: 2, hp_max: 26, ac: 14, speed: 30, cr: '1',
    creature_type: 'beast', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4,
      attacks: [
        { name: 'Biss', bonus: '+5', damage: '7 (1W8+3) Stich + 9 (2W8) Gift, KON RW DC 11' },
        { name: 'Netz (5-6)', bonus: '+5', damage: 'GES RW DC 12 · festgesetzt' },
      ],
      traits: ['Spinnenklettern', 'Netzsinn', 'Netzweber'],
    },
  },
  {
    name_de: 'Wolf',
    name_en: 'Wolf',
    slug: 'wolf',
    size: 1, hp_max: 11, ac: 13, speed: 40, cr: '1/4',
    creature_type: 'beast', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6,
      attacks: [{ name: 'Biss', bonus: '+4', damage: '7 (2W4+2) Stich · STR RW DC 11 oder liegend' }],
      traits: ['Rudeltaktik', 'Scharfer Geruch und Gehör'],
    },
  },
  {
    name_de: 'Schattenwolf',
    name_en: 'Dire Wolf',
    slug: 'dire-wolf',
    size: 2, hp_max: 37, ac: 14, speed: 50, cr: '1',
    creature_type: 'beast', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7,
      attacks: [{ name: 'Biss', bonus: '+5', damage: '10 (2W6+3) Stich · STR RW DC 13 oder liegend' }],
      traits: ['Rudeltaktik', 'Scharfer Geruch und Gehör'],
    },
  },
  {
    name_de: 'Bugbear',
    name_en: 'Bugbear',
    slug: 'bugbear',
    size: 1, hp_max: 27, ac: 16, speed: 30, cr: '1',
    creature_type: 'humanoid', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9,
      attacks: [
        { name: 'Morgenstern', bonus: '+4', damage: '11 (2W8+2) Stich' },
        { name: 'Wurfspeer', bonus: '+4', damage: '9 (2W6+2) Stich · 30/120 ft' },
      ],
      traits: ['Brutal: +1W6 auf Nahkampf-Überraschungstreffer', 'Schleichend'],
    },
  },
  {
    name_de: 'Gnoll',
    name_en: 'Gnoll',
    slug: 'gnoll',
    size: 1, hp_max: 22, ac: 15, speed: 30, cr: '1/2',
    creature_type: 'humanoid', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 14, dex: 12, con: 11, int: 6, wis: 10, cha: 7,
      attacks: [
        { name: 'Biss', bonus: '+4', damage: '4 (1W4+2) Stich' },
        { name: 'Speer', bonus: '+4', damage: '5 (1W6+2) Stich · 20/60 ft' },
      ],
      traits: ['Blutlust: Bonusaktion Bewegen nach Kill'],
    },
  },
  {
    name_de: 'Ghul',
    name_en: 'Ghoul',
    slug: 'ghoul',
    size: 1, hp_max: 22, ac: 12, speed: 30, cr: '1',
    creature_type: 'undead', faction: 'enemy', marker_color: '#a78bfa',
    stat_block: {
      str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6,
      attacks: [
        { name: 'Biss', bonus: '+2', damage: '9 (2W6+2) Stich' },
        { name: 'Krallen', bonus: '+4', damage: '7 (2W4+2) Hieb · KON RW DC 10 oder gelähmt 1 min' },
      ],
      traits: ['Immun Gift, Bezauberung, Erschöpfung'],
    },
  },
  {
    name_de: 'Gast',
    name_en: 'Ghast',
    slug: 'ghast',
    size: 1, hp_max: 36, ac: 13, speed: 30, cr: '2',
    creature_type: 'undead', faction: 'enemy', marker_color: '#a78bfa',
    stat_block: {
      str: 16, dex: 17, con: 10, int: 11, wis: 10, cha: 8,
      attacks: [
        { name: 'Biss', bonus: '+3', damage: '12 (2W8+3) Stich' },
        { name: 'Krallen', bonus: '+5', damage: '10 (2W6+3) Hieb · KON RW DC 10 oder gelähmt' },
      ],
      traits: ['Gestank (DC 10 CON)', 'Resistent Nekrotisch'],
    },
  },
  {
    name_de: 'Hobgoblin',
    name_en: 'Hobgoblin',
    slug: 'hobgoblin',
    size: 1, hp_max: 11, ac: 18, speed: 30, cr: '1/2',
    creature_type: 'humanoid', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9,
      attacks: [
        { name: 'Langschwert', bonus: '+3', damage: '5 (1W8+1) Hieb' },
        { name: 'Langbogen', bonus: '+3', damage: '5 (1W8+1) Stich · 150/600 ft' },
      ],
      traits: ['Martialischer Vorteil: +2W6 gegen Ziel mit Verbündetem in 5 ft'],
    },
  },
  {
    name_de: 'Oger',
    name_en: 'Ogre',
    slug: 'ogre',
    size: 2, hp_max: 59, ac: 11, speed: 40, cr: '2',
    creature_type: 'giant', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7,
      attacks: [
        { name: 'Großknüppel', bonus: '+6', damage: '13 (2W8+4) Wucht' },
        { name: 'Wurfspeer', bonus: '+6', damage: '11 (2W6+4) Stich · 30/120 ft' },
      ],
      traits: [],
    },
  },
  {
    name_de: 'Kultist',
    name_en: 'Cultist',
    slug: 'cultist',
    size: 1, hp_max: 9, ac: 12, speed: 30, cr: '1/8',
    creature_type: 'humanoid', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10,
      attacks: [{ name: 'Krummsäbel', bonus: '+3', damage: '4 (1W6+1) Hieb' }],
      traits: ['Dunkle Hingabe: Vorteil auf RW gegen Bezauberung/Furcht'],
    },
  },
  {
    name_de: 'Akolyth',
    name_en: 'Acolyte',
    slug: 'acolyte',
    size: 1, hp_max: 9, ac: 10, speed: 30, cr: '1/4',
    creature_type: 'humanoid', faction: 'neutral', marker_color: '#f59e0b',
    stat_block: {
      str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 11,
      attacks: [{ name: 'Keule', bonus: '+2', damage: '3 (1W6) Wucht' }],
      traits: ['Zaubern: Licht, Gewandtheit, Heilige Flamme, Segen, Heilendes Wort (SG 12)'],
    },
  },
  {
    name_de: 'Wache',
    name_en: 'Guard',
    slug: 'guard',
    size: 1, hp_max: 11, ac: 16, speed: 30, cr: '1/8',
    creature_type: 'humanoid', faction: 'friendly', marker_color: '#3b82f6',
    stat_block: {
      str: 13, dex: 12, con: 12, int: 10, wis: 11, cha: 10,
      attacks: [{ name: 'Speer', bonus: '+3', damage: '4 (1W6+1) Stich · 20/60 ft' }],
      traits: [],
    },
  },
  {
    name_de: 'Kundschafter',
    name_en: 'Scout',
    slug: 'scout',
    size: 1, hp_max: 16, ac: 13, speed: 30, cr: '1/2',
    creature_type: 'humanoid', faction: 'neutral', marker_color: '#f59e0b',
    stat_block: {
      str: 11, dex: 14, con: 12, int: 11, wis: 13, cha: 11,
      attacks: [
        { name: 'Kurzschwert', bonus: '+4', damage: '5 (1W6+2) Stich' },
        { name: 'Langbogen', bonus: '+4', damage: '6 (1W8+2) Stich · 150/600 ft' },
      ],
      traits: ['Scharfe Sinne', 'Vielseitig'],
    },
  },
  // ── Beasts ──────────────────────────────────────────────────────────
  {
    name_de: 'Braunbär',
    name_en: 'Brown Bear',
    slug: 'brown-bear',
    size: 2, hp_max: 34, ac: 11, speed: 40, cr: '1',
    creature_type: 'beast', faction: 'enemy', marker_color: '#b45309',
    stat_block: {
      str: 19, dex: 10, con: 16, int: 2, wis: 13, cha: 7,
      attacks: [
        { name: 'Biss', bonus: '+5', damage: '8 (1W8+4) Stich' },
        { name: 'Klauen', bonus: '+5', damage: '11 (2W6+4) Hieb' },
      ],
      traits: ['Multiangriff: 1 Biss + 1 Klaue', 'Scharfer Geruch', 'Klettern 30 ft'],
    },
  },
  {
    name_de: 'Wildschwein',
    name_en: 'Boar',
    slug: 'boar',
    size: 1, hp_max: 11, ac: 11, speed: 40, cr: '1/4',
    creature_type: 'beast', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 13, dex: 11, con: 12, int: 2, wis: 9, cha: 5,
      attacks: [
        { name: 'Hauerangriff', bonus: '+3', damage: '4 (1W6+1) Hieb' },
      ],
      traits: ['Sturmangriff: 20 ft auf Feind zu + Hauerangriff · STR RW DC 11 oder liegend, +3 (1W6) Schaden', 'Unbeugsam (1/Tag): bei 0 HP → 1 HP'],
    },
  },
  {
    name_de: 'Reitpferd',
    name_en: 'Riding Horse',
    slug: 'riding-horse',
    size: 2, hp_max: 13, ac: 10, speed: 60, cr: '1/4',
    creature_type: 'beast', faction: 'friendly', marker_color: '#3b82f6',
    stat_block: {
      str: 16, dex: 10, con: 12, int: 2, wis: 11, cha: 7,
      attacks: [
        { name: 'Hufe', bonus: '+2', damage: '5 (1W6+3) Wucht' },
      ],
      traits: ['Geschwindigkeit 60 ft'],
    },
  },
  {
    name_de: 'Pony',
    name_en: 'Pony',
    slug: 'pony',
    size: 1, hp_max: 11, ac: 10, speed: 40, cr: '1/8',
    creature_type: 'beast', faction: 'friendly', marker_color: '#3b82f6',
    stat_block: {
      str: 15, dex: 10, con: 13, int: 2, wis: 11, cha: 7,
      attacks: [
        { name: 'Hufe', bonus: '+2', damage: '4 (1W6+2) Wucht' },
      ],
      traits: [],
    },
  },
  {
    name_de: 'Maultier',
    name_en: 'Mule',
    slug: 'mule',
    size: 1, hp_max: 11, ac: 10, speed: 40, cr: '1/8',
    creature_type: 'beast', faction: 'friendly', marker_color: '#3b82f6',
    stat_block: {
      str: 14, dex: 10, con: 13, int: 2, wis: 10, cha: 5,
      attacks: [
        { name: 'Hufe', bonus: '+2', damage: '4 (1W6+2) Wucht' },
      ],
      traits: ['Trittsicher: Vorteil auf STR/GES-RW gegen Umwerfen'],
    },
  },

  // ── Swarms ──────────────────────────────────────────────────────────
  {
    name_de: 'Rattenschwarm',
    name_en: 'Swarm of Rats',
    slug: 'swarm-of-rats',
    size: 1, hp_max: 24, ac: 10, speed: 30, cr: '1/4',
    creature_type: 'swarm', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 9, dex: 11, con: 9, int: 2, wis: 10, cha: 3,
      attacks: [
        { name: 'Bisse', bonus: '+2', damage: '7 (2W6) Stich · halbe HP: 2 (1W6)' },
      ],
      traits: ['Schwarm: Raum von 1 Feld · Tiny-Ratten', 'Resistent Wucht/Stich/Hieb', 'Scharfer Geruch'],
    },
  },
  {
    name_de: 'Fledermausschwarm',
    name_en: 'Swarm of Bats',
    slug: 'swarm-of-bats',
    size: 1, hp_max: 22, ac: 12, speed: 0, cr: '1/4',
    creature_type: 'swarm', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 5, dex: 15, con: 10, int: 2, wis: 12, cha: 4,
      attacks: [
        { name: 'Bisse', bonus: '+4', damage: '5 (2W4) Stich · halbe HP: 2 (1W4)' },
      ],
      traits: ['Flug 30 ft', 'Echolot · Blindsicht 60 ft', 'Resistent Wucht/Stich/Hieb'],
    },
  },
  {
    name_de: 'Insektenschwarm',
    name_en: 'Swarm of Insects',
    slug: 'swarm-of-insects',
    size: 1, hp_max: 22, ac: 12, speed: 20, cr: '1/2',
    creature_type: 'swarm', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 3, dex: 13, con: 10, int: 1, wis: 7, cha: 1,
      attacks: [
        { name: 'Bisse', bonus: '+3', damage: '10 (4W4) Stich · halbe HP: 5 (2W4)' },
      ],
      traits: ['Klettern 20 ft', 'Blindsicht 10 ft', 'Resistent Wucht/Stich/Hieb'],
    },
  },

  // ── Fiends (SRD demons + devils, low CR) ───────────────────────────
  {
    name_de: 'Imp',
    name_en: 'Imp',
    slug: 'imp',
    size: 1, hp_max: 10, ac: 13, speed: 20, cr: '1',
    creature_type: 'fiend', faction: 'enemy', marker_color: '#991b1b',
    stat_block: {
      str: 6, dex: 17, con: 13, int: 11, wis: 12, cha: 14,
      attacks: [
        { name: 'Stich', bonus: '+5', damage: '5 (1W4+3) Stich + 10 (3W6) Gift · KON RW DC 11' },
      ],
      traits: ['Gestaltwandel: Ratte/Rabe/Spinne', 'Unsichtbarkeit nach Belieben', 'Magieresistenz', 'Teufelssicht 120 ft'],
    },
  },
  {
    name_de: 'Quasit',
    name_en: 'Quasit',
    slug: 'quasit',
    size: 1, hp_max: 7, ac: 13, speed: 40, cr: '1',
    creature_type: 'fiend', faction: 'enemy', marker_color: '#991b1b',
    stat_block: {
      str: 5, dex: 17, con: 10, int: 7, wis: 10, cha: 10,
      attacks: [
        { name: 'Klauen', bonus: '+4', damage: '5 (1W4+3) Stich + 5 (2W4) Gift · KON RW DC 10' },
        { name: 'Erschrecken (1/Tag)', bonus: '—', damage: '20 ft · WIS RW DC 10 oder verängstigt 1 min' },
      ],
      traits: ['Gestaltwandel: Fledermaus/Tausendfüßer/Kröte', 'Unsichtbarkeit nach Belieben', 'Magieresistenz'],
    },
  },
  {
    name_de: 'Dretch',
    name_en: 'Dretch',
    slug: 'dretch',
    size: 1, hp_max: 18, ac: 11, speed: 20, cr: '1/4',
    creature_type: 'fiend', faction: 'enemy', marker_color: '#991b1b',
    stat_block: {
      str: 11, dex: 11, con: 12, int: 5, wis: 8, cha: 3,
      attacks: [
        { name: 'Biss', bonus: '+2', damage: '3 (1W6) Stich' },
        { name: 'Klauen', bonus: '+2', damage: '5 (2W4) Hieb' },
      ],
      traits: ['Multiangriff: Biss + Klauen', 'Stinkende Wolke (5-6): 10 ft · KON RW DC 11 oder nur Aktion oder Bonusaktion 1 Rd'],
    },
  },

  // ── Elementals ──────────────────────────────────────────────────────
  {
    name_de: 'Feuerelementar',
    name_en: 'Fire Elemental',
    slug: 'fire-elemental',
    size: 2, hp_max: 102, ac: 13, speed: 50, cr: '5',
    creature_type: 'elemental', faction: 'enemy', marker_color: '#f59e0b',
    stat_block: {
      str: 10, dex: 17, con: 16, int: 6, wis: 10, cha: 7,
      attacks: [
        { name: 'Berührung', bonus: '+6', damage: '10 (2W6+3) Feuer · entzündet brennbares' },
      ],
      traits: ['Multiangriff: 2 Berührungen', 'Feuerform: kann durch 1-ft-Räume, entzündet Kreaturen am Ende eigener Züge', 'Beleuchtung 30 ft hell + 30 ft schwach', 'Wasseranfälligkeit: 1 Kälte je 5 Gallonen'],
    },
  },
  {
    name_de: 'Wasserelementar',
    name_en: 'Water Elemental',
    slug: 'water-elemental',
    size: 2, hp_max: 114, ac: 14, speed: 30, cr: '5',
    creature_type: 'elemental', faction: 'enemy', marker_color: '#3b82f6',
    stat_block: {
      str: 18, dex: 14, con: 18, int: 5, wis: 10, cha: 8,
      attacks: [
        { name: 'Schlagangriff', bonus: '+7', damage: '13 (2W8+4) Wucht' },
        { name: 'Umspülen (4-6)', bonus: '—', damage: 'Kreatur in eigenem Feld · STR RW DC 15 oder festgesetzt + 13 (2W8+4) Wucht/Rd' },
      ],
      traits: ['Multiangriff: 2 Schläge', 'Schwimmen 90 ft', 'Wasserform: kann durch 1-ft-Räume', 'Freeze-Anfälligkeit: Geschwindigkeit 0 wenn Kälteschaden'],
    },
  },
  {
    name_de: 'Erdelementar',
    name_en: 'Earth Elemental',
    slug: 'earth-elemental',
    size: 2, hp_max: 126, ac: 17, speed: 30, cr: '5',
    creature_type: 'elemental', faction: 'enemy', marker_color: '#78350f',
    stat_block: {
      str: 20, dex: 8, con: 20, int: 5, wis: 10, cha: 5,
      attacks: [
        { name: 'Schlagangriff', bonus: '+8', damage: '14 (2W8+5) Wucht' },
      ],
      traits: ['Multiangriff: 2 Schläge', 'Graben 30 ft', 'Erdgleiten: bewegt sich durch nicht-magischen Stein/Erde'],
    },
  },
  {
    name_de: 'Luftelementar',
    name_en: 'Air Elemental',
    slug: 'air-elemental',
    size: 2, hp_max: 90, ac: 15, speed: 0, cr: '5',
    creature_type: 'elemental', faction: 'enemy', marker_color: '#94a3b8',
    stat_block: {
      str: 14, dex: 20, con: 14, int: 6, wis: 10, cha: 6,
      attacks: [
        { name: 'Schlagangriff', bonus: '+8', damage: '14 (3W8+5) Wucht' },
        { name: 'Wirbelsturm (4-6)', bonus: '—', damage: 'Bewegt durch Feinde · STR RW DC 13 oder 15 ft geschoben + liegend' },
      ],
      traits: ['Flug 90 ft (hover)', 'Multiangriff: 2 Schläge', 'Luftform: kann durch 1-ft-Räume'],
    },
  },

  // ── Named humanoid archetypes (mid-tier) ─────────────────────────
  {
    name_de: 'Priester',
    name_en: 'Priest',
    slug: 'priest',
    size: 1, hp_max: 27, ac: 13, speed: 30, cr: '2',
    creature_type: 'humanoid', faction: 'neutral', marker_color: '#f59e0b',
    stat_block: {
      str: 10, dex: 10, con: 12, int: 13, wis: 16, cha: 13,
      attacks: [
        { name: 'Streitkolben', bonus: '+2', damage: '3 (1W6) Wucht' },
        { name: 'Göttliche Erhabenheit', bonus: '—', damage: 'Bonusaktion: +10 (3W6) strahlend oder nekrotisch beim nächsten Nahkampftreffer' },
      ],
      traits: ['Zauberwirker: Kleriker Stufe 5 (WIS, SG 13) · Spirituelle Waffe, Heilwort, Segen, Ruhige Emotionen, Heilige Flamme'],
    },
  },
  {
    name_de: 'Berserker',
    name_en: 'Berserker',
    slug: 'berserker',
    size: 1, hp_max: 67, ac: 13, speed: 30, cr: '2',
    creature_type: 'humanoid', faction: 'enemy', marker_color: '#ef4444',
    stat_block: {
      str: 16, dex: 12, con: 17, int: 9, wis: 11, cha: 9,
      attacks: [
        { name: 'Großaxt', bonus: '+5', damage: '9 (1W12+3) Hieb' },
      ],
      traits: ['Hemmungslos: Vorteil auf Nahkampfangriffe, Angriffe gegen ihn auch mit Vorteil bis zum nächsten Zug', 'Fellrüstung (AC 13)'],
    },
  },
  {
    name_de: 'Ritter',
    name_en: 'Knight',
    slug: 'knight',
    size: 1, hp_max: 52, ac: 18, speed: 30, cr: '3',
    creature_type: 'humanoid', faction: 'friendly', marker_color: '#3b82f6',
    stat_block: {
      str: 16, dex: 11, con: 14, int: 11, wis: 11, cha: 15,
      attacks: [
        { name: 'Großschwert', bonus: '+5', damage: '10 (2W6+3) Hieb' },
        { name: 'Schwere Armbrust', bonus: '+2', damage: '5 (1W10) Stich · 100/400 ft' },
        { name: 'Lanze (beritten)', bonus: '+5', damage: '9 (1W12+3) Stich' },
      ],
      traits: ['Multiangriff: 2 Großschwerthiebe', 'Tapfer: Vorteil auf RW gegen Verängstigung', 'Führung (1/Rast): bis zu 6 Verbündete in 30 ft +1W4 auf eigene Angriffswürfe/RW'],
    },
  },
  {
    name_de: 'Magier',
    name_en: 'Mage',
    slug: 'mage',
    size: 1, hp_max: 40, ac: 12, speed: 30, cr: '6',
    creature_type: 'humanoid', faction: 'enemy', marker_color: '#a78bfa',
    stat_block: {
      str: 9, dex: 14, con: 11, int: 17, wis: 12, cha: 11,
      attacks: [
        { name: 'Dolch', bonus: '+5', damage: '4 (1W4+2) Stich' },
        { name: 'Zauberwirker: Feuerball', bonus: '—', damage: '8 Grad Magier (INT, SG 14, +6 Angriff) · Feuerball, Eisstrahl, Blitzstrahl, Magisches Geschoss' },
      ],
      traits: ['Magierrüstung (AC 15 aktiv)', 'Unsichtbarkeit', 'Verhaltenes Schweben', 'Gegenzauber als Reaktion'],
    },
  },

  // ── Bosses ──────────────────────────────────────────────────────────
  {
    name_de: 'Junger Schwarzer Drache',
    name_en: 'Young Black Dragon',
    slug: 'young-black-dragon',
    size: 2, hp_max: 127, ac: 18, speed: 40, cr: '7',
    creature_type: 'dragon', faction: 'enemy', marker_color: '#1f2937',
    stat_block: {
      str: 19, dex: 14, con: 17, int: 12, wis: 11, cha: 15,
      attacks: [
        { name: 'Biss', bonus: '+7', damage: '15 (2W10+4) Stich + 4 (1W8) Säure' },
        { name: 'Klauen', bonus: '+7', damage: '11 (2W6+4) Hieb' },
        { name: 'Säureatem (5-6)', bonus: '—', damage: '49 (11W8) Säure · 30 ft Linie, GES RW DC 14 halbiert' },
      ],
      traits: ['Multiangriff: Biss + 2 Klauen', 'Immun Säure', 'Amphibisch', 'Flug 80 ft, Schwimmen 40 ft'],
    },
  },
  {
    name_de: 'Junger Roter Drache',
    name_en: 'Young Red Dragon',
    slug: 'young-red-dragon',
    size: 2, hp_max: 178, ac: 18, speed: 40, cr: '10',
    creature_type: 'dragon', faction: 'enemy', marker_color: '#991b1b',
    stat_block: {
      str: 23, dex: 10, con: 21, int: 14, wis: 11, cha: 19,
      attacks: [
        { name: 'Biss', bonus: '+10', damage: '17 (2W10+6) Stich + 7 (2W6) Feuer' },
        { name: 'Kralle', bonus: '+10', damage: '13 (2W6+6) Hieb' },
        { name: 'Feueratem (5-6)', bonus: '—', damage: '56 (16W6) Feuer · 30 ft Kegel, GES RW DC 17 halbiert' },
      ],
      traits: ['Multiangriff: Biss + 2 Krallen', 'Immun Feuer', 'Flug 80 ft'],
    },
  },
  {
    name_de: 'Feuerriese',
    name_en: 'Fire Giant',
    slug: 'fire-giant',
    size: 3, hp_max: 162, ac: 18, speed: 30, cr: '9',
    creature_type: 'giant', faction: 'enemy', marker_color: '#991b1b',
    stat_block: {
      str: 25, dex: 9, con: 23, int: 10, wis: 14, cha: 13,
      attacks: [
        { name: 'Großschwert', bonus: '+11', damage: '28 (6W6+7) Hieb' },
        { name: 'Felsbrocken', bonus: '+11', damage: '29 (4W10+7) Wucht · 60/240 ft' },
      ],
      traits: ['Multiangriff: 2 Großschwerthiebe', 'Immun Feuer', 'Dunkelsicht 60 ft', 'Waffentüchtigkeit: lange Waffen und Rüstungen aus Schwarzen Bergen'],
    },
  },
  {
    name_de: 'Steingolem',
    name_en: 'Stone Golem',
    slug: 'stone-golem',
    size: 2, hp_max: 178, ac: 17, speed: 30, cr: '10',
    creature_type: 'construct', faction: 'enemy', marker_color: '#64748b',
    stat_block: {
      str: 22, dex: 9, con: 20, int: 3, wis: 11, cha: 1,
      attacks: [
        { name: 'Schlagangriff', bonus: '+10', damage: '19 (3W8+6) Wucht · Multiangriff: 2 Schläge' },
        { name: 'Verlangsamen (5-6)', bonus: '—', damage: '10 ft · WIS RW DC 17 oder verlangsamt 1 min · halbe Bewegung, kein Multiangriff, AC −2' },
      ],
      traits: ['Magieresistenz: Vorteil auf RW gegen Zauber', 'Magische Waffen: Angriffe gelten als magisch', 'Immun Gift, Psychisch + nicht-magische W/S/H ohne Adamantin', 'Immun gegen Bezauberung, Erschöpfung, Furcht, Lähmung, Versteinerung, Vergiftung'],
    },
  },
  {
    name_de: 'Baumhirte',
    name_en: 'Treant',
    slug: 'treant',
    size: 3, hp_max: 138, ac: 16, speed: 30, cr: '9',
    creature_type: 'plant', faction: 'neutral', marker_color: '#22c55e',
    stat_block: {
      str: 23, dex: 8, con: 21, int: 12, wis: 16, cha: 12,
      attacks: [
        { name: 'Keulenschlag', bonus: '+10', damage: '16 (3W6+6) Wucht' },
        { name: 'Felsbrocken', bonus: '+10', damage: '28 (4W10+6) Wucht · 60/180 ft' },
        { name: 'Bäume erwecken (1/Tag)', bonus: '—', damage: 'Bis zu 2 Bäume in 60 ft werden als wach-Bäume zu Verbündeten für 1 Tag' },
      ],
      traits: ['Multiangriff: 2 Keulenschläge', 'Verwundbar Feuer', 'Resistent Wucht/Stich', 'Falsches Aussehen: als normaler Baum reglos'],
    },
  },
  {
    name_de: 'Vampir',
    name_en: 'Vampire',
    slug: 'vampire-spawn',
    size: 1, hp_max: 144, ac: 16, speed: 30, cr: '13',
    creature_type: 'undead', faction: 'enemy', marker_color: '#991b1b',
    stat_block: {
      str: 18, dex: 18, con: 18, int: 17, wis: 15, cha: 18,
      attacks: [
        { name: 'Unbewaffneter Schlag', bonus: '+9', damage: '8 (1W8+4) Wucht · Ergreifen DC 18' },
        { name: 'Biss (ergriffen)', bonus: '+9', damage: '7 (1W6+4) Stich + 10 (3W6) Nekrotisch · HP-Max sinkt' },
      ],
      traits: ['Regeneration 20 HP/Runde', 'Gestaltwandel', 'Kinder der Nacht', 'Bezauberung (WIS DC 17)', 'Schwächen: Fließendes Wasser, Pfahl, Sonne'],
    },
  },
]
