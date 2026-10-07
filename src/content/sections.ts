/** The six portfolio sections, each tied to a landmark in the valley. */
export type SectionId = 'welcome' | 'about' | 'skills' | 'journey' | 'projects' | 'contact';

export interface SectionMeta {
  id: SectionId;
  /** decorative seal character (must exist in the brush font subset) */
  glyph: string;
  label: string;
  /** where it is found, for hints ("Find it at …") */
  place: string;
  /** landmark name shown on the map */
  landmark: string;
}

export const sj_SECTIONS: readonly SectionMeta[] = [
  { id: 'welcome', glyph: '迎', label: 'Welcome', place: 'the stone gate', landmark: 'Stone Gate' },
  {
    id: 'about',
    glyph: '我',
    label: 'About',
    place: 'the tea pavilion by the lake',
    landmark: 'Tea Pavilion',
  },
  {
    id: 'skills',
    glyph: '技',
    label: 'Skills',
    place: 'the training grounds',
    landmark: 'Training Grounds',
  },
  {
    id: 'journey',
    glyph: '路',
    label: 'Journey',
    place: 'the zig-zag bridge',
    landmark: 'Zig-zag Bridge',
  },
  {
    id: 'projects',
    glyph: '作',
    label: 'Projects',
    place: 'the banners below the pagoda',
    landmark: 'Pagoda',
  },
  {
    id: 'contact',
    glyph: '信',
    label: 'Contact',
    place: 'the bell tower by the waterfall',
    landmark: 'Bell Tower',
  },
];

export function sectionMeta(sj_id: SectionId): SectionMeta {
  return sj_SECTIONS.find((sj_s) => sj_s.id === sj_id)!;
}
