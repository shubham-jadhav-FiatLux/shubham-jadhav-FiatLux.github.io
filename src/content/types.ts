/**
 * Shape of the portfolio content. Everything the valley displays comes from an object of
 * this type (see ./portfolio.ts). The world adapts to the amount of content: one banner
 * per project, one training dummy per skill group, one bridge milestone per journey entry.
 */

export interface Link {
  label: string;
  url: string;
}

export interface SkillGroup {
  /** e.g. "Graphics" */
  name: string;
  /** Short line shown under the name */
  blurb?: string;
  items: { name: string; /** 1–5, shown as filled seals */ level?: number }[];
}

export interface Project {
  id: string;
  title: string;
  /** Shown on the fluttering banner (keep it short: 1–3 words) */
  bannerTitle?: string;
  year?: string;
  summary: string;
  /** Paragraphs */
  description?: string[];
  tech: string[];
  links?: Link[];
  /** Optional image URL (relative to /public or absolute) */
  image?: string;
}

export interface JourneyEntry {
  /** e.g. "2024" or "2022 – 2024" */
  when: string;
  title: string;
  place?: string;
  description?: string;
}

export interface PortfolioContent {
  site: {
    /** Name of the world, shown on the title screen and the gate */
    title: string;
    /** Chinese characters for the gate signboard (must be in the font subset) */
    gateGlyphs: string;
    tagline: string;
  };
  owner: {
    name: string;
    role: string;
    location?: string;
    /** One line shown on the title screen */
    intro: string;
    resumeUrl?: string;
  };
  welcome: {
    heading: string;
    paragraphs: string[];
  };
  about: {
    heading: string;
    paragraphs: string[];
    facts?: { label: string; value: string }[];
  };
  skills: {
    heading: string;
    intro?: string;
    groups: SkillGroup[];
  };
  projects: {
    heading: string;
    intro?: string;
    items: Project[];
  };
  journey: {
    heading: string;
    intro?: string;
    entries: JourneyEntry[];
  };
  contact: {
    heading: string;
    message: string;
    email?: string;
    links: Link[];
  };
}
