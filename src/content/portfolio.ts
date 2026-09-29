import type { PortfolioContent } from './types';

/**
 * ✍️  YOUR CONTENT LIVES HERE.
 *
 * Replace every placeholder (anything in [square brackets] or marked TODO) with your own
 * information. The valley rebuilds itself around this file:
 *   - projects.items   → one fluttering banner each on the path to the pagoda (up to 8)
 *   - skills.groups    → one wooden training dummy each (up to 6)
 *   - journey.entries  → one milestone per turn of the zig-zag bridge (up to 8)
 *
 * Tips
 *  - Keep banner titles short (1–3 words); the full title shows in the scroll.
 *  - Links open in a new tab. Use full URLs (https://...).
 *  - The gate glyphs must exist in the brush font subset (see scripts/subset-font.py).
 */
export const portfolio: PortfolioContent = {
  site: {
    title: 'Valley of Whispering Bamboo',
    gateGlyphs: '竹语谷',
    tagline: 'A portfolio you can walk through',
  },

  owner: {
    name: '[Your Name]', // TODO
    role: 'Computer Science Student · Graphics Programmer',
    location: '[City, Country]', // TODO
    intro: 'I build real-time graphics with OpenGL, WebGL and a lot of curiosity.',
    resumeUrl: '', // TODO: e.g. 'https://example.com/resume.pdf'
  },

  welcome: {
    heading: 'Welcome, traveller',
    paragraphs: [
      'This valley is my portfolio. Every landmark holds a scroll with a piece of my story: who I am, what I can do, what I have built and where to find me.',
      'Walk with WASD or the arrow keys, run with Shift, jump with Space and try a kung-fu strike with F. When a scroll glows nearby, press E to read it.',
      'In a hurry? Open the map (M) to travel instantly, or switch to the classic page from the menu.',
    ],
  },

  about: {
    heading: 'About me',
    paragraphs: [
      "[Write two or three sentences about yourself: what you study, what excites you about computer graphics, and what you're looking for next.]", // TODO
      '[A second paragraph: a fun fact, what you do outside code, or the story of how you got into graphics.]', // TODO
    ],
    facts: [
      { label: 'Studying', value: 'Computer Science' },
      { label: 'Focus', value: 'Real-time rendering, shaders, game engines' },
      { label: 'Currently', value: '[Learning / building something]' }, // TODO
    ],
  },

  skills: {
    heading: 'Skills',
    intro: 'Strike a training dummy to test each discipline.',
    groups: [
      {
        name: 'Graphics',
        blurb: 'Real-time rendering',
        items: [
          { name: 'OpenGL', level: 4 },
          { name: 'WebGL', level: 4 },
          { name: 'GLSL shaders', level: 4 },
          { name: 'three.js', level: 3 },
        ],
      },
      {
        name: 'Languages',
        blurb: 'Tools of the trade',
        items: [
          { name: 'C++', level: 4 }, // TODO: adjust levels
          { name: 'TypeScript / JavaScript', level: 3 },
          { name: 'Python', level: 3 },
        ],
      },
      {
        name: 'Engine craft',
        blurb: 'Under the hood',
        items: [
          { name: 'Linear algebra for 3D', level: 4 },
          { name: 'Scene graphs & ECS', level: 3 },
          { name: 'Physics & collision', level: 3 },
        ],
      },
      {
        name: 'Workflow',
        blurb: 'Shipping things',
        items: [
          { name: 'Git & GitHub', level: 4 },
          { name: 'Linux', level: 3 },
          { name: 'Blender', level: 2 },
        ],
      },
    ],
  },

  projects: {
    heading: 'Projects',
    intro: 'Each banner on the path to the pagoda is something I built.',
    items: [
      {
        id: 'valley',
        title: 'Valley of Whispering Bamboo',
        bannerTitle: 'This Valley',
        year: '2026',
        summary:
          'This explorable 3D portfolio: a procedural valley, a hand-animated panda and a generative soundtrack.',
        description: [
          'Everything you see and hear is generated in code: terrain, wind-blown grass, bamboo, blossom trees, a lake with caustics, pagodas and the music.',
          'Built with three.js, TypeScript and custom GLSL shaders, with a kinematic character controller and procedural animation.',
        ],
        tech: ['three.js', 'TypeScript', 'GLSL', 'Web Audio', 'Vite'],
        links: [
          { label: 'Source code', url: 'https://github.com/[you]/valley-of-whispering-bamboo' },
        ], // TODO
      },
      {
        id: 'renderer',
        title: '[OpenGL renderer]', // TODO
        bannerTitle: 'Renderer',
        year: '[Year]',
        summary: '[One line: what it renders and what makes it interesting.]',
        description: ['[Describe the techniques: PBR, shadow mapping, deferred shading, SSAO…]'],
        tech: ['C++', 'OpenGL', 'GLSL'],
        links: [{ label: 'GitHub', url: 'https://github.com/[you]' }],
      },
      {
        id: 'webgl-experiment',
        title: '[WebGL experiment]', // TODO
        bannerTitle: 'Shaders',
        year: '[Year]',
        summary: '[One line about a shader toy, simulation or demo you made.]',
        tech: ['WebGL', 'GLSL'],
        links: [{ label: 'Live demo', url: 'https://example.com' }],
      },
      {
        id: 'engine',
        title: '[Game engine / game]', // TODO
        bannerTitle: 'Engine',
        year: '[Year]',
        summary: '[One line about an engine, game or tool you built.]',
        tech: ['C++', 'ECS'],
        links: [],
      },
    ],
  },

  journey: {
    heading: 'Journey',
    intro: 'Each turn of the bridge is a step on my path.',
    entries: [
      {
        when: '[Year]',
        title: '[Started programming]', // TODO
        description: '[What sparked it?]',
      },
      {
        when: '[Year]',
        title: '[Began my CS degree]',
        place: '[University]',
        description: '[What you focus on]',
      },
      {
        when: '[Year]',
        title: '[First OpenGL triangle]',
        description: '[The moment graphics clicked]',
      },
      {
        when: '[Year]',
        title: '[Internship / project / award]',
        place: '[Where]',
      },
      {
        when: 'Now',
        title: 'Building this valley',
        description: 'And looking for the next adventure.',
      },
    ],
  },

  contact: {
    heading: 'Say hello',
    message:
      'The bell carries messages across the valley. Reach out for collaborations, internships or just to talk graphics.',
    email: 'you@example.com', // TODO
    links: [
      { label: 'GitHub', url: 'https://github.com/[you]' }, // TODO
      { label: 'LinkedIn', url: 'https://www.linkedin.com/in/[you]' }, // TODO
    ],
  },
};
