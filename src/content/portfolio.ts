import type { PortfolioContent } from './types';

/**
 * All of the portfolio's personal content lives here, and the valley rebuilds itself
 * around it:
 *   - projects.items   → one fluttering banner each on the path to the pagoda (up to 8)
 *   - skills.groups    → one wooden training dummy each (up to 6)
 *   - journey.entries  → one milestone per turn of the zig-zag bridge (up to 8)
 *
 * Tips
 *  - Keep banner titles short (1–3 words); the full title shows in the scroll.
 *  - Links open in a new tab. Use full URLs (https://...).
 *  - The gate glyphs must exist in the brush font subset (see scripts/subset-font.py).
 */
export const sj_portfolio: PortfolioContent = {
  site: {
    title: 'Valley of Peace',
    gateGlyphs: '和平谷', // "Valley of Peace"
    seal: '和', // peace, harmony
    tagline: 'A portfolio you can walk through',
    // url: the deploy workflow sets it for GitHub Pages; set it here for other hosts
    sourceUrl: 'https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io',
  },

  owner: {
    name: 'Shubham Jadhav',
    role: 'Researcher at IIT Madras · GPU & Graphics',
    location: 'Chennai, India',
    intro:
      'I make hard problems run fast and empty screens come alive, with GPUs, parallel algorithms and real-time graphics.',
  },

  welcome: {
    heading: 'Welcome, traveller',
    paragraphs: [
      'I am Shubham, and this valley is my portfolio. Every landmark keeps a scroll with a piece of my story: who I am, what I can do, what I have built and where to find me.',
      'Wander at your own pace. When a scroll glows nearby, step closer to read it, and do try a kung-fu strike on the training dummies.',
      'In a hurry? Open the map to travel instantly, or read everything as a classic page from the menu.',
    ],
  },

  about: {
    heading: 'About me',
    paragraphs: [
      'I am a graduate researcher in Computer Science and Engineering at IIT Madras. I am happiest where elegant algorithms meet real hardware: I take problems that look impossibly large and make them fast, then faster, until they run in the blink of an eye.',
      'My M.S. thesis takes on the Capacitated Vehicle Routing Problem, the puzzle behind every delivery network. Our solver is built from simple, fast heuristics that run in parallel; on million-scale benchmarks it beats the state of the art on average within seconds, about a tenfold cut in runtime on an ordinary 8-core machine.',
      'Real-time graphics is my favourite kind of magic: an OpenGL scene drawn in C on a bare Win32 window, an ocean simulated with CUDA FFTs, and now this valley, where every hill, leaf and note is written in code. In between, I write GPU kernels, parallel graph algorithms and compilers that turn tensor graphs into fused CUDA.',
      'Away from the keyboard I draw, paint and practise calligraphy, play the tabla and the guitar, and never turn down a game of table tennis or chess.',
    ],
    facts: [
      { label: 'Studying', value: 'M.S. by Research, CSE · IIT Madras' },
      { label: 'Research', value: 'Vehicle routing at million scale' },
      { label: 'Focus', value: 'GPU computing, real-time graphics, compilers' },
      { label: 'Off the clock', value: 'Tabla, guitar, calligraphy, chess' },
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
          { name: 'DirectX', level: 3 },
          { name: 'Win32 SDK', level: 3 },
        ],
      },
      {
        name: 'Parallel computing',
        blurb: 'From GPUs to clusters',
        items: [
          { name: 'CUDA', level: 4 },
          { name: 'OpenMP', level: 3 },
          { name: 'MPI', level: 3 },
          { name: 'OpenACC', level: 3 },
          { name: 'HIP', level: 2 },
        ],
      },
      {
        name: 'Languages',
        blurb: 'Tools of the trade',
        items: [
          { name: 'C++', level: 4 },
          { name: 'C', level: 4 },
          { name: 'Python', level: 3 },
          { name: 'TypeScript / JavaScript', level: 3 },
          { name: 'Java', level: 3 },
          { name: 'SQL', level: 3 },
        ],
      },
      {
        name: 'Workflow',
        blurb: 'Shipping things',
        items: [
          { name: 'Git & GitHub', level: 4 },
          { name: 'Linux', level: 3 },
          { name: 'Docker', level: 3 },
          { name: 'Slurm', level: 3 },
          { name: 'LaTeX', level: 4 },
          { name: 'Blender', level: 2 },
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
        name: 'Systems & AI',
        blurb: 'Compilers, binaries, models',
        items: [
          { name: 'LLVM', level: 3 },
          { name: 'Ghidra', level: 3 },
          { name: 'LLMs', level: 3 },
          { name: 'Ollama', level: 3 },
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
        title: 'Valley of Peace',
        bannerTitle: 'This Valley',
        year: '2026',
        summary:
          'This explorable 3D portfolio: a procedural valley, a hand-animated panda and a generative soundtrack.',
        description: [
          'Everything you see and hear is generated in code: terrain, wind-blown grass, bamboo, blossom trees, a lake with caustics, pagodas and the music.',
          'Built with three.js, TypeScript and custom GLSL. It draws close to two million triangles in about two hundred draw calls, and an autopilot and a camera director on Bezier paths film the whole story as a five-minute tour.',
        ],
        tech: ['three.js', 'TypeScript', 'GLSL', 'Web Audio', 'Vite'],
        links: [
          {
            label: 'Source code',
            url: 'https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io',
          },
        ],
      },
      {
        id: 'vehicle-routing',
        title: 'Vehicle Routing at Million Scale (M.S. thesis)',
        bannerTitle: 'Routing',
        year: '2024 – now',
        summary:
          'A parallel heuristic solver for the Capacitated Vehicle Routing Problem that beats the state of the art on million-scale instances within seconds.',
        description: [
          'The problem: the cheapest routes from one depot that visit every customer exactly once without overloading a vehicle. It is NP-hard, and it sits at the core of logistics, where every kilometre saved adds up to large savings in cost and emissions.',
          'Our solver pairs a geometry-aware construction with granular local search and ruin-and-recreate, run in parallel over a size-independent decomposition. On million-scale benchmarks it beats the state of the art within seconds and improves best-known solutions within 600 seconds: about ten times faster on an 8-core machine. Guided by Prof. Rupesh Nasre and Prof. Narayanaswamy N S.',
        ],
        tech: ['Combinatorial optimization', 'Metaheuristics', 'Parallel computing'],
      },
      {
        id: 'ai-compiler',
        title: 'Domain-Specific AI Compiler & CUDA Kernel Engine',
        bannerTitle: 'AI Compiler',
        year: '2026',
        summary:
          'An ML compiler that lowers tensor graphs through MLIR and LLVM into fused Triton and CUDA kernels, 1.42× faster than PyTorch end to end.',
        description: [
          'Custom passes fuse operators, remove dead code and unroll loops; a code generator then emits fused Triton and CUDA C++ kernels with shared-memory tiling and float4 loads, so intermediate results never travel back to DRAM.',
          'Measured with NVIDIA Nsight Compute and perf: a 1.42× end-to-end inference speedup and 38% less VRAM bandwidth than the PyTorch baselines.',
        ],
        tech: ['C++', 'CUDA', 'Triton', 'MLIR', 'LLVM', 'CMake'],
      },
      {
        id: 'penetralia',
        title: 'Penetralia',
        bannerTitle: 'Penetralia',
        summary:
          'A real-time rendering demo: an ocean simulated with CUDA FFTs, procedural terrain and atmospheric scattering, filmed by a Bezier camera.',
        description: [
          'A demo I co-engineered: a CUDA FFT ocean solver, procedural terrain and atmospheric scattering, finished with god rays, bloom and depth of field, and choreographed by Bezier camera animation.',
        ],
        tech: ['CUDA', 'FFT ocean', 'Atmospheric scattering', 'Post-processing'],
        links: [{ label: 'Watch the demo', url: 'https://youtu.be/Ze5QbGQnguM' }],
      },
      {
        id: 'parallel-sssp',
        title: 'Parallel SSSP Solver',
        bannerTitle: 'GPU Graphs',
        year: '2025',
        summary:
          'Delta-stepping shortest paths on NVIDIA GPUs for ultra-large sparse graphs: 300 million edges without host-device synchronisation.',
        description: [
          'Static and adaptive delta-stepping over graphs in CSR format. Thrust-driven worklists rescale their buckets on the fly to keep 65,536 work items in flight, and native atomics with careful memory reuse do the rest.',
        ],
        tech: ['CUDA C++', 'NVIDIA Thrust'],
      },
      {
        id: 'agent-security',
        title: 'Securing Agentic AI Workflows',
        bannerTitle: 'Agent Security',
        year: '2026',
        summary:
          'How a zero-click prompt injection hijacks an LLM agent, and the defences that stop it: human consent, a dual-LLM inspector and a security gateway.',
        description: [
          "In a LangChain and Llama 3.1 testbed, poisoned data hijacks an agent's ReAct loop for autonomous exfiltration: the excessive agency risk from the OWASP Top 10 for LLM applications.",
          'The defences: human-in-the-loop consent before high-impact tool calls, a dual-LLM "Inspector" that acts as a semantic firewall, and a proposed security gateway with scoped MCP authentication against delegation-chain spoofing.',
        ],
        tech: ['Python', 'LangChain', 'Ollama', 'Llama 3.1'],
      },
      {
        id: 'chanchal-maan',
        title: 'Asa He Chanchal Maan',
        bannerTitle: 'Chanchal Maan',
        summary:
          'An OpenGL demo written in C, with Win32 for its window and hand-built data structures for its scenes.',
        tech: ['C', 'OpenGL', 'Win32 SDK'],
        links: [{ label: 'Watch the demo', url: 'https://youtu.be/4pB2rZeWkNU' }],
      },
    ],
  },

  journey: {
    heading: 'Journey',
    intro: 'Each turn of the bridge is a step on my path.',
    entries: [
      {
        when: '2015 – 2017',
        title: 'School years',
        place: 'Gadhinglaj and Kolhapur',
        description:
          'Class X at Gadhinglaj High School with 94.2%, Class XII at Vivekanand College, Kolhapur, and the Road Safety Patrol platoon, which I led through its drills and traffic-safety drives.',
      },
      {
        when: '2017 – 2021',
        title: 'B.Tech in Computer Science',
        place: 'Savitribai Phule Pune University',
        description:
          'Graduated with a CGPA of 9.11 and headed the National Service Scheme unit: blood donation drives, check-dam construction and a seven-day rural development camp in Varoti Bk.',
      },
      {
        when: '2024',
        title: 'M.S. by Research begins',
        place: 'IIT Madras',
        description:
          'Joined the Department of Computer Science and Engineering and began my thesis on vehicle routing at million scale, guided by Prof. Rupesh Nasre and Prof. Narayanaswamy N S.',
      },
      {
        when: '2024 – now',
        title: 'Teaching and service',
        place: 'IIT Madras',
        description:
          'Teaching assistant for GPU Programming, Blockchain Technology and Natural Language Processing; elected MS representative for CSE; and a coordinator of the ICPC India Online Round (2025, 2026) and the CSE degree ceremony.',
      },
      {
        when: '2026',
        title: 'Compilers and secure AI',
        description:
          'Built an ML compiler that lowers tensor graphs into fused CUDA and Triton kernels, and showed how prompt injection hijacks AI agents, and how to stop it.',
      },
      {
        when: 'Now',
        title: 'Building this valley',
        description: 'And looking for the next hard problem to make fast.',
      },
    ],
  },

  contact: {
    heading: 'Say hello',
    message:
      'The bell carries messages across the valley. Ring it for research collaborations, GPU and graphics work, or simply to talk shop.',
    email: 'cs24s009@cse.iitm.ac.in',
    links: [{ label: 'GitHub', url: 'https://github.com/shubham-jadhav-FiatLux' }],
  },
};
