/* SRD 5.2 creature templates seeded into token_templates on first run.

   Source: Wizards of the Coast, D&D 5e SRD v5.2.1 — Creative Commons
   Attribution 4.0 International (CC-BY-4.0). Stats are the SRD baseline;
   DMs can duplicate into the user-scoped library to tweak without
   losing the canonical copy.

   Sizes follow BoltBerry's grid-cell convention: Small/Medium = 1,
   Large = 2, Huge = 3. Tiny creatures are rounded to 1 because the token
   renderer has no sub-cell mode. */

export interface SrdMonster {
  name_de: string
  name_en: string
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
  // ── Bosses ──────────────────────────────────────────────────────────
  {
    name_de: 'Junger Roter Drache',
    name_en: 'Young Red Dragon',
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
    name_de: 'Beholder',
    name_en: 'Beholder',
    size: 2, hp_max: 180, ac: 18, speed: 0, cr: '13',
    creature_type: 'aberration', faction: 'enemy', marker_color: '#a78bfa',
    stat_block: {
      str: 10, dex: 14, con: 18, int: 17, wis: 15, cha: 17,
      attacks: [
        { name: 'Biss', bonus: '+5', damage: '14 (4W6) Stich' },
        { name: 'Augenstrahlen (3/Runde)', bonus: '—', damage: 'Diverse Effekte: Charme, Lähmung, Furcht, Steinwerdung, Tod' },
      ],
      traits: ['Antimagiekegel (Hauptauge, 150 ft)', 'Schwebt 20 ft'],
    },
  },
  {
    name_de: 'Lich',
    name_en: 'Lich',
    size: 1, hp_max: 135, ac: 17, speed: 30, cr: '21',
    creature_type: 'undead', faction: 'enemy', marker_color: '#a78bfa',
    stat_block: {
      str: 11, dex: 16, con: 16, int: 20, wis: 14, cha: 16,
      attacks: [
        { name: 'Eiseskaltes Berühren', bonus: '+12', damage: '10 (3W6) Kalt · kein HP-Gewinn bis kurze Rast' },
        { name: 'Zauberwerk', bonus: '—', damage: 'Zauberkundiger Stufe 18 (SG 20, +12 Angriff)' },
      ],
      traits: ['Legendäre Aktionen 3/Runde', 'Legendäre Resistenzen 3/Tag', 'Phylakterie'],
    },
  },
  {
    name_de: 'Mind Flayer',
    name_en: 'Mind Flayer',
    size: 1, hp_max: 71, ac: 15, speed: 30, cr: '7',
    creature_type: 'aberration', faction: 'enemy', marker_color: '#a78bfa',
    stat_block: {
      str: 11, dex: 12, con: 12, int: 19, wis: 17, cha: 17,
      attacks: [
        { name: 'Tentakel', bonus: '+7', damage: '15 (2W10+4) Psychisch · INT RW DC 15 oder betäubt' },
        { name: 'Gedankenfresser', bonus: '—', damage: 'Ergriffenes Ziel: 55 (10W10) Psychisch · Extraktion bei 0 HP' },
        { name: 'Gedankenexplosion (5-6)', bonus: '—', damage: '22 (4W8+4) Psychisch · 60 ft Kegel, INT RW DC 15' },
      ],
      traits: ['Magieresistenz', 'Telepathie 120 ft'],
    },
  },
  {
    name_de: 'Vampir',
    name_en: 'Vampire',
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
